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
   * Filtra automaticamente grupos, canais de transmissão e números inválidos.
   */
  async getConversations(channelFilter?: ChannelType): Promise<UnifiedConversationSummary[]> {
    const allUnified = await db.unifiedMessages.toArray();
    const legacyChats = await db.chatMessages.toArray();

    // Mapeamento agregado por [canal + identificador limpo]
    const conversationMap: Map<string, UnifiedConversationSummary> = new Map();

    // 1. Processa mensagens da tabela de chatMessages legada (WhatsApp)
    for (const msg of legacyChats) {
      const cleanPhone = msg.phone.replace(/\D/g, '');
      // Ignora newsletters e grupos do WhatsApp (IDs de 18 dígitos ou inválidos)
      if (cleanPhone.length > 15 || cleanPhone.length < 8 || cleanPhone.startsWith('120363')) {
        continue;
      }

      const key = `whatsapp:${cleanPhone}`;
      const existing = conversationMap.get(key);

      if (!existing || msg.timestamp > existing.timestamp) {
        conversationMap.set(key, {
          contactId: cleanPhone,
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
      const isWa = msg.channel === 'whatsapp';
      const cleanContactId = isWa ? msg.contactId.replace(/\D/g, '') : msg.contactId.trim();

      // Ignora newsletters e grupos no WhatsApp
      if (isWa && (cleanContactId.length > 15 || cleanContactId.length < 8 || cleanContactId.startsWith('120363'))) {
        continue;
      }

      const key = `${msg.channel}:${cleanContactId}`;
      const existing = conversationMap.get(key);

      const isUnread = msg.direction === 'incoming' && msg.status !== 'read';

      if (!existing || msg.timestamp > existing.timestamp) {
        conversationMap.set(key, {
          contactId: cleanContactId,
          channel: msg.channel,
          contactName: existing?.contactName || msg.sender !== 'Minha Empresa' ? msg.sender : undefined,
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
        if (conv.channel === 'whatsapp') {
          const lead = await leadRepository.getLeadByPhone(conv.contactId);
          if (lead) {
            conv.contactName = lead.decisionMaker || lead.name || conv.contactName;
            conv.companyName = lead.companyName;
          }
        } else if (conv.channel === 'email') {
          const allLeads = await leadRepository.getLeads();
          const lead = allLeads.find(l => l.email?.toLowerCase() === conv.contactId.toLowerCase());
          if (lead) {
            conv.contactName = lead.decisionMaker || lead.name || conv.contactName;
            conv.companyName = lead.companyName;
          }
        } else if (conv.channel === 'instagram') {
          const allLeads = await leadRepository.getLeads();
          const cleanIg = conv.contactId.replace(/^@/, '').toLowerCase();
          const lead = allLeads.find(l => 
            (l.notes && l.notes.toLowerCase().includes(cleanIg)) ||
            (l.name && l.name.toLowerCase().includes(cleanIg))
          );
          if (lead) {
            conv.contactName = lead.decisionMaker || lead.name || conv.contactName;
            conv.companyName = lead.companyName;
          }
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
    const cleanId = channel === 'whatsapp' ? contactId.replace(/\D/g, '') : contactId;

    await db.unifiedMessages
      .where('contactId')
      .anyOf([contactId, cleanId])
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
        .anyOf([contactId, cleanId])
        .modify((msg) => {
          if (!msg.fromMe) {
            msg.status = 'read';
          }
        });
    }
  },

  /**
   * Remove mensagens de uma conversa específica do histórico local
   */
  async deleteConversation(contactId: string, channel?: ChannelType): Promise<void> {
    const cleanId = channel === 'whatsapp' ? contactId.replace(/\D/g, '') : contactId;

    if (channel) {
      await db.unifiedMessages.filter(m => (m.contactId === contactId || m.contactId === cleanId) && m.channel === channel).delete();
      if (channel === 'whatsapp') {
        await db.chatMessages.filter(m => m.phone === contactId || m.phone === cleanId).delete();
      }
    } else {
      await db.unifiedMessages.filter(m => m.contactId === contactId || m.contactId === cleanId).delete();
      await db.chatMessages.filter(m => m.phone === contactId || m.phone === cleanId).delete();
    }
  },

  /**
   * Limpa permanentemente mensagens residuais de canais de transmissão e grupos do banco de dados local
   */
  async purgeInvalidChats(): Promise<number> {
    let count = 0;
    try {
      count += await db.unifiedMessages.filter(m => {
        if (m.channel === 'whatsapp') {
          const d = m.contactId.replace(/\D/g, '');
          return d.startsWith('120363') || d.length > 15 || d.length < 8;
        }
        return false;
      }).delete();

      count += await db.chatMessages.filter(m => {
        const d = m.phone.replace(/\D/g, '');
        return d.startsWith('120363') || d.length > 15 || d.length < 8;
      }).delete();
    } catch (err) {
      console.warn('Erro ao purgar chats inválidos:', err);
    }
    return count;
  }
};
