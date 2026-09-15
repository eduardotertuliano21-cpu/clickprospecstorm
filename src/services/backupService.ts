import { db, type Lead, type Campaign, type MessageLog, type AutoResponderRule, type AppSettings } from '../db';

export interface DatabaseSnapshot {
  version: number;
  appName: 'ClickLeadStorm';
  exportedAt: string;
  data: {
    leads: Lead[];
    campaigns: Campaign[];
    messages: MessageLog[];
    autoResponderRules: AutoResponderRule[];
    settings?: AppSettings[];
  };
}

export const backupService = {
  /**
   * Exporta todo o banco IndexedDB ClickLeadStorm_DB em formato JSON
   */
  async exportBackup(): Promise<string> {
    const leads = await db.leads.toArray();
    const campaigns = await db.campaigns.toArray();
    const messages = await db.messages.toArray();
    const autoResponderRules = await db.autoResponderRules.toArray();
    const settings = await db.settings.toArray();

    const snapshot: DatabaseSnapshot = {
      version: 1,
      appName: 'ClickLeadStorm',
      exportedAt: new Date().toISOString(),
      data: {
        leads,
        campaigns,
        messages,
        autoResponderRules,
        settings
      }
    };

    return JSON.stringify(snapshot, null, 2);
  },

  /**
   * Faz o download do arquivo JSON de backup na máquina local do usuário
   */
  async downloadBackup(): Promise<void> {
    const jsonStr = await this.exportBackup();
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const dateStr = new Date().toISOString().slice(0, 10);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = `click-lead-storm-backup-${dateStr}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  },

  /**
   * Restaura o banco de dados a partir de um arquivo JSON
   */
  async restoreBackup(jsonString: string): Promise<{ leads: number; campaigns: number; rules: number }> {
    const snapshot: DatabaseSnapshot = JSON.parse(jsonString);

    if (snapshot.appName !== 'ClickLeadStorm' || !snapshot.data) {
      throw new Error('Arquivo de backup inválido ou incompatível com o Click Lead Storm.');
    }

    let leadsCount = 0;
    let campaignsCount = 0;
    let rulesCount = 0;

    await db.transaction('rw', [db.leads, db.campaigns, db.messages, db.autoResponderRules, db.settings], async () => {
      // Limpar tabelas atuais
      await db.leads.clear();
      await db.campaigns.clear();
      await db.messages.clear();
      await db.autoResponderRules.clear();

      if (snapshot.data.leads?.length) {
        await db.leads.bulkAdd(snapshot.data.leads);
        leadsCount = snapshot.data.leads.length;
      }

      if (snapshot.data.campaigns?.length) {
        await db.campaigns.bulkAdd(snapshot.data.campaigns);
        campaignsCount = snapshot.data.campaigns.length;
      }

      if (snapshot.data.messages?.length) {
        await db.messages.bulkAdd(snapshot.data.messages);
      }

      if (snapshot.data.autoResponderRules?.length) {
        await db.autoResponderRules.bulkAdd(snapshot.data.autoResponderRules);
        rulesCount = snapshot.data.autoResponderRules.length;
      }

      if (snapshot.data.settings?.length) {
        await db.settings.clear();
        await db.settings.bulkAdd(snapshot.data.settings);
      }
    });

    return { leads: leadsCount, campaigns: campaignsCount, rules: rulesCount };
  }
};
