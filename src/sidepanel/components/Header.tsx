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
  AlertTriangle
} from 'lucide-react';
import { campaignRepository } from '../../db/repositories/campaignRepository';
import { settingsRepository } from '../../db/repositories/settingsRepository';
import { webviewBridge } from '../../services/webviewBridge';
import { logger } from '../../services/logger';
import { WhatsAppConnectionModal } from './WhatsAppConnectionModal';
import { LogViewerModal } from './LogViewerModal';
import logoImg from '../../assets/logo.png';
import { useAdminStore } from '../stores/useAdminStore';

export const Header: React.FC = () => {
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
      <header className="bg-slate-900/95 border-b border-slate-800 px-4 py-2.5 flex items-center justify-between select-none">
        <div className="flex items-center gap-3.5">
          <div className="h-12 px-3 py-1.5 rounded-xl bg-slate-950/80 border border-slate-800/80 flex items-center justify-center shadow-lg shadow-emerald-500/10 shrink-0">
            <img src={logoImg} alt="Click Lead Storm Logo" className="h-full w-auto max-h-9 object-contain" />
          </div>
          <div>
            <h1 className="text-sm font-bold tracking-tight bg-gradient-to-r from-emerald-400 to-teal-200 bg-clip-text text-transparent flex items-center gap-1.5">
              CLICK LEAD STORM
              <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                {isElectron ? 'Desktop Baileys' : 'Chrome Extension'}
              </span>
              {isEmergencyBypassed ? (
                <button
                  type="button"
                  onClick={emergencyLock}
                  className="text-[10px] uppercase font-mono px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40 font-bold flex items-center gap-1.5 hover:bg-amber-500/30 transition shadow-sm cursor-pointer"
                  title="Desbloqueio Mestre Temporário Ativo. Clique para bloquear o sistema imediatamente."
                >
                  <span>👑 Mestre</span>
                  <span className="text-rose-400 font-extrabold hover:underline">🔒 Bloquear</span>
                </button>
              ) : isAdmin ? (
                <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-400 border border-amber-500/30 font-bold flex items-center gap-1">
                  👑 Mestre
                </span>
              ) : null}
            </h1>
            <p className="text-[11px] text-slate-400">Prospect & CRM B2B Local com IA</p>
          </div>
        </div>

        {/* Identificação da Estação e Cliente Conectado */}
        {stationLicense && (() => {
          const daysRemaining = stationLicense.expiresAt 
            ? Math.ceil((new Date(stationLicense.expiresAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
            : null;
          const isExpiringSoon = daysRemaining !== null && daysRemaining > 0 && daysRemaining <= 5 && (stationLicense.status === 'active' || stationLicense.status === 'trial');

          return (
            <div 
              className="hidden lg:flex items-center gap-2 bg-slate-950/90 border border-slate-800/90 px-3 py-1.5 rounded-xl text-[11px] font-mono shadow-sm cursor-help"
              title={`IDENTIFICAÇÃO DESTA ESTAÇÃO:\nEmpresa / Cliente: ${stationLicense.customerName || (stationLicense.isTrial ? 'Demonstração (Trial)' : 'Cliente Local')}\nComputador: ${stationLicense.hostname || 'DESKTOP-CLIENT'}\nID Hardware: ${stationLicense.machineId}\nStatus: ${stationLicense.status === 'active' ? 'Ativo / Licenciado' : stationLicense.status}\nValidade: ${stationLicense.expiresAt ? new Date(stationLicense.expiresAt).toLocaleDateString('pt-BR') : 'Vitalício'}`}
            >
              <div className="flex items-center gap-1.5 text-emerald-400 font-semibold truncate max-w-[170px]">
                <Building2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                <span className="truncate">{stationLicense.customerName || (stationLicense.isTrial ? 'Modo Demonstração' : 'Cliente Conectado')}</span>
              </div>
              <span className="text-slate-700 font-sans">|</span>
              <div className="flex items-center gap-1 text-slate-300 truncate max-w-[130px]">
                <Monitor className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                <span className="truncate text-slate-200">{stationLicense.hostname || 'PC-Local'}</span>
              </div>
              {isExpiringSoon && (
                <>
                  <span className="text-slate-700 font-sans">|</span>
                  <div className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-500/20 text-amber-300 border border-amber-500/40 text-[10px] font-bold animate-pulse">
                    <AlertTriangle className="w-3 h-3 text-amber-400 shrink-0" />
                    <span>Vence em {daysRemaining}d</span>
                  </div>
                </>
              )}
            </div>
          );
        })()}

        <div className="flex items-center gap-3">
          {/* Contador Diário Amigável */}
          <div className="hidden sm:flex flex-col items-end text-right px-2.5 py-1 bg-slate-950/60 rounded-xl border border-slate-800/80">
            <span className="text-[9px] uppercase tracking-wider text-slate-400 font-semibold">Envios Disponíveis Hoje</span>
            <div className="text-xs font-bold text-slate-100 flex items-center gap-1">
              <span className={sentToday >= dailyQuota ? 'text-rose-400' : 'text-emerald-400'}>{sentToday}</span>
              <span className="text-slate-500">/</span>
              <span className="text-slate-300">{dailyQuota >= 99999 ? 'Ilimitado' : dailyQuota}</span>
            </div>
          </div>

          {/* Status de Conexão WhatsApp - Chamada Clara e Intuitiva */}
          {isElectron ? (
            <button
              onClick={handleStatusClick}
              title={
                waStatus === 'connected'
                  ? `WhatsApp Conectado com sucesso (${connectedPhone || 'Sessão Ativa'}). Clique para gerenciar ou desconectar.`
                  : 'Clique aqui para escanear o QR Code no seu WhatsApp e conectar o sistema'
              }
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-bold border transition-all shadow-md active:scale-95 ${
                waStatus === 'connected'
                  ? 'bg-emerald-950/80 text-emerald-300 border-emerald-500/40 hover:bg-emerald-900/90 shadow-emerald-500/10'
                  : waStatus === 'connecting'
                  ? 'bg-amber-950/80 text-amber-300 border-amber-500/50 hover:bg-amber-900/80'
                  : 'bg-emerald-600 hover:bg-emerald-500 text-white border-emerald-400 shadow-emerald-600/30 animate-pulse'
              }`}
            >
              {waStatus === 'connected' ? (
                <>
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping" />
                  <Smartphone className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span className="truncate max-w-[150px]">{connectedPhone || 'WhatsApp Conectado'}</span>
                </>
              ) : waStatus === 'connecting' ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin text-amber-400 shrink-0" />
                  <span>Conectando WhatsApp...</span>
                </>
              ) : (
                <>
                  <QrCode className="w-4 h-4 text-white shrink-0" />
                  <span>📲 Conectar WhatsApp Agora</span>
                </>
              )}
            </button>
          ) : (
            <button
              onClick={handleStatusClick}
              title={isWppReady ? 'WhatsApp Web Conectado e Pronto' : 'Clique para verificar conexão'}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-medium border transition-colors ${
                isWppReady
                  ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/20'
                  : 'bg-amber-500/10 text-amber-400 border-amber-500/30 hover:bg-amber-500/20'
              }`}
            >
              {isWppReady ? (
                <>
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                  <Wifi className="w-3.5 h-3.5" />
                  <span>Conectado</span>
                </>
              ) : (
                <>
                  <span className="w-2 h-2 rounded-full bg-amber-400" />
                  <WifiOff className="w-3.5 h-3.5" />
                  <span>Abrir WhatsApp Web</span>
                </>
              )}
              <RefreshCw className={`w-3 h-3 ml-0.5 opacity-60 ${checking ? 'animate-spin' : ''}`} />
            </button>
          )}

          {/* Botão de Diagnóstico e Logs */}
          <button
            onClick={() => {
              setLogsModalOpen(true);
              setHasNewError(false);
            }}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-[11px] font-semibold border transition-all ${
              hasNewError
                ? 'bg-red-500/20 text-red-300 border-red-500/40 hover:bg-red-500/30 animate-pulse shadow-sm shadow-red-500/20'
                : 'bg-slate-800 text-slate-300 border-slate-700/80 hover:bg-slate-700 hover:text-white'
            }`}
            title="Visualizar logs do sistema e diagnósticos em tempo real"
          >
            <Terminal className={`w-3.5 h-3.5 ${hasNewError ? 'text-red-400' : 'text-slate-400'}`} />
            <span>Logs</span>
            {hasNewError && <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-ping" />}
          </button>

          {/* Controles de Janela do Electron se em modo Desktop */}
          {isElectron && (window as any).electronAPI && (
            <div className="flex items-center gap-1 ml-2 border-l border-slate-800 pl-3">
              <button
                onClick={() => (window as any).electronAPI?.minimize()}
                className="p-1 hover:bg-slate-800 text-slate-400 hover:text-slate-200 rounded"
                title="Minimizar"
              >
                <Minus className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => (window as any).electronAPI?.maximize()}
                className="p-1 hover:bg-slate-800 text-slate-400 hover:text-slate-200 rounded"
                title="Maximizar"
              >
                <Square className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => (window as any).electronAPI?.close()}
                className="p-1 hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 rounded"
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
