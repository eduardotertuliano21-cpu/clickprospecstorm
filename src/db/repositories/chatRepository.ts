import { db, type ChatMessage } from '../index';
import { leadRepository } from './leadRepository';

export interface ConversationSummary {
  phone: string;
  jid?: string;
  name: string;
  companyName?: string;
  lastMessage: string;
  timestamp: number;
  unreadCount: number;
}

export const chatRepository = {
  async saveMessage(data: {
    phone: string;
    jid?: string;
    contactName?: string;
    fromMe: boolean;
    body: string;
    timestamp?: number;
    status?: 'sent' | 'received' | 'read';
  }): Promise<number> {
    const cleanPhone = data.phone.replace(/\D/g, '');
    const ts = data.timestamp || Date.now();

    const id = await db.chatMessages.add({
      phone: cleanPhone,
      jid: data.jid,
      contactName: data.contactName,
      fromMe: data.fromMe,
      body: data.body,
      timestamp: ts,
      status: data.status || (data.fromMe ? 'sent' : 'received'),
      createdAt: new Date().toISOString()
    });

    return id as number;
  },

  async getMessages(phone: string): Promise<ChatMessage[]> {
    const clean = phone.replace(/\D/g, '');
    return await db.chatMessages
      .where('phone')
      .equals(clean)
      .sortBy('timestamp');
  },

  async getConversations(): Promise<ConversationSummary[]> {
    const allMsgs = await db.chatMessages.toArray();
    const map = new Map<string, { lastMsg: ChatMessage; unread: number }>();

    for (const msg of allMsgs) {
      const existing = map.get(msg.phone);
      const isUnread = !msg.fromMe && msg.status !== 'read';

      if (!existing || msg.timestamp > existing.lastMsg.timestamp) {
        map.set(msg.phone, {
          lastMsg: msg,
          unread: (existing ? existing.unread : 0) + (isUnread ? 1 : 0)
        });
      } else if (isUnread && existing) {
        existing.unread += 1;
      }
    }

    const conversations: ConversationSummary[] = [];

    for (const [phone, { lastMsg, unread }] of map.entries()) {
      const lead = await leadRepository.getLeadByPhone(phone);

      conversations.push({
        phone,
        jid: lastMsg.jid,
        name: lead?.name || lastMsg.contactName || `+${phone}`,
        companyName: lead?.companyName,
        lastMessage: lastMsg.body,
        timestamp: lastMsg.timestamp,
        unreadCount: unread
      });
    }

    // Ordena da conversa mais recente para a mais antiga
    return conversations.sort((a, b) => b.timestamp - a.timestamp);
  },

  async markAsRead(phone: string): Promise<void> {
    const clean = phone.replace(/\D/g, '');
    const unreadMsgs = await db.chatMessages
      .where('phone')
      .equals(clean)
      .filter(m => !m.fromMe && m.status !== 'read')
      .toArray();

    for (const msg of unreadMsgs) {
      if (msg.id) {
        await db.chatMessages.update(msg.id, { status: 'read' });
      }
    }
  }
};
