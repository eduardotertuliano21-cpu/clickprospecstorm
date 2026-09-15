import React, { useState, useEffect } from 'react';
import { settingsRepository } from '../../../db/repositories/settingsRepository';
import { backupService } from '../../../services/backupService';
import { semanticCacheService } from '../../../services/semanticCacheService';
import { omnichannelService } from '../../../services/omnichannelService';
import type { ChannelSettings } from '../../../types/omnichannel';
import { type AppSettings } from '../../../db';
import { 
  Key, 
  ShieldCheck, 
  Download, 
  Upload, 
  Trash2, 
  Save, 
  CheckCircle2, 
  Cpu, 
  Briefcase,
  Database,
  Layers,
  Sparkles,
  Building2,
  Monitor,
  Mail,
  MessageSquare,
  Radio,
  ChevronDown,
  ChevronRight,
  Wifi,
  WifiOff,
  Crown,
  Lock,
  LogOut,
  KeyRound,
  AlertCircle
} from 'lucide-react';
import { useAdminStore } from '../../stores/useAdminStore';

const InstagramIcon: React.FC<{ className?: string }> = ({ className = 'w-4 h-4' }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect width="20" height="20" x="2" y="2" rx="5" ry="5"/>
    <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/>
    <line x1="17.5" x2="17.51" y1="6.5" y2="6.5"/>
  </svg>
);

const MessengerIcon: React.FC<{ className?: string }> = ({ className = 'w-4 h-4' }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 2C6.477 2 2 6.145 2 11.258c0 2.91 1.455 5.513 3.735 7.184V22l3.415-1.874c.905.251 1.865.388 2.85.388 5.523 0 10-4.145 10-9.256C22 6.145 17.523 2 12 2zm1.066 12.445l-2.585-2.756-5.048 2.756 5.552-5.895 2.651 2.756 4.982-2.756-5.552 5.895z"/>
  </svg>
);

const LinkedinIcon: React.FC<{ className?: string }> = ({ className = 'w-4 h-4' }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor">
    <path d="M19 3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14m-.5 15.5v-5.3a3.26 3.26 0 0 0-3.26-3.26c-.85 0-1.84.52-2.28 1.3v-1.11h-2.79v8.37h2.79v-4.93c0-.77.62-1.4 1.39-1.4a1.4 1.4 0 0 1 1.4 1.4v4.93h2.75M6.46 10.9v8.37H9.2V10.9H6.46M7.83 6.45c-.96 0-1.74.78-1.74 1.74 0 .96.78 1.74 1.74 1.74.96 0 1.74-.78 1.74-1.74 0-.96-.78-1.74-1.74-1.74Z"/>
  </svg>
);

