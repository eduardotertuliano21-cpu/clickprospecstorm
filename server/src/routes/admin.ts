import { Router, Response } from 'express';
import crypto from 'crypto';
import { db, CustomerLicense } from '../db/database.js';
import { requireAdminAuth, AuthRequest } from '../middleware/auth.js';

export const adminRouter = Router();

// Todas as rotas administrativas exigem autenticação do Master Admin
adminRouter.use(requireAdminAuth);

/**
 * 1. GET /api/v1/admin/metrics
 * Retorna contadores de licenças ativas, trials em andamento, bloqueados e faturamento.
 */
adminRouter.get('/metrics', (_req: AuthRequest, res: Response): void => {
  try {
    const customers = db.getAllCustomers();
    const now = Date.now();

    let activeCount = 0;
    let trialCount = 0;
    let blockedCount = 0;
    let expiredCount = 0;
    let expiringSoonCount = 0;
    let grossRevenue = 0;

    customers.forEach(c => {
      grossRevenue += c.pricePaid || 0;

      if (c.status === 'blocked') {
        blockedCount++;
      } else if (c.expiresAt && new Date(c.expiresAt).getTime() < now) {
        expiredCount++;
      } else {
        if (c.expiresAt) {
          const daysLeft = Math.ceil((new Date(c.expiresAt).getTime() - now) / (1000 * 60 * 60 * 24));
          if (daysLeft > 0 && daysLeft <= 5) {
            expiringSoonCount++;
          }
        }
        if (c.isTrial || c.licenseType === 'trial') {
          trialCount++;
        } else if (c.status === 'active') {
          activeCount++;
        }
      }
    });

    const versionConfig = db.getVersionConfig();

    res.json({
      success: true,
      data: {
        totalCustomers: customers.length,
        activeLicenses: activeCount,
        runningTrials: trialCount,
        blockedLicenses: blockedCount,
        expiredLicenses: expiredCount,
        expiringSoonLicenses: expiringSoonCount,
        grossRevenue,
        minVersionRequired: versionConfig.minVersionRequired,
        latestVersion: versionConfig.latestVersion
      }
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * 2. GET /api/v1/admin/customers
 * Lista todos os clientes com suporte a filtros de status, busca textual e paginação.
 */
adminRouter.get('/customers', (req: AuthRequest, res: Response): void => {
  try {
    const { status, search, page = '1', limit = '50' } = req.query;
    let customers = db.getAllCustomers();
    const now = Date.now();

    // Filtro por status
    if (status && status !== 'all') {
      customers = customers.filter(c => {
        const isExpired = c.expiresAt && new Date(c.expiresAt).getTime() < now;
        if (status === 'expired') return isExpired && c.status !== 'blocked';
        if (status === 'blocked') return c.status === 'blocked';
        if (status === 'expiring_soon') {
          if (c.status === 'blocked' || isExpired || !c.expiresAt) return false;
          const daysLeft = Math.ceil((new Date(c.expiresAt).getTime() - now) / (1000 * 60 * 60 * 24));
          return daysLeft > 0 && daysLeft <= 5;
        }
        if (status === 'trial') return (c.isTrial || c.licenseType === 'trial') && !isExpired && c.status !== 'blocked';
        if (status === 'active') return c.status === 'active' && !c.isTrial && !isExpired;
        return c.status === status;
      });
    }

    // Busca textual (nome, e-mail, telefone, chave de licença, machineId)
    if (search && typeof search === 'string' && search.trim()) {
      const q = search.trim().toLowerCase();
      customers = customers.filter(c => 
        c.customerName.toLowerCase().includes(q) ||
        c.customerEmail.toLowerCase().includes(q) ||
        c.licenseKey.toLowerCase().includes(q) ||
        (c.machineId && c.machineId.toLowerCase().includes(q)) ||
        (c.phone && c.phone.toLowerCase().includes(q))
      );
    }

    // Paginação
    const p = Math.max(1, parseInt(page as string, 10) || 1);
    const l = Math.max(1, Math.min(100, parseInt(limit as string, 10) || 50));
    const total = customers.length;
    const startIndex = (p - 1) * l;
    const paginated = customers.slice(startIndex, startIndex + l);

    res.json({
      success: true,
      data: {
        customers: paginated,
        pagination: {
          total,
          page: p,
          limit: l,
          totalPages: Math.ceil(total / l)
        }
      }
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * 3. PATCH /api/v1/admin/customers/:id/status
 * Alterna manualmente o status para 'active' ou 'blocked'.
 */
adminRouter.patch('/customers/:id/status', (req: AuthRequest, res: Response): void => {
  try {
    const { id } = req.params;
    const { status, days } = req.body;

    if (!['active', 'blocked'].includes(status)) {
      res.status(400).json({ success: false, error: "Status inválido. Use 'active' ou 'blocked'." });
      return;
    }

    const customer = db.findCustomerById(id);
    if (!customer) {
      res.status(404).json({ success: false, error: 'Cliente não encontrado.' });
      return;
    }

    const updates: any = { status };

    // Ao desbloquear e definir dias de acesso
    if (status === 'active' && days !== undefined) {
      if (days === null || days === 'lifetime' || days === 0) {
        updates.expiresAt = null;
      } else {
        const numDays = parseInt(days, 10);
        if (!isNaN(numDays) && numDays > 0) {
          updates.expiresAt = new Date(Date.now() + numDays * 24 * 60 * 60 * 1000).toISOString();
        }
      }
    }

    const updated = db.updateCustomer(id, updates);
    res.json({ success: true, data: updated });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * 3.1 POST /api/v1/admin/customers/:id/set-validity
 * Define validade personalizada em dias a partir de hoje ou estende a data existente.
 */
adminRouter.post('/customers/:id/set-validity', (req: AuthRequest, res: Response): void => {
  try {
    const { id } = req.params;
    const { days, mode = 'from_now' } = req.body; // 'from_now' | 'extend' | 'lifetime'

    const customer = db.findCustomerById(id);
    if (!customer) {
      res.status(404).json({ success: false, error: 'Cliente não encontrado.' });
      return;
    }

    let newExpiresAt: string | null = null;

    if (mode === 'lifetime' || days === 'lifetime' || days === null) {
      newExpiresAt = null;
    } else {
      const numDays = parseInt(days, 10);
      if (isNaN(numDays) || numDays <= 0) {
        res.status(400).json({ success: false, error: 'Informe uma quantidade válida de dias.' });
        return;
      }

      if (mode === 'extend') {
        const currentExpiry = customer.expiresAt ? new Date(customer.expiresAt).getTime() : Date.now();
        const baseTime = Math.max(Date.now(), currentExpiry);
        newExpiresAt = new Date(baseTime + numDays * 24 * 60 * 60 * 1000).toISOString();
      } else {
        // 'from_now' - desbloqueia contando X dias a partir do momento atual
        newExpiresAt = new Date(Date.now() + numDays * 24 * 60 * 60 * 1000).toISOString();
      }
    }

    const updated = db.updateCustomer(id, {
      expiresAt: newExpiresAt,
      status: 'active'
    });

    res.json({
      success: true,
      message: newExpiresAt 
        ? `Acesso liberado até ${new Date(newExpiresAt).toLocaleDateString('pt-BR')} (${days} dias a partir de agora).`
        : 'Licença definida como Vitalícia (acesso ilimitado).',
      data: updated
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * 4. POST /api/v1/admin/customers/:id/reset-machine
 * Limpa o machine_id gravado no banco para permitir ativação em novo PC.
 */
adminRouter.post('/customers/:id/reset-machine', (req: AuthRequest, res: Response): void => {
  try {
    const { id } = req.params;
    const customer = db.findCustomerById(id);
    if (!customer) {
      res.status(404).json({ success: false, error: 'Cliente não encontrado.' });
      return;
    }

    const updated = db.updateCustomer(id, {
      machineId: null,
      notes: `${customer.notes || ''} [Reset de Hardware em ${new Date().toLocaleDateString('pt-BR')}]`.trim()
    });

    res.json({
      success: true,
      message: 'Hardware ID desvinculado com sucesso! O cliente já pode ativar o Click Lead Storm em outro computador.',
      data: updated
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * 5. POST /api/v1/admin/customers/:id/extend
 * Acrescenta X dias à data de expiração (expires_at).
 */
adminRouter.post('/customers/:id/extend', (req: AuthRequest, res: Response): void => {
  try {
    const { id } = req.params;
    const { days = 30 } = req.body;
    const numDays = parseInt(days, 10);

    if (isNaN(numDays) || numDays <= 0) {
      res.status(400).json({ success: false, error: 'Informe uma quantidade válida de dias (número positivo).' });
      return;
    }

    const customer = db.findCustomerById(id);
    if (!customer) {
      res.status(404).json({ success: false, error: 'Cliente não encontrado.' });
      return;
    }

    const currentExpiry = customer.expiresAt ? new Date(customer.expiresAt).getTime() : Date.now();
    const baseTime = Math.max(Date.now(), currentExpiry);
    const newExpiresAt = new Date(baseTime + numDays * 24 * 60 * 60 * 1000).toISOString();

    const updated = db.updateCustomer(id, {
      expiresAt: newExpiresAt,
      status: customer.status === 'expired' ? 'active' : customer.status
    });

    res.json({
      success: true,
      message: `Licença estendida em +${numDays} dias com sucesso. Nova data: ${new Date(newExpiresAt).toLocaleDateString('pt-BR')}.`,
      data: updated
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * 6. POST /api/v1/admin/customers/:id/reset-password
 * Gera senha temporária alfanumérica segura e retorna em texto puro para repasse ao cliente.
 */
adminRouter.post('/customers/:id/reset-password', (req: AuthRequest, res: Response): void => {
  try {
    const { id } = req.params;
    const customer = db.findCustomerById(id);
    if (!customer) {
      res.status(404).json({ success: false, error: 'Cliente não encontrado.' });
      return;
    }

    // Gera senha de 8 caracteres alfanuméricos legíveis
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let tempPass = '';
    for (let i = 0; i < 8; i++) {
      tempPass += chars.charAt(Math.floor(Math.random() * chars.length));
    }

    const updated = db.updateCustomer(id, { tempPassword: tempPass });

    res.json({
      success: true,
      tempPassword: tempPass,
      message: `Senha temporária gerada: ${tempPass}`,
      customer: {
        id: customer.id,
        name: customer.customerName,
        email: customer.customerEmail
      }
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * 7. POST /api/v1/admin/licenses/create
 * Cria licenças pagas (CLS-XXXX-XXXX) ou temporárias (CLS-TRIAL-XXXX) com dias de teste e limite diário customizável.
 */
adminRouter.post('/licenses/create', (req: AuthRequest, res: Response): void => {
  try {
    const {
      customerName,
      customerEmail,
      phone,
      licenseType = 'pro', // 'pro' | 'trial'
      validityDays = 30, // 0 = vitalício
      dailyLimit,
      pricePaid = 0,
      notes
    } = req.body;

    if (!customerName || !customerEmail) {
      res.status(400).json({ success: false, error: 'Nome e E-mail do cliente são obrigatórios.' });
      return;
    }

    const isTrial = licenseType === 'trial';
    
    // Geração de chave no formato padrão
    const rnd1 = crypto.randomBytes(2).toString('hex').toUpperCase();
    const rnd2 = crypto.randomBytes(2).toString('hex').toUpperCase();
    const licenseKey = isTrial ? `CLS-TRIAL-${rnd1}-${rnd2}` : `CLS-PRO-${rnd1}-${rnd2}`;

    // Cálculo da expiração
    let expiresAt: string | null = null;
    const days = parseInt(validityDays, 10);
    if (days > 0) {
      expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
    }

    // Limite diário: 20 para trial se não fornecido, 99999 para pro
    const finalDailyLimit = dailyLimit !== undefined ? parseInt(dailyLimit, 10) : (isTrial ? 20 : 99999);

    const newLicense = db.createCustomerLicense({
      customerName: customerName.trim(),
      customerEmail: customerEmail.trim().toLowerCase(),
      phone: phone?.trim(),
      licenseKey,
      licenseType: isTrial ? 'trial' : 'pro',
      status: 'active',
      isTrial,
      dailyLimit: finalDailyLimit,
      expiresAt,
      pricePaid: Number(pricePaid) || 0,
      notes: notes?.trim()
    });

    // Mensagem comercial pré-formatada pronta para envio no WhatsApp
    const messageTemplate = `Olá, *${newLicense.customerName}*! 🎉

Aqui estão as suas credenciais de ativação do *Click Lead Storm*:
🔑 *Sua Chave de Acesso:* \`${newLicense.licenseKey}\`
📦 *Plano:* ${isTrial ? 'Demonstração Comercial (Trial)' : 'Licença Oficial B2B'}
⏳ *Validade:* ${expiresAt ? new Date(expiresAt).toLocaleDateString('pt-BR') : 'Acesso Vitalício'}
🚀 *Disparos Diários Permitidos:* ${newLicense.dailyLimit >= 99999 ? 'Ilimitados' : `${newLicense.dailyLimit} envios/dia`}

Para ativar:
1. Abra o *Click Lead Storm* no seu Windows.
2. Cole a chave de acesso no campo de ativação e clique em Confirmar.

Qualquer dúvida, conte com nosso suporte direto!`;

    res.status(201).json({
      success: true,
      data: newLicense,
      messageTemplate
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * 8. GET & PUT /api/v1/admin/config/versions
 * Consulta e atualiza minVersionRequired e latestVersion.
 */
adminRouter.get('/config/versions', (_req: AuthRequest, res: Response): void => {
  try {
    const config = db.getVersionConfig();
    res.json({ success: true, data: config });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

adminRouter.put('/config/versions', (req: AuthRequest, res: Response): void => {
  try {
    const { minVersionRequired, latestVersion, downloadUrl, forceUpdateMessage } = req.body;

    if (!minVersionRequired || !latestVersion) {
      res.status(400).json({ success: false, error: 'minVersionRequired e latestVersion são obrigatórios.' });
      return;
    }

    const updated = db.updateVersionConfig({
      minVersionRequired: minVersionRequired.trim(),
      latestVersion: latestVersion.trim(),
      ...(downloadUrl ? { downloadUrl: downloadUrl.trim() } : {}),
      ...(forceUpdateMessage ? { forceUpdateMessage: forceUpdateMessage.trim() } : {})
    });

    res.json({
      success: true,
      message: 'Configurações globais de versão atualizadas com sucesso!',
      data: updated
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * 9. DELETE /api/v1/admin/customers/:id
 */
adminRouter.delete('/customers/:id', (req: AuthRequest, res: Response): void => {
  try {
    const { id } = req.params;
    const deleted = db.deleteCustomer(id);
    if (!deleted) {
      res.status(404).json({ success: false, error: 'Cliente não encontrado.' });
      return;
    }
    res.json({ success: true, message: 'Registro de cliente removido com sucesso.' });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * 10. POST /api/v1/admin/customers/:id/machines
 * Adiciona um ID de placa-mãe/máquina manualmente ao cliente.
 */
adminRouter.post('/customers/:id/machines', (req: AuthRequest, res: Response): void => {
  try {
    const { id } = req.params;
    const { machineId, hostname, notes } = req.body;

    if (!machineId || !machineId.trim()) {
      res.status(400).json({ success: false, error: 'O ID da placa-mãe/máquina é obrigatório.' });
      return;
    }

    const customer = db.findCustomerById(id);
    if (!customer) {
      res.status(404).json({ success: false, error: 'Cliente não encontrado.' });
      return;
    }

    const cleanMid = machineId.trim();
    if (!customer.allowedMachines) {
      customer.allowedMachines = customer.machineId 
        ? [{ machineId: customer.machineId, hostname: 'Principal', registeredAt: customer.createdAt, lastSeenAt: new Date().toISOString() }] 
        : [];
    }

    const exists = customer.allowedMachines.find(m => m.machineId === cleanMid);

    if (!exists) {
      customer.allowedMachines.push({
        machineId: cleanMid,
        hostname: hostname?.trim() || 'Estação Manual',
        registeredAt: new Date().toISOString(),
        lastSeenAt: new Date().toISOString(),
        notes: notes?.trim()
      });
      if (!customer.machineId) customer.machineId = cleanMid;
    } else {
      if (hostname) exists.hostname = hostname.trim();
      if (notes) exists.notes = notes.trim();
    }

    if (customer.allowedMachines.length > (customer.maxMachines || 1)) {
      customer.maxMachines = customer.allowedMachines.length;
    }

    const updated = db.updateCustomer(id, {
      allowedMachines: customer.allowedMachines,
      maxMachines: customer.maxMachines,
      machineId: customer.machineId
    });

    res.json({
      success: true,
      message: `Máquina ${hostname || cleanMid.substring(0, 10)} cadastrada com sucesso!`,
      data: updated
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * 11. DELETE /api/v1/admin/customers/:id/machines/:machineId
 * Remove uma máquina cadastrada.
 */
adminRouter.delete('/customers/:id/machines/:machineId', (req: AuthRequest, res: Response): void => {
  try {
    const { id, machineId } = req.params;
    const customer = db.findCustomerById(id);
    if (!customer) {
      res.status(404).json({ success: false, error: 'Cliente não encontrado.' });
      return;
    }

    if (customer.allowedMachines) {
      customer.allowedMachines = customer.allowedMachines.filter(m => m.machineId !== machineId);
    }
    if (customer.machineId === machineId) {
      customer.machineId = customer.allowedMachines?.[0]?.machineId || null;
    }

    const updated = db.updateCustomer(id, {
      allowedMachines: customer.allowedMachines,
      machineId: customer.machineId
    });

    res.json({
      success: true,
      message: 'Máquina desvinculada com sucesso.',
      data: updated
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * 12. PATCH /api/v1/admin/customers/:id/max-machines
 * Atualiza o limite de máquinas autorizadas.
 */
adminRouter.patch('/customers/:id/max-machines', (req: AuthRequest, res: Response): void => {
  try {
    const { id } = req.params;
    const { maxMachines } = req.body;
    const limit = parseInt(maxMachines, 10);

    if (isNaN(limit) || limit < 1) {
      res.status(400).json({ success: false, error: 'Informe uma quantidade válida (no mínimo 1 máquina).' });
      return;
    }

    const customer = db.findCustomerById(id);
    if (!customer) {
      res.status(404).json({ success: false, error: 'Cliente não encontrado.' });
      return;
    }

    const updated = db.updateCustomer(id, { maxMachines: limit });
    res.json({
      success: true,
      message: `Limite de computadores atualizado para ${limit} máquina(s).`,
      data: updated
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});
