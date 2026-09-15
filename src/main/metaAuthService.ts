import { BrowserWindow } from 'electron';
import { loggerService } from './loggerService.js';

export interface MetaOAuthResult {
  connected: boolean;
  pageAccessToken: string;
  pageId: string;
  pageName: string;
  instagramAccountId?: string;
  instagramUsername?: string;
  error?: string;
}

export const metaAuthService = {
  async startOAuth(appId: string, appSecret: string): Promise<MetaOAuthResult> {
    if (!appId || !appSecret) {
      return { connected: false, pageAccessToken: '', pageId: '', pageName: '', error: 'App ID e App Secret são obrigatórios.' };
    }

    const redirectUri = 'https://localhost/callback';
    const scopes = [
      'pages_show_list',
      'pages_read_engagement',
      'pages_manage_metadata',
      'pages_messaging',
      'instagram_basic',
      'instagram_manage_messages'
    ].join(',');

    const authUrl = `https://www.facebook.com/v19.0/dialog/oauth?client_id=${appId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(scopes)}&response_type=code`;

    loggerService.info('META_AUTH', `Iniciando fluxo OAuth. App ID: ${appId.substring(0, 8)}...`);

    return new Promise<MetaOAuthResult>((resolve) => {
      const authWindow = new BrowserWindow({
        width: 620,
        height: 720,
        title: 'Conectar Conta Meta (Facebook & Instagram)',
        autoHideMenuBar: true,
        center: true,
        modal: true,
        parent: BrowserWindow.getFocusedWindow() || undefined,
        webPreferences: {
          contextIsolation: true,
          nodeIntegration: false
        }
      });

      let resolved = false;

      const handleNavigation = async (url: string) => {
        if (resolved) return;
        try {
          const urlObj = new URL(url);
          if (urlObj.hostname === 'localhost' && urlObj.pathname === '/callback') {
            const code = urlObj.searchParams.get('code');
            const error = urlObj.searchParams.get('error');

            if (error || !code) {
              resolved = true;
              authWindow.close();
              loggerService.warn('META_AUTH', `OAuth cancelado ou negado: ${error || 'sem code'}`);
              resolve({ connected: false, pageAccessToken: '', pageId: '', pageName: '', error: error || 'Autenticação cancelada pelo usuário.' });
              return;
            }

            resolved = true;
            authWindow.close();
            loggerService.info('META_AUTH', 'Code obtido com sucesso. Trocando por access token...');
            const result = await metaAuthService.exchangeCodeForToken(code, appId, appSecret, redirectUri);
            resolve(result);
          }
        } catch {
          // URL inválida, ignorar
        }
      };

      authWindow.webContents.on('will-redirect', (_event: any, url: string) => {
        handleNavigation(url);
      });

      authWindow.webContents.on('will-navigate', (_event: any, url: string) => {
        handleNavigation(url);
      });

      authWindow.on('closed', () => {
        if (!resolved) {
          resolved = true;
          resolve({ connected: false, pageAccessToken: '', pageId: '', pageName: '', error: 'Janela fechada pelo usuário.' });
        }
      });

      authWindow.loadURL(authUrl).catch((err: any) => {
        loggerService.error('META_AUTH', 'Erro ao carregar URL de OAuth:', err?.message);
        if (!resolved) {
          resolved = true;
          authWindow.close();
          resolve({ connected: false, pageAccessToken: '', pageId: '', pageName: '', error: `Erro ao abrir página de login: ${err?.message}` });
        }
      });
    });
  },

  async exchangeCodeForToken(code: string, appId: string, appSecret: string, redirectUri: string): Promise<MetaOAuthResult> {
    try {
      // 1. Trocar code por short-lived user token
      const tokenUrl = `https://graph.facebook.com/v19.0/oauth/access_token?client_id=${appId}&redirect_uri=${encodeURIComponent(redirectUri)}&client_secret=${appSecret}&code=${code}`;
      const tokenRes = await fetch(tokenUrl);
      const tokenData = await tokenRes.json() as any;

      if (tokenData.error) {
        loggerService.error('META_AUTH', 'Erro ao trocar code por token:', tokenData.error.message);
        return { connected: false, pageAccessToken: '', pageId: '', pageName: '', error: tokenData.error.message };
      }

      const shortLivedToken = tokenData.access_token;
      loggerService.info('META_AUTH', 'Short-lived token obtido. Convertendo para long-lived...');

      // 2. Converter para long-lived token (~60 dias)
      const longLivedUrl = `https://graph.facebook.com/v19.0/oauth/access_token?grant_type=fb_exchange_token&client_id=${appId}&client_secret=${appSecret}&fb_exchange_token=${shortLivedToken}`;
      const longLivedRes = await fetch(longLivedUrl);
      const longLivedData = await longLivedRes.json() as any;

      const userToken = longLivedData.access_token || shortLivedToken;
      loggerService.info('META_AUTH', 'Long-lived user token obtido. Buscando páginas...');

      // 3. Buscar páginas vinculadas
      const pagesUrl = `https://graph.facebook.com/v19.0/me/accounts?access_token=${userToken}`;
      const pagesRes = await fetch(pagesUrl);
      const pagesData = await pagesRes.json() as any;

      if (!pagesData.data || pagesData.data.length === 0) {
        loggerService.warn('META_AUTH', 'Nenhuma página encontrada vinculada a esta conta.');
        return { connected: false, pageAccessToken: '', pageId: '', pageName: '', error: 'Nenhuma página do Facebook encontrada.' };
      }

      const page = pagesData.data[0];
      const pageAccessToken = page.access_token;
      const pageId = page.id;
      const pageName = page.name;

      loggerService.info('META_AUTH', `Página encontrada: ${pageName} (ID: ${pageId}). Buscando Instagram Business...`);

      // 4. Buscar Instagram Business Account vinculado
      let instagramAccountId: string | undefined;
      let instagramUsername: string | undefined;

      try {
        const igUrl = `https://graph.facebook.com/v19.0/${pageId}?fields=instagram_business_account&access_token=${pageAccessToken}`;
        const igRes = await fetch(igUrl);
        const igData = await igRes.json() as any;

        if (igData.instagram_business_account?.id) {
          instagramAccountId = igData.instagram_business_account.id;

          const igProfileUrl = `https://graph.facebook.com/v19.0/${instagramAccountId}?fields=username,name&access_token=${pageAccessToken}`;
          const igProfileRes = await fetch(igProfileUrl);
          const igProfileData = await igProfileRes.json() as any;
          instagramUsername = igProfileData.username || undefined;

          loggerService.info('META_AUTH', `Instagram Business vinculado: @${instagramUsername} (ID: ${instagramAccountId})`);
        } else {
          loggerService.warn('META_AUTH', 'Nenhuma conta Instagram Business vinculada a esta página.');
        }
      } catch (igErr: any) {
        loggerService.warn('META_AUTH', 'Erro ao buscar Instagram Business:', igErr?.message);
      }

      loggerService.info('META_AUTH', `OAuth concluído! Página: ${pageName}, Instagram: ${instagramUsername || 'N/A'}`);

      return {
        connected: true,
        pageAccessToken,
        pageId,
        pageName,
        instagramAccountId,
        instagramUsername
      };

    } catch (err: any) {
      loggerService.error('META_AUTH', 'Erro fatal no token exchange:', err?.message);
      return { connected: false, pageAccessToken: '', pageId: '', pageName: '', error: err?.message || 'Erro desconhecido.' };
    }
  }
};
