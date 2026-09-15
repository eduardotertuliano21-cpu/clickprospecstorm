import { loggerService } from './loggerService.js';

export interface MetaConfig {
  pageAccessToken: string;
  instagramAccountId?: string;
  pageId?: string;
}

export interface SendMetaMessagePayload {
  recipientId: string;
  text: string;
  channel: 'instagram' | 'messenger';
  config: MetaConfig;
}

export const metaService = {
  /**
   * Valida o token e conectividade com a Meta Graph API
   */
  async testConnection(config: MetaConfig): Promise<{ success: boolean; message?: string; name?: string }> {
    try {
      if (!config.pageAccessToken) {
        return { success: false, message: 'Page Access Token não informado.' };
      }

      loggerService.info('META', 'Verificando conexão com Meta Graph API...');
      const url = `https://graph.facebook.com/v19.0/me?access_token=${encodeURIComponent(config.pageAccessToken)}`;
      const res = await fetch(url);
      const data = await res.json();

      if (data.error) {
        loggerService.error('META', 'Erro retornado pela Meta Graph API:', data.error.message);
        return { success: false, message: data.error.message };
      }

      loggerService.info('META', `Conectado com sucesso à página Meta: ${data.name || data.id}`);
      return {
        success: true,
        message: `Conectado à página: ${data.name || data.id}`,
        name: data.name
      };
    } catch (err: any) {
      loggerService.error('META', 'Falha na requisição Meta Graph API:', err?.message);
      return { success: false, message: err?.message || 'Erro ao conectar com a Meta Graph API.' };
    }
  },

  /**
   * Envia mensagem direta para Instagram ou Facebook Messenger
   */
  async sendMessage(payload: SendMetaMessagePayload): Promise<{ success: boolean; messageId?: string; error?: string }> {
    const { recipientId, text, channel, config } = payload;
    
    try {
      loggerService.info('META', `Enviando mensagem via ${channel} para ${recipientId}...`);

      const targetId = channel === 'instagram' 
        ? (config.instagramAccountId || config.pageId || 'me')
        : (config.pageId || 'me');

      const url = `https://graph.facebook.com/v19.0/${targetId}/messages`;
      
      const body = {
        recipient: { id: recipientId },
        message: { text: text },
        messaging_type: 'RESPONSE'
      };

      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${config.pageAccessToken}`
        },
        body: JSON.stringify(body)
      });

      const data = await res.json();

      if (data.error) {
        loggerService.error('META', `Erro ao enviar mensagem via ${channel}:`, data.error.message);
        return { success: false, error: data.error.message };
      }

      const messageId = data.message_id || data.recipient_id || 'sent';
      loggerService.info('META', `Mensagem enviada com sucesso via ${channel} (ID: ${messageId})`);
      return { success: true, messageId };
    } catch (err: any) {
      loggerService.error('META', `Erro na chamada de envio ${channel}:`, err?.message);
      return { success: false, error: err?.message || 'Falha ao enviar mensagem.' };
    }
  }
};
