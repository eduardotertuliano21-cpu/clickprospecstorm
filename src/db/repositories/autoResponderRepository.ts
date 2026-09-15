import { db, type AutoResponderRule } from '../index';

export const autoResponderRepository = {
  async getRules(): Promise<AutoResponderRule[]> {
    return await db.autoResponderRules.orderBy('createdAt').reverse().toArray();
  },

  async addRule(rule: Omit<AutoResponderRule, 'id' | 'createdAt'>): Promise<number> {
    return await db.autoResponderRules.add({
      ...rule,
      createdAt: new Date().toISOString()
    });
  },

  async updateRule(id: number, changes: Partial<AutoResponderRule>): Promise<number> {
    return await db.autoResponderRules.update(id, changes);
  },

  async deleteRule(id: number): Promise<void> {
    await db.autoResponderRules.delete(id);
  },

  async toggleRule(id: number, active: boolean): Promise<number> {
    return await db.autoResponderRules.update(id, { active });
  }
};
