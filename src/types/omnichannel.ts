export type ChannelType = 'whatsapp' | 'email' | 'instagram' | 'messenger' | 'linkedin';

export interface ChannelIdentity {
  id: string;
  channel: ChannelType;
  identifier: string; // Número com DDI, e-mail, @instagram ou profileId
  name?: string;
  avatarUrl?: string;
}

export interface UnifiedMessage {
  id?: string;
  contactId: string;
  channel: ChannelType;
  direction: 'incoming' | 'outgoing';
  sender: string;
  recipient: string;
  subject?: string; // Para e-mails
  content: string;
  timestamp: number;
  status: 'pending' | 'sent' | 'delivered' | 'read' | 'failed';
  metadata?: Record<string, any>;
}

export interface ChannelSettings {
  whatsapp: {
    connected: boolean;
    phone?: string;
  };
  email: {
    enabled: boolean;
    host: string;
    port: number;
    secure: boolean;
    auth: {
      user: string;
      pass: string;
    };
    fromName: string;
  };
  meta: {
    enabled: boolean;
    pageAccessToken: string;
    instagramAccountId?: string;
    pageId?: string;
    connected?: boolean;
    pageName?: string;
    instagramUsername?: string;
    appId?: string;
    appSecret?: string;
  };
  instagram?: {
    connected: boolean;
    username?: string;
  };
  messenger?: {
    connected: boolean;
    name?: string;
  };
  linkedin?: {
    connected: boolean;
    name?: string;
  };
}

export interface CadenceStep {
  id: string;
  order: number;
  delayHours: number;
  channel: ChannelType;
  subjectTemplate?: string;
  contentTemplate: string;
  useAi?: boolean;
}

export interface Cadence {
  id?: number;
  name: string;
  description?: string;
  active: boolean;
  steps: CadenceStep[];
  targetTags?: string[];
  createdAt: string;
  updatedAt: string;
}
