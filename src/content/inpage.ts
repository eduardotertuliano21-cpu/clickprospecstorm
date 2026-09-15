/**
 * InPage Script do Click Lead Storm (Executa no contexto MAIN de web.whatsapp.com)
 * Tem acesso direto a window.WPP sem bloqueios de Content Security Policy (CSP)
 */

console.log('[Click Lead Storm InPage] Inicializado no contexto da página do WhatsApp Web.');

function notifyReady() {
  console.log('[Click Lead Storm InPage] WPP pronto e confirmado!');
  window.postMessage({ type: 'CLS_WPP_STATUS', isReady: true }, '*');
}

function checkWppReady() {
  const wpp = (window as any).WPP;
  if (wpp) {
    if (wpp.isReady || (wpp.webpack && wpp.webpack.isReady)) {
      notifyReady();
      setupListeners();
      return;
    }
    if (wpp.webpack && typeof wpp.webpack.onReady === 'function') {
      wpp.webpack.onReady(() => {
        notifyReady();
        setupListeners();
      });
      return;
    }
  }
  setTimeout(checkWppReady, 1000);
}

let listenersSetup = false;
function setupListeners() {
  if (listenersSetup) return;
  const wpp = (window as any).WPP;
  try {
    if (wpp && wpp.chat && typeof wpp.chat.on === 'function') {
      listenersSetup = true;
      wpp.chat.on('msg', (msg: any) => {
        if (!msg.isGroupMsg && !msg.fromMe && msg.body) {
          window.postMessage({
            type: 'CLS_INCOMING_MSG',
            from: msg.from,
            body: msg.body,
            timestamp: msg.t
          }, '*');
        }
      });
      console.log('[Click Lead Storm InPage] Listener de mensagens recebidas configurado.');
    }
  } catch (e) {
    console.warn('[Click Lead Storm InPage] Erro ao registrar listener de msg:', e);
  }
}

/**
 * Resolve o WID correto para um número de telefone, tratando com inteligência
 * variações com e sem o nono dígito no Brasil (ex: 55119... vs 5511...)
 */
async function resolveWid(wpp: any, rawPhone: string): Promise<string> {
  const clean = rawPhone.replace(/\D/g, '');
  let defaultId = clean.includes('@') ? clean : `${clean}@c.us`;

  if (!wpp || !wpp.contact || typeof wpp.contact.queryExists !== 'function') {
    return defaultId;
  }

  try {
    // 1. Tenta consulta direta
    const query = await wpp.contact.queryExists(defaultId);
    if (query && query.wid) {
      return query.wid._serialized || query.wid.toString();
    }

    // 2. Se for número brasileiro (começa com 55)
    if (clean.startsWith('55')) {
      // Caso 1: tem 13 dígitos (com o 9º dígito: 55 + DD + 9 + 8 dígitos) -> tenta sem o 9
      if (clean.length === 13) {
        const withoutNine = clean.slice(0, 4) + clean.slice(5);
        const qWithout = await wpp.contact.queryExists(`${withoutNine}@c.us`);
        if (qWithout && qWithout.wid) {
          console.log(`[Click Lead Storm InPage] Resolvido sem 9º dígito: ${withoutNine}@c.us`);
          return qWithout.wid._serialized || qWithout.wid.toString();
        }
      }
      // Caso 2: tem 12 dígitos (sem o 9º dígito: 55 + DD + 8 dígitos) -> tenta com o 9
      else if (clean.length === 12) {
        const withNine = clean.slice(0, 4) + '9' + clean.slice(4);
        const qWith = await wpp.contact.queryExists(`${withNine}@c.us`);
        if (qWith && qWith.wid) {
          console.log(`[Click Lead Storm InPage] Resolvido com 9º dígito: ${withNine}@c.us`);
          return qWith.wid._serialized || qWith.wid.toString();
        }
      }
    }
  } catch (err) {
    console.warn('[Click Lead Storm InPage] Aviso ao resolver WID:', err);
  }

  return defaultId;
}

