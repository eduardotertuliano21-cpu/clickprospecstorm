import { db } from '../index';
import type { ChannelType, UnifiedMessage } from '../../types/omnichannel';
import { leadRepository } from './leadRepository';

export interface UnifiedConversationSummary {
  contactId: string;
  channel: ChannelType;
  contactName?: string;
  companyName?: string;
  lastMessage: string;
  timestamp: number;
  unreadCount: number;
  subject?: string;
}

export const omnichannelRepository = {
  /**
   * Salva mensagem unificada na tabela indexada
   */
  async saveMessage(msg: UnifiedMessage): Promise<number> {
    const id = await db.unifiedMessages.add({
      ...msg,
      timestamp: msg.timestamp || Date.now()
    });
    return id as number;
  },

  /**
   * Retorna mensagens ordenadas cronologicamente para um contato
   */
  async getMessages(contactId: string, channelFilter?: ChannelType): Promise<UnifiedMessage[]> {
    let query = db.unifiedMessages.where('contactId').equals(contactId);
    let messages = await query.sortBy('timestamp');

    if (channelFilter) {
      messages = messages.filter(m => m.channel === channelFilter);
    }

    // Se não houver mensagens unificadas mas o canal for WhatsApp ou indefinido, consulta chatMessages legado
    if (messages.length === 0 && (!channelFilter || channelFilter === 'whatsapp')) {
      const legacyMsgs = await db.chatMessages.where('phone').equals(contactId).sortBy('timestamp');
      if (legacyMsgs.length > 0) {
        return legacyMsgs.map(m => ({
          id: String(m.id),
          contactId: m.phone,
          channel: 'whatsapp',
          direction: m.fromMe ? 'outgoing' : 'incoming',
          sender: m.fromMe ? 'Minha Empresa' : (m.contactName || m.phone),
          recipient: m.fromMe ? m.phone : 'Minha Empresa',
          content: m.body,
          timestamp: m.timestamp,
          status: m.status === 'received' ? 'delivered' : 'sent'
        }));
      }
    }

    return messages;
  },

  /**
   * Agrupa conversas recentes por contato e canal para a Inbox Unificada
   */
  async getConversations(channelFilter?: ChannelType): Promise<UnifiedConversationSummary[]> {
    const allUnified = await db.unifiedMessages.toArray();
    const legacyChats = await db.chatMessages.toArray();

    // Mapeamento agregado
    const conversationMap: Map<string, UnifiedConversationSummary> = new Map();

    // 1. Processa mensagens da tabela de chatMessages legada (WhatsApp)
    for (const msg of legacyChats) {
      const key = `whatsapp:${msg.phone}`;
      const existing = conversationMap.get(key);

      if (!existing || msg.timestamp > existing.timestamp) {
        conversationMap.set(key, {
          contactId: msg.phone,
          channel: 'whatsapp',
          contactName: msg.contactName,
          lastMessage: msg.body,
          timestamp: msg.timestamp,
          unreadCount: (!msg.fromMe && msg.status !== 'read') ? 1 : 0
        });
      }
    }

    // 2. Processa mensagens unificadas multicanal (WhatsApp, E-mail, Instagram, Messenger)
    for (const msg of allUnified) {
      const key = `${msg.channel}:${msg.contactId}`;
      const existing = conversationMap.get(key);

      const isUnread = msg.direction === 'incoming' && msg.status !== 'read';

      if (!existing || msg.timestamp > existing.timestamp) {
        conversationMap.set(key, {
          contactId: msg.contactId,
          channel: msg.channel,
          contactName: existing?.contactName,
          companyName: existing?.companyName,
          lastMessage: msg.content,
          subject: msg.subject,
          timestamp: msg.timestamp,
          unreadCount: (existing?.unreadCount || 0) + (isUnread ? 1 : 0)
        });
      } else if (isUnread) {
        existing.unreadCount = (existing.unreadCount || 0) + 1;
      }
    }

    let summaries = Array.from(conversationMap.values());

    // Enriquece com dados do Lead se cadastrado no CRM
    for (const conv of summaries) {
      try {
        const lead = await leadRepository.getLeadByPhone(conv.contactId);
        if (lead) {
          conv.contactName = conv.contactName || lead.decisionMaker || lead.name;
          conv.companyName = lead.companyName;
        }
      } catch {}
    }

    // Filtra por canal se selecionado
    if (channelFilter) {
      summaries = summaries.filter(c => c.channel === channelFilter);
    }

    // Ordena pelo contato mais recente primeiro
    return summaries.sort((a, b) => b.timestamp - a.timestamp);
  },

  /**
   * Marca conversa como lida
   */
  async markAsRead(contactId: string, channel?: ChannelType): Promise<void> {
    await db.unifiedMessages
      .where('contactId')
      .equals(contactId)
      .modify((msg) => {
        if (!channel || msg.channel === channel) {
          if (msg.direction === 'incoming') {
            msg.status = 'read';
          }
        }
      });

    if (!channel || channel === 'whatsapp') {
      await db.chatMessages
        .where('phone')
        .equals(contactId)
        .modify((msg) => {
          if (!msg.fromMe) {
            msg.status = 'read';
          }
        });
    }
  },

  /**
   * Remove mensagens de uma conversa
   */
  async deleteConversation(contactId: string, channel?: ChannelType): Promise<void> {
    if (channel) {
      await db.unifiedMessages.where('contactId').equals(contactId).filter(m => m.channel === channel).delete();
    } else {
      await db.unifiedMessages.where('contactId').equals(contactId).delete();
      await db.chatMessages.where('phone').equals(contactId).delete();
    }
  }
};
