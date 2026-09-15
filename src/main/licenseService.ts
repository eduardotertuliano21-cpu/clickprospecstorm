import { app, BrowserWindow } from 'electron';
import path from 'path';
import fs from 'fs';
import os from 'os';
import crypto from 'crypto';
import { loggerService } from './loggerService.js';
import { SUPABASE_CONFIG } from './config/supabaseConfig.js';
import { SupabaseLicenseClient } from './services/supabaseLicenseClient.js';

export interface LicenseData {
  machineId: string;
  licenseKey: string;
  status: 'active' | 'trial' | 'blocked' | 'expired';
  isTrial: boolean;
  dailyLimit: number; // 20 para trial, 99999 para ativo
  expiresAt: string | null;
  ownerEmail?: string;
  lastCheckedAt: string;
  message?: string;
}

class LicenseService {
  private licenseFile: string = '';
  private currentLicense: LicenseData | null = null;
  private checkInterval: NodeJS.Timeout | null = null;
  private mainWindow: BrowserWindow | null = null;

  constructor() {
    try {
      const userData = app?.getPath('userData') || process.cwd();
      this.licenseFile = path.join(userData, 'license.json');
    } catch (e) {
      console.warn('[LicenseService] Falha ao definir caminho do arquivo de licença:', e);
    }
  }

  private getLicensePath(): string {
    try {
      const userData = app?.getPath('userData') || path.join(process.env.APPDATA || process.cwd(), 'click-lead-storm');
      return path.join(userData, 'license.json');
    } catch {
      return path.join(process.cwd(), 'license.json');
    }
  }

  public setMainWindow(win: BrowserWindow | null) {
    this.mainWindow = win;
  }

  public getMachineId(): string {
    try {
      const nics = os.networkInterfaces();
      const macs = Object.values(nics)
        .flat()
        .filter((n): n is os.NetworkInterfaceInfo => !!n && !n.internal && !!n.mac && n.mac !== '00:00:00:00:00:00')
        .map(n => n.mac)
        .sort()
        .join(';');
      const raw = [os.hostname(), os.platform(), os.arch(), os.cpus()[0]?.model || '', macs].join('|');
      return crypto.createHash('sha256').update(raw).digest('hex').substring(0, 32);
    } catch {
      const fallbackRaw = `${os.hostname()}-${os.platform()}-${os.arch()}`;
      return crypto.createHash('sha256').update(fallbackRaw).digest('hex').substring(0, 32);
    }
  }

  public getLicenseInfo(): LicenseData {
    if (this.currentLicense) return this.currentLicense;

    const mId = this.getMachineId();
    const licenseFilePath = this.getLicensePath();

    if (fs.existsSync(licenseFilePath)) {
      try {
        const raw = fs.readFileSync(licenseFilePath, 'utf8');
        const parsed = JSON.parse(raw);
        if (parsed && parsed.machineId === mId) {
          this.currentLicense = parsed;
          return this.currentLicense!;
        }
      } catch (err) {
        console.warn('[LicenseService] Erro ao carregar license.json salvo:', err);
      }
    }

    // Inicializa Trial padrão de 7 dias com cota reduzida de 20 envios/dia
    const trialExpires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    this.currentLicense = {
      machineId: mId,
      licenseKey: '',
      status: 'trial',
      isTrial: true,
      dailyLimit: 20,
      expiresAt: trialExpires,
      lastCheckedAt: new Date().toISOString(),
      message: 'Versão de Demonstração (Trial) ativa - Limite de 20 envios/dia.'
    };

    this.saveLicense(this.currentLicense);
    return this.currentLicense;
  }

  private getMasterServerUrl(): string {
    return process.env.CLS_MASTER_SERVER || 'http://192.168.3.123:4000';
  }

