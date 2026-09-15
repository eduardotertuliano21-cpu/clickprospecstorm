import { autoUpdater } from 'electron-updater';
import { app, BrowserWindow } from 'electron';
import { loggerService } from '../loggerService.js';

export interface UpdateProgressInfo {
  percent: number;
  bytesPerSecond: number;
  transferred: number;
  total: number;
}

class AutoUpdateService {
  private mainWindow: BrowserWindow | null = null;
  private isUpdateDownloaded: boolean = false;
  private checkInterval: NodeJS.Timeout | null = null;

  constructor() {
    this.setupUpdater();
  }

  private setupUpdater() {
    // Registra logs do autoUpdater no logger do sistema
    autoUpdater.logger = {
      info: (msg: any) => loggerService.info('AUTO_UPDATE', String(msg)),
      warn: (msg: any) => loggerService.warn('AUTO_UPDATE', String(msg)),
      error: (msg: any) => loggerService.error('AUTO_UPDATE', String(msg)),
      debug: (msg: any) => loggerService.info('AUTO_UPDATE', String(msg)),
    };

    // Baixa a atualização automaticamente em segundo plano
    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = true;

    autoUpdater.on('checking-for-update', () => {
      loggerService.info('AUTO_UPDATE', 'Verificando se há novas versões no GitHub Releases...');
      this.sendToRenderer('updater:checking');
    });

    autoUpdater.on('update-available', (info) => {
      loggerService.info('AUTO_UPDATE', `Nova versão encontrada: v${info.version}. Iniciando download em segundo plano...`);
      this.sendToRenderer('updater:available', {
        version: info.version,
        releaseDate: info.releaseDate,
        releaseNotes: info.releaseNotes,
      });
    });

    autoUpdater.on('update-not-available', (info) => {
      loggerService.info('AUTO_UPDATE', `Sistema está atualizado na versão mais recente (v${info.version}).`);
      this.sendToRenderer('updater:not-available', { version: info.version });
    });

    autoUpdater.on('error', (err) => {
      loggerService.warn('AUTO_UPDATE', `Erro ao verificar/baixar atualização: ${err?.message || err}`);
      this.sendToRenderer('updater:error', { message: err?.message || 'Erro no auto-update' });
    });

    autoUpdater.on('download-progress', (progressObj) => {
      const percent = Math.round(progressObj.percent || 0);
      loggerService.info('AUTO_UPDATE', `Download do update: ${percent}% (${Math.round(progressObj.transferred / 1024 / 1024)}MB / ${Math.round(progressObj.total / 1024 / 1024)}MB)`);
      this.sendToRenderer('updater:download-progress', {
        percent,
        bytesPerSecond: progressObj.bytesPerSecond,
        transferred: progressObj.transferred,
        total: progressObj.total,
      });
    });

    autoUpdater.on('update-downloaded', (info) => {
      this.isUpdateDownloaded = true;
      loggerService.info('AUTO_UPDATE', `Atualização v${info.version} baixada com sucesso e pronta para instalação!`);
      this.sendToRenderer('updater:downloaded', { version: info.version });
    });
  }

  public setMainWindow(win: BrowserWindow | null) {
    this.mainWindow = win;
  }

  private sendToRenderer(channel: string, data?: any) {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send(channel, data);
    }
  }

  public async checkForUpdates(): Promise<{ checking: boolean; message: string }> {
    if (!app.isPackaged) {
      loggerService.info('AUTO_UPDATE', 'Modo desenvolvimento detectado. Checagem de releases emulada.');
      return { checking: false, message: 'Modo desenvolvimento (App não empacotado)' };
    }

    try {
      loggerService.info('AUTO_UPDATE', 'Disparando checagem manual de atualizações...');
      await autoUpdater.checkForUpdates();
      return { checking: true, message: 'Verificando atualizações no GitHub Releases...' };
    } catch (err: any) {
      loggerService.error('AUTO_UPDATE', `Falha ao checar atualizações: ${err.message}`);
      return { checking: false, message: err.message };
    }
  }

  public quitAndInstall() {
    loggerService.info('AUTO_UPDATE', 'Reiniciando aplicação para aplicar a nova versão instalada...');
    autoUpdater.quitAndInstall(false, true);
  }

  public startPeriodicCheck() {
    if (this.checkInterval) clearInterval(this.checkInterval);

    // Checagem inicial 15 segundos após abrir o app
    setTimeout(() => {
      this.checkForUpdates().catch(() => {});
    }, 15000);

    // Checagem periódica a cada 30 minutos (30 * 60 * 1000)
    this.checkInterval = setInterval(() => {
      this.checkForUpdates().catch(() => {});
    }, 30 * 60 * 1000);
  }
}

export const autoUpdateService = new AutoUpdateService();
