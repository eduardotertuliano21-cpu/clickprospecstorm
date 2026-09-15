import { SUPABASE_CONFIG } from '../config/supabaseConfig.js';
import { loggerService } from '../loggerService.js';

export interface SupabaseRpcResponse {
  valid: boolean;
  force_update?: boolean;
  status?: 'active' | 'blocked' | 'trial' | 'expired';
  is_trial?: boolean;
  daily_limit?: number;
  expires_at?: string;
  customer_name?: string;
  message?: string;
}

export class SupabaseLicenseClient {
  /**
   * Executa a stored procedure protegida 'validate_license' via REST API do Supabase
   */
  public static async validateLicense(params: {
    licenseKey: string;
    machineId: string;
    appVersion: string;
  }): Promise<SupabaseRpcResponse> {
    if (!SUPABASE_CONFIG.isConfigured) {
      throw new Error('Supabase não configurado (SUPABASE_URL ou SUPABASE_ANON_KEY ausentes).');
    }

    const endpoint = `${SUPABASE_CONFIG.url.replace(/\/+$/, '')}/rest/v1/rpc/validate_license`;

    loggerService.info('SUPABASE', `Chamando RPC validate_license para chave ${params.licenseKey.substring(0, 8)}...`);

    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_CONFIG.anonKey,
        'Authorization': `Bearer ${SUPABASE_CONFIG.anonKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        p_license_key: params.licenseKey,
        p_machine_id: params.machineId,
        p_app_version: params.appVersion
      })
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      loggerService.error('SUPABASE', `Erro HTTP ${res.status} na RPC validate_license: ${errText}`);
      throw new Error(`Falha na comunicação com o Supabase (HTTP ${res.status}): ${errText}`);
    }

    const data = await res.json() as SupabaseRpcResponse;
    loggerService.info('SUPABASE', `Resposta RPC: valid=${data.valid}, status=${data.status}, message=${data.message || 'OK'}`);
    return data;
  }
}