  public async verifyLicenseKey(key: string): Promise<LicenseData> {
    const cleanKey = (key || '').trim().toUpperCase();
    const mId = this.getMachineId();
    const appVersion = app?.getVersion() || '1.0.0';

    loggerService.info('LICENSE', `Validando chave de ativação: ${cleanKey.substring(0, 8)}... para máquina ${mId.substring(0, 8)}`);

    // 0. Se o Supabase estiver configurado, valida diretamente via RPC na nuvem
    if (SUPABASE_CONFIG.isConfigured) {
      try {
        const supaRes = await SupabaseLicenseClient.validateLicense({
          licenseKey: cleanKey,
          machineId: mId,
          appVersion
        });

        if (supaRes.force_update) {
          this.notifyForceUpdate({
            minVersionRequired: '1.0.0',
            latestVersion: '1.0.0',
            downloadUrl: 'https://github.com/clickleadstorm/desktop/releases',
            message: supaRes.message || 'Versão descontinuada. É obrigatório atualizar o Click Lead Storm.'
          });
          throw new Error(supaRes.message || 'Versão descontinuada. Atualize o sistema para prosseguir.');
        }

        if (supaRes.valid) {
          this.currentLicense = {
            machineId: mId,
            licenseKey: cleanKey,
            status: supaRes.status || 'active',
            isTrial: !!supaRes.is_trial,
            dailyLimit: supaRes.daily_limit || (supaRes.is_trial ? 20 : 99999),
            expiresAt: supaRes.expires_at || null,
            ownerEmail: supaRes.customer_name,
            lastCheckedAt: new Date().toISOString(),
            message: `Licença ${supaRes.is_trial ? 'Trial' : 'Comercial'} autenticada com sucesso via Supabase Cloud!`
          };
          this.saveLicense(this.currentLicense);
          this.notifyRenderer();
          return this.currentLicense;
        } else {
          throw new Error(supaRes.message || 'Chave de licença inválida ou inexistente.');
        }
      } catch (supaErr: any) {
        if (supaErr.message && !supaErr.message.includes('Falha na comunicação com o Supabase')) {
          throw supaErr;
        }
        loggerService.warn('LICENSE', `Supabase Cloud indisponível (${supaErr.message}). Tentando fallback.`);
      }
    }

    // 1. Tenta validação remota em tempo real com o Servidor Central
    try {
      const serverUrl = this.getMasterServerUrl();
      const res = await fetch(`${serverUrl}/api/v1/license/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ licenseKey: cleanKey, machineId: mId, appVersion })
      });

      const body: any = await res.json();

      if (res.status === 426 || body.forceUpdate) {
        this.notifyForceUpdate({
          minVersionRequired: body.minVersionRequired || '1.0.0',
          latestVersion: body.latestVersion || '1.0.0',
          downloadUrl: body.downloadUrl || 'https://github.com/clickleadstorm/desktop/releases',
          message: body.message
        });
        throw new Error(body.message || 'Versão descontinuada. É obrigatório atualizar o Click Lead Storm.');
      }

      if (res.ok && body.valid && body.license) {
        this.currentLicense = {
          machineId: mId,
          licenseKey: body.license.licenseKey || cleanKey,
          status: body.license.status || 'active',
          isTrial: !!body.license.isTrial,
          dailyLimit: body.license.dailyLimit || (body.license.isTrial ? 20 : 99999),
          expiresAt: body.license.expiresAt,
          ownerEmail: body.license.customerEmail,
          lastCheckedAt: new Date().toISOString(),
          message: `Licença ${body.license.isTrial ? 'Trial' : 'Comercial'} autenticada com sucesso pelo Servidor Central!`
        };
        this.saveLicense(this.currentLicense);
        this.notifyRenderer();
        return this.currentLicense;
      } else {
        throw new Error(body.message || 'Chave de ativação inválida no servidor central.');
      }
    } catch (netErr: any) {
      // Se a falha for rejeição direta do servidor, propaga o erro
      if (netErr.message && !netErr.message.includes('fetch failed')) {
        throw netErr;
      }
      loggerService.warn('LICENSE', `Servidor central indisponível (${netErr.message}). Utilizando validação offline.`);
    }

    // 2. Chaves de Desenvolvedor / Mestre para testes e suporte offline
    if (cleanKey.startsWith('MASTER-') || cleanKey.startsWith('DEV-') || cleanKey === 'CLS-ADMIN-LIFETIME') {
      this.currentLicense = {
        machineId: mId,
        licenseKey: cleanKey,
        status: 'active',
        isTrial: false,
        dailyLimit: 99999,
        expiresAt: null, // Vitalício
        ownerEmail: 'eduardo.tertuliano21@gmail.com',
        lastCheckedAt: new Date().toISOString(),
        message: 'Licença Vitalícia de Administrador ativada com sucesso (Offline)!'
      };
      this.saveLicense(this.currentLicense);
      this.notifyRenderer();
      return this.currentLicense;
    }

    // 3. Formato padrão CLS-XXXX-XXXX offline fallback
    if (cleanKey.startsWith('CLS-') && cleanKey.length >= 14) {
      const isTrial = cleanKey.includes('TRIAL');
      this.currentLicense = {
        machineId: mId,
        licenseKey: cleanKey,
        status: 'active',
        isTrial,
        dailyLimit: isTrial ? 20 : 99999,
        expiresAt: isTrial 
          ? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
          : new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
        lastCheckedAt: new Date().toISOString(),
        message: 'Licença validada offline com sucesso.'
      };
      this.saveLicense(this.currentLicense);
      this.notifyRenderer();
      return this.currentLicense;
    }

    throw new Error('Chave de licença inválida ou expirada. Contate o suporte.');
  }

  public startPeriodicCheck() {
    if (this.checkInterval) clearInterval(this.checkInterval);

    // Validação a cada 2 horas (2 * 60 * 60 * 1000)
    this.checkInterval = setInterval(() => {
      this.performRemoteCheck();
    }, 2 * 60 * 60 * 1000);

    // Checagem inicial
    this.performRemoteCheck();
  }

  private async performRemoteCheck() {
    const lic = this.getLicenseInfo();
    const appVersion = app?.getVersion() || '1.0.0';

    // 0. Checagem periódica no Supabase Cloud
    if (SUPABASE_CONFIG.isConfigured && lic.licenseKey) {
      try {
        const supaRes = await SupabaseLicenseClient.validateLicense({
          licenseKey: lic.licenseKey,
          machineId: lic.machineId,
          appVersion
        });

        if (supaRes.force_update) {
          loggerService.warn('LICENSE', `Atualização obrigatória detectada no Supabase.`);
          this.notifyForceUpdate({
            minVersionRequired: '1.0.0',
            latestVersion: '1.0.0',
            downloadUrl: 'https://github.com/clickleadstorm/desktop/releases',
            message: supaRes.message || 'Atualização obrigatória necessária.'
          });
          return;
        }

        if (supaRes.valid) {
          lic.status = supaRes.status || 'active';
          lic.isTrial = !!supaRes.is_trial;
          lic.dailyLimit = supaRes.daily_limit || (supaRes.is_trial ? 20 : 99999);
          lic.expiresAt = supaRes.expires_at || null;
          lic.lastCheckedAt = new Date().toISOString();
          this.saveLicense(lic);
          this.notifyRenderer();
          return;
        } else {
          lic.status = supaRes.status || 'blocked';
          lic.message = supaRes.message || 'Licença bloqueada pelo Supabase.';
          this.saveLicense(lic);
          this.notifyRenderer();
          return;
        }
      } catch (err: any) {
        loggerService.warn('LICENSE', `Checagem periódica no Supabase falhou (${err.message}). Tentando servidor local.`);
      }
    }

    try {
      const serverUrl = this.getMasterServerUrl();
      const res = await fetch(`${serverUrl}/api/v1/license/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ licenseKey: lic.licenseKey, machineId: lic.machineId, appVersion })
      });

      const body: any = await res.json();

      // Checagem de Versão Descontinuada / Forçar Atualização
      if (res.status === 426 || body.forceUpdate) {
        loggerService.warn('LICENSE', `Atualização obrigatória detectada: v${appVersion} < v${body.minVersionRequired}`);
        this.notifyForceUpdate({
          minVersionRequired: body.minVersionRequired || '1.0.0',
          latestVersion: body.latestVersion || '1.0.0',
          downloadUrl: body.downloadUrl || 'https://github.com/clickleadstorm/desktop/releases',
          message: body.message
        });
        return;
      }

      // Checagem de Bloqueio ou Expiração
      if (res.status === 403 || res.status === 404) {
        lic.status = body.status || 'blocked';
        lic.message = body.message || 'Licença bloqueada pelo servidor central.';
        this.saveLicense(lic);
        this.notifyRenderer();
        return;
      }

      // Sucesso no Handshake
      if (res.ok && body.valid && body.license) {
        lic.status = body.license.status || 'active';
        lic.isTrial = !!body.license.isTrial;
        lic.dailyLimit = body.license.dailyLimit;
        lic.expiresAt = body.license.expiresAt;
        lic.lastCheckedAt = new Date().toISOString();
        this.saveLicense(lic);
        this.notifyRenderer();
        return;
      }
    } catch (err: any) {
      loggerService.warn('LICENSE', `Handshake com servidor central falhou (${err.message}). Continuando offline.`);
    }

    // Verificação local de expiração de trial caso esteja offline
    if (lic.isTrial && lic.expiresAt) {
      if (new Date(lic.expiresAt).getTime() < Date.now()) {
        loggerService.warn('LICENSE', 'Período de testes (Trial) expirado.');
        lic.status = 'expired';
        lic.message = 'Seu período de teste de 7 dias encerrou. Adquira uma licença para continuar.';
        this.saveLicense(lic);
        this.notifyRenderer();
      }
    }

    lic.lastCheckedAt = new Date().toISOString();
    this.saveLicense(lic);
  }

  private saveLicense(data: LicenseData) {
    try {
      const file = this.getLicensePath();
      const dir = path.dirname(file);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
    } catch (err) {
      console.warn('[LicenseService] Falha ao gravar license.json:', err);
    }
  }

  private notifyRenderer() {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send('license:status-changed', this.currentLicense);
    }
  }

  private notifyForceUpdate(info: { minVersionRequired: string; latestVersion: string; downloadUrl: string; message: string }) {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send('license:force-update', info);
    }
  }
}

export const licenseService = new LicenseService();
