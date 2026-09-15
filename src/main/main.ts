import { app, BrowserWindow, ipcMain, shell } from 'electron';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { whatsappService } from './whatsappService.js';
import { loggerService } from './loggerService.js';
import { mapsScraperMain } from './mapsScraperMain.js';
import { emailService } from './emailService.js';
import { metaService } from './metaService.js';
import { metaAuthService } from './metaAuthService.js';
import { metaWebAuthService } from './metaWebAuthService.js';
import { linkedinService } from './linkedinService.js';
import { trayService } from './trayService.js';
import { licenseService } from './licenseService.js';
import { autoUpdateService } from './services/autoUpdateService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 1. Persistência de dados em %APPDATA%/click-lead-storm
const customUserDataPath = path.join(app.getPath('appData'), 'click-lead-storm');
if (!fs.existsSync(customUserDataPath)) {
  fs.mkdirSync(customUserDataPath, { recursive: true });
}
app.setPath('userData', customUserDataPath);

// Captura global de exceções para rastreabilidade nos logs
process.on('uncaughtException', (err) => {
  try {
    loggerService.error('CRASH', `uncaughtException: ${err?.stack || err?.message || err}`);
  } catch {}
  console.error('[CRASH uncaughtException]', err);
});

process.on('unhandledRejection', (reason: any) => {
  try {
    loggerService.error('CRASH', `unhandledRejection: ${reason?.stack || reason?.message || reason}`);
  } catch {}
  console.error('[CRASH unhandledRejection]', reason);
});

// Trava de Instância Única: previne múltiplas janelas/processos simultâneos
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  try {
    loggerService.warn('MAIN', 'Segunda instância detectada e encerrada. A janela existente será restaurada.');
  } catch {}
  app.quit();
  process.exit(0);
}

app.on('second-instance', () => {
  try {
    loggerService.info('MAIN', 'Evento second-instance recebido. Restaurando e trazendo a janela para o foco.');
  } catch {}
  if (mainWindow && !mainWindow.isDestroyed()) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  }
});

let mainWindow: BrowserWindow | null = null;
let splashWindow: BrowserWindow | null = null;
let splashShownTime: number = 0;

