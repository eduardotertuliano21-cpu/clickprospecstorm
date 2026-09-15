const { contextBridge, ipcRenderer } = require('electron');

// Expõe APIs seguras para a janela React via contextBridge
contextBridge.exposeInMainWorld('electronAPI', {
  // Controle de Janela e Versão
  minimize: () => ipcRenderer.send('window-minimize'),
  maximize: () => ipcRenderer.send('window-maximize'),
  close: () => ipcRenderer.send('window-close'),
  getVersion: () => ipcRenderer.invoke('get-app-version'),

  // Métodos Nativos do WhatsApp (Baileys)
  initWhatsApp: () => ipcRenderer.invoke('wa-init'),
  logoutWhatsApp: () => ipcRenderer.invoke('wa-logout'),
  sendWhatsAppMessage: (data) => ipcRenderer.invoke('wa-send-message', data),
  getWhatsAppStatus: () => ipcRenderer.invoke('wa-get-status'),
  checkWhatsAppNumbers: (phones) => ipcRenderer.invoke('wa-check-numbers', phones),

  // Prospecção Nativa no Google Maps & Enriquecimento
  scrapeGoogleMaps: (data) => ipcRenderer.invoke('scrape-google-maps', data),
  findCompanyCnpj: (data) => ipcRenderer.invoke('find-company-cnpj', data),

  // Módulos Omnichannel (E-mail SMTP, Meta Graph API e Despachador Universal)
  testEmailConnection: (config) => ipcRenderer.invoke('email-test-connection', config),
  sendEmail: (payload) => ipcRenderer.invoke('email-send', payload),
  testMetaConnection: (config) => ipcRenderer.invoke('meta-test-connection', config),
  sendMetaMessage: (payload) => ipcRenderer.invoke('meta-send-message', payload),
  startMetaOAuth: (data) => ipcRenderer.invoke('meta:start-oauth', data),
  disconnectMeta: () => ipcRenderer.invoke('meta:disconnect'),

  // Autenticação Webview Nativa (Instagram & Facebook Messenger)
  loginInstagram: () => ipcRenderer.invoke('auth:instagram-login'),
  logoutInstagram: () => ipcRenderer.invoke('auth:instagram-logout'),
  getInstagramStatus: () => ipcRenderer.invoke('auth:instagram-status'),
  loginFacebook: () => ipcRenderer.invoke('auth:facebook-login'),
  logoutFacebook: () => ipcRenderer.invoke('auth:facebook-logout'),
  getFacebookStatus: () => ipcRenderer.invoke('auth:facebook-status'),

  // Prospecção & Autenticação LinkedIn
  searchLinkedInLeads: (query) => ipcRenderer.invoke('linkedin:search-leads', query),
  findLinkedInDecisionMakers: (data) => ipcRenderer.invoke('linkedin:find-decision-makers', data),
  loginLinkedIn: () => ipcRenderer.invoke('auth:linkedin-login'),
  logoutLinkedIn: () => ipcRenderer.invoke('auth:linkedin-logout'),
  getLinkedInStatus: () => ipcRenderer.invoke('auth:linkedin-status'),

  sendOmniMessage: (payload) => ipcRenderer.invoke('omni:send-message', payload),

  // Listeners de Eventos do Processo Principal
  onOmniIncomingMessage: (callback) => {
    const subscription = (_event, msg) => callback(msg);
    ipcRenderer.on('omni:incoming-message', subscription);
    return () => {
      ipcRenderer.removeListener('omni:incoming-message', subscription);
    };
  },

  onQrCode: (callback) => {
    const subscription = (_event, qrBase64) => callback(qrBase64);
    ipcRenderer.on('wa-qr-code', subscription);
    return () => {
      ipcRenderer.removeListener('wa-qr-code', subscription);
    };
  },

  onWhatsAppStatus: (callback) => {
    const subscription = (_event, status) => callback(status);
    ipcRenderer.on('wa-status', subscription);
    return () => {
      ipcRenderer.removeListener('wa-status', subscription);
    };
  },

  onIncomingMessage: (callback) => {
    const subscription = (_event, msg) => callback(msg);
    ipcRenderer.on('wa-incoming-message', subscription);
    return () => {
      ipcRenderer.removeListener('wa-incoming-message', subscription);
    };
  },

  onHistorySync: (callback) => {
    const subscription = (_event, data) => callback(data);
    ipcRenderer.on('wa-history-sync', subscription);
    return () => {
      ipcRenderer.removeListener('wa-history-sync', subscription);
    };
  },

  // Sistema de Logs & Diagnóstico
  getLogs: () => ipcRenderer.invoke('get-system-logs'),
  clearLogs: () => ipcRenderer.invoke('clear-system-logs'),
  openLogDir: () => ipcRenderer.invoke('open-log-directory'),
  logMessage: (level, tag, message, meta) => ipcRenderer.invoke('write-renderer-log', { level, tag, message, meta }),
  onLog: (callback) => {
    const subscription = (_event, logEntry) => callback(logEntry);
    ipcRenderer.on('app-log', subscription);
    return () => {
      ipcRenderer.removeListener('app-log', subscription);
    };
  },

  // System Tray & Controles de Segundo Plano
  setTrayCampaignStatus: (running) => ipcRenderer.send('tray:set-campaign-status', running),
  setTrayAutoResponderStatus: (enabled) => ipcRenderer.send('tray:set-auto-responder-status', enabled),
  setTrayWhatsAppStatus: (status) => ipcRenderer.send('tray:set-whatsapp-status', status),
  onTrayAutoResponderChanged: (callback) => {
    const subscription = (_event, enabled) => callback(enabled);
    ipcRenderer.on('auto-responder:status-changed', subscription);
    return () => {
      ipcRenderer.removeListener('auto-responder:status-changed', subscription);
    };
  },
  onTrayCampaignTogglePause: (callback) => {
    const subscription = () => callback();
    ipcRenderer.on('campaign:toggle-pause', subscription);
    return () => {
      ipcRenderer.removeListener('campaign:toggle-pause', subscription);
    };
  },

  // Sistema de Licenças e Bloqueio Remoto
  getLicenseInfo: () => ipcRenderer.invoke('license:get-info'),
  verifyLicense: (key) => ipcRenderer.invoke('license:verify-key', key),
  onLicenseStatusChanged: (callback) => {
    const subscription = (_event, lic) => callback(lic);
    ipcRenderer.on('license:status-changed', subscription);
    return () => {
      ipcRenderer.removeListener('license:status-changed', subscription);
    };
  },
  onForceUpdate: (callback) => {
    const subscription = (_event, info) => callback(info);
    ipcRenderer.on('license:force-update', subscription);
    return () => {
      ipcRenderer.removeListener('license:force-update', subscription);
    };
  },
  openExternal: (url) => ipcRenderer.invoke('open-external', url),

  // Notificações Nativas do Windows
  notifyLeadReply: (data) => ipcRenderer.send('notify:lead-reply', data),
  notifyCampaignCompleted: (data) => ipcRenderer.send('notify:campaign-completed', data)
});
