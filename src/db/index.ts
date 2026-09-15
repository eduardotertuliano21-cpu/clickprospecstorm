import Dexie, { type Table } from 'dexie';
import type { UnifiedMessage, ChannelSettings, Cadence } from '../types/omnichannel';

export type LeadStatus = 'novo' | 'qualificado' | 'contatado' | 'negociacao' | 'ganho' | 'perdido';

export interface Lead {
  id?: number;
  name: string;
  companyName: string;
  phone: string; // Formato E.164 (ex: 5511999999999) - ÍNDICE ÚNICO
  cnpj?: string;
  email?: string;
  address?: string;
  city?: string;
  state?: string;
  category?: string;
  website?: string;
  linkedinUrl?: string;
  decisionMaker?: string; // Nome do sócio/administrador (QSA) ou "Responsável pela empresa"
  status: LeadStatus;
  origin?: 'maps' | 'manual' | 'cnpj' | 'csv' | 'whatsapp' | 'email' | 'instagram' | 'linkedin' | string;
  tags?: string[];
  notes?: string;
  lastContactAt?: string;
  createdAt: string;
  updatedAt: string;
}

export type CampaignStatus = 'idle' | 'running' | 'paused' | 'finished';

export interface Campaign {
  id?: number;
  name: string;
  promptTemplate: string;
  spintaxEnabled: boolean;
  delayMin: number; // segundos
  delayMax: number; // segundos
  dailyLimit: number;
  breakAfterCount: number; // Pausa após X mensagens (ex: 12)
  breakDurationMinutes: number; // Duração da pausa em minutos (ex: 7)
  targetStatuses: LeadStatus[];
  status: CampaignStatus;
  totalLeads: number;
  sentCount: number;
  failedCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface MessageLog {
  id?: number;
  campaignId?: number;
  leadId: number;
  leadName: string;
  phone: string;
  content: string;
  status: 'pending' | 'sent' | 'failed';
  strategyUsed?: 'base' | 'ai' | 'spintax' | 'ia_autonoma';
  error?: string;
  sentAt?: string;
  createdAt: string;
}

export interface ChatMessage {
  id?: number;
  phone: string; // Identificador do contato (ex: 5511999998888 ou LID)
  jid?: string; // JID nativo do WhatsApp (ex: 140874960912622@lid ou 5511999998888@s.whatsapp.net)
  contactName?: string;
  fromMe: boolean;
  body: string;
  timestamp: number;
  status?: 'sent' | 'received' | 'read';
  createdAt: string;
}

export interface SemanticCacheEntry {
  id?: number;
  query: string;
  normalizedQuery: string;
  intentCategory?: string; // ex: 'preco', 'como_funciona', 'horario', 'geral'
  responseTemplate: string;
  hits: number;
  tokensSaved: number;
  createdAt: string;
  lastUsedAt: string;
}

export type TriggerMatchType = 'contains' | 'exact' | 'regex' | 'ai';

export interface AutoResponderRule {
  id?: number;
  title: string;
  triggerKeywords: string[];
  matchType: TriggerMatchType;
  responseTemplate: string;
  useAi: boolean;
  aiPrompt?: string;
  active: boolean;
  createdAt: string;
}

export interface AppSettings {
  id?: number;
  groqApiKey: string;
  groqModel: string;
  myCompanyName?: string; // Nome da Minha Empresa
  myCompanyDescription?: string; // O que Minha Empresa faz / diferenciais
  myCompanyOffer?: string; // Oferta comercial, preços, planos
  customSalesPrompt: string; // Contexto comercial e instruções de abordagem
  dailyQuota: number;
  delayMin: number;
  delayMax: number;
  breakAfterCount: number; // Ex: 12 envios
  breakDurationMinutes: number; // Ex: 7 minutos
  businessHoursStart: string; // "08:30"
  businessHoursEnd: string; // "19:00"
  workingDaysOnly: boolean;
  autoResponderActive: boolean;
  autoResponderAiFallback?: boolean; // Fallback com Llama 3 quando não houver regra casada
  enableSemanticCache?: boolean; // Ativação do cache semântico para economizar tokens
  systemPrompt?: string;
  updatedAt?: string;
}

export class ClickLeadStormDB extends Dexie {
  leads!: Table<Lead, number>;
  campaigns!: Table<Campaign, number>;
  messages!: Table<MessageLog, number>;
  autoResponderRules!: Table<AutoResponderRule, number>;
  settings!: Table<AppSettings, number>;
  chatMessages!: Table<ChatMessage, number>;
  semanticCache!: Table<SemanticCacheEntry, number>;
  unifiedMessages!: Table<UnifiedMessage, number>;
  channelSettings!: Table<ChannelSettings & { id?: number }, number>;
  cadences!: Table<Cadence, number>;

  constructor() {
    super('ClickLeadStorm_DB');

    this.version(2).stores({
      leads: '++id, &phone, companyName, status, city, category, createdAt, updatedAt',
      campaigns: '++id, name, status, createdAt',
      messages: '++id, campaignId, leadId, phone, status, sentAt, createdAt',
      autoResponderRules: '++id, title, active, createdAt',
      settings: '++id'
    });

    // Versão 3: Tabela de Mensagens de Chat Integrado (Inbox)
    this.version(3).stores({
      leads: '++id, &phone, companyName, status, city, category, createdAt, updatedAt',
      campaigns: '++id, name, status, createdAt',
      messages: '++id, campaignId, leadId, phone, status, sentAt, createdAt',
      autoResponderRules: '++id, title, active, createdAt',
      settings: '++id',
      chatMessages: '++id, phone, fromMe, timestamp, createdAt'
    });

    // Versão 4: Cache Semântico Local para economia de tokens de IA
    this.version(4).stores({
      leads: '++id, &phone, companyName, status, city, category, createdAt, updatedAt',
      campaigns: '++id, name, status, createdAt',
      messages: '++id, campaignId, leadId, phone, status, sentAt, createdAt',
      autoResponderRules: '++id, title, active, createdAt',
      settings: '++id',
      chatMessages: '++id, phone, fromMe, timestamp, createdAt',
      semanticCache: '++id, normalizedQuery, intentCategory, hits, lastUsedAt'
    });

    // Versão 5: Módulos Omnichannel (E-mail, Meta, Inbox Unificada e Cadências)
    this.version(5).stores({
      leads: '++id, &phone, companyName, status, city, category, createdAt, updatedAt',
      campaigns: '++id, name, status, createdAt',
      messages: '++id, campaignId, leadId, phone, status, sentAt, createdAt',
      autoResponderRules: '++id, title, active, createdAt',
      settings: '++id',
      chatMessages: '++id, phone, fromMe, timestamp, createdAt',
      semanticCache: '++id, normalizedQuery, intentCategory, hits, lastUsedAt',
      unifiedMessages: '++id, contactId, channel, direction, timestamp, status, [channel+contactId]',
      channelSettings: '++id, channel, updatedAt',
      cadences: '++id, name, active, createdAt'
    });
  }
}

export * from '../types/omnichannel';

export const db = new ClickLeadStormDB();
