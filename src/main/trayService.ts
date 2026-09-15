import { app, BrowserWindow, Menu, Tray, nativeImage, Notification } from 'electron';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class TrayService {
  private tray: Tray | null = null;
  private mainWindow: BrowserWindow | null = null;
  private isAutoResponderEnabled: boolean = true;
  private isCampaignRunning: boolean = false;
  private whatsappStatus: 'Conectado' | 'Desconectado' = 'Desconectado';

  public init(win: BrowserWindow) {
    this.mainWindow = win;
    this.createTray();
  }

  public setMainWindow(win: BrowserWindow) {
    this.mainWindow = win;
  }

  private getTrayIcon() {
    // Busca ícone compatível na pasta de ícones do projeto
    const possiblePaths = [
      path.join(__dirname, '../../public/icons/logo.png'),
      path.join(__dirname, '../../public/logo.png'),
      path.join(process.cwd(), 'public/icons/logo.png'),
      path.join(process.cwd(), 'public/logo.png'),
      path.join(__dirname, '../../public/icons/icon16.png'),
      path.join(__dirname, '../../dist/icons/icon16.png'),
    ];

    for (const iconPath of possiblePaths) {
      if (fs.existsSync(iconPath)) {
        const img = nativeImage.createFromPath(iconPath);
        if (!img.isEmpty()) {
          return img.resize({ width: 16, height: 16 });
        }
      }
    }

    return nativeImage.createEmpty();
  }

  public createTray() {
    if (this.tray) return;

    try {
      const icon = this.getTrayIcon();
      this.tray = new Tray(icon);
      this.tray.setToolTip('Click Lead Storm - B2B Prospect & CRM');

      // Cliques no ícone da bandeja restauram e trazem o app para o topo
      this.tray.on('double-click', () => {
        this.showMainWindow();
      });

      this.tray.on('click', () => {
        this.showMainWindow();
      });

      this.updateTrayMenu();
    } catch (err) {
      console.warn('[TrayService] Falha ao inicializar Tray:', err);
    }
  }

  public updateTrayMenu() {
    if (!this.tray) return;

    const contextMenu = Menu.buildFromTemplate([
      // 1. Status Informativo (Não clicável)
      {
        label: `WhatsApp: ${this.whatsappStatus === 'Conectado' ? '🟢 Conectado' : '🔴 Desconectado'}`,
        enabled: false
      },
      { type: 'separator' },

      // 2. Toggle Nativo: Auto-IA (Respostas Automáticas)
      {
        label: 'Respostas Automáticas (Auto-IA)',
        type: 'checkbox',
        checked: this.isAutoResponderEnabled,
        click: (menuItem) => {
          this.isAutoResponderEnabled = menuItem.checked;
          if (this.mainWindow && !this.mainWindow.isDestroyed()) {
            this.mainWindow.webContents.send('auto-responder:status-changed', this.isAutoResponderEnabled);
          }
          this.updateTrayMenu();
        }
      },

      // 3. Controle Rápido do Disparador
      {
        label: this.isCampaignRunning ? '⏸️ Pausar Disparos Atuais' : '▶️ Retomar Disparos',
        enabled: true,
        click: () => {
          if (this.mainWindow && !this.mainWindow.isDestroyed()) {
            this.mainWindow.webContents.send('campaign:toggle-pause');
          }
        }
      },
      { type: 'separator' },

      // 4. Abertura e Encerramento
      {
        label: 'Abrir Painel do Click Lead Storm',
        click: () => {
          this.showMainWindow();
        }
      },
      {
        label: 'Fechar Totalmente o Sistema',
        click: () => {
          (app as any).isQuitting = true;
          app.quit();
        }
      }
    ]);

    this.tray.setContextMenu(contextMenu);
  }

  public showMainWindow() {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      if (this.mainWindow.isMinimized()) {
        this.mainWindow.restore();
      }
      this.mainWindow.show();
      this.mainWindow.focus();
    }
  }

  public setWhatsAppStatus(status: 'Conectado' | 'Desconectado') {
    if (this.whatsappStatus !== status) {
      this.whatsappStatus = status;
      this.updateTrayMenu();
    }
  }

  public setAutoResponderStatus(enabled: boolean) {
    if (this.isAutoResponderEnabled !== enabled) {
      this.isAutoResponderEnabled = enabled;
      this.updateTrayMenu();
    }
  }

  public setCampaignStatus(running: boolean) {
    if (this.isCampaignRunning !== running) {
      this.isCampaignRunning = running;
      this.updateTrayMenu();
    }
  }

  public showLeadReplyNotification(data: { senderName?: string; phone: string; previewText: string; channel?: string }) {
    try {
      if (!Notification.isSupported()) return;

      const title = `Nova Mensagem: ${data.senderName || data.phone}`;
      const body = data.previewText.length > 90 ? data.previewText.substring(0, 90) + '...' : data.previewText;

      const iconPath = path.join(__dirname, '../../public/icons/logo.png');
      const notification = new Notification({
        title,
        body,
        icon: fs.existsSync(iconPath) ? iconPath : undefined
      });

      notification.on('click', () => {
        this.showMainWindow();
      });

      notification.show();
    } catch (err) {
      console.warn('[TrayService] Falha ao disparar notificação de lead:', err);
    }
  }

  public showCampaignCompletedNotification(data: { totalSent: number; failed: number }) {
    try {
      if (!Notification.isSupported()) return;

      const iconPath = path.join(__dirname, '../../public/icons/logo.png');
      const notification = new Notification({
        title: 'Campanha de Disparos Concluída! 🚀',
        body: `Envios finalizados com sucesso: ${data.totalSent}. Falhas: ${data.failed}.`,
        icon: fs.existsSync(iconPath) ? iconPath : undefined
      });

      notification.on('click', () => {
        this.showMainWindow();
      });

      notification.show();
    } catch (err) {
      console.warn('[TrayService] Falha ao disparar notificação de campanha:', err);
    }
  }

  public destroy() {
    if (this.tray) {
      this.tray.destroy();
      this.tray = null;
    }
  }
}

export const trayService = new TrayService();