export const SettingsTab: React.FC = () => {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [stationLicense, setStationLicense] = useState<any>(null);
  const [copiedStationId, setCopiedStationId] = useState(false);
  const [backupMsg, setBackupMsg] = useState<string | null>(null);
  const [cacheStats, setCacheStats] = useState<{ totalEntries: number; totalHits: number; tokensSaved: number }>({
    totalEntries: 0,
    totalHits: 0,
    tokensSaved: 0
  });

  // Estados Omnichannel
  const [channelSettings, setChannelSettings] = useState<ChannelSettings>({
    whatsapp: { connected: false },
    email: {
      enabled: false,
      host: 'smtp.gmail.com',
      port: 465,
      secure: true,
      auth: { user: '', pass: '' },
      fromName: 'Click Lead Storm'
    },
    meta: {
      enabled: false,
      pageAccessToken: '',
      instagramAccountId: '',
      pageId: ''
    }
  });

  const [testingEmail, setTestingEmail] = useState(false);
  const [emailStatusMsg, setEmailStatusMsg] = useState<string | null>(null);

  // Estados Webview Nativa (Instagram, Facebook Messenger & LinkedIn)
  const [instagramConnected, setInstagramConnected] = useState(false);
  const [instagramUsername, setInstagramUsername] = useState('');
  const [connectingInstagram, setConnectingInstagram] = useState(false);

  const [facebookConnected, setFacebookConnected] = useState(false);
  const [facebookName, setFacebookName] = useState('');
  const [connectingFacebook, setConnectingFacebook] = useState(false);

  const [linkedinConnected, setLinkedinConnected] = useState(false);
  const [linkedinName, setLinkedinName] = useState('');
  const [connectingLinkedin, setConnectingLinkedin] = useState(false);

  // Estados do Modo Mestre (Admin)
  const { isAdmin, adminEmail, logout: logoutAdmin, changePassword: changeAdminPassword } = useAdminStore();
  const [oldAdminPass, setOldAdminPass] = useState('');
  const [newAdminPass, setNewAdminPass] = useState('');
  const [confirmAdminPass, setConfirmAdminPass] = useState('');
  const [adminPassMsg, setAdminPassMsg] = useState<{ success: boolean; text: string } | null>(null);

  const handleUpdateAdminPassword = (e: React.FormEvent) => {
    e.preventDefault();
    setAdminPassMsg(null);
    if (newAdminPass !== confirmAdminPass) {
      setAdminPassMsg({ success: false, text: 'A confirmação de senha não coincide com a nova senha.' });
      return;
    }
    const res = changeAdminPassword(oldAdminPass, newAdminPass);
    setAdminPassMsg({ success: res.success, text: res.message });
    if (res.success) {
      setOldAdminPass('');
      setNewAdminPass('');
      setConfirmAdminPass('');
    }
  };

  const loadCacheStats = async () => {
    const stats = await semanticCacheService.getStats();
    setCacheStats(stats);
  };

  useEffect(() => {
    settingsRepository.getSettings().then(setSettings);

    if (typeof window !== 'undefined' && (window as any).electronAPI?.getLicenseInfo) {
      (window as any).electronAPI.getLicenseInfo().then(setStationLicense).catch(() => {});
    }

    omnichannelService.getSettings().then((cs) => {
      setChannelSettings(cs);
      if (cs.instagram?.connected) {
        setInstagramConnected(true);
        setInstagramUsername(cs.instagram.username || '');
      }
      if (cs.messenger?.connected) {
        setFacebookConnected(true);
        setFacebookName(cs.messenger.name || '');
      }
      if (cs.linkedin?.connected) {
        setLinkedinConnected(true);
        setLinkedinName(cs.linkedin.name || '');
      }
    });

    // Checagem de sessão em tempo real através dos cookies nativos
    if (typeof window !== 'undefined' && (window as any).electronAPI?.getInstagramStatus) {
      (window as any).electronAPI.getInstagramStatus().then((res: any) => {
        if (res?.connected) {
          setInstagramConnected(true);
          if (res.username) setInstagramUsername(res.username);
        }
      });
    }

    if (typeof window !== 'undefined' && (window as any).electronAPI?.getFacebookStatus) {
      (window as any).electronAPI.getFacebookStatus().then((res: any) => {
        if (res?.connected) {
          setFacebookConnected(true);
          if (res.name) setFacebookName(res.name);
        }
      });
    }

    if (typeof window !== 'undefined' && (window as any).electronAPI?.getLinkedInStatus) {
      (window as any).electronAPI.getLinkedInStatus().then((res: any) => {
        if (res?.connected) {
          setLinkedinConnected(true);
          if (res.name) setLinkedinName(res.name);
        }
      });
    }

    loadCacheStats();
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!settings) return;

    await settingsRepository.updateSettings(settings);
    await omnichannelService.saveSettings(channelSettings);

    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 4000);
  };

  const handleClearCache = async () => {
    if (confirm('Deseja limpar as respostas indexadas no Cache Semântico?')) {
      await semanticCacheService.clear();
      await loadCacheStats();
      alert('Cache semântico limpo com sucesso.');
    }
  };

  const handleDownloadBackup = async () => {
    try {
      await backupService.downloadBackup();
      setBackupMsg('Arquivo de backup exportado com sucesso!');
      setTimeout(() => setBackupMsg(null), 4000);
    } catch (err: any) {
      alert(`Erro no backup: ${err.message}`);
    }
  };

  const handleRestoreFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (confirm('Atenção: A restauração de dados mesclará os registros com a base atual. Deseja continuar?')) {
      try {
        const text = await file.text();
        await backupService.restoreBackup(text);
        alert('Dados restaurados com sucesso! O aplicativo será recarregado.');
        window.location.reload();
      } catch (err: any) {
        alert(`Falha na restauração: ${err.message}`);
      }
    }
  };

  const handleTestEmail = async () => {
    setTestingEmail(true);
    setEmailStatusMsg(null);
    try {
      if (typeof window !== 'undefined' && (window as any).electronAPI?.testEmailConnection) {
        const res = await (window as any).electronAPI.testEmailConnection({
          host: channelSettings.email.host,
          port: Number(channelSettings.email.port),
          secure: channelSettings.email.secure,
          user: channelSettings.email.auth.user,
          pass: channelSettings.email.auth.pass,
          fromName: channelSettings.email.fromName
        });
        setEmailStatusMsg(res.message || (res.success ? 'Conexão OK!' : 'Falha na conexão.'));
      } else {
        setEmailStatusMsg('Disponível apenas no Desktop App.');
      }
    } catch (err: any) {
      setEmailStatusMsg(err.message || 'Erro ao testar conexão.');
    } finally {
      setTestingEmail(false);
    }
  };

  // Ações de Conexão Webview Nativa (Instagram & Facebook Messenger)
  const handleInstagramLogin = async () => {
    setConnectingInstagram(true);
    try {
      if (typeof window !== 'undefined' && (window as any).electronAPI?.loginInstagram) {
        const res = await (window as any).electronAPI.loginInstagram();
        if (res.connected) {
          setInstagramConnected(true);
          setInstagramUsername(res.username || '');
          setChannelSettings(prev => ({
            ...prev,
            instagram: { connected: true, username: res.username }
          }));
        }
      }
    } catch (err: any) {
      console.warn('Erro no login Instagram:', err);
    } finally {
      setConnectingInstagram(false);
    }
  };

  const handleInstagramLogout = async () => {
    if (!confirm('Deseja desconectar sua conta do Instagram?')) return;
    try {
      if (typeof window !== 'undefined' && (window as any).electronAPI?.logoutInstagram) {
        await (window as any).electronAPI.logoutInstagram();
      }
      setInstagramConnected(false);
      setInstagramUsername('');
      setChannelSettings(prev => ({
        ...prev,
        instagram: { connected: false }
      }));
    } catch (err: any) {
      console.warn('Erro ao desconectar Instagram:', err);
    }
  };

  const handleFacebookLogin = async () => {
    setConnectingFacebook(true);
    try {
      if (typeof window !== 'undefined' && (window as any).electronAPI?.loginFacebook) {
        const res = await (window as any).electronAPI.loginFacebook();
        if (res.connected) {
          setFacebookConnected(true);
          setFacebookName(res.name || '');
          setChannelSettings(prev => ({
            ...prev,
            messenger: { connected: true, name: res.name }
          }));
        }
      }
    } catch (err: any) {
      console.warn('Erro no login Facebook:', err);
    } finally {
      setConnectingFacebook(false);
    }
  };

  const handleFacebookLogout = async () => {
    if (!confirm('Deseja desconectar sua conta do Facebook Messenger?')) return;
    try {
      if (typeof window !== 'undefined' && (window as any).electronAPI?.logoutFacebook) {
        await (window as any).electronAPI.logoutFacebook();
      }
      setFacebookConnected(false);
      setFacebookName('');
      setChannelSettings(prev => ({
        ...prev,
        messenger: { connected: false }
      }));
    } catch (err: any) {
      console.warn('Erro ao desconectar Facebook:', err);
    }
  };

  const handleLinkedInLogin = async () => {
    setConnectingLinkedin(true);
    try {
      if (typeof window !== 'undefined' && (window as any).electronAPI?.loginLinkedIn) {
        const res = await (window as any).electronAPI.loginLinkedIn();
        if (res.connected) {
          setLinkedinConnected(true);
          setLinkedinName(res.name || '');
          setChannelSettings(prev => ({
            ...prev,
            linkedin: { connected: true, name: res.name }
          }));
        }
      }
    } catch (err: any) {
      console.warn('Erro no login LinkedIn:', err);
    } finally {
      setConnectingLinkedin(false);
    }
  };

  const handleLinkedInLogout = async () => {
    if (!confirm('Deseja desconectar sua conta do LinkedIn?')) return;
    try {
      if (typeof window !== 'undefined' && (window as any).electronAPI?.logoutLinkedIn) {
        await (window as any).electronAPI.logoutLinkedIn();
      }
      setLinkedinConnected(false);
      setLinkedinName('');
      setChannelSettings(prev => ({
        ...prev,
        linkedin: { connected: false }
      }));
    } catch (err: any) {
      console.warn('Erro ao desconectar LinkedIn:', err);
    }
  };

  if (!settings) {
    return <div className="p-8 text-center text-xs text-slate-500">Carregando configurações...</div>;
  }

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6 overflow-y-auto max-h-screen">
      
      {/* HEADER DA ABA */}
      <div className="flex items-center justify-between border-b border-slate-800 pb-4">
        <div>
          <h2 className="text-lg font-bold text-slate-100">Configurações do Sistema & Canais</h2>
          <p className="text-xs text-slate-400">Personalize o comportamento da IA, regras de cadência e canais Omnichannel.</p>
        </div>

        {savedSuccess && (
          <div className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 rounded-xl text-xs font-semibold animate-in fade-in">
            <CheckCircle2 className="w-4 h-4" />
            <span>Configurações salvas!</span>
          </div>
        )}
      </div>

      <form onSubmit={handleSave} className="space-y-6">

        {/* BLOCO DE IDENTIFICAÇÃO DA ESTAÇÃO & LICENCIAMENTO */}
        {stationLicense && (
          <div className="bg-slate-900/90 p-5 rounded-2xl border border-slate-800 shadow-xl space-y-4 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-48 h-48 bg-emerald-500/5 rounded-full blur-3xl pointer-events-none" />

            <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
              <div className="flex items-center gap-2.5 text-sm font-bold text-slate-100">
                <ShieldCheck className="w-5 h-5 text-emerald-400" />
                <span>Identificação & Licenciamento Desta Estação</span>
              </div>
              <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${
                stationLicense.status === 'active'
                  ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                  : stationLicense.status === 'blocked'
                  ? 'bg-red-500/15 text-red-300 border-red-500/30'
                  : 'bg-amber-500/15 text-amber-300 border-amber-500/30'
              }`}>
                {stationLicense.status === 'active' ? '🟢 Licenciado / Ativo' : stationLicense.status === 'blocked' ? '🔴 Acesso Bloqueado' : '🟡 Período de Testes (Trial)'}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3.5 text-xs">
              <div className="bg-slate-950 p-3 rounded-xl border border-slate-800/80">
                <span className="text-[10px] uppercase font-semibold text-slate-400 block mb-1">Cliente / Empresa Vinculada</span>
                <div className="font-bold text-white flex items-center gap-1.5 truncate">
                  <Building2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                  <span className="truncate">{stationLicense.customerName || (stationLicense.isTrial ? 'Demonstração Local' : 'Cliente Conectado')}</span>
                </div>
                {stationLicense.ownerEmail && (
                  <div className="text-[10px] text-slate-400 mt-0.5 truncate">{stationLicense.ownerEmail}</div>
                )}
              </div>

              <div className="bg-slate-950 p-3 rounded-xl border border-slate-800/80">
                <span className="text-[10px] uppercase font-semibold text-slate-400 block mb-1">Nome do Computador (Windows)</span>
                <div className="font-bold text-blue-300 flex items-center gap-1.5 truncate">
                  <Monitor className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                  <span className="truncate">{stationLicense.hostname || 'DESKTOP-LOCAL'}</span>
                </div>
                <div className="text-[10px] text-slate-500 mt-0.5">Estação de Trabalho</div>
              </div>

              <div className="bg-slate-950 p-3 rounded-xl border border-slate-800/80">
                <span className="text-[10px] uppercase font-semibold text-slate-400 block mb-1">Chave de Licença</span>
                <div className="font-mono font-bold text-emerald-400 truncate select-all">
                  {stationLicense.licenseKey || 'TRIAL (Demonstração)'}
                </div>
                <div className="text-[10px] text-slate-500 mt-0.5">
                  Cota: {stationLicense.dailyLimit >= 99999 ? 'Ilimitado' : `${stationLicense.dailyLimit} envios/dia`}
                </div>
              </div>
            </div>

            {/* Hardware ID (Placa-Mãe / Machine ID) */}
            <div className="bg-slate-950 p-3 rounded-xl border border-slate-800/80 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <span className="text-[10px] uppercase font-semibold text-slate-400 block">Identificador Único de Hardware (ID da Placa-Mãe)</span>
                <span className="font-mono text-xs text-slate-200 select-all break-all">{stationLicense.machineId}</span>
              </div>
              <button
                type="button"
                onClick={() => {
                  const payload = `📋 IDENTIFICAÇÃO DESTA ESTAÇÃO - CLICK LEAD STORM\nEmpresa: ${stationLicense.customerName || 'Cliente'}\nComputador: ${stationLicense.hostname || 'PC'}\nID Hardware (Placa-Mãe): ${stationLicense.machineId}\nChave: ${stationLicense.licenseKey || 'Trial'}`;
                  navigator.clipboard.writeText(payload);
                  setCopiedStationId(true);
                  setTimeout(() => setCopiedStationId(false), 2500);
                }}
                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-semibold shrink-0 transition flex items-center gap-1.5 self-start sm:self-center"
              >
                {copiedStationId ? '✅ Copiado para Suporte!' : '📋 Copiar Dados da Estação'}
              </button>
            </div>
          </div>
        )}

        {/* BLOCO 1: CONTEXTO DA MINHA EMPRESA */}
        <div className="bg-slate-900/70 p-5 rounded-2xl border border-slate-800 space-y-4">
          <div className="flex items-center gap-2.5 text-sm font-bold text-slate-100">
            <Building2 className="w-4 h-4 text-emerald-400" />
            <span>Identidade & Contexto da Sua Empresa</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-semibold text-slate-300 block mb-1">Nome Comercial da Empresa</label>
              <input
                type="text"
                value={settings.myCompanyName || ''}
                onChange={(e) => setSettings({ ...settings, myCompanyName: e.target.value })}
                placeholder="Ex: Click Lead Storm"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-emerald-500"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-300 block mb-1">Segmento / Proposta de Valor</label>
              <input
                type="text"
                value={settings.myCompanyDescription || ''}
                onChange={(e) => setSettings({ ...settings, myCompanyDescription: e.target.value })}
                placeholder="Ex: Software de Prospecção B2B e Automação Omnichannel com IA"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-emerald-500"
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-300 block mb-1">
              Produtos, Planos e Preços
            </label>
            <textarea
              rows={2}
              value={settings.myCompanyOffer || ''}
              onChange={(e) => setSettings({ ...settings, myCompanyOffer: e.target.value })}
              placeholder="Ex: Licença Mensal R$ 197, Licença Anual R$ 1.497 com disparo ilimitado e IA inclusa."
              className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-emerald-500 resize-none"
            />
          </div>
        </div>

        {/* BLOCO 2: CANAIS OMNICHANNEL (E-MAIL SMTP E META) */}
        <div className="bg-slate-900/70 p-5 rounded-2xl border border-slate-800 space-y-4">
          <div className="flex items-center gap-2.5 text-sm font-bold text-slate-100">
            <Radio className="w-4 h-4 text-sky-400" />
            <span>Canais de Comunicação Omnichannel</span>
          </div>

          {/* E-MAIL CORPORATIVO (SMTP) */}
          <div className="p-4 rounded-xl bg-slate-950/80 border border-slate-800 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Mail className="w-4 h-4 text-sky-400" />
                <h4 className="text-xs font-bold text-slate-200">E-mail Corporativo (SMTP / IMAP)</h4>
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={channelSettings.email.enabled}
                  onChange={(e) => setChannelSettings({
                    ...channelSettings,
                    email: { ...channelSettings.email, enabled: e.target.checked }
                  })}
                  className="rounded bg-slate-800 border-slate-700 text-emerald-500 w-3.5 h-3.5"
                />
                <span className="text-[11px] text-slate-300 font-semibold">Ativar E-mail</span>
              </label>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <label className="text-[11px] text-slate-400 block mb-1">Host SMTP</label>
                <input
                  type="text"
                  value={channelSettings.email.host}
                  onChange={(e) => setChannelSettings({
                    ...channelSettings,
                    email: { ...channelSettings.email, host: e.target.value }
                  })}
                  placeholder="smtp.gmail.com"
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-slate-100 font-mono"
                />
              </div>

              <div>
                <label className="text-[11px] text-slate-400 block mb-1">Porta</label>
                <input
                  type="number"
                  value={channelSettings.email.port}
                  onChange={(e) => setChannelSettings({
                    ...channelSettings,
                    email: { ...channelSettings.email, port: Number(e.target.value) }
                  })}
                  placeholder="465"
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-slate-100 font-mono"
                />
              </div>

              <div>
                <label className="text-[11px] text-slate-400 block mb-1">Nome do Remetente</label>
                <input
                  type="text"
                  value={channelSettings.email.fromName}
                  onChange={(e) => setChannelSettings({
                    ...channelSettings,
                    email: { ...channelSettings.email, fromName: e.target.value }
                  })}
                  placeholder="Seu Nome / Empresa"
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-slate-100"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] text-slate-400 block mb-1">Usuário / E-mail</label>
                <input
                  type="email"
                  value={channelSettings.email.auth.user}
                  onChange={(e) => setChannelSettings({
                    ...channelSettings,
                    email: {
                      ...channelSettings.email,
                      auth: { ...channelSettings.email.auth, user: e.target.value }
                    }
                  })}
                  placeholder="seuemail@empresa.com"
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-slate-100 font-mono"
                />
              </div>

              <div>
                <label className="text-[11px] text-slate-400 block mb-1">Senha de Aplicativo / Token</label>
                <input
                  type="password"
                  value={channelSettings.email.auth.pass}
                  onChange={(e) => setChannelSettings({
                    ...channelSettings,
                    email: {
                      ...channelSettings.email,
                      auth: { ...channelSettings.email.auth, pass: e.target.value }
                    }
                  })}
                  placeholder="••••••••••••••••"
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-slate-100 font-mono"
                />
              </div>
            </div>

            <div className="flex items-center justify-between pt-1">
              <span className="text-[11px] text-slate-400">
                {emailStatusMsg && <span className="font-semibold text-sky-400">{emailStatusMsg}</span>}
              </span>
              <button
                type="button"
                onClick={handleTestEmail}
                disabled={testingEmail || !channelSettings.email.auth.user || !channelSettings.email.auth.pass}
                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-sky-300 border border-slate-700 rounded-lg text-xs font-semibold disabled:opacity-50 transition-colors"
              >
                {testingEmail ? 'Testando...' : 'Testar Conexão SMTP'}
              </button>
            </div>
          </div>

          {/* 1. CARD INSTAGRAM DIRECT (Webview Nativa - Zero Configuração) */}
          <div className="p-4 rounded-xl bg-slate-950/80 border border-slate-800 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <InstagramIcon className="w-4 h-4 text-pink-400" />
                <h4 className="text-xs font-bold text-slate-200">Instagram Direct</h4>
              </div>
              {instagramConnected ? (
                <span className="flex items-center gap-1.5 text-[11px] font-semibold text-emerald-400 bg-emerald-500/10 px-2.5 py-0.5 rounded-full border border-emerald-500/20">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  🟢 Conectado
                </span>
              ) : (
                <span className="text-[10px] text-slate-500">Desconectado</span>
              )}
            </div>

            <p className="text-xs text-slate-400">
              Conecte sua conta para receber e enviar directs pelo Click Lead Storm.
            </p>

            {instagramConnected ? (
              <div className="bg-slate-900 border border-emerald-500/30 rounded-xl p-3 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-amber-500 via-pink-500 to-purple-600 flex items-center justify-center text-white text-xs font-bold shadow-md">
                    📸
                  </div>
                  <div>
                    <div className="text-xs font-bold text-slate-100">
                      @{instagramUsername || 'instagram_conectado'}
                    </div>
                    <div className="text-[10px] text-emerald-400 font-medium">
                      Sessão sincronizada via Webview
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleInstagramLogout}
                  className="px-3 py-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 rounded-lg text-xs font-medium transition-colors"
                >
                  Desconectar
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={handleInstagramLogin}
                disabled={connectingInstagram}
                className="w-full py-2.5 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white rounded-xl text-xs font-bold transition-all shadow-lg shadow-pink-600/20 flex items-center justify-center gap-2 disabled:opacity-50"
              >
                <InstagramIcon className="w-4 h-4 text-white" />
                <span>{connectingInstagram ? 'Abrindo Instagram...' : '🟣 Conectar com Instagram'}</span>
              </button>
            )}
          </div>

          {/* 2. CARD FACEBOOK MESSENGER (Webview Nativa - Zero Configuração) */}
          <div className="p-4 rounded-xl bg-slate-950/80 border border-slate-800 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <MessengerIcon className="w-4 h-4 text-sky-400" />
                <h4 className="text-xs font-bold text-slate-200">Facebook Messenger</h4>
              </div>
              {facebookConnected ? (
                <span className="flex items-center gap-1.5 text-[11px] font-semibold text-emerald-400 bg-emerald-500/10 px-2.5 py-0.5 rounded-full border border-emerald-500/20">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  🟢 Conectado
                </span>
              ) : (
                <span className="text-[10px] text-slate-500">Desconectado</span>
              )}
            </div>

            <p className="text-xs text-slate-400">
              Conecte seu perfil/página para sincronizar conversas do Messenger.
            </p>

            {facebookConnected ? (
              <div className="bg-slate-900 border border-emerald-500/30 rounded-xl p-3 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-white text-xs font-bold shadow-md">
                    💬
                  </div>
                  <div>
                    <div className="text-xs font-bold text-slate-100">
                      {facebookName || 'Perfil Conectado'}
                    </div>
                    <div className="text-[10px] text-emerald-400 font-medium">
                      Sessão sincronizada via Webview
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleFacebookLogout}
                  className="px-3 py-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 rounded-lg text-xs font-medium transition-colors"
                >
                  Desconectar
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={handleFacebookLogin}
                disabled={connectingFacebook}
                className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-bold transition-all shadow-lg shadow-blue-600/20 flex items-center justify-center gap-2 disabled:opacity-50"
              >
                <MessengerIcon className="w-4 h-4 text-white" />
                <span>{connectingFacebook ? 'Abrindo Messenger...' : '🔵 Conectar com Facebook'}</span>
              </button>
            )}
          </div>

          {/* 3. CARD LINKEDIN B2B (Webview Nativa - Zero Configuração) */}
          <div className="p-4 rounded-xl bg-slate-950/80 border border-slate-800 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <LinkedinIcon className="w-4 h-4 text-sky-400" />
                <h4 className="text-xs font-bold text-slate-200">LinkedIn B2B</h4>
              </div>
              {linkedinConnected ? (
                <span className="flex items-center gap-1.5 text-[11px] font-semibold text-emerald-400 bg-emerald-500/10 px-2.5 py-0.5 rounded-full border border-emerald-500/20">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  🟢 Conectado
                </span>
              ) : (
                <span className="text-[10px] text-slate-500">Desconectado</span>
              )}
            </div>

            <p className="text-xs text-slate-400">
              Conecte sua conta do LinkedIn para prospectar decisores e sincronizar perfis corporativos.
            </p>

            {linkedinConnected ? (
              <div className="bg-slate-900 border border-emerald-500/30 rounded-xl p-3 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-full bg-sky-700 flex items-center justify-center text-white text-xs font-bold shadow-md">
                    💼
                  </div>
                  <div>
                    <div className="text-xs font-bold text-slate-100">
                      {linkedinName || 'Conta LinkedIn Conectada'}
                    </div>
                    <div className="text-[10px] text-emerald-400 font-medium">
                      Sessão sincronizada via Webview
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleLinkedInLogout}
                  className="px-3 py-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 rounded-lg text-xs font-medium transition-colors"
                >
                  Desconectar
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={handleLinkedInLogin}
                disabled={connectingLinkedin}
                className="w-full py-2.5 bg-sky-700 hover:bg-sky-600 text-white rounded-xl text-xs font-bold transition-all shadow-lg shadow-sky-700/20 flex items-center justify-center gap-2 disabled:opacity-50"
              >
                <LinkedinIcon className="w-4 h-4 text-white" />
                <span>{connectingLinkedin ? 'Abrindo LinkedIn...' : '💼 Conectar com LinkedIn'}</span>
              </button>
            )}
          </div>
        </div>

        {/* BLOCO 3: INTELIGÊNCIA ARTIFICIAL (SaaS Cliente vs Modo Mestre) */}
        {!isAdmin ? (
          /* Visão Limpa SaaS para Clientes Comuns */
          <div className="bg-slate-900/70 p-5 rounded-2xl border border-slate-800 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5 text-sm font-bold text-slate-100">
                <Cpu className="w-4 h-4 text-emerald-400" />
                <span>Inteligência Artificial Click Lead Storm</span>
              </div>
              <span className="flex items-center gap-1.5 text-[11px] font-semibold text-emerald-400 bg-emerald-500/10 px-2.5 py-0.5 rounded-full border border-emerald-500/20">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                🟢 Calibrada e Pronta para Uso
              </span>
            </div>

            <p className="text-xs text-slate-400 leading-relaxed">
              O motor de IA neural está ativado e operando de forma autônoma. Variações semânticas de copy para prospecção, abordagens personalizadas e respostas automáticas no WhatsApp são processadas de forma transparente sem necessidade de configuração técnica.
            </p>
          </div>
        ) : (
          /* Visão Técnica Completa para Modo Mestre */
          <>
            <div className="bg-slate-900/70 p-5 rounded-2xl border border-amber-500/30 space-y-4 shadow-lg shadow-amber-500/5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5 text-sm font-bold text-slate-100">
                  <Crown className="w-4 h-4 text-amber-400" />
                  <span>Motor de IA Groq (Configuração Técnica Mestre)</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20 font-bold">
                    👑 Modo Mestre Ativo
                  </span>
                  <button
                    type="button"
                    onClick={logoutAdmin}
                    className="flex items-center gap-1 text-[11px] text-red-400 hover:text-red-300 px-2 py-0.5 rounded hover:bg-red-500/10 transition-colors"
                    title="Sair do Modo Mestre"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    <span>Sair</span>
                  </button>
                </div>
              </div>

              <div className="space-y-3">
                <div>
                  <label className="text-xs font-semibold text-slate-300 block mb-1">Chave da API Groq (Pool ou Individual)</label>
                  <input
                    type="password"
                    value={settings.groqApiKey}
                    onChange={(e) => setSettings({ ...settings, groqApiKey: e.target.value })}
                    placeholder="gsk_..."
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-slate-100 font-mono placeholder-slate-500 focus:outline-none focus:border-amber-500"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-300 block mb-1">Modelo de IA Ativo</label>
                  <select
                    value={settings.groqModel}
                    onChange={(e) => setSettings({ ...settings, groqModel: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-amber-500"
                  >
                    <option value="qwen/qwen3.8-27b">Qwen 3.8 27B (Alta Performance & Respostas Humanas - Recomendado)</option>
                    <option value="groq/compound-mini">Groq Compound Mini (Ultra Rápido & Conversacional)</option>
                    <option value="groq/compound">Groq Compound (Raciocínio Comercial Completo)</option>
                    <option value="openai/gpt-oss-120b">GPT OSS 120B (Alta Capacidade)</option>
                  </select>
                </div>
              </div>
            </div>

            {/* BLOCO EXCLUSIVO: ALTERAÇÃO DE SENHA DO ADMINISTRADOR */}
            <div className="bg-slate-900/70 p-5 rounded-2xl border border-amber-500/30 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5 text-sm font-bold text-slate-100">
                  <KeyRound className="w-4 h-4 text-amber-400" />
                  <span>Segurança da Conta Mestre ({adminEmail})</span>
                </div>
                <span className="text-[10px] text-amber-400/80 font-medium">Exclusivo do Desenvolvedor</span>
              </div>

              <form onSubmit={handleUpdateAdminPassword} className="space-y-3">
                {adminPassMsg && (
                  <div className={`p-3 rounded-xl flex items-center gap-2 text-xs ${
                    adminPassMsg.success 
                      ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-300'
                      : 'bg-red-500/10 border border-red-500/20 text-red-300'
                  }`}>
                    {adminPassMsg.success ? <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" /> : <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />}
                    <span>{adminPassMsg.text}</span>
                  </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div>
                    <label className="text-[11px] font-semibold text-slate-300 block mb-1">Senha Atual</label>
                    <input
                      type="password"
                      required
                      value={oldAdminPass}
                      onChange={(e) => setOldAdminPass(e.target.value)}
                      placeholder="Senha atual"
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-100 placeholder-slate-600 focus:outline-none focus:border-amber-500"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-semibold text-slate-300 block mb-1">Nova Senha</label>
                    <input
                      type="password"
                      required
                      value={newAdminPass}
                      onChange={(e) => setNewAdminPass(e.target.value)}
                      placeholder="Mínimo 6 dígitos"
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-100 placeholder-slate-600 focus:outline-none focus:border-amber-500"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-semibold text-slate-300 block mb-1">Confirmar Nova Senha</label>
                    <input
                      type="password"
                      required
                      value={confirmAdminPass}
                      onChange={(e) => setConfirmAdminPass(e.target.value)}
                      placeholder="Confirme nova senha"
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-100 placeholder-slate-600 focus:outline-none focus:border-amber-500"
                    />
                  </div>
                </div>

                <div className="flex justify-end pt-1">
                  <button
                    type="submit"
                    className="px-4 py-2 bg-gradient-to-r from-amber-600 to-amber-500 hover:from-amber-500 hover:to-amber-400 text-slate-950 font-bold rounded-xl text-xs shadow-md shadow-amber-500/20 transition-all flex items-center gap-1.5"
                  >
                    <Lock className="w-3.5 h-3.5" />
                    <span>Salvar Nova Senha Mestre</span>
                  </button>
                </div>
              </form>
            </div>
          </>
        )}

        {/* BLOCO 4: PARÂMETROS ANTI-BAN */}
        <div className="bg-slate-900/70 p-5 rounded-2xl border border-slate-800 space-y-4">
          <div className="flex items-center gap-2.5 text-sm font-bold text-slate-100">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <span>Parâmetros de Segurança Anti-Ban & Cadência Estocástica</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Slider 1: Delay Mínimo */}
            <div className="bg-slate-950/60 p-3.5 rounded-xl border border-slate-800 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-slate-300">Delay Mínimo entre Mensagens</span>
                <span className="px-2 py-0.5 rounded-md font-mono font-bold text-xs bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  {settings.delayMin} seg
                </span>
              </div>
              <input
                type="range"
                min={10}
                max={120}
                step={1}
                value={settings.delayMin}
                onChange={(e) => {
                  const val = Number(e.target.value);
                  setSettings({ 
                    ...settings, 
                    delayMin: val,
                    delayMax: Math.max(val + 5, settings.delayMax)
                  });
                }}
                className="w-full accent-emerald-500 h-1.5 bg-slate-800 rounded-lg cursor-pointer transition-all"
              />
              <div className="flex justify-between text-[10px] text-slate-500 font-mono">
                <span>10s (rápido)</span>
                <span>120s (lento)</span>
              </div>
            </div>

            {/* Slider 2: Delay Máximo */}
            <div className="bg-slate-950/60 p-3.5 rounded-xl border border-slate-800 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-slate-300">Delay Máximo entre Mensagens</span>
                <span className="px-2 py-0.5 rounded-md font-mono font-bold text-xs bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  {settings.delayMax} seg
                </span>
              </div>
              <input
                type="range"
                min={20}
                max={240}
                step={1}
                value={settings.delayMax}
                onChange={(e) => {
                  const val = Number(e.target.value);
                  setSettings({ 
                    ...settings, 
                    delayMax: val,
                    delayMin: Math.min(val - 5, settings.delayMin)
                  });
                }}
                className="w-full accent-emerald-500 h-1.5 bg-slate-800 rounded-lg cursor-pointer transition-all"
              />
              <div className="flex justify-between text-[10px] text-slate-500 font-mono">
                <span>20s</span>
                <span>240s (ultra-seguro)</span>
              </div>
            </div>

            {/* Slider 3: Cota Diária de Disparos */}
            <div className="bg-slate-950/60 p-3.5 rounded-xl border border-slate-800 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-slate-300">Cota Diária de Disparos</span>
                <span className="px-2 py-0.5 rounded-md font-mono font-bold text-xs bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  {settings.dailyQuota} envios/dia
                </span>
              </div>
              <input
                type="range"
                min={10}
                max={250}
                step={5}
                value={settings.dailyQuota}
                onChange={(e) => setSettings({ ...settings, dailyQuota: Number(e.target.value) })}
                className="w-full accent-emerald-500 h-1.5 bg-slate-800 rounded-lg cursor-pointer transition-all"
              />
              <div className="flex justify-between text-[10px] text-slate-500 font-mono">
                <span>10 envios</span>
                <span>250 envios</span>
              </div>
            </div>

            {/* Slider 4: Pausa Estocástica de Segurança */}
            <div className="bg-slate-950/60 p-3.5 rounded-xl border border-slate-800 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-slate-300">Pausa Estocástica de Segurança</span>
                <span className="px-2 py-0.5 rounded-md font-mono font-bold text-xs bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  a cada {settings.breakAfterCount} disparos
                </span>
              </div>
              <input
                type="range"
                min={5}
                max={30}
                step={1}
                value={settings.breakAfterCount}
                onChange={(e) => setSettings({ ...settings, breakAfterCount: Number(e.target.value) })}
                className="w-full accent-emerald-500 h-1.5 bg-slate-800 rounded-lg cursor-pointer transition-all"
              />
              <div className="flex justify-between text-[10px] text-slate-500 font-mono">
                <span>A cada 5 disparos</span>
                <span>A cada 30 disparos</span>
              </div>
            </div>
          </div>
        </div>

        {/* BOTÃO SALVAR */}
        <button
          type="submit"
          className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl text-xs flex items-center justify-center gap-2 transition-all shadow-lg shadow-emerald-600/25"
        >
          <Save className="w-4 h-4" />
          <span>Salvar Todas as Configurações</span>
        </button>
      </form>

      {/* BLOCO 5: BACKUP E DADOS */}
      <div className="bg-slate-900/50 p-4 rounded-2xl border border-slate-800/80 flex items-center justify-between">
        <div>
          <h4 className="text-xs font-bold text-slate-200">Backup dos Dados Locais</h4>
          <p className="text-[11px] text-slate-400">Exporte ou restaure todos os leads, conversas e regras.</p>
        </div>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={handleDownloadBackup}
            className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-semibold flex items-center gap-1.5"
          >
            <Download className="w-3.5 h-3.5 text-emerald-400" />
            Exportar JSON
          </button>

          <label className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-semibold flex items-center gap-1.5 cursor-pointer">
            <Upload className="w-3.5 h-3.5 text-emerald-400" />
            Restaurar
            <input type="file" accept=".json" onChange={handleRestoreFile} className="hidden" />
          </label>
        </div>
      </div>
    </div>
  );
};

export default SettingsTab;
