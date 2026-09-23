import { app, BrowserWindow } from 'electron';
import path from 'path';
import fs from 'fs';
import QRCode from 'qrcode';
import pino from 'pino';
import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
  WASocket,
  ConnectionState
} from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import { loggerService } from './loggerService.js';
import { trayService } from './trayService.js';

export interface WhatsAppStatus {
  status: 'disconnected' | 'connecting' | 'connected';
  user?: {
    id: string;
    name?: string;
  };
  phone?: string;
}

/**
 * Extrai o texto limpo da mensagem de forma recursiva e resiliente
 * cobrindo ephemeral messages, view-once, áudios, imagens, botões e reações.
 */
function extractMessageText(message: any): string {
  if (!message) return '';
  if (message.conversation) return message.conversation;
  if (message.extendedTextMessage?.text) return message.extendedTextMessage.text;
  if (message.imageMessage?.caption) return message.imageMessage.caption;
  if (message.videoMessage?.caption) return message.videoMessage.caption;
  if (message.documentMessage?.caption) return message.documentMessage.caption;
  
  // Mensagens efêmeras / autodestrutivas
  if (message.ephemeralMessage?.message) return extractMessageText(message.ephemeralMessage.message);
  if (message.viewOnceMessage?.message) return extractMessageText(message.viewOnceMessage.message);
  if (message.viewOnceMessageV2?.message) return extractMessageText(message.viewOnceMessageV2.message);
  if (message.viewOnceMessageV2Extension?.message) return extractMessageText(message.viewOnceMessageV2Extension.message);
  if (message.documentWithCaptionMessage?.message) return extractMessageText(message.documentWithCaptionMessage.message);
  
  // Respostas de botões e listas
  if (message.buttonsResponseMessage?.selectedButtonId) return message.buttonsResponseMessage.selectedButtonId;
  if (message.templateButtonReplyMessage?.selectedId) return message.templateButtonReplyMessage.selectedId;
  if (message.listResponseMessage?.singleSelectReply?.selectedRowId) return message.listResponseMessage.singleSelectReply.selectedRowId;

  // Tipos de mídia sem legenda
  if (message.audioMessage) return '[Áudio]';
  if (message.imageMessage) return '[Imagem]';
  if (message.videoMessage) return '[Vídeo]';
  if (message.documentMessage) return message.documentMessage.fileName ? `[Arquivo: ${message.documentMessage.fileName}]` : '[Documento]';
  if (message.stickerMessage) return '[Figurinha]';
  if (message.contactMessage) return '[Contato Compartilhado]';
  if (message.locationMessage) return '[Localização]';

  return '';
}

/**
 * Detecta e filtra grupos, canais de transmissão, newsletters e LIDs internos do WhatsApp.
 * Mantém apenas conversas com números de telefone reais (leads individuais).
 */
function isWhatsAppGroupOrNewsletter(jid?: string, rawPhone?: string, participant?: string): boolean {
  if (participant) return true; // Se tem participant em mensagem recebida, é mensagem de grupo
  if (!jid) return true;

  const jidLower = jid.toLowerCase();
  if (
    jidLower.endsWith('@g.us') ||
    jidLower.endsWith('@newsletter') ||
    jidLower.includes('broadcast') ||
    jidLower.endsWith('@temp')
  ) {
    return true;
  }

  const digits = (rawPhone || jid.split('@')[0].split(':')[0]).replace(/\D/g, '');
  // Números reais no formato E.164 têm no máximo 15 dígitos.
  // Canais/Newsletters e Grupos no WhatsApp usam IDs de 16 a 19 dígitos (geralmente iniciando com 120363).
  if (digits.length > 15 || digits.length < 8) return true;
  if (digits.startsWith('120363')) return true;

  return false;
}

class WhatsAppService {
  private sock: WASocket | null = null;
  private mainWindow: BrowserWindow | null = null;
  private currentStatus: WhatsAppStatus = { status: 'disconnected' };
  private isInitializing = false;
  private authDir: string = '';
  private jidMap: Map<string, string> = new Map();

  constructor() {
    this.authDir = path.join(app.getPath('userData'), 'baileys_auth');
    if (!fs.existsSync(this.authDir)) {
      fs.mkdirSync(this.authDir, { recursive: true });
    }
  }

  public setMainWindow(win: BrowserWindow) {
    this.mainWindow = win;
  }

