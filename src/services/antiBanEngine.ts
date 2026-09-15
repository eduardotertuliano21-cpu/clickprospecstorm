/**
 * Motor Anti-Ban Estocástico & Humanização do Click Lead Storm
 * - Distribuição Normal Gaussiana (Box-Muller)
 * - Simulação de Digitação (3 a 6 segundos com evento markIsComposing)
 * - Intercalação Estrita: Base -> Groq IA -> Spintax
 * - Trava de Pausa Preventiva Automática (a cada 10-15 mensagens, pausa de 5-10 minutos)
 */

export interface AntiBanConfig {
  minDelaySeconds: number;
  maxDelaySeconds: number;
  dailyQuota: number;
  breakAfterCount: number; // Ex: 12 envios
  breakDurationMinutes: number; // Ex: 7 minutos
  businessHoursStart: string; // "08:30"
  businessHoursEnd: string;   // "19:00"
  workingDaysOnly: boolean;
}

export type InterleavingStrategy = 'base' | 'ai' | 'spintax';

export const antiBanEngine = {
  /**
   * Gera um atraso estocástico com distribuição normal (gaussiana)
   * centralizado na média entre min e max via transformada de Box-Muller.
   */
  getGaussianDelay(minSec: number, maxSec: number): number {
    const mean = (minSec + maxSec) / 2;
    const stdDev = (maxSec - minSec) / 6; // 99.7% das amostras caem no intervalo [min, max]

    let u1 = 0, u2 = 0;
    while (u1 === 0) u1 = Math.random();
    while (u2 === 0) u2 = Math.random();

    const z0 = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
    let sample = mean + z0 * stdDev;

    // Clamp de segurança
    sample = Math.max(minSec, Math.min(maxSec, sample));
    return Math.round(sample * 1000); // Retorna em milissegundos
  },

  /**
   * Calcula o tempo aleatório de digitação humana (3 a 6 segundos)
   * proporcional ao tamanho da mensagem para acionar o estado 'digitando...'.
   */
  getTypingSimulationDelay(messageLength: number): number {
    // Entre 3000ms e 6000ms, com leve acréscimo para frases mais longas
    const baseMs = 3000 + Math.random() * 2500; // 3.0s a 5.5s
    const lengthFactor = Math.min(messageLength * 15, 800); // max +800ms
    const totalMs = Math.round(baseMs + lengthFactor);
    return Math.min(Math.max(totalMs, 3000), 6500);
  },

  /**
   * Determina a estratégia de intercalação estrutural estrita para o índice do envio:
   * 0 -> Mensagem Base Original (com variáveis {nome}, etc.)
   * 1 -> Variação Semântica gerada por IA Groq Llama
   * 2 -> Variação com Spintax dinâmico {Olá|Oi}
   */
  getInterleavingStrategy(index: number): InterleavingStrategy {
    const mod = index % 3;
    if (mod === 0) return 'base';
    if (mod === 1) return 'ai';
    return 'spintax';
  },

  /**
   * Verifica se atingiu o gatilho da pausa de segurança obrigatória
   * (ex: a cada 10 a 15 disparos)
   */
  shouldTriggerSafetyPause(consecutiveCount: number, breakAfterCount: number = 12): boolean {
    return consecutiveCount > 0 && consecutiveCount % breakAfterCount === 0;
  },

  /**
   * Verifica se o momento atual está dentro da janela de horário comercial
   */
  isWithinOperatingHours(config: Pick<AntiBanConfig, 'businessHoursStart' | 'businessHoursEnd' | 'workingDaysOnly'>): {
    allowed: boolean;
    reason?: string;
  } {
    const now = new Date();

    if (config.workingDaysOnly) {
      const day = now.getDay();
      if (day === 0 || day === 6) { // 0 = Domingo, 6 = Sábado
        return { allowed: false, reason: 'Final de semana bloqueado pelas diretrizes de segurança' };
      }
    }

    const [startH, startM] = config.businessHoursStart.split(':').map(Number);
    const [endH, endM] = config.businessHoursEnd.split(':').map(Number);

    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    const startMinutes = startH * 60 + startM;
    const endMinutes = endH * 60 + endM;

    if (currentMinutes < startMinutes || currentMinutes > endMinutes) {
      return { 
        allowed: false, 
        reason: `Fora do horário comercial configurado (${config.businessHoursStart} às ${config.businessHoursEnd})` 
      };
    }

    return { allowed: true };
  },

  /**
   * Aguarda pelo tempo determinado com suporte a cancelamento por AbortSignal
   */
  async sleep(ms: number, signal?: AbortSignal): Promise<void> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(resolve, ms);
      if (signal) {
        signal.addEventListener('abort', () => {
          clearTimeout(timer);
          reject(new DOMException('Operação abortada pelo usuário', 'AbortError'));
        });
      }
    });
  }
};
