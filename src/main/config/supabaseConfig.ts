/**
 * Configuração de Conexão com o Supabase (Cloud Licensing)
 * 
 * Preencha com os dados do seu projeto em Project Settings > API:
 * - url: Project URL (ex: https://xxxxxxxxxxxxxxxxxxxx.supabase.co)
 * - anonKey: Project API Anon Key (public)
 */
export const SUPABASE_CONFIG = {
  url: process.env.SUPABASE_URL || '',
  anonKey: process.env.SUPABASE_ANON_KEY || '',
  get isConfigured(): boolean {
    return !!(this.url && this.anonKey && this.url.startsWith('https://'));
  }
};
