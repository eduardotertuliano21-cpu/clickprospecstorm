/**
 * Ponte de comunicação híbrida (Electron Baileys Nativo / Chrome Extension Side Panel)
 */

export interface ActionReply {
  actionId: string;
  success: boolean;
  result?: any;
  error?: string;
}

export interface IncomingMessageEvent {
  from: string;
  body: string;
  timestamp: number;
  fromMe?: boolean;
  pushName?: string;
  jid?: string;
}

type MessageCallback = (msg: IncomingMessageEvent) => void;
type HistorySyncCallback = (data: { messages: IncomingMessageEvent[] }) => void;
type StatusCallback = (ready: boolean) => void;

class WebviewBridgeService {
  private webviewElement: any = null;
  private pendingActions = new Map<string, { resolve: (val: any) => void; reject: (err: any) => void; timer: any }>();
  private messageListeners: Set<MessageCallback> = new Set();
  private historyListeners: Set<HistorySyncCallback> = new Set();
  private statusListeners: Set<StatusCallback> = new Set();
  private isReady = false;

  constructor() {
    // Modo 1: Electron Desktop Edition com Baileys Nativo
    if (typeof window !== 'undefined' && (window as any).electronAPI) {
      const electron = (window as any).electronAPI;

      // Status inicial
      if (typeof electron.getWhatsAppStatus === 'function') {
        electron.getWhatsAppStatus().then((status: any) => {
          this.isReady = status?.status === 'connected';
          this.statusListeners.forEach(cb => cb(this.isReady));
        }).catch(() => {});
      }

      // Escuta mudanças de status do Baileys
      if (typeof electron.onWhatsAppStatus === 'function') {
        electron.onWhatsAppStatus((status: any) => {
          this.isReady = status?.status === 'connected';
          this.statusListeners.forEach(cb => cb(this.isReady));
        });
      }

      // Escuta mensagens recebidas para o Auto-Responder e Chat
      if (typeof electron.onIncomingMessage === 'function') {
        electron.onIncomingMessage((msg: any) => {
          this.messageListeners.forEach(cb => cb(msg));
        });
      }

      // Escuta sincronização inicial de histórico
      if (typeof electron.onHistorySync === 'function') {
        electron.onHistorySync((data: any) => {
          this.historyListeners.forEach(cb => cb(data));
        });
      }
    }

    // Modo 2: Chrome Extension Side Panel
    if (typeof chrome !== 'undefined' && chrome.runtime?.onMessage) {
      chrome.runtime.onMessage.addListener((message: any) => {
        if (message?.type === 'FORWARD_INCOMING_MSG') {
          this.messageListeners.forEach(cb => cb(message.payload));
        } else if (message?.type === 'CLS_STATUS_CHANGED') {
          this.isReady = !!message.isReady;
          this.statusListeners.forEach(cb => cb(this.isReady));
        }
      });
    }
  }

  public setWebview(el: any) {
    if (!el || this.webviewElement === el) return;
    this.webviewElement = el;

    el.addEventListener('ipc-message', (event: any) => {
      const channel = event.channel;
      const data = event.args[0] || {};

      if (channel === 'CLS_STATUS_CHANGED') {
        this.isReady = !!data.isReady;
        this.statusListeners.forEach(cb => cb(this.isReady));
      } else if (channel === 'CLS_INCOMING_MSG') {
        this.messageListeners.forEach(cb => cb(data));
      } else if (channel === 'CLS_ACTION_REPLY') {
        const { actionId, success, result, error } = data as ActionReply;
        if (this.pendingActions.has(actionId)) {
          const action = this.pendingActions.get(actionId)!;
          clearTimeout(action.timer);
          this.pendingActions.delete(actionId);

          if (success) {
            action.resolve(result);
          } else {
            action.reject(new Error(error || 'Falha na execução no WhatsApp Web'));
          }
        }
      }
    });

    el.addEventListener('dom-ready', () => {
      console.log('[ClickLeadStorm Bridge] WebView DOM Ready. Verificando prontidão...');
      this.checkStatus().catch(() => {});
    });
  }

  public onIncomingMessage(cb: MessageCallback) {
    this.messageListeners.add(cb);
    return () => this.messageListeners.delete(cb);
  }

  public onHistorySync(cb: HistorySyncCallback) {
    this.historyListeners.add(cb);
    return () => this.historyListeners.delete(cb);
  }

