/**
 * Service Worker Principal do Click Lead Storm (Manifest V3)
 * Gerencia Side Panel, auto-injeção em abas existentes e roteamento de mensagens
 */

// Permite abrir o Side Panel ao clicar no ícone da extensão
chrome.runtime.onInstalled.addListener(async () => {
  console.log('[Click Lead Storm] Extensão instalada/atualizada.');
  if (chrome.sidePanel && chrome.sidePanel.setPanelBehavior) {
    chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch((err: any) => {
      console.warn('[Click Lead Storm] Erro ao configurar sidePanel behavior:', err);
    });
  }

  // Auto-injeta nas abas do WhatsApp Web que já estiverem abertas
  await injectScriptsIntoExistingTabs();
});

async function injectScriptsIntoExistingTabs() {
  try {
    const tabs = await chrome.tabs.query({ url: '*://web.whatsapp.com/*' });
    for (const tab of tabs) {
      if (tab.id) {
        try {
          await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            files: ['vendor/wppconnect-wa-js.js', 'src/content/inpage.js'],
            world: 'MAIN'
          });
          await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            files: ['src/content/bridge.js']
          });
          console.log('[Click Lead Storm Worker] Scripts auto-injetados na aba:', tab.id);
        } catch (e) {
          // Pode falhar em abas protegidas ou desconectadas
        }
      }
    }
  } catch (err) {
    console.warn('[Click Lead Storm Worker] Falha na auto-injeção:', err);
  }
}

// Listener de mensagens globais
chrome.runtime.onMessage.addListener((message: any, _sender: any, sendResponse: (res: any) => void) => {
  if (message?.type === 'OPEN_OR_FOCUS_WHATSAPP') {
    (async () => {
      try {
        const tabs = await chrome.tabs.query({ url: '*://web.whatsapp.com/*' });
        if (tabs.length > 0 && tabs[0].id) {
          await chrome.tabs.update(tabs[0].id, { active: true });
          if (tabs[0].windowId) {
            await chrome.windows.update(tabs[0].windowId, { focused: true });
          }
          sendResponse({ success: true, opened: false });
        } else {
          await chrome.tabs.create({ url: 'https://web.whatsapp.com' });
          sendResponse({ success: true, opened: true });
        }
      } catch (err: any) {
        sendResponse({ success: false, error: err?.message });
      }
    })();
    return true;
  }

  if (message?.target === 'WHATSAPP_TAB') {
    (async () => {
      try {
        const tabs = await chrome.tabs.query({ url: '*://web.whatsapp.com/*' });
        if (!tabs || tabs.length === 0) {
          sendResponse({
            success: false,
            error: 'Nenhuma aba do WhatsApp Web aberta. Abra https://web.whatsapp.com primeiro.'
          });
          return;
        }

        const activeTab = tabs[0];
        if (!activeTab.id) {
          sendResponse({ success: false, error: 'Aba do WhatsApp Web inválida.' });
          return;
        }

        // Tenta enviar mensagem para o content script bridge
        try {
          const res = await chrome.tabs.sendMessage(activeTab.id, message.data);
          sendResponse(res);
        } catch (sendErr: any) {
          console.log('[Click Lead Storm Worker] Content script não respondeu, auto-injetando agora na aba:', activeTab.id);
          try {
            await chrome.scripting.executeScript({
              target: { tabId: activeTab.id },
              files: ['vendor/wppconnect-wa-js.js', 'src/content/inpage.js'],
              world: 'MAIN'
            });
            await chrome.scripting.executeScript({
              target: { tabId: activeTab.id },
              files: ['src/content/bridge.js']
            });

            // Aguarda inicialização breve e re-tenta
            await new Promise(r => setTimeout(r, 800));
            const retryRes = await chrome.tabs.sendMessage(activeTab.id, message.data);
            sendResponse(retryRes);
          } catch (injectErr: any) {
            sendResponse({
              success: false,
              error: 'Recarregue (F5) a aba do WhatsApp Web para inicializar a conexão.'
            });
          }
        }
      } catch (err: any) {
        sendResponse({
          success: false,
          error: err?.message || 'Falha ao se comunicar com a aba do WhatsApp Web.'
        });
      }
    })();
    return true; // Resposta assíncrona
  }

  // Notificação de mensagem recebida no WhatsApp (para Auto-Responder)
  if (message?.type === 'CLS_INCOMING_MSG_EVENT') {
    chrome.runtime.sendMessage({
      type: 'FORWARD_INCOMING_MSG',
      payload: message.payload
    }).catch(() => {});
  }
});
