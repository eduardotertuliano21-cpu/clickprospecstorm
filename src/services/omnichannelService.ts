import { db } from '../db';
import type { ChannelType, ChannelSettings, UnifiedMessage } from '../types/omnichannel';
import { omnichannelRepository } from '../db/repositories/omnichannelRepository';

const DEFAULT_SETTINGS: ChannelSettings = {
  whatsapp: {
    connected: false
  },
  email: {
    enabled: false,
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    auth: {
      user: '',
      pass: ''
    },
    fromName: 'Click Lead Storm'
  },
  meta: {
    enabled: false,
    pageAccessToken: '',
    instagramAccountId: '',
    pageId: ''
  }
};

export const omnichannelService = {
  /**
   * Obtém as configurações de todos os canais
   */
  async getSettings(): Promise<ChannelSettings> {
    try {
      const saved = await db.channelSettings.toCollection().first();
      if (saved) {
        return {
          whatsapp: saved.whatsapp || DEFAULT_SETTINGS.whatsapp,
          email: saved.email || DEFAULT_SETTINGS.email,
          meta: saved.meta || DEFAULT_SETTINGS.meta
        };
      }
    } catch (e) {
      console.warn('Erro ao carregar channelSettings do banco, usando defaults:', e);
    }
    return DEFAULT_SETTINGS;
  },

  /**
   * Salva configurações dos canais no banco local
   */
  async saveSettings(settings: ChannelSettings): Promise<void> {
    const existing = await db.channelSettings.toCollection().first();
    if (existing && existing.id) {
      await db.channelSettings.update(existing.id, settings);
    } else {
      await db.channelSettings.add(settings);
    }
  },

  /**
   * Despachador Universal de Mensagens
   */
  async sendMessage(payload: {
    contactId: string;
    channel: ChannelType;
    content: string;
    subject?: string;
  }): Promise<{ success: boolean; messageId?: string; error?: string }> {
    const { contactId, channel, content, subject } = payload;
    const settings = await this.getSettings();

    try {
      let channelConfig: any = null;
      if (channel === 'email') channelConfig = settings.email;
      else if (channel === 'instagram' || channel === 'messenger') channelConfig = settings.meta;

      let result: any = { success: true };

      if (typeof window !== 'undefined' && (window as any).electronAPI?.sendOmniMessage) {
        result = await (window as any).electronAPI.sendOmniMessage({
          channel,
          recipient: contactId,
          content,
          subject,
          channelConfig
        });
      }

      // Salva mensagem no repositório unificado
      await omnichannelRepository.saveMessage({
        contactId,
        channel,
        direction: 'outgoing',
        sender: 'Minha Empresa',
        recipient: contactId,
        content,
        subject,
        timestamp: Date.now(),
        status: result.success ? 'sent' : 'failed'
      });

      return result;
    } catch (err: any) {
      console.error(`[Omnichannel] Erro ao enviar mensagem por ${channel}:`, err);
      return { success: false, error: err?.message || 'Falha no envio.' };
    }
  }
};