function createSplashScreen(resolvedIcon?: string) {
  splashShownTime = Date.now();
  splashWindow = new BrowserWindow({
    width: 580,
    height: 360,
    frame: false,
    resizable: false,
    transparent: false,
    alwaysOnTop: true,
    center: true,
    show: true, // Exibe instantaneamente ao clicar sem lag
    icon: resolvedIcon,
    backgroundColor: '#090d16',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  const splashDist = path.join(__dirname, '../../dist/splash.html');
  const splashPublic = path.join(__dirname, '../../public/splash.html');
  const target = fs.existsSync(splashDist) ? splashDist : splashPublic;

  if (fs.existsSync(target)) {
    splashWindow.loadFile(target).catch(err => {
      loggerService.error('SPLASH', `Falha ao carregar splash.html: ${err.message}`);
    });
  }
}

function createMainWindow(resolvedIcon?: string) {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1080,
    minHeight: 700,
    title: 'Click Lead Storm - Desktop CRM & Prospecção WhatsApp',
    backgroundColor: '#020617', // slate-950
    autoHideMenuBar: true,
    show: false, // Inicia oculto até a conclusão da Splash Screen
    icon: resolvedIcon,
    webPreferences: {
      webviewTag: false,
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, '../preload/index.cjs'),
      sandbox: false
    }
  });

  // Conecta os serviços à janela principal para envio de eventos
  whatsappService.setMainWindow(mainWindow);
  loggerService.setMainWindow(mainWindow);
  metaWebAuthService.setMainWindow(mainWindow);
  linkedinService.setMainWindow(mainWindow);
  trayService.init(mainWindow);
  licenseService.setMainWindow(mainWindow);
  licenseService.startPeriodicCheck();
  autoUpdateService.setMainWindow(mainWindow);
  autoUpdateService.startPeriodicCheck();
  loggerService.info('SYSTEM', 'Janela principal, Auto-Update e Bandeja do Sistema (Tray) criadas com sucesso.');

  mainWindow.webContents.on('console-message', (_event, level, message, line, sourceId) => {
    loggerService.info('RENDERER', `[L${level}] ${message} (${sourceId}:${line})`);
  });

  mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
    loggerService.error('RENDERER', `Falha ao carregar ${validatedURL}: [${errorCode}] ${errorDescription}`);
    transitionToMain();
  });

  // Em desenvolvimento ou produção, carrega a UI React compilada
  const distHtmlPath = path.join(__dirname, '../../dist/src/sidepanel/index.html');
  const fallbackHtmlPath = path.join(__dirname, '../../dist/index.html');

  if (fs.existsSync(distHtmlPath)) {
    loggerService.info('MAIN', `Carregando interface principal: ${distHtmlPath}`);
    mainWindow.loadFile(distHtmlPath).catch(err => {
      loggerService.error('MAIN', `Erro loadFile distHtmlPath: ${err.message}`);
    });
  } else if (fs.existsSync(fallbackHtmlPath)) {
    loggerService.info('MAIN', `Carregando interface fallback: ${fallbackHtmlPath}`);
    mainWindow.loadFile(fallbackHtmlPath).catch(err => {
      loggerService.error('MAIN', `Erro loadFile fallbackHtmlPath: ${err.message}`);
    });
  } else {
    // Modo desenvolvimento se o servidor Vite estiver ativo
    mainWindow.loadURL('http://localhost:5173/src/sidepanel/index.html').catch(() => {
      console.warn('Vite dev server não detectado na porta 5173. Aguardando build...');
    });
  }

  // Transição garantida da Splash Screen para a Janela Principal
  let hasTransitioned = false;
  const transitionToMain = () => {
    if (hasTransitioned) return;
    hasTransitioned = true;

    try {
      if (splashWindow && !splashWindow.isDestroyed()) {
        splashWindow.destroy();
        splashWindow = null;
      }
    } catch (e) {
      console.warn('Erro ao fechar splashWindow:', e);
    }

    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.show();
      mainWindow.focus();
      loggerService.info('MAIN', 'Janela principal exibida com sucesso.');
    }
  };

  mainWindow.once('ready-to-show', () => {
    loggerService.info('MAIN', 'Evento ready-to-show recebido da janela principal.');
    const elapsed = Date.now() - splashShownTime;
    const minSplashDuration = 3500; // 3.5 segundos elegantes
    const delay = Math.max(0, minSplashDuration - elapsed);
    setTimeout(transitionToMain, delay);
  });

  // Fallback de segurança: se ready-to-show demorar mais de 5s, exibe obrigatoriamente
  setTimeout(() => {
    if (!hasTransitioned) {
      loggerService.warn('MAIN', 'Timeout de ready-to-show: forçando exibição da janela principal.');
      transitionToMain();
    }
  }, 5000);

  // Previne navegação fora do app
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https:') || url.startsWith('http:')) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  // Minimiza para a bandeja do sistema ao fechar a janela, mantendo o processo em segundo plano
  mainWindow.on('close', (event) => {
    if (!(app as any).isQuitting) {
      event.preventDefault();
      mainWindow?.hide();
      loggerService.info('MAIN', 'Janela minimizada para a bandeja do sistema.');
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// IPC Handlers para o ciclo de vida do WhatsApp (Baileys)
ipcMain.handle('wa-init', async () => {
  return await whatsappService.initWhatsApp();
});

ipcMain.handle('wa-logout', async () => {
  await whatsappService.disconnectWhatsApp();
  return { success: true };
});

ipcMain.handle('wa-send-message', async (_event, data: { phone: string; text: string }) => {
  return await whatsappService.sendWhatsAppMessage(data.phone, data.text);
});

ipcMain.handle('wa-get-status', () => {
  return whatsappService.getStatus();
});

// Verificação de números no WhatsApp (Baileys onWhatsApp)
ipcMain.handle('wa-check-numbers', async (_event, phones: string[]) => {
  return await whatsappService.checkNumbersOnWhatsApp(phones);
});

// Raspador nativo do Google Maps com Chromium offscreen
ipcMain.handle('scrape-google-maps', async (_event, data: { query: string; limit?: number }) => {
  return await mapsScraperMain.scrapeGoogleMaps(data.query, data.limit || 25);
});

// Busca inteligente de CNPJ por nome e cidade
ipcMain.handle('find-company-cnpj', async (_event, data: { companyName: string; city?: string }) => {
  try {
    const cleanName = data.companyName.replace(/["']/g, '').trim();
    const cleanCity = (data.city || '').replace(/["']/g, '').trim();
    const query = `"${cleanName}" ${cleanCity} CNPJ`;
    const res = await fetch(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });
    if (!res.ok) return null;
    const text = await res.text();
    const match = text.match(/\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}/);
    return match ? match[0] : null;
  } catch (err: any) {
    loggerService.warn('PROSPECT', `Erro ao buscar CNPJ de ${data.companyName}:`, err?.message);
    return null;
  }
});

// --- MÓDULOS OMNICHANNEL (E-mail, Meta, Despachador Universal) ---
ipcMain.handle('email-test-connection', async (_event, config) => {
  return await emailService.testConnection(config);
});

ipcMain.handle('email-send', async (_event, payload) => {
  return await emailService.sendEmail(payload);
});

ipcMain.handle('meta-test-connection', async (_event, config) => {
  return await metaService.testConnection(config);
});

ipcMain.handle('meta-send-message', async (_event, payload) => {
  return await metaService.sendMessage(payload);
});

// Meta OAuth: Autenticação automática via popup do Facebook
ipcMain.handle('meta:start-oauth', async (_event, data: { appId: string; appSecret: string }) => {
  return await metaAuthService.startOAuth(data.appId, data.appSecret);
});

ipcMain.handle('meta:disconnect', async () => {
  loggerService.info('META_AUTH', 'Conta Meta desconectada pelo usuário.');
  return { success: true };
});

// --- AUTENTICAÇÃO WEBVIEW NATIVA (Zero Configuração para o Cliente) ---
ipcMain.handle('auth:instagram-login', async () => {
  return await metaWebAuthService.loginInstagram();
});

ipcMain.handle('auth:instagram-logout', async () => {
  return await metaWebAuthService.logoutInstagram();
});

ipcMain.handle('auth:instagram-status', async () => {
  return await metaWebAuthService.getInstagramStatus();
});

ipcMain.handle('auth:facebook-login', async () => {
  return await metaWebAuthService.loginFacebook();
});

ipcMain.handle('auth:facebook-logout', async () => {
  return await metaWebAuthService.logoutFacebook();
});

ipcMain.handle('auth:facebook-status', async () => {
  return await metaWebAuthService.getFacebookStatus();
});

// --- LINKEDIN PROSPECTION & AUTH (Localização de Contatos & Sessão Webview) ---
ipcMain.handle('linkedin:search-leads', async (_event, data: { role?: string; company?: string; location?: string; limit?: number }) => {
  return await linkedinService.searchLinkedInProfiles(data);
});

ipcMain.handle('linkedin:find-decision-makers', async (_event, data: { companyName: string; city?: string }) => {
  return await linkedinService.findCompanyDecisionMakers(data.companyName, data.city);
});

ipcMain.handle('auth:linkedin-login', async () => {
  return await linkedinService.loginLinkedIn();
});

ipcMain.handle('auth:linkedin-logout', async () => {
  return await linkedinService.logoutLinkedIn();
});

ipcMain.handle('auth:linkedin-status', async () => {
  return await linkedinService.getLinkedInStatus();
});

const handleOmniSendMessage = async (data: {
  channel: 'whatsapp' | 'email' | 'instagram' | 'messenger';
  recipient: string;
  content: string;
  subject?: string;
  channelConfig?: any;
}) => {
  const { channel, recipient, content, subject, channelConfig } = data;

  if (channel === 'whatsapp') {
    return await whatsappService.sendWhatsAppMessage(recipient, content);
  } else if (channel === 'email') {
    if (!channelConfig) throw new Error('Configuração de SMTP de e-mail não configurada em Ajustes.');
    return await emailService.sendEmail({
      to: recipient,
      subject: subject || 'Contato Comercial',
      text: content,
      config: channelConfig
    });
  } else if (channel === 'instagram' || channel === 'messenger') {
    if (!channelConfig) throw new Error('Configuração da Meta Graph API não configurada em Ajustes.');
    return await metaService.sendMessage({
      recipientId: recipient,
      text: content,
      channel,
      config: channelConfig
    });
  }

  throw new Error(`Canal não suportado: ${channel}`);
};

ipcMain.handle('omni-send-message', async (_event, data) => handleOmniSendMessage(data));
ipcMain.handle('omni:send-message', async (_event, data) => handleOmniSendMessage(data));

// IPC Handlers de Sistema e Janela
ipcMain.handle('get-app-version', () => app.getVersion());

// Handlers de Diagnóstico e Logs
ipcMain.handle('get-system-logs', () => {
  return loggerService.getRecentLogs();
});

ipcMain.handle('clear-system-logs', () => {
  loggerService.clearLogs();
  return { success: true };
});

ipcMain.handle('open-log-directory', async () => {
  const dir = loggerService.getLogDir();
  await shell.openPath(dir);
  return { success: true, dir };
});

ipcMain.handle('write-renderer-log', (_event, data: { level: 'info' | 'warn' | 'error' | 'debug'; tag: string; message: string; meta?: any }) => {
  loggerService.log(data.level || 'info', data.tag || 'FRONTEND', data.message || '', data.meta);
  return { success: true };
});

ipcMain.on('window-minimize', () => {
  mainWindow?.minimize();
});

ipcMain.on('window-maximize', () => {
  if (mainWindow?.isMaximized()) {
    mainWindow.unmaximize();
  } else {
    mainWindow?.maximize();
  }
});

ipcMain.on('window-close', () => {
  if (!(app as any).isQuitting) {
    mainWindow?.hide();
  } else {
    mainWindow?.close();
  }
});

// Handlers de sincronização do System Tray
ipcMain.on('tray:set-campaign-status', (_event, running: boolean) => {
  trayService.setCampaignStatus(running);
});

ipcMain.on('tray:set-auto-responder-status', (_event, enabled: boolean) => {
  trayService.setAutoResponderStatus(enabled);
});

ipcMain.on('tray:set-whatsapp-status', (_event, status: 'Conectado' | 'Desconectado') => {
  trayService.setWhatsAppStatus(status);
});

// Handlers de Licença e Bloqueio Remoto
ipcMain.handle('license:get-info', () => {
  return licenseService.getLicenseInfo();
});

ipcMain.handle('license:verify-key', async (_event, key: string) => {
  return await licenseService.verifyLicenseKey(key);
});

// Handlers de Auto-Update Contínuo
ipcMain.handle('updater:check', async () => {
  return await autoUpdateService.checkForUpdates();
});

ipcMain.handle('updater:quit-and-install', () => {
  autoUpdateService.quitAndInstall();
  return true;
});

ipcMain.handle('open-external', async (_event, url: string) => {
  if (url && (url.startsWith('https:') || url.startsWith('http:'))) {
    await shell.openExternal(url);
    return true;
  }
  return false;
});

// Handlers de Notificações Nativas do Windows
ipcMain.on('notify:lead-reply', (_event, data: { senderName?: string; phone: string; previewText: string; channel?: string }) => {
  trayService.showLeadReplyNotification(data);
});

ipcMain.on('notify:campaign-completed', (_event, data: { totalSent: number; failed: number }) => {
  trayService.showCampaignCompletedNotification(data);
});

app.whenReady().then(() => {
  const iconPath = path.join(__dirname, '../../public/icons/logo.png');
  const iconIcoPath = path.join(__dirname, '../../public/icons/icon.ico');
  const resolvedIcon = fs.existsSync(iconPath) ? iconPath : (fs.existsSync(iconIcoPath) ? iconIcoPath : undefined);

  // 1. Exibe a Splash Screen instantaneamente ao clicar
  createSplashScreen(resolvedIcon);

  // 2. Inicia o carregamento da janela principal em segundo plano
  setTimeout(() => {
    createMainWindow(resolvedIcon);
  }, 100);

  // Se já houver credenciais salvas em disco, inicializa conexão em segundo plano
  const authDir = path.join(app.getPath('userData'), 'baileys_auth');
  const credsFile = path.join(authDir, 'creds.json');
  if (fs.existsSync(credsFile)) {
    console.log('[Main] Credenciais encontradas, reconectando WhatsApp automaticamente...');
    whatsappService.initWhatsApp().catch((err) => {
      console.warn('[Main] Falha na auto-reconexão inicial do WhatsApp:', err);
    });
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow(resolvedIcon);
    } else if (mainWindow) {
      mainWindow.show();
    }
  });
});

app.on('before-quit', () => {
  (app as any).isQuitting = true;
  trayService.destroy();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin' && (app as any).isQuitting) {
    app.quit();
  }
});
