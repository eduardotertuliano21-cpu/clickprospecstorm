import React from 'react';
import { AlertTriangle, Download, ShieldAlert } from 'lucide-react';

export interface ForceUpdateInfo {
  minVersionRequired: string;
  latestVersion: string;
  downloadUrl: string;
  message: string;
}

interface ForceUpdateModalProps {
  info: ForceUpdateInfo;
}

export const ForceUpdateModal: React.FC<ForceUpdateModalProps> = ({ info }) => {
  const handleDownload = () => {
    const url = info.downloadUrl || 'https://github.com/clickleadstorm/desktop/releases';
    if (typeof window !== 'undefined' && (window as any).electronAPI?.openExternal) {
      (window as any).electronAPI.openExternal(url);
    } else {
      window.open(url, '_blank');
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-950/95 backdrop-blur-md z-50 flex items-center justify-center p-4 select-none">
      <div className="bg-slate-900 border-2 border-red-500/50 rounded-2xl max-w-md w-full p-6 shadow-2xl shadow-red-950/50 text-center space-y-5">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-red-500/10 border border-red-500/30 mx-auto">
          <AlertTriangle className="w-8 h-8 text-red-400 animate-pulse" />
        </div>

        <div>
          <h2 className="text-xl font-bold text-white tracking-tight">Atualização Obrigatória</h2>
          <p className="text-xs text-red-300/80 font-medium mt-1">Versão do Aplicativo Descontinuada</p>
        </div>

        <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-4 text-xs text-slate-300 text-left space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="text-slate-400">Versão Mínima Exigida:</span>
            <strong className="text-amber-400 font-mono">v{info.minVersionRequired}</strong>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-slate-400">Última Versão Disponível:</span>
            <strong className="text-emerald-400 font-mono">v{info.latestVersion}</strong>
          </div>
          <div className="pt-2 border-t border-slate-800/80 text-[11px] text-slate-400 leading-relaxed">
            {info.message || 'Para garantir a integridade dos envios, anti-ban e conformidade com os servidores, é necessário atualizar para a versão mais recente.'}
          </div>
        </div>

        <button
          onClick={handleDownload}
          className="w-full bg-red-600 hover:bg-red-500 text-white font-bold py-3 px-4 rounded-xl shadow-lg shadow-red-600/30 transition duration-200 text-xs flex items-center justify-center gap-2"
        >
          <Download className="w-4 h-4" />
          <span>Baixar Nova Versão Oficial</span>
        </button>

        <p className="text-[10px] text-slate-500">
          Após concluir o download e instalação, o Click Lead Storm será reativado automaticamente.
        </p>
      </div>
    </div>
  );
};
