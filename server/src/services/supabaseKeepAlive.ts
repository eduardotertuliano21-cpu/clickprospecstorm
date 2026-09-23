/**
 * Serviço de Keep-Alive para o Supabase Free Tier
 * Envia um ping HTTP a cada 12 horas para garantir que o projeto Supabase
 * nunca fique 7 dias inativo e, portanto, nunca seja pausado automaticamente.
 */

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://ssbtgywzeezxocibajcx.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY || 'sb_publishable_IYrTXeaGQCqaujq0dcyhag_OTea-_qQ';

// Intervalo de 12 horas (em milissegundos)
const PING_INTERVAL_MS = 12 * 60 * 60 * 1000;

export async function pingSupabase(): Promise<boolean> {
  try {
    const endpoint = `${SUPABASE_URL.replace(/\/+$/, '')}/rest/v1/licenses?select=id&limit=1`;
    const res = await fetch(endpoint, {
      method: 'GET',
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`
      }
    });

    if (res.ok) {
      console.log(`[Supabase Keep-Alive] ✅ Heartbeat OK (HTTP ${res.status}) às ${new Date().toLocaleString('pt-BR')}`);
      return true;
    } else {
      console.warn(`[Supabase Keep-Alive] ⚠️ Supabase respondeu status ${res.status}`);
      return false;
    }
  } catch (err: any) {
    console.warn(`[Supabase Keep-Alive] ❌ Falha no heartbeat:`, err.message);
    return false;
  }
}

export function startSupabaseKeepAlive(): void {
  console.log('[Supabase Keep-Alive] 🔄 Serviço de prevenção contra pausa automática iniciado.');
  
  // Executa o primeiro ping 5 segundos após a inicialização do servidor
  setTimeout(() => {
    pingSupabase();
  }, 5000);

  // Agenda pings a cada 12 horas
  setInterval(() => {
    pingSupabase();
  }, PING_INTERVAL_MS);
}
