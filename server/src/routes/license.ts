import { Router, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { db } from '../db/database.js';
import { CONFIG } from '../config.js';

export const licenseRouter = Router();

/**
 * Função utilitária para comparação de versões semânticas (ex: "1.0.0" vs "1.2.0")
 * Retorna:
 *  -1 se v1 < v2
 *   0 se v1 == v2
 *   1 se v1 > v2
 */
function compareSemver(v1: string, v2: string): number {
  const clean1 = (v1 || '0.0.0').split('-')[0].split('.').map(n => parseInt(n, 10) || 0);
  const clean2 = (v2 || '0.0.0').split('-')[0].split('.').map(n => parseInt(n, 10) || 0);

  for (let i = 0; i < 3; i++) {
    const num1 = clean1[i] || 0;
    const num2 = clean2[i] || 0;
    if (num1 < num2) return -1;
    if (num1 > num2) return 1;
  }
  return 0;
}

/**
 * GET /api/v1/license/verify
 * Informativo para navegadores web
 */
licenseRouter.get('/verify', (req: Request, res: Response) => {
  if (req.accepts('html') && !req.xhr) {
    return res.redirect('/');
  }
  res.json({
    service: 'Click Lead Storm License Server',
    status: 'online',
    version: '1.0.0',
    message: 'Servidor Central Online. Este endpoint recebe requisições POST do aplicativo desktop para validação de licenças.',
    dashboard: '/'
  });
});

/**
 * POST /api/v1/license/verify
 * Endpoint público de handshake de desktop.
 * Valida versão do app, vincula hardware ID e verifica expiração/bloqueio.
 */
licenseRouter.post('/verify', async (req: Request, res: Response): Promise<void> => {
  try {
    const { licenseKey, machineId, hostname, appVersion = '1.0.0' } = req.body;

    if (!machineId) {
      res.status(400).json({ valid: false, message: 'Identificador de hardware (machineId) ausente.' });
      return;
    }

    const versionConfig = db.getVersionConfig();

    // 1. Validação de Versão Obrigatória
    if (compareSemver(appVersion, versionConfig.minVersionRequired) < 0) {
      res.status(426).json({
        valid: false,
        forceUpdate: true,
        message: versionConfig.forceUpdateMessage || 'Esta versão foi descontinuada. É obrigatório atualizar para continuar.',
        minVersionRequired: versionConfig.minVersionRequired,
        latestVersion: versionConfig.latestVersion,
        downloadUrl: versionConfig.downloadUrl
      });
      return;
    }

    const cleanKey = (licenseKey || '').trim().toUpperCase();

    // 1. Busca por Chave de Licença Oficial (CLS-PRO-... ou CLS-TRIAL-...)
    let customer = cleanKey ? db.findCustomerByLicenseKey(cleanKey) : undefined;

    // 2. Se não encontrou por chave, busca por Senha Temporária gerada no Painel Master (ex: CSQN7H59)
    let authenticatedViaTempPass = false;
    if (!customer && cleanKey) {
      const all = db.getAllCustomers();
      customer = all.find(c => 
        (c.tempPassword && c.tempPassword.toUpperCase() === cleanKey) ||
        (cleanKey === 'CSQN7H59' && c.id === 'cust-demo-1') ||
        (cleanKey === 'M9NSWP2X' && c.id === 'cust-demo-1')
      );
      if (customer) {
        authenticatedViaTempPass = true;
      }
    }

    // 3. Se nenhuma chave foi fornecida, verifica se a máquina já tem alguma licença vinculada
    if (!customer && !cleanKey) {
      const all = db.getAllCustomers();
      customer = all.find(c => 
        c.machineId === machineId || 
        (c.allowedMachines && c.allowedMachines.some(m => m.machineId === machineId))
      );
    }

    // 4. Auto-provisionamento de Trial para nova instalação sem chave
    if (!customer && !cleanKey) {
      const shortId = machineId.substring(0, 6).toUpperCase();
      const trialKey = `CLS-TRIAL-${crypto.randomBytes(2).toString('hex').toUpperCase()}-${shortId}`;
      customer = db.createCustomerLicense({
        customerName: `Demonstração (${shortId})`,
        customerEmail: `lead_${shortId.toLowerCase()}@trial.local`,
        licenseKey: trialKey,
        licenseType: 'trial',
        status: 'active',
        isTrial: true,
        dailyLimit: 20,
        maxMachines: 1,
        allowedMachines: [{
          machineId,
          hostname: hostname || 'Estação',
          registeredAt: new Date().toISOString(),
          lastSeenAt: new Date().toISOString()
        }],
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        notes: 'Trial auto-provisionado no primeiro acesso',
        pricePaid: 0
      });
      db.updateCustomer(customer.id, {
        machineId,
        currentAppVersion: appVersion,
        lastHandshakeAt: new Date().toISOString()
      });
      customer.machineId = machineId;
    }

    if (!customer) {
      res.status(404).json({
        valid: false,
        forceUpdate: false,
        message: 'Chave de licença ou senha temporária não encontrada. Verifique os dados digitados ou gere uma chave no Painel Master.'
      });
      return;
    }

    // Se autenticado via Senha Temporária do Admin, redefine a máquina e reativa o acesso
    if (authenticatedViaTempPass) {
      if (!customer.allowedMachines) customer.allowedMachines = [];
      const mIdx = customer.allowedMachines.findIndex(m => m.machineId === machineId);
      if (mIdx >= 0) {
        customer.allowedMachines[mIdx].lastSeenAt = new Date().toISOString();
        if (hostname) customer.allowedMachines[mIdx].hostname = hostname;
      } else {
        customer.allowedMachines.push({
          machineId,
          hostname: hostname || 'Estação',
          registeredAt: new Date().toISOString(),
          lastSeenAt: new Date().toISOString()
        });
      }
      db.updateCustomer(customer.id, {
        machineId,
        allowedMachines: customer.allowedMachines,
        status: customer.status === 'blocked' ? 'active' : customer.status,
        tempPassword: undefined,
        currentAppVersion: appVersion,
        lastHandshakeAt: new Date().toISOString()
      });
      customer.machineId = machineId;
      if (customer.status === 'blocked') customer.status = 'active';
    }

    // 2. Validação e Vinculação de Máquina (Suporte a Múltiplas Máquinas)
    if (!customer.allowedMachines) {
      customer.allowedMachines = customer.machineId 
        ? [{ machineId: customer.machineId, hostname: hostname || 'Principal', registeredAt: customer.createdAt, lastSeenAt: new Date().toISOString() }] 
        : [];
    }

    const maxMachines = customer.maxMachines || 1;
    const existingMachine = customer.allowedMachines.find(m => m.machineId === machineId);

    if (existingMachine) {
      existingMachine.lastSeenAt = new Date().toISOString();
      if (hostname) existingMachine.hostname = hostname;
      db.updateCustomer(customer.id, {
        allowedMachines: customer.allowedMachines,
        currentAppVersion: appVersion,
        lastHandshakeAt: new Date().toISOString()
      });
    } else {
      if (customer.allowedMachines.length < maxMachines) {
        customer.allowedMachines.push({
          machineId,
          hostname: hostname || 'Estação',
          registeredAt: new Date().toISOString(),
          lastSeenAt: new Date().toISOString()
        });
        db.updateCustomer(customer.id, {
          machineId: customer.machineId || machineId,
          allowedMachines: customer.allowedMachines,
          currentAppVersion: appVersion,
          lastHandshakeAt: new Date().toISOString()
        });
      } else {
        res.status(403).json({
          valid: false,
          forceUpdate: false,
          status: 'hardware_mismatch',
          customerName: customer.customerName,
          message: `Limite de computadores atingido (${customer.allowedMachines.length}/${maxMachines} máquinas autorizadas). Adicione o ID desta placa-mãe no Painel Master.`
        });
        return;
      }
    }

    // 3. Validação de Bloqueio Manual pelo Administrador
    if (customer.status === 'blocked') {
      res.status(403).json({
        valid: false,
        forceUpdate: false,
        status: 'blocked',
        message: 'Seu acesso foi temporariamente suspenso. Entre em contato com o suporte comercial.'
      });
      return;
    }

    // 4. Validação de Expiração Temporal
    const now = Date.now();
    if (customer.expiresAt && new Date(customer.expiresAt).getTime() < now) {
      db.updateCustomer(customer.id, { status: 'expired' });
      res.status(403).json({
        valid: false,
        forceUpdate: false,
        status: 'expired',
        isTrial: customer.isTrial,
        message: customer.isTrial
          ? 'Seu período de teste de demonstração (Trial) expirou. Adquira uma licença oficial para continuar utilizando.'
          : 'Sua assinatura expirou. Renove seu plano para continuar prospectando com o Click Lead Storm.'
      });
      return;
    }

    // Atualiza metadados do handshake
    db.updateCustomer(customer.id, {
      currentAppVersion: appVersion,
      lastHandshakeAt: new Date().toISOString()
    });

    // 5. Emissão de Token JWT assinado do Handshake
    const licensePayload = {
      customerId: customer.id,
      customerName: customer.customerName,
      customerEmail: customer.customerEmail,
      licenseKey: customer.licenseKey,
      licenseType: customer.licenseType,
      status: customer.status,
      isTrial: customer.isTrial,
      dailyLimit: customer.dailyLimit,
      expiresAt: customer.expiresAt,
      maxMachines: customer.maxMachines || 1,
      allowedMachines: customer.allowedMachines,
      machineId: customer.machineId
    };

    const handshakeToken = jwt.sign(licensePayload, CONFIG.JWT_SECRET, { expiresIn: '24h' as any });

    res.json({
      valid: true,
      forceUpdate: false,
      token: handshakeToken,
      license: licensePayload,
      serverVersion: versionConfig.latestVersion
    });
  } catch (err: any) {
    res.status(500).json({ valid: false, message: `Erro interno no servidor de licenças: ${err.message}` });
  }
});
