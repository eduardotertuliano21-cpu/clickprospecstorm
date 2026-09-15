import { db, type Lead, type LeadStatus } from '../index';

export const leadRepository = {
  async addLead(leadData: Omit<Lead, 'id' | 'createdAt' | 'updatedAt'>): Promise<number> {
    const now = new Date().toISOString();
    // Limpar telefone mantendo apenas números
    const cleanPhone = leadData.phone.replace(/\D/g, '');
    
    // Verificar se já existe lead com este telefone
    const existing = await db.leads.where('phone').equals(cleanPhone).first();
    if (existing && existing.id) {
      await db.leads.update(existing.id, {
        ...leadData,
        phone: cleanPhone,
        updatedAt: now
      });
      return existing.id;
    }

    return await db.leads.add({
      ...leadData,
      phone: cleanPhone,
      createdAt: now,
      updatedAt: now
    });
  },

  async bulkAddLeads(leadsData: Array<Omit<Lead, 'id' | 'createdAt' | 'updatedAt'>>): Promise<{ added: number; updated: number }> {
    const now = new Date().toISOString();
    let added = 0;
    let updated = 0;

    await db.transaction('rw', db.leads, async () => {
      for (const item of leadsData) {
        const cleanPhone = item.phone.replace(/\D/g, '');
        if (!cleanPhone) continue;

        const existing = await db.leads.where('phone').equals(cleanPhone).first();
        if (existing && existing.id) {
          await db.leads.update(existing.id, {
            ...item,
            phone: cleanPhone,
            updatedAt: now
          });
          updated++;
        } else {
          await db.leads.add({
            ...item,
            phone: cleanPhone,
            createdAt: now,
            updatedAt: now
          });
          added++;
        }
      }
    });

    return { added, updated };
  },

  async getLeads(filters?: { status?: LeadStatus; search?: string }): Promise<Lead[]> {
    let collection = db.leads.orderBy('updatedAt').reverse();

    let list = await collection.toArray();

    if (filters?.status) {
      list = list.filter(l => l.status === filters.status);
    }

    if (filters?.search) {
      const q = filters.search.toLowerCase();
      list = list.filter(l => 
        l.name.toLowerCase().includes(q) ||
        l.companyName.toLowerCase().includes(q) ||
        l.phone.includes(q) ||
        (l.city && l.city.toLowerCase().includes(q)) ||
        (l.decisionMaker && l.decisionMaker.toLowerCase().includes(q)) ||
        (l.category && l.category.toLowerCase().includes(q))
      );
    }

    return list;
  },

  async getLeadById(id: number): Promise<Lead | undefined> {
    return await db.leads.get(id);
  },

  async getLeadByPhone(phone: string): Promise<Lead | undefined> {
    const cleanPhone = phone.replace(/\D/g, '');
    return await db.leads.where('phone').equals(cleanPhone).first();
  },

  async updateLead(id: number, changes: Partial<Lead>): Promise<number> {
    const now = new Date().toISOString();
    return await db.leads.update(id, {
      ...changes,
      updatedAt: now
    });
  },

  async updateLeadStatus(id: number, status: LeadStatus): Promise<number> {
    return await this.updateLead(id, { status });
  },

  async deleteLead(id: number): Promise<void> {
    await db.leads.delete(id);
  },

  async clearAllLeads(): Promise<void> {
    await db.leads.clear();
  },

  async getStats(): Promise<Record<LeadStatus, number> & { total: number }> {
    const all = await db.leads.toArray();
    const stats: Record<LeadStatus, number> & { total: number } = {
      novo: 0,
      qualificado: 0,
      contatado: 0,
      negociacao: 0,
      ganho: 0,
      perdido: 0,
      total: all.length
    };

    for (const lead of all) {
      if (stats[lead.status] !== undefined) {
        stats[lead.status]++;
      }
    }

    return stats;
  }
};
