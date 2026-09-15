import { ipcRenderer } from 'electron';
import fs from 'fs';
import path from 'path';

console.log('[Click Lead Storm WebView Preload] Inicializando Preload do WhatsApp Web...');

// Injeção do WA-JS no contexto da página assim que o DOM carregar
window.addEventListener('DOMContentLoaded', () => {
  console.log('[Click Lead Storm WebView Preload] DOMContentLoaded detectado, injetando WA-JS...');

  // Caminho do arquivo wppconnect-wa.js nos resources ou public
  const possiblePaths = [
    path.join(__dirname, '../../public/vendor/wppconnect-wa-js.js'),
    path.join(__dirname, '../../../public/vendor/wppconnect-wa-js.js'),
    path.join(process.resourcesPath || '', 'vendor/wppconnect-wa-js.js'),
    path.join(process.resourcesPath || '', 'public/vendor/wppconnect-wa-js.js')
  ];

  let waJsContent = '';
  for (const p of possiblePaths) {
    if (fs.existsSync(p)) {
      try {
        waJsContent = fs.readFileSync(p, 'utf-8');
        console.log(`[Click Lead Storm WebView Preload] WA-JS carregado a partir de: ${p}`);
        break;
      } catch (e) {
        console.warn(`[Click Lead Storm WebView Preload] Erro ao ler ${p}:`, e);
      }
    }
  }

  // 1. Injeta o código do WA-JS
  const scriptEl = document.createElement('script');
  if (waJsContent) {
    scriptEl.textContent = waJsContent;
  } else {
    // Fallback CDN se os arquivos locais não estiverem acessíveis
    scriptEl.src = 'https://unpkg.com/@wppconnect/wa-js@latest/dist/wppconnect-wa.js';
  }
  (document.head || document.documentElement).appendChild(scriptEl);

  // 2. Injeta o observador e despachante no escopo window da página
  const observerScript = document.createElement('script');
  observerScript.textContent = `
    (function initWppObserver() {
      console.log('[Click Lead Storm PageContext] Observador de prontidão iniciado...');
      
      let attempts = 0;
      function waitForWPP() {
        attempts++;
        if (window.WPP && window.WPP.webpack && window.WPP.webpack.isReady) {
          console.log('[Click Lead Storm PageContext] WPP pronto e ativo!');
          window.postMessage({ type: 'CLS_PAGE_WPP_READY', isReady: true }, '*');
          setupIncomingListeners();
        } else if (attempts < 120) {
          setTimeout(waitForWPP, 1000);
        }
      }

      function setupIncomingListeners() {
        try {
          if (window.WPP.chat && window.WPP.chat.on) {
            window.WPP.chat.on('msg', (msg) => {
              if (!msg.isGroupMsg && !msg.fromMe && msg.body) {
                window.postMessage({
                  type: 'CLS_PAGE_INCOMING_MSG',
                  from: msg.from,
                  body: msg.body,
                  timestamp: msg.t
                }, '*');
              }
            });
          }
        } catch (e) {
          console.warn('[Click Lead Storm PageContext] Erro ao registrar listener de msg:', e);
        }
      }

      window.addEventListener('message', async (event) => {
        if (!event.data || !event.data.type || !event.data.type.startsWith('CLS_PAGE_ACTION_')) return;
        
        const { type, actionId, payload } = event.data;

        try {
          if (type === 'CLS_PAGE_ACTION_CHECK_STATUS') {
            const isReady = !!(window.WPP && window.WPP.webpack && window.WPP.webpack.isReady);
            const isConnected = !!(window.WPP && window.WPP.conn && window.WPP.conn.isMainReady && window.WPP.conn.isMainReady());
            window.postMessage({
              type: 'CLS_PAGE_ACTION_RESPONSE',
              actionId,
              success: true,
              result: { isReady, isConnected }
            }, '*');
          }
          else if (type === 'CLS_PAGE_ACTION_SET_COMPOSING') {
            const { to, duration } = payload;
            const chatId = to.includes('@') ? to : \`\${to}@c.us\`;
            if (window.WPP && window.WPP.chat && window.WPP.chat.markIsComposing) {
              await window.WPP.chat.markIsComposing(chatId, duration || 3000);
            }
            window.postMessage({
              type: 'CLS_PAGE_ACTION_RESPONSE',
              actionId,
              success: true
            }, '*');
          }
          else if (type === 'CLS_PAGE_ACTION_SEND_TEXT') {
            if (!window.WPP || !window.WPP.chat) {
              throw new Error('WPP não está inicializado.');
            }
            const { to, text } = payload;
            const chatId = to.includes('@') ? to : \`\${to}@c.us\`;
            
            // Disparo oficial via módulo nativo do WA-JS
            const result = await window.WPP.chat.sendTextMessage(chatId, text, {
              createChat: true,
              waitForAck: true
            });

            window.postMessage({
              type: 'CLS_PAGE_ACTION_RESPONSE',
              actionId,
              success: true,
              result
            }, '*');
          }
          else if (type === 'CLS_PAGE_ACTION_QUERY_EXISTS') {
            const { phone } = payload;
            const chatId = phone.includes('@') ? phone : \`\${phone}@c.us\`;
            const exists = await window.WPP.contact.queryExists(chatId);
            window.postMessage({
              type: 'CLS_PAGE_ACTION_RESPONSE',
              actionId,
              success: true,
              result: !!exists
            }, '*');
          }
        } catch (error) {
          window.postMessage({
            type: 'CLS_PAGE_ACTION_RESPONSE',
            actionId,
            success: false,
            error: error?.message || String(error)
          }, '*');
        }
      });

      waitForWPP();
    })();
  `;
  (document.head || document.documentElement).appendChild(observerScript);
});

// Escuta eventos vindos da página (PageContext) e repassa ao React Host via sendToHost
window.addEventListener('message', (event) => {
  if (event.source !== window || !event.data || !event.data.type) return;

  const { type, actionId, success, result, error, isReady, from, body, timestamp } = event.data;

  if (type === 'CLS_PAGE_WPP_READY') {
    ipcRenderer.sendToHost('CLS_STATUS_CHANGED', { isReady });
  } else if (type === 'CLS_PAGE_INCOMING_MSG') {
    ipcRenderer.sendToHost('CLS_INCOMING_MSG', { from, body, timestamp });
  } else if (type === 'CLS_PAGE_ACTION_RESPONSE') {
    ipcRenderer.sendToHost('CLS_ACTION_REPLY', { actionId, success, result, error });
  }
});

// Escuta comandos enviados pelo Host (janela principal React) para a Webview
ipcRenderer.on('HOST_EXECUTE_ACTION', (_event, { actionType, actionId, payload }) => {
  window.postMessage({
    type: `CLS_PAGE_ACTION_${actionType}`,
    actionId,
    payload
  }, '*');
});
