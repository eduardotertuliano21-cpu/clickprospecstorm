import { app, BrowserWindow } from 'electron';
import path from 'path';
import fs from 'fs';
import os from 'os';
import crypto from 'crypto';
import cp from 'child_process';
import { loggerService } from './loggerService.js';
import { SUPABASE_CONFIG } from './config/supabaseConfig.js';
import { SupabaseLicenseClient } from './services/supabaseLicenseClient.js';

export interface LicenseData {
  machineId: string;
  hostname?: string;
  motherboardSerial?: string;
  systemUuid?: string;
  licenseKey: string;
  status: 'active' | 'trial' | 'blocked' | 'expired' | 'hardware_mismatch';
  isTrial: boolean;
  dailyLimit: number; // 20 para trial, 99999 para ativo
  expiresAt: string | null;
  customerName?: string;
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

  public getHardwareInfo(): { machineId: string; hostname: string; systemUuid: string; motherboardSerial: string } {
    let bb = '';
    let uuid = '';
    let bios = '';

    if (process.platform === 'win32') {
      try {
        try {
          uuid = cp.execSync('wmic csproduct get uuid', { encoding: 'utf8', timeout: 3000 })
            .replace(/UUID/i, '').trim();
        } catch {}
        try {
          bb = cp.execSync('wmic baseboard get serialnumber', { encoding: 'utf8', timeout: 3000 })
            .replace(/SerialNumber/i, '').trim();
        } catch {}
        try {
          bios = cp.execSync('wmic bios get serialnumber', { encoding: 'utf8', timeout: 3000 })
            .replace(/SerialNumber/i, '').trim();
        } catch {}
      } catch (err) {
        console.warn('[LicenseService] Falha ao coletar WMI de hardware:', err);
      }
    }

    const hostname = os.hostname() || 'DESKTOP-CLIENT';
    const cleanUuid = (uuid && uuid !== 'None') ? uuid : '';
    const cleanBb = (bb && bb !== 'None') ? bb : '';
    const cleanBios = (bios && bios !== 'None') ? bios : '';

    const hardwareSeed = `${cleanUuid}|${cleanBb}|${cleanBios}`.trim();
    const fallbackSeed = hardwareSeed.length > 5 ? hardwareSeed : `${hostname}|${os.platform()}|${os.arch()}|${os.cpus()[0]?.model || ''}`;
    const machineId = crypto.createHash('sha256').update(fallbackSeed).digest('hex').substring(0, 32);

    return {
      machineId,
      hostname,
      systemUuid: cleanUuid || cleanBb || machineId,
      motherboardSerial: cleanBb || cleanBios || 'N/A'
    };
  }

  public getMachineId(): string {
    return this.getHardwareInfo().machineId;
  }

