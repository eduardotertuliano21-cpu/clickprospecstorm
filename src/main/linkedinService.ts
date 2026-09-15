import { BrowserWindow, session } from 'electron';
import { loggerService } from './loggerService.js';

let mainWindowRef: BrowserWindow | null = null;
let cachedLinkedInUser: string | null = null;

export interface LinkedInLead {
  name: string;
  role: string;
  company: string;
  location?: string;
  profileUrl: string;
  headline?: string;
  snippet?: string;
}

export const linkedinService = {
  setMainWindow(win: BrowserWindow | null) {
    mainWindowRef = win;
  },

  getSession() {
    return session.fromPartition('persist:linkedin_sessions');
  },

  /**
   * Checa se há sessão ativa do LinkedIn verificando o cookie `li_at`
   */
  async getLinkedInStatus(): Promise<{ connected: boolean; name?: string }> {
    try {
      const sess = this.getSession();
      const cookies = await sess.cookies.get({ domain: '.linkedin.com' });
      const hasLiAt = cookies.some(c => c.name === 'li_at' && c.value);

      if (!hasLiAt) {
        cachedLinkedInUser = null;
        return { connected: false };
      }

      return {
        connected: true,
        name: cachedLinkedInUser || 'Conta LinkedIn Conectada'
      };
    } catch (err: any) {
      loggerService.error('LINKEDIN', 'Erro ao verificar status do LinkedIn:', err?.message);
      return { connected: false };
    }
  },

  /**
   * Abre modal de login do LinkedIn Web
   */
  async loginLinkedIn(): Promise<{ success: boolean; connected: boolean; name?: string; error?: string }> {
    loggerService.info('LINKEDIN', 'Abrindo janela de login do LinkedIn Web...');

    return new Promise((resolve) => {
      const authWin = new BrowserWindow({
        width: 500,
        height: 700,
        title: 'Entrar no LinkedIn',
        parent: mainWindowRef || undefined,
        modal: true,
        center: true,
        autoHideMenuBar: true,
        webPreferences: {
          partition: 'persist:linkedin_sessions',
          contextIsolation: false
        }
      });

      let resolved = false;
      let checkInterval: NodeJS.Timeout | null = null;

      const finishLogin = async (name: string) => {
        if (resolved) return;
        resolved = true;
        if (checkInterval) clearInterval(checkInterval);
        cachedLinkedInUser = name;
        loggerService.info('LINKEDIN', `LinkedIn conectado: ${name}`);

        try {
          authWin.close();
        } catch {}

        resolve({ success: true, connected: true, name });
      };

      const checkLoginSuccess = async () => {
        if (resolved) return;
        try {
          const sess = this.getSession();
          const cookies = await sess.cookies.get({ domain: '.linkedin.com' });
          const hasLiAt = cookies.some(c => c.name === 'li_at' && c.value);
          const currentUrl = authWin.webContents.getURL() || '';

          // Se tiver cookie li_at e estiver em feed, mynetwork ou fora de login/checkpoint
          if (hasLiAt && !currentUrl.includes('/login') && !currentUrl.includes('/checkpoint')) {
            let detectedName = '';
            try {
              detectedName = await authWin.webContents.executeJavaScript(`
                (() => {
                  try {
                    const profileEl = document.querySelector('.profile-card-name') || document.querySelector('.feed-identity-module__actor-meta');
                    if (profileEl) return profileEl.textContent?.trim() || '';
                    if (document.title && !document.title.includes('LinkedIn: Log In')) {
                      return document.title.split('|')[0].trim();
                    }
                  } catch {}
                  return '';
                })()
              `);
            } catch {}

            await finishLogin(detectedName || 'Conta LinkedIn');
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
          loggerService.info('LINKEDIN', 'Janela de login do LinkedIn fechada.');
          resolve({ success: false, connected: false, error: 'Login cancelado.' });
        }
      });

      authWin.loadURL('https://www.linkedin.com/login').catch((err) => {
        loggerService.error('LINKEDIN', 'Erro ao carregar LinkedIn login:', err?.message);
      });
    });
  },

  /**
   * Desconecta o LinkedIn limpando cookies e storage
   */
  async logoutLinkedIn(): Promise<{ success: boolean }> {
    try {
      loggerService.info('LINKEDIN', 'Desconectando conta do LinkedIn...');
      const sess = this.getSession();
      const cookies = await sess.cookies.get({ domain: '.linkedin.com' });

      for (const c of cookies) {
        const rawDomain = c.domain || 'linkedin.com';
        const domain = rawDomain.startsWith('.') ? rawDomain.slice(1) : rawDomain;
        await sess.cookies.remove(`https://${domain}${c.path}`, c.name).catch(() => {});
      }

      await sess.clearStorageData({
        origin: 'https://www.linkedin.com',
        storages: ['cookies', 'localstorage', 'cachestorage']
      });

      cachedLinkedInUser = null;
      return { success: true };
    } catch (err: any) {
      loggerService.error('LINKEDIN', 'Erro ao desconectar LinkedIn:', err?.message);
      return { success: false };
    }
  },

  /**
   * Busca perfis no LinkedIn usando X-Ray Search inteligente
   * Extrai Nome, Cargo, Empresa, Localização e Link do Perfil
   */
  async searchLinkedInProfiles(params: {
    role?: string;
    company?: string;
    location?: string;
    limit?: number;
  }): Promise<LinkedInLead[]> {
    const { role = '', company = '', location = '', limit = 20 } = params;

    // Constrói termos de busca focados no LinkedIn
    const terms: string[] = ['site:linkedin.com/in/'];
    if (role.trim()) terms.push(`intitle:"${role.trim()}"`);
    if (company.trim()) terms.push(`"${company.trim()}"`);
    if (location.trim()) terms.push(`"${location.trim()}"`);

    const query = terms.join(' ');
    loggerService.info('LINKEDIN', `Buscando perfis no LinkedIn: ${query}`);

    try {
      const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
      const res = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7'
        }
      });

      if (!res.ok) {
        loggerService.warn('LINKEDIN', `DuckDuckGo retornou status HTTP ${res.status}`);
        return [];
      }

      const html = await res.text();
      const leads = this.parseDuckDuckGoHtml(html, limit);
      loggerService.info('LINKEDIN', `Encontrados ${leads.length} perfis no LinkedIn para a busca.`);
      return leads;
    } catch (err: any) {
      loggerService.error('LINKEDIN', 'Falha na busca de perfis do LinkedIn:', err?.message);
      return [];
    }
  },

  /**
   * Busca decisores (CEO, Diretor, Sócio, Fundador) de uma empresa específica
   */
  async findCompanyDecisionMakers(companyName: string, city?: string): Promise<LinkedInLead[]> {
    if (!companyName.trim()) return [];

    const cleanCompany = companyName.replace(/["']/g, '').trim();
    const cleanCity = (city || '').replace(/["']/g, '').trim();

    const query = `site:linkedin.com/in/ ("CEO" OR "Diretor" OR "Sócio" OR "Founder" OR "Gerente") "${cleanCompany}" ${cleanCity ? `"${cleanCity}"` : ''}`;
    loggerService.info('LINKEDIN', `Buscando decisores da empresa "${cleanCompany}" no LinkedIn...`);

    try {
      const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
      const res = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
          'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8'
        }
      });

      if (!res.ok) return [];

      const html = await res.text();
      return this.parseDuckDuckGoHtml(html, 10);
    } catch (err: any) {
      loggerService.warn('LINKEDIN', `Erro ao buscar decisores de ${companyName}:`, err?.message);
      return [];
    }
  },

  /**
   * Parser robusto do HTML retornado pela busca
   */
  parseDuckDuckGoHtml(html: string, limit: number): LinkedInLead[] {
    const leads: LinkedInLead[] = [];
    // Cada resultado no DuckDuckGo HTML tem class="result results_links ..."
    const resultRegex = /<div class="result results_links[^>]*>[\s\S]*?<h2 class="result__title">[\s\S]*?<a class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<a class="result__snippet"[^>]*>([\s\S]*?)<\/a>/gi;

    let match: RegExpExecArray | null;
    while ((match = resultRegex.exec(html)) !== null) {
      if (leads.length >= limit) break;

      const rawHref = match[1];
      const rawTitle = match[2];
      const rawSnippet = match[3];

      // Decodifica a URL limpa do LinkedIn a partir do redirect do DDG
      let profileUrl = '';
      try {
        if (rawHref.includes('uddg=')) {
          const parsed = new URL(`https://duckduckgo.com${rawHref}`);
          profileUrl = decodeURIComponent(parsed.searchParams.get('uddg') || '');
        } else if (rawHref.includes('linkedin.com/in/')) {
          profileUrl = rawHref;
        }
      } catch {
        if (rawHref.includes('linkedin.com/in/')) profileUrl = rawHref;
      }

      // Valida se é de fato um perfil de pessoa no LinkedIn
      if (!profileUrl || !profileUrl.includes('linkedin.com/in/')) {
        continue;
      }

      // Limpa tags HTML
      const title = rawTitle.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&#x27;/g, "'").trim();
      const snippet = rawSnippet.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&#x27;/g, "'").trim();

      // Formato típico de título do LinkedIn:
      // "Carlos Silva - Diretor Comercial - Empresa XYZ | LinkedIn"
      // ou "Mariana Souza - CEO & Co-founder na TechBrasil | LinkedIn"
      let cleanTitle = title.replace(/\s*\|\s*LinkedIn.*$/i, '').trim();
      const titleParts = cleanTitle.split(/\s*[-–—]\s*/);

      let name = titleParts[0] ? titleParts[0].trim() : 'Contato';
      let role = '';
      let company = '';

      if (titleParts.length >= 3) {
        role = titleParts[1].trim();
        company = titleParts.slice(2).join(' - ').trim();
      } else if (titleParts.length === 2) {
        // "Nome - Cargo na Empresa"
        const secondPart = titleParts[1].trim();
        if (/\s+na\s+/i.test(secondPart)) {
          const subParts = secondPart.split(/\s+na\s+/i);
          role = subParts[0].trim();
          company = subParts[1].trim();
        } else if (/\s+at\s+/i.test(secondPart)) {
          const subParts = secondPart.split(/\s+at\s+/i);
          role = subParts[0].trim();
          company = subParts[1].trim();
        } else {
          role = secondPart;
        }
      }

      // Se o nome contém emojis ou caracteres estranhos, limpa
      name = name.replace(/[^\w\s\u00C0-\u00FF.-]/g, '').trim();

      // Extrai localização a partir do snippet se disponível
      let location = '';
      const locMatch = snippet.match(/Localidade:\s*([^·\.\n]+)/i) || snippet.match(/Location:\s*([^·\.\n]+)/i) || snippet.match(/([A-ZÀ-Ú][a-zà-ú]+,\s*[A-Z]{2})/);
      if (locMatch) {
        location = locMatch[1].trim();
      }

      leads.push({
        name: name || 'Decisor LinkedIn',
        role: role || 'Liderança / Sócio',
        company: company || 'Empresa',
        location: location || undefined,
        profileUrl,
        headline: snippet || role,
        snippet
      });
    }

    return leads;
  }
};
