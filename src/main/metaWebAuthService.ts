import { BrowserWindow, session } from 'electron';
import { loggerService } from './loggerService.js';

let mainWindowRef: BrowserWindow | null = null;

// Cache em memória para o username e nome detectados
let cachedInstagramUser: string | null = null;
let cachedFacebookName: string | null = null;

export const metaWebAuthService = {
  setMainWindow(window: BrowserWindow | null) {
    mainWindowRef = window;
  },

  getSession() {
    return session.fromPartition('persist:meta_sessions');
  },

  /**
   * Verifica se há sessão ativa do Instagram através dos cookies
   */
  async getInstagramStatus(): Promise<{ connected: boolean; username?: string }> {
    try {
      const sess = this.getSession();
      const cookies = await sess.cookies.get({ domain: '.instagram.com' });
      const hasSession = cookies.some(c => c.name === 'sessionid' && c.value);
      const dsUser = cookies.find(c => c.name === 'ds_user_id')?.value;

      if (!hasSession) {
        cachedInstagramUser = null;
        return { connected: false };
      }

      return {
        connected: true,
        username: cachedInstagramUser || (dsUser ? `user_${dsUser}` : 'instagram_user')
      };
    } catch (err: any) {
      loggerService.error('META_WEB', 'Erro ao checar status do Instagram:', err?.message);
      return { connected: false };
    }
  },

  /**
   * Abre janela webview modal para login no Instagram Web
   */
  async loginInstagram(): Promise<{ success: boolean; connected: boolean; username?: string; error?: string }> {
    loggerService.info('META_WEB', 'Abrindo janela de login do Instagram Web...');

    return new Promise((resolve) => {
      const authWin = new BrowserWindow({
        width: 500,
        height: 720,
        title: 'Entrar no Instagram',
        parent: mainWindowRef || undefined,
        modal: true,
        center: true,
        autoHideMenuBar: true,
        webPreferences: {
          partition: 'persist:meta_sessions',
          contextIsolation: false
        }
      });

      let resolved = false;
      let checkInterval: NodeJS.Timeout | null = null;

      const finishLogin = async (username: string) => {
        if (resolved) return;
        resolved = true;
        if (checkInterval) clearInterval(checkInterval);
        cachedInstagramUser = username;
        loggerService.info('META_WEB', `Instagram conectado com sucesso: @${username}`);
        
        try {
          authWin.close();
        } catch {}

        resolve({ success: true, connected: true, username });
      };

      const checkLoginSuccess = async () => {
        if (resolved) return;
        try {
          const sess = this.getSession();
          const cookies = await sess.cookies.get({ domain: '.instagram.com' });
          const hasSession = cookies.some(c => c.name === 'sessionid' && c.value);
          const currentUrl = authWin.webContents.getURL() || '';

          // Se tiver cookie de sessão e saiu da tela de login/cadastro
          if (hasSession && !currentUrl.includes('/accounts/login') && !currentUrl.includes('/accounts/emailsignup')) {
            // Tenta extrair o nome de usuário do DOM
            let detectedUsername = '';
            try {
              detectedUsername = await authWin.webContents.executeJavaScript(`
                (() => {
                  try {
                    // 1. Link do perfil na barra de navegação
                    const links = Array.from(document.querySelectorAll('a[href]'));
                    for (const a of links) {
                      const href = a.getAttribute('href') || '';
                      const m = href.match(/^\\/([a-zA-Z0-9._]{3,30})\\/?$/);
                      if (m && !['explore', 'direct', 'reels', 'stories', 'your_activity', 'accounts'].includes(m[1])) {
                        return m[1];
                      }
                    }
                    // 2. Imagem de avatar com alt contendo username
                    const avatar = document.querySelector('img[alt*="profile picture"]');
                    if (avatar) {
                      const alt = avatar.getAttribute('alt') || '';
                      const m = alt.match(/^([^'\\s]+)/);
                      if (m) return m[1];
                    }
                  } catch {}
                  return '';
                })()
              `);
            } catch {}

            const dsUser = cookies.find(c => c.name === 'ds_user_id')?.value;
            const finalUsername = detectedUsername || (dsUser ? `user_${dsUser}` : 'instagram_conectado');
            await finishLogin(finalUsername);
          }
        } catch {}
      };

      authWin.webContents.on('did-finish-load', () => {
        checkLoginSuccess();
      });

      authWin.webContents.on('did-navigate', () => {
        checkLoginSuccess();
      });

      // Checagem periódica a cada 1.5s enquanto a janela estiver aberta
      checkInterval = setInterval(() => {
        checkLoginSuccess();
      }, 1500);

      authWin.on('closed', () => {
        if (checkInterval) clearInterval(checkInterval);
        if (!resolved) {
          resolved = true;
          loggerService.info('META_WEB', 'Janela de login do Instagram fechada pelo usuário.');
          resolve({ success: false, connected: false, error: 'Login cancelado.' });
        }
      });

      authWin.loadURL('https://www.instagram.com/accounts/login/').catch((err) => {
        loggerService.error('META_WEB', 'Erro ao carregar Instagram login:', err?.message);
      });
    });
  },

  /**
   * Desconecta a conta do Instagram limpando cookies e storage
   */
  async logoutInstagram(): Promise<{ success: boolean }> {
    try {
      loggerService.info('META_WEB', 'Desconectando conta do Instagram...');
      const sess = this.getSession();
      const cookies = await sess.cookies.get({ domain: '.instagram.com' });
      for (const c of cookies) {
        const rawDomain = c.domain || 'instagram.com';
        const domain = rawDomain.startsWith('.') ? rawDomain.slice(1) : rawDomain;
        await sess.cookies.remove(`https://${domain}${c.path}`, c.name).catch(() => {});
      }
      await sess.clearStorageData({
        origin: 'https://www.instagram.com',
        storages: ['cookies', 'localstorage', 'cachestorage']
      });
      cachedInstagramUser = null;
      return { success: true };
    } catch (err: any) {
      loggerService.error('META_WEB', 'Erro ao desconectar Instagram:', err?.message);
      return { success: false };
    }
  },

  /**
   * Verifica se há sessão ativa do Facebook Messenger através dos cookies
   */
  async getFacebookStatus(): Promise<{ connected: boolean; name?: string }> {
    try {
      const sess = this.getSession();
      const fbCookies = await sess.cookies.get({ domain: '.facebook.com' });
      const msCookies = await sess.cookies.get({ domain: '.messenger.com' });
      const hasCUser = [...fbCookies, ...msCookies].some(c => c.name === 'c_user' && c.value);

      if (!hasCUser) {
        cachedFacebookName = null;
        return { connected: false };
      }

      return {
        connected: true,
        name: cachedFacebookName || 'Perfil Conectado'
      };
    } catch (err: any) {
      loggerService.error('META_WEB', 'Erro ao checar status do Facebook:', err?.message);
      return { connected: false };
    }
  },

  /**
   * Abre janela webview modal para login no Facebook Messenger
   */
  async loginFacebook(): Promise<{ success: boolean; connected: boolean; name?: string; error?: string }> {
    loggerService.info('META_WEB', 'Abrindo janela de login do Facebook Messenger...');

    return new Promise((resolve) => {
      const authWin = new BrowserWindow({
        width: 550,
        height: 750,
        title: 'Entrar no Facebook Messenger',
        parent: mainWindowRef || undefined,
        modal: true,
        center: true,
        autoHideMenuBar: true,
        webPreferences: {
          partition: 'persist:meta_sessions',
          contextIsolation: false
        }
      });

      let resolved = false;
      let checkInterval: NodeJS.Timeout | null = null;

      const finishLogin = async (name: string) => {
        if (resolved) return;
        resolved = true;
        if (checkInterval) clearInterval(checkInterval);
        cachedFacebookName = name;
        loggerService.info('META_WEB', `Facebook Messenger conectado: ${name}`);

        try {
          authWin.close();
        } catch {}

        resolve({ success: true, connected: true, name });
      };

      const checkLoginSuccess = async () => {
        if (resolved) return;
        try {
          const sess = this.getSession();
          const fbCookies = await sess.cookies.get({ domain: '.facebook.com' });
          const msCookies = await sess.cookies.get({ domain: '.messenger.com' });
          const hasCUser = [...fbCookies, ...msCookies].some(c => c.name === 'c_user' && c.value);
          const currentUrl = authWin.webContents.getURL() || '';

          if (hasCUser && !currentUrl.includes('/login')) {
            let detectedName = '';
            try {
              detectedName = await authWin.webContents.executeJavaScript(`
                (() => {
                  try {
                    const title = document.title;
                    if (title && !title.toLowerCase().includes('log in') && !title.toLowerCase().includes('entrar')) {
                      return title.split('|')[0].trim();
                    }
                  } catch {}
                  return '';
                })()
              `);
            } catch {}

            await finishLogin(detectedName || 'Conta Facebook');
          }
        } catch {}
      };

      authWin.webContents.on('did-finish-load', () => {
        checkLoginSuccess();
      });

      authWin.webContents.on('did-navigate', () => {
        checkLoginSuccess();
      });

      checkInterval = setInterval(() => {
        checkLoginSuccess();
      }, 1500);

      authWin.on('closed', () => {
        if (checkInterval) clearInterval(checkInterval);
        if (!resolved) {
          resolved = true;
          loggerService.info('META_WEB', 'Janela de login do Facebook fechada pelo usuário.');
          resolve({ success: false, connected: false, error: 'Login cancelado.' });
        }
      });

      authWin.loadURL('https://www.messenger.com/login/').catch((err) => {
        loggerService.error('META_WEB', 'Erro ao carregar Messenger login:', err?.message);
      });
    });
  },

  /**
   * Desconecta a conta do Facebook Messenger limpando cookies e storage
   */
  async logoutFacebook(): Promise<{ success: boolean }> {
    try {
      loggerService.info('META_WEB', 'Desconectando conta do Facebook Messenger...');
      const sess = this.getSession();
      const fbCookies = await sess.cookies.get({ domain: '.facebook.com' });
      const msCookies = await sess.cookies.get({ domain: '.messenger.com' });

      for (const c of [...fbCookies, ...msCookies]) {
        const rawDomain = c.domain || 'facebook.com';
        const domain = rawDomain.startsWith('.') ? rawDomain.slice(1) : rawDomain;
        await sess.cookies.remove(`https://${domain}${c.path}`, c.name).catch(() => {});
      }

      await sess.clearStorageData({
        origin: 'https://www.messenger.com',
        storages: ['cookies', 'localstorage', 'cachestorage']
      });
      await sess.clearStorageData({
        origin: 'https://www.facebook.com',
        storages: ['cookies', 'localstorage', 'cachestorage']
      });

      cachedFacebookName = null;
      return { success: true };
    } catch (err: any) {
      loggerService.error('META_WEB', 'Erro ao desconectar Facebook:', err?.message);
      return { success: false };
    }
  }
};
