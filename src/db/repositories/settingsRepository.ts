import { db, type AppSettings } from '../index';

export const defaultSettings: AppSettings = {
  id: 1,
  groqApiKey: '',
  groqModel: 'qwen/qwen3.8-27b',
  myCompanyName: 'Click Lead Storm',
  myCompanyDescription: 'Assessoria comercial especializada em prospecção B2B ativa e automação de vendas no WhatsApp para gerar leads qualificados e fechar novos negócios.',
  myCompanyOffer: 'Diagnóstico comercial gratuito, implantação de máquina de vendas B2B e agendamento de reuniões qualificadas com decisores.',
  customSalesPrompt: 'Somos uma assessoria de crescimento comercial B2B. Ajudamos empresas a captar clientes qualificados e acelerar o faturamento no WhatsApp.',
  dailyQuota: 60,
  delayMin: 30,
  delayMax: 75,
  breakAfterCount: 12,
  breakDurationMinutes: 7,
  businessHoursStart: '08:30',
  businessHoursEnd: '19:00',
  workingDaysOnly: true,
  autoResponderActive: false,
  autoResponderAiFallback: true,
  enableSemanticCache: true,
  systemPrompt: 'Você é um consultor comercial e SDR sênior da nossa empresa. Responda com naturalidade, clareza, empatia e cordialidade via WhatsApp, sempre adaptando a conversa à realidade do cliente.'
};

export const settingsRepository = {
  async getSettings(): Promise<AppSettings> {
    const existing = await db.settings.get(1);
    if (existing) {
      // Se não tiver chaves salvas ou estiver vazio, aplica as chaves default
      if (!existing.groqApiKey) {
        existing.groqApiKey = defaultSettings.groqApiKey;
        await db.settings.update(1, { groqApiKey: defaultSettings.groqApiKey });
      }
      // Migração automática caso o modelo salvo seja o antigo/indisponível
      if (!existing.groqModel || existing.groqModel.includes('llama-3.3') || existing.groqModel.includes('llama-3.1')) {
        existing.groqModel = 'qwen/qwen3.8-27b';
        await db.settings.update(1, { groqModel: 'qwen/qwen3.8-27b' });
      }
      // Garante contexto da empresa preenchido caso esteja vazio
      if (!existing.myCompanyName) {
        existing.myCompanyName = defaultSettings.myCompanyName;
        existing.myCompanyDescription = defaultSettings.myCompanyDescription;
        existing.myCompanyOffer = defaultSettings.myCompanyOffer;
        await db.settings.update(1, {
          myCompanyName: defaultSettings.myCompanyName,
          myCompanyDescription: defaultSettings.myCompanyDescription,
          myCompanyOffer: defaultSettings.myCompanyOffer
        });
      }
      return { ...defaultSettings, ...existing };
    }
    await db.settings.put(defaultSettings);
    return defaultSettings;
  },

  async updateSettings(partial: Partial<AppSettings>): Promise<void> {
    const current = await this.getSettings();
    const updated = {
      ...current,
      ...partial,
      id: 1,
      updatedAt: new Date().toISOString()
    };
    await db.settings.put(updated);
  }
};