  private sendToRenderer(channel: string, data: any) {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send(channel, data);
    }
  }

  public getStatus(): WhatsAppStatus {
    return this.currentStatus;
  }

  public async initWhatsApp(): Promise<WhatsAppStatus> {
    if (this.sock && this.currentStatus.status === 'connected') {
      return this.currentStatus;
    }

    if (this.isInitializing) {
      return this.currentStatus;
    }

    this.isInitializing = true;
    this.currentStatus = { status: 'connecting' };
    this.sendToRenderer('wa-status', this.currentStatus);
    loggerService.info('WHATSAPP', 'Iniciando conexão nativa com Baileys WebSocket...');

    try {
      const { state, saveCreds } = await useMultiFileAuthState(this.authDir);

      const socket = makeWASocket({
        auth: state,
        logger: pino({ level: 'silent' }) as any,
        printQRInTerminal: false,
        browser: ['Click Lead Storm', 'Desktop', '1.0.0'],
        syncFullHistory: false,
        markOnlineOnConnect: true,
        connectTimeoutMs: 60000,
        keepAliveIntervalMs: 25000
      });

      this.sock = socket;

      // Evento de atualização de credenciais
      socket.ev.on('creds.update', saveCreds);

      // Evento de sincronização inicial de histórico de conversas do aparelho
      socket.ev.on('messaging-history.set', ({ chats, contacts, messages }) => {
        loggerService.info('WHATSAPP', `Sincronização de histórico recebida: ${chats?.length || 0} conversas, ${messages?.length || 0} mensagens.`);
        
        try {
          const formattedMessages: Array<{
            from: string;
            pushName?: string;
            fromMe: boolean;
            body: string;
            timestamp: number;
          }> = [];

          if (Array.isArray(messages)) {
            for (const m of messages) {
              const remoteJid = m.key?.remoteJid || '';
              const participant = m.key?.participant || undefined;
              const cleanPhone = remoteJid.split('@')[0].split(':')[0].replace(/\D/g, '');

              // Ignora grupos, canais de transmissão, newsletters e contatos inválidos
              if (isWhatsAppGroupOrNewsletter(remoteJid, cleanPhone, participant)) continue;

              const text = extractMessageText(m.message);
              if (text) {
                formattedMessages.push({
                  from: cleanPhone,
                  pushName: m.pushName || undefined,
                  fromMe: !!m.key?.fromMe,
                  body: text,
                  timestamp: (Number(m.messageTimestamp) || Math.floor(Date.now() / 1000)) * 1000
                });
              }
            }
          }

          if (formattedMessages.length > 0) {
            this.sendToRenderer('wa-history-sync', { messages: formattedMessages });
          }
        } catch (err: any) {
          loggerService.error('WHATSAPP', 'Erro ao processar sincronização de histórico:', err?.message);
        }
      });

      // Evento de atualização de conexão
      socket.ev.on('connection.update', async (update: Partial<ConnectionState>) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
          try {
            loggerService.info('WHATSAPP', 'Novo QR Code gerado para autenticação.');
            const qrBase64 = await QRCode.toDataURL(qr, {
              width: 300,
              margin: 2,
              color: {
                dark: '#020617',
                light: '#ffffff'
              }
            });
            this.sendToRenderer('wa-qr-code', qrBase64);
          } catch (qrErr: any) {
            loggerService.error('WHATSAPP', 'Erro ao converter QR Code para Base64:', qrErr?.message);
          }
        }

        if (connection === 'open') {
          this.isInitializing = false;
          const userJid = socket.user?.id || '';
          const cleanPhone = userJid.split(':')[0].replace(/\D/g, '');

          this.currentStatus = {
            status: 'connected',
            user: socket.user ? { id: socket.user.id, name: socket.user.name } : undefined,
            phone: cleanPhone ? `+${cleanPhone}` : undefined
          };

          loggerService.info('WHATSAPP', `WhatsApp conectado com sucesso! Número ativo: ${this.currentStatus.phone}`);
          this.sendToRenderer('wa-status', this.currentStatus);
          trayService.setWhatsAppStatus('Conectado');
        } else if (connection === 'close') {
          this.isInitializing = false;
          trayService.setWhatsAppStatus('Desconectado');
          const statusCode = (lastDisconnect?.error as Boom)?.output?.statusCode;
          const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

          loggerService.warn('WHATSAPP', `Conexão encerrada. StatusCode: ${statusCode}. Reconectar: ${shouldReconnect}`);

          if (statusCode === DisconnectReason.loggedOut) {
            this.currentStatus = { status: 'disconnected' };
            await this.clearAuth();
            this.sendToRenderer('wa-status', this.currentStatus);
          } else if (statusCode === DisconnectReason.connectionReplaced) {
            this.currentStatus = { status: 'disconnected' };
            this.sendToRenderer('wa-status', this.currentStatus);
            loggerService.warn('WHATSAPP', 'Sessão substituída por outra conexão ativa (StatusCode 440). Reconexão pausada.');
          } else {
            this.currentStatus = { status: 'disconnected' };
            this.sendToRenderer('wa-status', this.currentStatus);
            
            // Reconexão resiliente após 4 segundos para quedas transitórias de rede
            setTimeout(() => {
              loggerService.info('WHATSAPP', 'Tentando reconectar automaticamente...');
              this.initWhatsApp().catch((err) => {
                loggerService.error('WHATSAPP', 'Erro na reconexão automática:', err?.message);
              });
            }, 4000);
          }
        }
      });

      // Evento de recebimento de mensagens (alimenta o Chat e o Auto-Responder)
      socket.ev.on('messages.upsert', async ({ messages, type }) => {
        for (const msg of messages) {
          const remoteJid = msg.key?.remoteJid || '';
          const participant = msg.key?.participant || undefined;
          const cleanFrom = remoteJid.split('@')[0].split(':')[0].replace(/\D/g, '');

          // Ignora grupos, canais de transmissão, newsletters e contatos inválidos
          if (isWhatsAppGroupOrNewsletter(remoteJid, cleanFrom, participant)) {
            continue;
          }

          const body = extractMessageText(msg.message);
          if (!body) continue;

          // Mapeia JID e cleanFrom para envio futuro assertivo (suporte total a LID)
          this.jidMap.set(cleanFrom, remoteJid);
          this.jidMap.set(remoteJid, remoteJid);

          const fromMe = !!msg.key?.fromMe;
          const pushName = msg.pushName || undefined;
          const timestamp = Number(msg.messageTimestamp) || Math.floor(Date.now() / 1000);

          loggerService.info(
            'WHATSAPP',
            `Mensagem ${fromMe ? 'enviada por mim para' : 'recebida de'} ${remoteJid} (${pushName || 'Sem nome'}): "${body.substring(0, 60)}${body.length > 60 ? '...' : ''}"`
          );

          this.sendToRenderer('wa-incoming-message', {
            from: cleanFrom,
            jid: remoteJid,
            fromMe,
            pushName,
            body,
            timestamp
          });

          // Dispara notificação nativa do Windows no Tray se for resposta de lead
          if (!fromMe) {
            trayService.showLeadReplyNotification({
              senderName: pushName,
              phone: cleanFrom,
              previewText: body,
              channel: 'whatsapp'
            });
          }
        }
      });

      return this.currentStatus;
    } catch (error: any) {
      this.isInitializing = false;
      this.currentStatus = { status: 'disconnected' };
      loggerService.error('WHATSAPP', 'Falha ao inicializar WhatsApp:', error?.message);
      this.sendToRenderer('wa-status', this.currentStatus);
      throw error;
    }
  }

  public async sendWhatsAppMessage(phone: string, text: string): Promise<{ success: boolean; messageId?: string }> {
    if (!this.sock || this.currentStatus.status !== 'connected') {
      loggerService.error('WHATSAPP', 'Tentativa de envio falhou: WhatsApp desconectado.');
      throw new Error('WhatsApp não está conectado. Conecte o aparelho via QR Code.');
    }

    let jid = phone.trim();
    const cleanDigits = jid.replace(/\D/g, '');

    // 1. Resolução via mapa de JIDs conhecidos (resolve LIDs mapeados automaticamente)
    if (this.jidMap.has(jid)) {
      jid = this.jidMap.get(jid)!;
    } else if (this.jidMap.has(cleanDigits)) {
      jid = this.jidMap.get(cleanDigits)!;
    } else if (!jid.includes('@')) {
      // Se não possui domínio @, verifica se é formato de LID (14+ dígitos) ou número com DDI
      if (cleanDigits.length >= 14 && (cleanDigits.startsWith('14') || cleanDigits.startsWith('15') || cleanDigits.startsWith('16'))) {
        jid = `${cleanDigits}@lid`;
      } else {
        if (!cleanDigits || cleanDigits.length < 8) {
          throw new Error(`Número de telefone inválido: "${phone}"`);
        }
        jid = `${cleanDigits}@s.whatsapp.net`;
      }
    }

    try {
      loggerService.info('WHATSAPP', `Iniciando envio para ${jid}: "${text.substring(0, 50)}${text.length > 50 ? '...' : ''}"`);

      // 1. Simula presença de digitação (Composing)
      try {
        await this.sock.sendPresenceUpdate('composing', jid);
      } catch {}

      // 2. Pausa estocástica de digitação (entre 1200ms e 2500ms)
      const typingDelay = Math.floor(1200 + Math.random() * 1300);
      await new Promise((resolve) => setTimeout(resolve, typingDelay));

      // 3. Envia a mensagem de texto
      const result = await this.sock.sendMessage(jid, { text });

      // 4. Finaliza presença
      try {
        await this.sock.sendPresenceUpdate('paused', jid);
      } catch {}

      loggerService.info('WHATSAPP', `Mensagem enviada com sucesso para ${jid} (ID: ${result?.key?.id})`);

      return {
        success: true,
        messageId: result?.key?.id || undefined
      };
    } catch (error: any) {
      loggerService.error('WHATSAPP', `Erro ao enviar mensagem para ${jid}:`, error?.message);
      try {
        await this.sock.sendPresenceUpdate('paused', jid);
      } catch {}
      throw error;
    }
  }

  /**
   * Verifica se uma lista de números possui conta ativa no WhatsApp usando Baileys onWhatsApp
   */
  public async checkNumbersOnWhatsApp(phones: string[]): Promise<Record<string, { exists: boolean; jid?: string }>> {
    const resultMap: Record<string, { exists: boolean; jid?: string }> = {};

    if (!this.sock || this.currentStatus.status !== 'connected') {
      loggerService.warn('WHATSAPP', 'Tentativa de checar números com WhatsApp desconectado.');
      for (const phone of phones) {
        resultMap[phone] = { exists: false };
      }
      return resultMap;
    }

    try {
      // Limpa números e formata para JID internacional
      const phoneToJidMap: Map<string, string> = new Map();
      const validJids: string[] = [];

      for (const rawPhone of phones) {
        const clean = rawPhone.replace(/\D/g, '');
        if (clean.length >= 10) {
          const international = clean.startsWith('55') ? clean : `55${clean}`;
          const jid = `${international}@s.whatsapp.net`;
          phoneToJidMap.set(rawPhone, jid);
          validJids.push(jid);
        } else {
          resultMap[rawPhone] = { exists: false };
        }
      }

      if (validJids.length === 0) {
        return resultMap;
      }

      loggerService.info('WHATSAPP', `Verificando ${validJids.length} números no WhatsApp via onWhatsApp...`);
      
      // Baileys onWhatsApp aceita múltiplos JIDs
      const queryResults = await this.sock.onWhatsApp(...validJids);
      const existsMap = new Map<string, string>(); // jid -> formatted jid
      
      if (Array.isArray(queryResults)) {
        for (const res of queryResults) {
          if (res && res.exists) {
            existsMap.set(res.jid, res.jid);
          }
        }
      }

      for (const rawPhone of phones) {
        const jid = phoneToJidMap.get(rawPhone);
        if (jid && existsMap.has(jid)) {
          resultMap[rawPhone] = { exists: true, jid };
        } else {
          resultMap[rawPhone] = { exists: false };
        }
      }

      loggerService.info('WHATSAPP', `Verificação concluída: ${existsMap.size} de ${phones.length} números têm WhatsApp.`);
      return resultMap;
    } catch (err: any) {
      loggerService.error('WHATSAPP', 'Erro ao verificar números no WhatsApp:', err?.message);
      for (const phone of phones) {
        resultMap[phone] = { exists: false };
      }
      return resultMap;
    }
  }

  public async disconnectWhatsApp(): Promise<void> {
    try {
      loggerService.info('WHATSAPP', 'Desconectando sessão do WhatsApp...');
      if (this.sock) {
        try {
          await this.sock.logout();
        } catch {}
        try {
          this.sock.end(undefined);
        } catch {}
        this.sock = null;
      }
    } finally {
      await this.clearAuth();
      this.currentStatus = { status: 'disconnected' };
      this.sendToRenderer('wa-status', this.currentStatus);
      trayService.setWhatsAppStatus('Desconectado');
      loggerService.info('WHATSAPP', 'Sessão do WhatsApp encerrada e credenciais limpas.');
    }
  }

  private async clearAuth(): Promise<void> {
    try {
      if (fs.existsSync(this.authDir)) {
        fs.rmSync(this.authDir, { recursive: true, force: true });
        fs.mkdirSync(this.authDir, { recursive: true });
      }
    } catch (err: any) {
      loggerService.warn('WHATSAPP', 'Erro ao limpar diretório de autenticação:', err?.message);
    }
  }
}

export const whatsappService = new WhatsAppService();
