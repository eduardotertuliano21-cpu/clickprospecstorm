import { db, type SemanticCacheEntry } from '../db';
import { settingsRepository } from '../db/repositories/settingsRepository';

const STOP_WORDS = new Set([
  'o', 'a', 'os', 'as', 'um', 'uma', 'uns', 'umas',
  'de', 'do', 'da', 'dos', 'das', 'em', 'no', 'na', 'nos', 'nas',
  'por', 'para', 'com', 'que', 'se', 'e', 'ou', 'como', 'mais', 'mas',
  'me', 'te', 'lhe', 'nos', 'vos', 'lhes', 'meu', 'minha', 'seu', 'sua'
]);

class SemanticCacheService {
  /**
   * Normaliza o texto removendo acentos, pontuações e stopwords
   */
  public normalizeText(text: string): string {
    return text
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '') // remove acentos
      .replace(/[^\w\s]/gi, ' ') // remove pontuações
      .split(/\s+/)
      .filter((w) => w.length > 1 && !STOP_WORDS.has(w))
      .join(' ')
      .trim();
  }

  /**
   * Gera conjunto de 3-grams de caracteres
   */
  private getTrigrams(text: string): Set<string> {
    const padded = `  ${text}  `;
    const set = new Set<string>();
    for (let i = 0; i < padded.length - 2; i++) {
      set.add(padded.substring(i, i + 3));
    }
    return set;
  }

  /**
   * Calcula a similaridade semântica combinada (Jaccard de N-grams + Sobreposição de Palavras)
   * Retorna um score entre 0.0 (semelhante a nada) e 1.0 (idêntico)
   */
  public calculateSimilarity(textA: string, textB: string): number {
    const normA = this.normalizeText(textA);
    const normB = this.normalizeText(textB);

    if (!normA || !normB) return 0;
    if (normA === normB) return 1.0;

    // 1. Similaridade de N-grams (Trigram Jaccard)
    const triA = this.getTrigrams(normA);
    const triB = this.getTrigrams(normB);

    let intersectionCount = 0;
    triA.forEach((tri) => {
      if (triB.has(tri)) intersectionCount++;
    });

    const unionCount = triA.size + triB.size - intersectionCount;
    const trigramSim = unionCount > 0 ? intersectionCount / unionCount : 0;

    // 2. Similaridade por palavras-chave (Word Jaccard)
    const wordsA = new Set(normA.split(' '));
    const wordsB = new Set(normB.split(' '));

    let wordIntersect = 0;
    wordsA.forEach((w) => {
      if (wordsB.has(w)) wordIntersect++;
    });

    const wordUnion = wordsA.size + wordsB.size - wordIntersect;
    const wordSim = wordUnion > 0 ? wordIntersect / wordUnion : 0;

    // Média ponderada (60% trigrams para capturar variações morfológicas + 40% palavras inteiras)
    return trigramSim * 0.6 + wordSim * 0.4;
  }

  /**
   * Procura uma resposta compatível no cache semântico local
   */
  public async findMatch(query: string, threshold = 0.72): Promise<{ hit: boolean; response: string; similarity: number; entryId?: number } | null> {
    const settings = await settingsRepository.getSettings();
    if (settings.enableSemanticCache === false) {
      return null;
    }

    const normQuery = this.normalizeText(query);
    if (!normQuery || normQuery.length < 3) return null;

    try {
      const allEntries = await db.semanticCache.toArray();
      let bestMatch: SemanticCacheEntry | null = null;
      let maxScore = 0;

      for (const entry of allEntries) {
        // Se a query normalizada for idêntica, retorno imediato (100% de match)
        if (entry.normalizedQuery === normQuery) {
          bestMatch = entry;
          maxScore = 1.0;
          break;
        }

        const score = this.calculateSimilarity(normQuery, entry.normalizedQuery);
        if (score > maxScore && score >= threshold) {
          maxScore = score;
          bestMatch = entry;
        }
      }

      if (bestMatch && bestMatch.id) {
        // Atualiza estatísticas do cache
        const updatedHits = (bestMatch.hits || 0) + 1;
        const tokensSaved = (bestMatch.tokensSaved || 0) + 250; // Média estimada de 250 tokens economizados por chamada Groq

        await db.semanticCache.update(bestMatch.id, {
          hits: updatedHits,
          tokensSaved,
          lastUsedAt: new Date().toISOString()
        });

        console.log(
          `[SemanticCache] HIT! Similaridade: ${(maxScore * 100).toFixed(1)}% | Query: "${query}" ~ Cache: "${bestMatch.query}"`
        );

        return {
          hit: true,
          response: bestMatch.responseTemplate,
          similarity: maxScore,
          entryId: bestMatch.id
        };
      }
    } catch (err) {
      console.warn('[SemanticCache] Erro ao consultar cache:', err);
    }

    return null;
  }

  /**
   * Salva uma nova resposta no cache semântico
   */
  public async save(query: string, responseTemplate: string, intentCategory?: string): Promise<void> {
    const settings = await settingsRepository.getSettings();
    if (settings.enableSemanticCache === false) {
      return;
    }

    const normQuery = this.normalizeText(query);
    if (!normQuery || normQuery.length < 3 || !responseTemplate.trim()) return;

    try {
      // Evita duplicatas exatas
      const existing = await db.semanticCache
        .where('normalizedQuery')
        .equals(normQuery)
        .first();

      if (existing && existing.id) {
        await db.semanticCache.update(existing.id, {
          responseTemplate,
          lastUsedAt: new Date().toISOString()
        });
        return;
      }

      await db.semanticCache.add({
        query: query.trim(),
        normalizedQuery: normQuery,
        intentCategory: intentCategory || 'geral',
        responseTemplate: responseTemplate.trim(),
        hits: 1,
        tokensSaved: 0,
        createdAt: new Date().toISOString(),
        lastUsedAt: new Date().toISOString()
      });

      console.log(`[SemanticCache] Resposta indexada para query: "${query}"`);
    } catch (err) {
      console.warn('[SemanticCache] Erro ao salvar entrada:', err);
    }
  }

  /**
   * Retorna estatísticas gerais de economia de tokens
   */
  public async getStats(): Promise<{ totalEntries: number; totalHits: number; tokensSaved: number }> {
    try {
      const all = await db.semanticCache.toArray();
      let totalHits = 0;
      let tokensSaved = 0;

      for (const item of all) {
        totalHits += item.hits || 0;
        tokensSaved += item.tokensSaved || 0;
      }

      return {
        totalEntries: all.length,
        totalHits,
        tokensSaved
      };
    } catch {
      return { totalEntries: 0, totalHits: 0, tokensSaved: 0 };
    }
  }

  /**
   * Limpa o cache semântico
   */
  public async clear(): Promise<void> {
    await db.semanticCache.clear();
  }
}

export const semanticCacheService = new SemanticCacheService();