  public onStatusChange(cb: StatusCallback) {
    this.statusListeners.add(cb);
    cb(this.isReady);
    return () => this.statusListeners.delete(cb);
  }

  public getIsReady(): boolean {
    return this.isReady;
  }

  public async executeAction(actionType: string, payload?: any, timeoutMs = 45000): Promise<any> {
    // Prioridade 1: Electron Desktop Baileys Nativo
    if (typeof window !== 'undefined' && (window as any).electronAPI) {
      const electron = (window as any).electronAPI;

      if (actionType === 'SEND_TEXT') {
        return await electron.sendWhatsAppMessage({
          phone: payload.to,
          text: payload.text
        });
      }

      if (actionType === 'CHECK_STATUS') {
        const status = await electron.getWhatsAppStatus();
        return {
          isReady: status?.status === 'connected',
          isConnected: status?.status === 'connected'
        };
      }

      if (actionType === 'SET_COMPOSING') {
        // No Baileys, o sendWhatsAppMessage já gerencia a presença 'composing'
        return { success: true };
      }

      if (actionType === 'QUERY_EXISTS') {
        const clean = (payload?.phone || '').replace(/\D/g, '');
        return clean.length >= 8;
      }
    }

    // Prioridade 2: Electron WebView legada (caso ainda fornecida)
    if (this.webviewElement) {
      return new Promise((resolve, reject) => {
        const actionId = `cls_act_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

        const timer = setTimeout(() => {
          this.pendingActions.delete(actionId);
          reject(new Error(`Timeout na operação ${actionType} no WhatsApp Web (${timeoutMs / 1000}s)`));
        }, timeoutMs);

        this.pendingActions.set(actionId, { resolve, reject, timer });

        this.webviewElement.send('HOST_EXECUTE_ACTION', {
          actionType,
          actionId,
          payload
        });
      });
    }

    // Prioridade 3: Chrome Extension Side Panel
    if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
      let actionName = actionType;
      if (actionType === 'CHECK_STATUS') actionName = 'CHECK_WPP_READY';
      if (actionType === 'SEND_TEXT') actionName = 'SEND_WHATSAPP_MESSAGE';
      if (actionType === 'SET_COMPOSING') actionName = 'SET_COMPOSING';
      if (actionType === 'QUERY_EXISTS') actionName = 'CHECK_CONTACT_EXISTS';

      return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage(
          {
            target: 'WHATSAPP_TAB',
            data: {
              action: actionName,
              payload
            }
          },
          (response: any) => {
            if (chrome.runtime.lastError) {
              reject(new Error(chrome.runtime.lastError.message));
              return;
            }
            if (!response || !response.success) {
              reject(new Error(response?.error || 'Aba do WhatsApp Web não respondeu. Certifique-se de estar com https://web.whatsapp.com aberto.'));
              return;
            }
            resolve(response.data || response.result || response);
          }
        );
      });
    }

    throw new Error('Ambiente não suportado (nem Electron, nem Chrome Extension).');
  }

  public async checkStatus(): Promise<{ isReady: boolean; isConnected: boolean }> {
    try {
      if (typeof window !== 'undefined' && (window as any).electronAPI) {
        const status = await (window as any).electronAPI.getWhatsAppStatus();
        this.isReady = status?.status === 'connected';
        this.statusListeners.forEach(cb => cb(this.isReady));
        return { isReady: this.isReady, isConnected: this.isReady };
      }

      const res = await this.executeAction('CHECK_STATUS', null, 6000);
      this.isReady = !!res?.isReady;
      this.statusListeners.forEach(cb => cb(this.isReady));
      return res;
    } catch {
      this.isReady = false;
      this.statusListeners.forEach(cb => cb(false));
      return { isReady: false, isConnected: false };
    }
  }

  public async setComposing(to: string, durationMs = 3500): Promise<void> {
    await this.executeAction('SET_COMPOSING', { to, duration: durationMs }, 8000);
  }

  public async sendTextMessage(to: string, text: string): Promise<any> {
    return await this.executeAction('SEND_TEXT', { to, text }, 45000);
  }

  public async queryContactExists(phone: string): Promise<boolean> {
    return await this.executeAction('QUERY_EXISTS', { phone }, 10000);
  }
}

export const webviewBridge = new WebviewBridgeService();
