import React, { useEffect, useState } from 'react';
import { 
  Wifi, 
  WifiOff, 
  RefreshCw, 
  Minus, 
  Square, 
  X, 
  QrCode,
  Smartphone,
  Terminal,
  Building2,
  Monitor,
  ShieldCheck,
  AlertTriangle,
  Users,
  MessageSquare,
  Send,
  Bot,
  Settings
} from 'lucide-react';
import { campaignRepository } from '../../db/repositories/campaignRepository';
import { settingsRepository } from '../../db/repositories/settingsRepository';
import { webviewBridge } from '../../services/webviewBridge';
import { logger } from '../../services/logger';
import { WhatsAppConnectionModal } from './WhatsAppConnectionModal';
import { LogViewerModal } from './LogViewerModal';
import logoImg from '../../assets/logo.png';
import { useAdminStore } from '../stores/useAdminStore';

export interface HeaderProps {
  activeTab: 'crm' | 'chat' | 'campaign' | 'autoresponder' | 'settings';
  setActiveTab: (tab: 'crm' | 'chat' | 'campaign' | 'autoresponder' | 'settings') => void;
  isExpiringSoon?: boolean;
  daysRemaining?: number | null;
  customerName?: string;
}

export const Header: React.FC<HeaderProps> = ({
  activeTab,
  setActiveTab,
  isExpiringSoon,
  daysRemaining,
  customerName
}) => {
  const { isAdmin, isEmergencyBypassed, emergencyLock } = useAdminStore();
  const [stationLicense, setStationLicense] = useState<any>(null);
  const [isWppReady, setIsWppReady] = useState<boolean>(false);
  const [checking, setChecking] = useState(false);
  const [sentToday, setSentToday] = useState(0);
  const [dailyQuota, setDailyQuota] = useState(60);

  // Estados de Diagnóstico e Logs
  const [logsModalOpen, setLogsModalOpen] = useState(false);
  const [hasNewError, setHasNewError] = useState(false);

  // Estados específicos do Baileys Desktop
  const [modalOpen, setModalOpen] = useState(false);
  const [waStatus, setWaStatus] = useState<'disconnected' | 'connecting' | 'connected'>('disconnected');
  const [connectedPhone, setConnectedPhone] = useState<string>('');
  const [qrCodeBase64, setQrCodeBase64] = useState<string>('');

  const isElectron = typeof window !== 'undefined' && !!(window as any).electronAPI;

  const checkStatus = async () => {
    setChecking(true);
    try {
      const todayCount = await campaignRepository.getTodaySentCount();
      setSentToday(todayCount);
      const settings = await settingsRepository.getSettings();
      setDailyQuota(settings.dailyQuota || 60);

      if (isElectron) {
        const electron = (window as any).electronAPI;
        const res = await electron.getWhatsAppStatus();
        setWaStatus(res?.status || 'disconnected');
        setIsWppReady(res?.status === 'connected');
        if (res?.phone) setConnectedPhone(res.phone);
      } else {
        const res = await webviewBridge.checkStatus();
        setIsWppReady(!!res?.isReady);
      }
    } catch {
      setIsWppReady(false);
    } finally {
      setChecking(false);
    }
  };

  useEffect(() => {
    checkStatus();

    // Monitora logs de erro para alertar no botão de logs
    const unsubLogger = logger.subscribe((entry) => {
      if (entry.level === 'error') {
        setHasNewError(true);
      }
    });

    if (isElectron) {
      const electron = (window as any).electronAPI;

      // Carrega dados de identificação da estação e licença
      if (electron?.getLicenseInfo) {
        electron.getLicenseInfo().then(setStationLicense).catch(() => {});
      }
      const unsubLic = electron?.onLicenseStatusChanged?.((data: any) => {
        if (data) setStationLicense(data);
      });

      // Listener de QR Code Base64
      const unsubQr = electron.onQrCode((qr: string) => {
        setQrCodeBase64(qr);
        setWaStatus('connecting');
      });

      // Listener de Mudanças de Status do Baileys
      const unsubStatus = electron.onWhatsAppStatus((data: any) => {
        const status = data?.status || 'disconnected';
        setWaStatus(status);
        setIsWppReady(status === 'connected');
        if (data?.phone) {
          setConnectedPhone(data.phone);
        }
        if (status === 'connected') {
          setQrCodeBase64('');
        }
      });

      return () => {
        unsubLic?.();
        unsubQr?.();
        unsubStatus?.();
      };
    } else {
      const unsub = webviewBridge.onStatusChange((ready) => {
        setIsWppReady(ready);
      });

      const interval = setInterval(checkStatus, 5000);
      return () => {
        unsub();
        clearInterval(interval);
      };
    }
  }, [isElectron]);

  const handleStatusClick = async () => {
    if (isElectron) {
      setModalOpen(true);
      if (waStatus === 'disconnected') {
        handleConnect();
      }
    } else {
      await checkStatus();
      if (!isWppReady) {
        if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
          chrome.runtime.sendMessage({ type: 'OPEN_OR_FOCUS_WHATSAPP' });
        }
      }
    }
  };

  const handleConnect = async () => {
    if (isElectron) {
      setWaStatus('connecting');
      try {
        await (window as any).electronAPI.initWhatsApp();
      } catch (err) {
        console.error('Erro ao inicializar WhatsApp:', err);
        setWaStatus('disconnected');
      }
    }
  };

  const handleDisconnect = async () => {
    if (isElectron) {
      try {
        await (window as any).electronAPI.logoutWhatsApp();
        setWaStatus('disconnected');
        setConnectedPhone('');
        setQrCodeBase64('');
      } catch (err) {
        console.error('Erro ao desconectar WhatsApp:', err);
      }
    }
  };

  return (
    <>
      <header className="h-14 bg-slate-900/95 backdrop-blur-md border-b border-slate-800/90 px-3 flex items-center justify-between select-none shrink-0 z-30">
        {/* Lado Esquerdo: Logo, Marca e Abas de Navegação Integradas */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 pr-2 border-r border-slate-800">
            <img src={logoImg} alt="Click Lead Storm" className="h-7 w-auto object-contain" />
            <div className="flex flex-col">
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-bold tracking-tight bg-gradient-to-r from-emerald-400 to-teal-200 bg-clip-text text-transparent">
                  CLICK LEAD STORM
                </span>
                {isEmergencyBypassed ? (
                  <button
                    type="button"
                    onClick={emergencyLock}
                    className="text-[9px] uppercase font-mono px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40 font-bold flex items-center gap-1 hover:bg-amber-500/30 transition cursor-pointer"
                    title="Desbloqueio Mestre Ativo. Clique para bloquear."
                  >
                    <span>👑 Mestre</span>
                    <span className="text-rose-400 font-extrabold">🔒</span>
                  </button>
                ) : isAdmin ? (
                  <span className="text-[9px] uppercase font-mono px-1.5 py-0.2 rounded bg-amber-500/15 text-amber-400 border border-amber-500/30 font-bold">
                    👑
                  </span>
                ) : null}
              </div>
              <span className="text-[9px] text-slate-500 leading-none">B2B Prospect & CRM</span>
            </div>
          </div>

          {/* Abas de Navegação Compactas e Diretas */}
          <nav className="flex items-center gap-1 bg-slate-950/70 p-1 rounded-xl border border-slate-800/70">
            <button
              onClick={() => setActiveTab('crm')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                activeTab === 'crm'
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
              title="Visualizar e gerenciar clientes, importar e buscar no Google Maps (Alt+1)"
            >
              <Users className="w-3.5 h-3.5" />
              <span>Contatos</span>
            </button>

            <button
              onClick={() => setActiveTab('chat')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                activeTab === 'chat'
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
              title="Ver e responder mensagens recebidas no WhatsApp ao vivo (Alt+2)"
            >
              <MessageSquare className="w-3.5 h-3.5" />
              <span>Conversas</span>
            </button>

            <button
              onClick={() => setActiveTab('campaign')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                activeTab === 'campaign'
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
              title="Disparar mensagens em massa personalizadas com IA (Alt+3)"
            >
              <Send className="w-3.5 h-3.5" />
              <span>Disparos</span>
            </button>

            <button
              onClick={() => setActiveTab('autoresponder')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                activeTab === 'autoresponder'
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
              title="Robô de atendimento automático com IA 24 horas (Alt+4)"
            >
              <Bot className="w-3.5 h-3.5" />
              <span>Robô IA</span>
            </button>

            <button
              onClick={() => setActiveTab('settings')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                activeTab === 'settings'
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
              title="Configurações da empresa, limites e canais (Alt+5)"
            >
              <Settings className="w-3.5 h-3.5" />
              <span>Ajustes</span>
            </button>
          </nav>
        </div>

        {/* Lado Direito: Aviso Expiração + Cota + WhatsApp + Logs + Janela */}
        <div className="flex items-center gap-2.5">
          {/* Badge de Expiração Sutil (se faltar 5 dias ou menos) */}
          {isExpiringSoon && (
            <button
              type="button"
              onClick={() => window.open(`https://wa.me/5511996773805?text=${encodeURIComponent(`Olá Eduardo! Minha licença do Click Lead Storm (${customerName || 'Estação'}) expira em ${daysRemaining} dias e gostaria de renovar.`)}`, '_blank')}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-500/20 text-amber-300 border border-amber-500/40 text-xs font-bold hover:bg-amber-500/30 transition animate-pulse"
              title="Sua licença está próxima do vencimento. Clique para falar com o suporte e renovar."
            >
              <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
              <span>Vence em {daysRemaining}d</span>
            </button>
          )}

          {/* Cota Diária Limpa */}
          <div 
            className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 bg-slate-950/70 rounded-lg border border-slate-800/70 text-xs font-mono"
            title={`Envios de hoje: ${sentToday} de ${dailyQuota >= 99999 ? 'Ilimitado' : dailyQuota}`}
          >
            <span className="text-[10px] uppercase font-sans text-slate-400">Hoje:</span>
            <span className={`font-bold ${sentToday >= dailyQuota ? 'text-rose-400' : 'text-emerald-400'}`}>
              {sentToday}
            </span>
            <span className="text-slate-600">/</span>
            <span className="text-slate-400">{dailyQuota >= 99999 ? '∞' : dailyQuota}</span>
          </div>

          {/* Status WhatsApp */}
          {isElectron ? (
            <button
              onClick={handleStatusClick}
              title={
                waStatus === 'connected'
                  ? `WhatsApp Conectado (${connectedPhone || 'Ativo'}). Clique para gerenciar.`
                  : 'Clique para escanear o QR Code no seu WhatsApp'
              }
              className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold border transition-all ${
                waStatus === 'connected'
                  ? 'bg-emerald-950/70 text-emerald-300 border-emerald-500/40 hover:bg-emerald-900/80'
                  : waStatus === 'connecting'
                  ? 'bg-amber-950/70 text-amber-300 border-amber-500/50 hover:bg-amber-900/70'
                  : 'bg-emerald-600 hover:bg-emerald-500 text-white border-emerald-400 shadow-sm animate-pulse'
              }`}
            >
              {waStatus === 'connected' ? (
                <>
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                  <Smartphone className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                  <span className="max-w-[120px] truncate">{connectedPhone || 'Conectado'}</span>
                </>
              ) : waStatus === 'connecting' ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin text-amber-400 shrink-0" />
                  <span>Conectando...</span>
                </>
              ) : (
                <>
                  <QrCode className="w-3.5 h-3.5 text-white shrink-0" />
                  <span>Conectar WhatsApp</span>
                </>
              )}
            </button>
          ) : (
            <button
              onClick={handleStatusClick}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors ${
                isWppReady
                  ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                  : 'bg-amber-500/10 text-amber-400 border-amber-500/30'
              }`}
            >
              <span className={`w-2 h-2 rounded-full ${isWppReady ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`} />
              <span>{isWppReady ? 'Web Pronto' : 'Abrir Web'}</span>
            </button>
          )}

          {/* Botão Logs */}
          <button
            onClick={() => {
              setLogsModalOpen(true);
              setHasNewError(false);
            }}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium border transition-all ${
              hasNewError
                ? 'bg-rose-500/20 text-rose-300 border-rose-500/40 animate-pulse'
                : 'bg-slate-800 text-slate-300 border-slate-700/80 hover:bg-slate-700 hover:text-white'
            }`}
            title="Visualizar logs e diagnósticos"
          >
            <Terminal className={`w-3.5 h-3.5 ${hasNewError ? 'text-rose-400' : 'text-slate-400'}`} />
            <span>Logs</span>
            {hasNewError && <span className="w-1.5 h-1.5 rounded-full bg-rose-400 animate-ping" />}
          </button>

          {/* Controles de Janela Electron */}
          {isElectron && (window as any).electronAPI && (
            <div className="flex items-center gap-0.5 ml-1 border-l border-slate-800 pl-2">
              <button
                onClick={() => (window as any).electronAPI?.minimize()}
                className="p-1 hover:bg-slate-800 text-slate-400 hover:text-slate-200 rounded transition"
                title="Minimizar"
              >
                <Minus className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => (window as any).electronAPI?.maximize()}
                className="p-1 hover:bg-slate-800 text-slate-400 hover:text-slate-200 rounded transition"
                title="Maximizar"
              >
                <Square className="w-3 h-3" />
              </button>
              <button
                onClick={() => (window as any).electronAPI?.close()}
                className="p-1 hover:bg-rose-600 text-slate-400 hover:text-white rounded transition"
                title="Fechar"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>
      </header>

      {/* Modal de Conexão Baileys */}
      {isElectron && (
        <WhatsAppConnectionModal
          isOpen={modalOpen}
          onClose={() => setModalOpen(false)}
          status={waStatus}
          phone={connectedPhone}
          qrCodeBase64={qrCodeBase64}
          onConnect={handleConnect}
          onDisconnect={handleDisconnect}
        />
      )}

      {/* Modal de Logs & Diagnóstico */}
      <LogViewerModal
        isOpen={logsModalOpen}
        onClose={() => setLogsModalOpen(false)}
      />
    </>
  );
};
