import React, { useState, useEffect } from 'react';
import { AlertTriangle, Download, RefreshCw, CheckCircle2, Sparkles, ArrowRight } from 'lucide-react';

export interface ForceUpdateInfo {
  minVersionRequired: string;
  latestVersion: string;
  downloadUrl: string;
  message: string;
}

interface ForceUpdateModalProps {
  info: ForceUpdateInfo;
}

interface DownloadProgress {
  percent: number;
  bytesPerSecond: number;
  transferred: number;
  total: number;
}

export const ForceUpdateModal: React.FC<ForceUpdateModalProps> = ({ info }) => {
  const [downloadProgress, setDownloadProgress] = useState<DownloadProgress | null>(null);
  const [isDownloaded, setIsDownloaded] = useState(false);
  const [isChecking, setIsChecking] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined' || !(window as any).electronAPI) return;

    const api = (window as any).electronAPI;

    // Escuta eventos de progresso do download automático
    const unsubProgress = api.onUpdateProgress?.((prog: DownloadProgress) => {
      setDownloadProgress(prog);
    });

    // Escuta conclusão do download
    const unsubDownloaded = api.onUpdateDownloaded?.(() => {
      setIsDownloaded(true);
      setDownloadProgress(null);
    });

    // Dispara checagem do auto-updater
    setIsChecking(true);
    api.checkForUpdates?.().finally(() => setIsChecking(false));

    return () => {
      unsubProgress?.();
      unsubDownloaded?.();
    };
  }, []);

  const handleRestartAndInstall = () => {
    if (typeof window !== 'undefined' && (window as any).electronAPI?.quitAndInstallUpdate) {
      (window as any).electronAPI.quitAndInstallUpdate();
    }
  };

  const handleManualDownload = () => {
    const url = info.downloadUrl || 'https://github.com/eduardotertuliano21-cpu/clickprospecstorm/releases';
    if (typeof window !== 'undefined' && (window as any).electronAPI?.openExternal) {
      (window as any).electronAPI.openExternal(url);
    } else {
      window.open(url, '_blank');
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-950/95 backdrop-blur-md z-50 flex items-center justify-center p-4 select-none animate-in fade-in duration-200">
      <div className="bg-slate-900 border-2 border-amber-500/40 rounded-3xl max-w-md w-full p-6 shadow-2xl shadow-amber-950/40 text-center space-y-5 relative overflow-hidden">
        {/* Glow sutil */}
        <div className="absolute -top-20 left-1/2 -translate-x-1/2 w-60 h-28 bg-amber-500/15 rounded-full blur-3xl pointer-events-none" />

        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-amber-500/10 border border-amber-500/30 mx-auto text-amber-400">
          {isDownloaded ? (
            <CheckCircle2 className="w-8 h-8 text-emerald-400 animate-bounce" />
          ) : downloadProgress ? (
            <RefreshCw className="w-8 h-8 text-amber-400 animate-spin" />
          ) : (
            <AlertTriangle className="w-8 h-8 text-amber-400" />
          )}
        </div>

        <div>
          <h2 className="text-xl font-bold text-white tracking-tight">
            {isDownloaded ? 'Atualização Pronta para Instalação' : 'Atualização do Sistema Disponível'}
          </h2>
          <p className="text-xs text-amber-300/80 font-medium mt-1">
            {isDownloaded 
              ? 'A nova versão já foi baixada com segurança.' 
              : 'O sistema detectou uma versão obrigatória mais recente.'}
          </p>
        </div>

        <div className="bg-slate-950/80 border border-slate-800 rounded-2xl p-4 text-xs text-slate-300 text-left space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="text-slate-400">Versão Mínima Exigida:</span>
            <strong className="text-amber-400 font-mono">v{info.minVersionRequired}</strong>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-slate-400">Nova Versão Disponível:</span>
            <strong className="text-emerald-400 font-mono">v{info.latestVersion}</strong>
          </div>
          <div className="pt-2 border-t border-slate-800/80 text-[11px] text-slate-400 leading-relaxed">
            {info.message || 'Esta atualização contém correções críticas de segurança, conformidade e novos recursos de automação.'}
          </div>
        </div>

        {/* Barra de Progresso de Download Automático */}
        {downloadProgress && (
          <div className="space-y-2 text-left bg-slate-950/60 border border-slate-800 p-3 rounded-xl">
            <div className="flex justify-between text-[11px] font-semibold">
              <span className="text-amber-300 flex items-center gap-1.5">
                <RefreshCw className="w-3 h-3 animate-spin" />
                Baixando atualização automaticamente...
              </span>
              <span className="text-slate-200 font-mono">{downloadProgress.percent}%</span>
            </div>
            <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden">
              <div 
                className="bg-gradient-to-r from-amber-500 to-emerald-400 h-full rounded-full transition-all duration-300"
                style={{ width: `${downloadProgress.percent}%` }}
              />
            </div>
            <div className="flex justify-between text-[10px] text-slate-400">
              <span>{Math.round(downloadProgress.transferred / 1024 / 1024)} MB de {Math.round(downloadProgress.total / 1024 / 1024)} MB</span>
              <span>{Math.round(downloadProgress.bytesPerSecond / 1024)} KB/s</span>
            </div>
          </div>
        )}

        {/* Ação Principal: Reiniciar e Aplicar OU Baixar Manualmente */}
        {isDownloaded ? (
          <button
            onClick={handleRestartAndInstall}
            className="w-full bg-gradient-to-r from-emerald-600 to-teal-500 hover:from-emerald-500 hover:to-teal-400 text-white font-bold py-3 px-4 rounded-xl shadow-lg shadow-emerald-600/30 transition duration-200 text-xs flex items-center justify-center gap-2"
          >
            <RefreshCw className="w-4 h-4" />
            <span>Reiniciar e Atualizar Agora</span>
          </button>
        ) : (
          <button
            onClick={handleManualDownload}
            className="w-full bg-gradient-to-r from-amber-600 to-orange-500 hover:from-amber-500 hover:to-orange-400 text-white font-bold py-3 px-4 rounded-xl shadow-lg shadow-amber-600/30 transition duration-200 text-xs flex items-center justify-center gap-2"
          >
            <Download className="w-4 h-4" />
            <span>Baixar pelo GitHub Releases</span>
          </button>
        )}

        <p className="text-[10px] text-slate-500">
          O Click Lead Storm mantém todos os seus leads, mensagens e configurações intactos durante a atualização.
        </p>
      </div>
    </div>
  );
};
