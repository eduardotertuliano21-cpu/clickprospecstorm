/**
 * Ponte de Mensageria (Bridge) entre o Content Script e a extensão (Side Panel / Service Worker)
 */

interface PendingAction {
  resolve: (val: any) => void;
  reject: (err: any) => void;
  timer: any;
}

const pendingActions = new Map<string, PendingAction>();

// Escuta respostas vindas da página (injected script)
window.addEventListener('message', (event) => {
  if (event.source !== window || !event.data || !event.data.type) return;

  const { type, actionId, success, result, error, isReady, from, body } = event.data;

  // Notificação espontânea de status do WPP
  if (type === 'CLS_WPP_STATUS') {
    chrome.runtime.sendMessage({
      type: 'CLS_STATUS_CHANGED',
      isReady
    }).catch(() => {});
  }

  // Notificação de mensagem recebida (para Auto-Responder)
  if (type === 'CLS_INCOMING_MSG') {
    chrome.runtime.sendMessage({
      type: 'CLS_INCOMING_MSG_EVENT',
      payload: { from, body }
    }).catch(() => {});
  }

  // Resposta para uma ação assíncrona específica
  if (type === 'CLS_ACTION_RESPONSE' && actionId && pendingActions.has(actionId)) {
    const action = pendingActions.get(actionId)!;
    clearTimeout(action.timer);
    pendingActions.delete(actionId);

    if (success) {
      action.resolve(result);
    } else {
      action.reject(new Error(error || 'Erro desconhecido na execução da ação no WhatsApp'));
    }
  }
});

// Envia uma ação para a página e aguarda resposta via Promise
function executePageAction(actionType: string, payload?: any, timeoutMs = 30000): Promise<any> {
  return new Promise((resolve, reject) => {
    const actionId = `action_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;

    const timer = setTimeout(() => {
      pendingActions.delete(actionId);
      reject(new Error(`Timeout aguardando execução da ação: ${actionType}`));
    }, timeoutMs);

    pendingActions.set(actionId, { resolve, reject, timer });

    window.postMessage({
      type: actionType,
      actionId,
      payload
    }, '*');
  });
}

// Escuta comandos vindos do Side Panel ou Service Worker
chrome.runtime.onMessage.addListener((message: any, _sender: any, sendResponse: (res: any) => void) => {
  if (!message || !message.action) return;

  if (message.action === 'CHECK_WPP_READY') {
    executePageAction('CLS_ACTION_CHECK_STATUS', null, 5000)
      .then(res => sendResponse({ success: true, data: res }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true; // async response
  }

  if (message.action === 'SET_COMPOSING') {
    const { to, duration } = message.payload || {};
    executePageAction('CLS_ACTION_SET_COMPOSING', { to, duration }, 10000)
      .then(() => sendResponse({ success: true }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (message.action === 'SEND_WHATSAPP_MESSAGE') {
    const { to, text } = message.payload || {};
    executePageAction('CLS_ACTION_SEND_TEXT', { to, text }, 45000)
      .then(res => sendResponse({ success: true, data: res }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (message.action === 'CHECK_CONTACT_EXISTS') {
    const { phone } = message.payload || {};
    executePageAction('CLS_ACTION_QUERY_EXISTS', { phone }, 10000)
      .then(exists => sendResponse({ success: true, exists }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }
});

console.log('[Click Lead Storm] Bridge content script inicializado.');