  public getLicenseInfo(): LicenseData {
    if (this.currentLicense) return this.currentLicense;

    const hw = this.getHardwareInfo();
    const mId = hw.machineId;
    const licenseFilePath = this.getLicensePath();

    if (fs.existsSync(licenseFilePath)) {
      try {
        const raw = fs.readFileSync(licenseFilePath, 'utf8');
        const parsed = JSON.parse(raw);
        if (parsed) {
          // Atualiza dados de hardware em tempo de execução
          this.currentLicense = {
            ...parsed,
            machineId: mId,
            hostname: hw.hostname,
            systemUuid: hw.systemUuid,
            motherboardSerial: hw.motherboardSerial
          };
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
      hostname: hw.hostname,
      systemUuid: hw.systemUuid,
      motherboardSerial: hw.motherboardSerial,
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
    const hw = this.getHardwareInfo();
    const mId = hw.machineId;
    const hostname = hw.hostname;
    const appVersion = app?.getVersion() || '1.0.0';

    loggerService.info('LICENSE', `Validando chave de ativação: ${cleanKey.substring(0, 8)}... para máquina ${mId.substring(0, 8)} (${hostname})`);

    // 0. Se o Supabase estiver configurado, valida diretamente via RPC na nuvem
    if (SUPABASE_CONFIG.isConfigured) {
      try {
        const supaRes = await SupabaseLicenseClient.validateLicense({
          licenseKey: cleanKey,
          machineId: mId,
          hostname,
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
            hostname,
            systemUuid: hw.systemUuid,
            motherboardSerial: hw.motherboardSerial,
            licenseKey: cleanKey,
            status: supaRes.status || 'active',
            isTrial: !!supaRes.is_trial,
            dailyLimit: supaRes.daily_limit || (supaRes.is_trial ? 20 : 99999),
            expiresAt: supaRes.expires_at || null,
            customerName: supaRes.customer_name,
            ownerEmail: supaRes.customer_email || supaRes.customer_name,
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
        body: JSON.stringify({ licenseKey: cleanKey, machineId: mId, hostname, appVersion })
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
          hostname,
          systemUuid: hw.systemUuid,
          motherboardSerial: hw.motherboardSerial,
          licenseKey: body.license.licenseKey || cleanKey,
          status: body.license.status || 'active',
          isTrial: !!body.license.isTrial,
          dailyLimit: body.license.dailyLimit || (body.license.isTrial ? 20 : 99999),
          expiresAt: body.license.expiresAt,
          customerName: body.license.customerName,
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

    // Validação em segundo plano a cada 30 segundos para bloqueio/desbloqueio em tempo quase real
    this.checkInterval = setInterval(() => {
      this.performRemoteCheck().catch(() => {});
    }, 30 * 1000);

    // Checagem inicial
    this.performRemoteCheck().catch(() => {});
  }

  public async checkLicenseNow(): Promise<LicenseData> {
    await this.performRemoteCheck();
    return this.getLicenseInfo();
  }

  private async performRemoteCheck() {
    const lic = this.getLicenseInfo();
    const appVersion = app?.getVersion() || '1.0.0';

    const hw = this.getHardwareInfo();
    const hostname = lic.hostname || hw.hostname;

    // 0. Checagem periódica no Supabase Cloud
    if (SUPABASE_CONFIG.isConfigured && lic.licenseKey) {
      try {
        const supaRes = await SupabaseLicenseClient.validateLicense({
          licenseKey: lic.licenseKey,
          machineId: lic.machineId,
          hostname,
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
          lic.customerName = supaRes.customer_name || lic.customerName;
          lic.ownerEmail = supaRes.customer_email || lic.ownerEmail;
          lic.lastCheckedAt = new Date().toISOString();
          this.currentLicense = { ...lic };
          this.saveLicense(lic);
          this.notifyRenderer();
          return;
        } else {
          lic.status = supaRes.status || 'blocked';
          lic.message = supaRes.message || 'Licença bloqueada pelo Supabase.';
          loggerService.warn('LICENSE', `Licença bloqueada pelo Supabase Cloud: ${lic.message}`);
          this.currentLicense = { ...lic };
          this.saveLicense(lic);
          this.notifyRenderer();
          return;
        }
      } catch (err: any) {
        loggerService.warn('LICENSE', `Checagem periódica no Supabase falhou (${err.message}). Tentando servidor central.`);
      }
    }

    try {
      const serverUrl = this.getMasterServerUrl();
      const res = await fetch(`${serverUrl}/api/v1/license/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ licenseKey: lic.licenseKey, machineId: lic.machineId, hostname, appVersion })
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
        loggerService.warn('LICENSE', `[BLOQUEIO] Servidor retornou ${res.status}: ${lic.status.toUpperCase()} - ${lic.message}`);
        this.currentLicense = { ...lic };
        this.saveLicense(lic);
        this.notifyRenderer();
        return;
      }

      // Sucesso no Handshake
      if (res.ok && body.valid && body.license) {
        lic.status = body.license.status || 'active';
        lic.isTrial = !!body.license.isTrial;
        lic.dailyLimit = body.license.dailyLimit;
        lic.expiresAt = body.license.expiresAt !== undefined ? body.license.expiresAt : lic.expiresAt;
        lic.customerName = body.license.customerName || lic.customerName;
        lic.ownerEmail = body.license.customerEmail || lic.ownerEmail;
        lic.lastCheckedAt = new Date().toISOString();
        this.currentLicense = { ...lic };
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
