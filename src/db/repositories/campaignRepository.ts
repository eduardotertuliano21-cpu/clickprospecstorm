import { db, type Campaign, type MessageLog } from '../index';

export const campaignRepository = {
  async createCampaign(data: Omit<Campaign, 'id' | 'sentCount' | 'failedCount' | 'createdAt' | 'updatedAt'>): Promise<number> {
    const now = new Date().toISOString();
    return await db.campaigns.add({
      ...data,
      sentCount: 0,
      failedCount: 0,
      createdAt: now,
      updatedAt: now
    });
  },

  async getCampaigns(): Promise<Campaign[]> {
    return await db.campaigns.orderBy('createdAt').reverse().toArray();
  },

  async getCampaignById(id: number): Promise<Campaign | undefined> {
    return await db.campaigns.get(id);
  },

  async updateCampaign(id: number, changes: Partial<Campaign>): Promise<number> {
    const now = new Date().toISOString();
    return await db.campaigns.update(id, {
      ...changes,
      updatedAt: now
    });
  },

  async deleteCampaign(id: number): Promise<void> {
    await db.transaction('rw', [db.campaigns, db.messages], async () => {
      await db.messages.where('campaignId').equals(id).delete();
      await db.campaigns.delete(id);
    });
  },

  async logMessage(log: Omit<MessageLog, 'id' | 'createdAt'>): Promise<number> {
    const now = new Date().toISOString();
    return await db.messages.add({
      ...log,
      createdAt: now
    });
  },

  async getCampaignLogs(campaignId: number): Promise<MessageLog[]> {
    return await db.messages.where('campaignId').equals(campaignId).reverse().sortBy('createdAt');
  },

  async getAllLogs(limit = 100): Promise<MessageLog[]> {
    return await db.messages.orderBy('createdAt').reverse().limit(limit).toArray();
  },

  async getTodaySentCount(): Promise<number> {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const startIso = startOfDay.toISOString();

    const count = await db.messages
      .where('sentAt')
      .aboveOrEqual(startIso)
      .and(m => m.status === 'sent')
      .count();

    return count;
  }
};