// Escuta ações enviadas pelo bridge.ts (contexto ISOLATED)
window.addEventListener('message', async (event) => {
  if (event.source !== window || !event.data || !event.data.type || !event.data.type.startsWith('CLS_ACTION_')) return;

  const { type, actionId, payload } = event.data;
  const wpp = (window as any).WPP;

  try {
    if (type === 'CLS_ACTION_CHECK_STATUS') {
      const isReady = !!(wpp && (wpp.isReady || (wpp.webpack && wpp.webpack.isReady)));
      const isConnected = !!(wpp && wpp.conn && (wpp.conn.isMainReady?.() || wpp.conn.isRegistered?.()));

      window.postMessage({
        type: 'CLS_ACTION_RESPONSE',
        actionId,
        success: true,
        result: { isReady: isReady || isConnected, isConnected }
      }, '*');
    }
    else if (type === 'CLS_ACTION_SET_COMPOSING') {
      const { to, duration } = payload || {};
      const targetId = await resolveWid(wpp, to || '');

      if (wpp && wpp.chat && typeof wpp.chat.markIsComposing === 'function') {
        try {
          await wpp.chat.markIsComposing(targetId, duration || 3000);
        } catch {}
      }

      window.postMessage({
        type: 'CLS_ACTION_RESPONSE',
        actionId,
        success: true
      }, '*');
    }
    else if (type === 'CLS_ACTION_SEND_TEXT') {
      if (!wpp || !wpp.chat) {
        throw new Error('Módulo WPP.chat não disponível no WhatsApp Web.');
      }
      const { to, text } = payload;
      const targetId = await resolveWid(wpp, to || '');

      // 1. Garante que o chat é criado/encontrado no WhatsApp Web antes de enviar
      if (wpp.chat.find && typeof wpp.chat.find === 'function') {
        try {
          await wpp.chat.find(targetId);
        } catch (findErr) {
          console.warn('[Click Lead Storm InPage] chat.find warning (continuando):', findErr);
        }
      }

      // 2. Dispara a mensagem de texto
      let result;
      try {
        result = await wpp.chat.sendTextMessage(targetId, text, {
          createChat: true,
          waitForAck: true
        });
      } catch (sendErr: any) {
        console.warn('[Click Lead Storm InPage] Primeira tentativa de envio falhou:', sendErr?.message);
        
        // Se falhou com "Chat not found" e for número brasileiro, tenta a variação alternativa de dígitos
        const clean = to.replace(/\D/g, '');
        if (clean.startsWith('55')) {
          const altClean = clean.length === 13 
            ? (clean.slice(0, 4) + clean.slice(5)) 
            : (clean.slice(0, 4) + '9' + clean.slice(4));
          const altId = `${altClean}@c.us`;

          console.log(`[Click Lead Storm InPage] Tentando envio para WID alternativo: ${altId}`);
          if (wpp.chat.find) {
            try { await wpp.chat.find(altId); } catch {}
          }
          result = await wpp.chat.sendTextMessage(altId, text, {
            createChat: true,
            waitForAck: true
          });
        } else {
          throw sendErr;
        }
      }

      window.postMessage({
        type: 'CLS_ACTION_RESPONSE',
        actionId,
        success: true,
        result
      }, '*');
    }
    else if (type === 'CLS_ACTION_QUERY_EXISTS') {
      if (!wpp || !wpp.contact) {
        throw new Error('Módulo WPP.contact não disponível.');
      }
      const { phone } = payload;
      const resolved = await resolveWid(wpp, phone);
      const exists = !!resolved;
      
      window.postMessage({
        type: 'CLS_ACTION_RESPONSE',
        actionId,
        success: true,
        result: exists
      }, '*');
    }
  } catch (error: any) {
    window.postMessage({
      type: 'CLS_ACTION_RESPONSE',
      actionId,
      success: false,
      error: error?.message || String(error)
    }, '*');
  }
});

checkWppReady();
