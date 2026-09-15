import { BrowserWindow } from 'electron';
import { loggerService } from './loggerService.js';

export interface ScrapedPlace {
  name: string;
  phone: string;
  address?: string;
  rating?: string;
  reviewsCount?: string;
  category?: string;
  city?: string;
}

export const mapsScraperMain = {
  async scrapeGoogleMaps(query: string, limit: number = 25): Promise<ScrapedPlace[]> {
    loggerService.info('PROSPECT', `Iniciando busca real no Google Maps para: "${query}" (limite: ${limit})...`);
    let win: BrowserWindow | null = null;
    try {
      win = new BrowserWindow({
        show: false,
        width: 1280,
        height: 900,
        webPreferences: {
          offscreen: true,
          javascript: true,
        }
      });
      const url = `https://www.google.com/maps/search/${encodeURIComponent(query)}`;
      await win.loadURL(url, {
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
      });
      await new Promise(r => setTimeout(r, 4500));
      await win.webContents.executeJavaScript(`
        (async () => {
          const feed = document.querySelector('div[role="feed"]') || document.querySelector('.m6QErb[aria-label]');
          if (feed) {
            for (let i = 0; i < 3; i++) {
              feed.scrollTop = feed.scrollHeight;
              await new Promise(r => setTimeout(r, 1200));
            }
          }
        })()
      `).catch(() => {});
      await new Promise(r => setTimeout(r, 1500));
      const rawItems = await win.webContents.executeJavaScript(`
        (() => {
          const items = [];
          const cards = document.querySelectorAll('div.Nv2PK, div[role="article"]');
          cards.forEach(card => {
            const titleEl = card.querySelector('.qBF1Pd, .fontHeadlineSmall, [role="heading"]');
            const linkEl = card.querySelector('a.hfpxzc');
            const title = titleEl ? titleEl.textContent.trim() : (linkEl ? linkEl.getAttribute('aria-label') : '');
            if (!title) return;
            const text = card.innerText || '';
            const phoneMatch = text.match(/\\(?\\d{2}\\)?\\s*9?\\d{4}[-\\s]?\\d{4}/);
            const phone = phoneMatch ? phoneMatch[0] : '';
            const ratingMatch = text.match(/(\\d[,.]\\d)\\s*\\(?([0-9.]+)?\\)?/);
            const rating = ratingMatch ? ratingMatch[1] : '';
            const reviewsCount = ratingMatch && ratingMatch[2] ? ratingMatch[2] : '';
            const lines = text.split('\\n').map(l => l.trim()).filter(Boolean);
            let category = '';
            let address = '';
            for (const line of lines) {
              if (line.includes('·') || line.includes('Rua') || line.includes('Av.') || line.includes('Avenida') || line.includes('Alameda')) {
                if (!address && (line.includes('Rua') || line.includes('Av.') || line.includes('Avenida') || line.includes('Alameda') || line.includes('nº'))) {
                  address = line.replace(/^[^a-zA-Z0-9]+/, '');
                } else if (!category && line.includes('·')) {
                  const parts = line.split('·').map(p => p.trim());
                  category = parts[0] || '';
                  if (parts[1] && !address) address = parts[1];
                }
              }
            }
            items.push({
              name: title,
              phone,
              address: address || lines[2] || '',
              rating,
              reviewsCount,
              category: category || lines[1] || ''
            });
          });
          return items;
        })()
      `);
      const places: ScrapedPlace[] = (rawItems || []).slice(0, limit);
      loggerService.info('PROSPECT', `Busca Google Maps finalizada com sucesso! Encontrados ${places.length} locais.`);
      return places;
    } catch (err: any) {
      loggerService.error('PROSPECT', 'Erro durante raspagem no Google Maps:', err?.message);
      return [];
    } finally {
      if (win && !win.isDestroyed()) {
        try { win.destroy(); } catch {}
      }
    }
  }
};
