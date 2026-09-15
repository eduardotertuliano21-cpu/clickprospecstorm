import React, { useState, useEffect } from 'react';
import { 
  QrCode, 
  RefreshCw, 
  Smartphone, 
  CheckCircle2, 
  LogOut, 
  X, 
  AlertCircle,
  ShieldCheck
} from 'lucide-react';

interface WhatsAppConnectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  status: 'disconnected' | 'connecting' | 'connected';
  phone?: string;
  qrCodeBase64?: string;
  onConnect: () => void;
  onDisconnect: () => void;
}

export const WhatsAppConnectionModal: React.FC<WhatsAppConnectionModalProps> = ({
  isOpen,
  onClose,
  status,
  phone,
  qrCodeBase64,
  onConnect,
  onDisconnect
}) => {
  const [loadingAction, setLoadingAction] = useState(false);

  useEffect(() => {
    if (isOpen && status === 'disconnected' && !qrCodeBase64) {
      onConnect();
    }
  }, [isOpen, status, qrCodeBase64]);

  if (!isOpen) return null;

  const handleDisconnect = async () => {
    if (window.confirm('Deseja realmente desconectar o WhatsApp desta sessão? Será necessário ler o QR Code novamente para reconectar.')) {
      setLoadingAction(true);
      try {
        await onDisconnect();
      } finally {
        setLoadingAction(false);
      }
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fadeIn">
      <div 
        className="bg-slate-900 border border-slate-800 w-full max-w-md rounded-2xl shadow-2xl overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header do Modal */}
        <div className="bg-slate-900/90 border-b border-slate-800 px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
              <QrCode className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-100">Conexão WhatsApp</h2>
              <p className="text-[11px] text-slate-400">Motor Nativo Baileys WebSocket</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-lg transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Corpo do Modal */}
        <div className="p-6 flex flex-col items-center text-center">
          {/* ESTADO 1: CONECTADO */}
          {status === 'connected' ? (
            <div className="flex flex-col items-center py-4 w-full">
              <div className="w-16 h-16 rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 mb-4 animate-bounce">
                <CheckCircle2 className="w-8 h-8" />
              </div>
              <h3 className="text-base font-bold text-slate-100 mb-1">WhatsApp Conectado!</h3>
              <p className="text-xs text-slate-400 mb-4">
                Sessão autenticada e pronta para envios estocásticos.
              </p>

              {phone && (
                <div className="bg-slate-800/80 border border-slate-700/60 rounded-xl px-4 py-2.5 mb-6 flex items-center gap-2">
                  <Smartphone className="w-4 h-4 text-emerald-400" />
                  <span className="text-sm font-semibold text-slate-200">{phone}</span>
                </div>
              )}

              <div className="flex items-center gap-2 text-[11px] text-slate-500 mb-6 bg-slate-950/40 px-3 py-2 rounded-lg border border-slate-800 w-full justify-center">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                <span>Credenciais salvas de forma segura em seu disco local</span>
              </div>

              <div className="flex gap-3 w-full">
                <button
                  onClick={handleDisconnect}
                  disabled={loadingAction}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl border border-rose-500/30 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 text-xs font-semibold transition-colors disabled:opacity-50"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>Desconectar Sessão</span>
                </button>
                <button
                  onClick={onClose}
                  className="flex-1 py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold shadow-lg shadow-emerald-600/20 transition-colors"
                >
                  Concluir
                </button>
              </div>
            </div>
          ) : (
            /* ESTADO 2: DESCONECTADO OU CONECTANDO (QR CODE) */
            <div className="flex flex-col items-center w-full">
              {/* Área do QR Code */}
              <div className="relative w-64 h-64 bg-white p-3 rounded-2xl shadow-xl flex items-center justify-center border-4 border-slate-800 mb-5">
                {qrCodeBase64 ? (
                  <img
                    src={qrCodeBase64}
                    alt="WhatsApp QR Code"
                    className="w-full h-full object-contain rounded-lg select-none"
                  />
                ) : (
                  <div className="flex flex-col items-center justify-center gap-3 text-slate-800">
                    <RefreshCw className="w-8 h-8 text-emerald-600 animate-spin" />
                    <span className="text-xs font-semibold text-slate-600">
                      {status === 'connecting' ? 'Gerando QR Code...' : 'Aguardando conexão...'}
                    </span>
                  </div>
                )}
              </div>

              {/* Instruções de Pareamento */}
              <div className="text-left bg-slate-950/60 border border-slate-800/80 rounded-xl p-3.5 mb-5 w-full">
                <p className="text-xs font-semibold text-slate-300 mb-2 flex items-center gap-1.5">
                  <Smartphone className="w-3.5 h-3.5 text-emerald-400" />
                  Como conectar:
                </p>
                <ol className="text-[11px] text-slate-400 space-y-1 list-decimal list-inside leading-relaxed">
                  <li>Abra o WhatsApp no seu smartphone</li>
                  <li>Toque em <strong className="text-slate-200">Mais opções (⋮)</strong> ou <strong className="text-slate-200">Configurações</strong></li>
                  <li>Selecione <strong className="text-slate-200">Aparelhos conectados</strong></li>
                  <li>Toque em <strong className="text-slate-200">Conectar um aparelho</strong> e aponte a câmera</li>
                </ol>
              </div>

              {/* Botão de Atualizar QR Code */}
              <div className="flex items-center justify-between w-full">
                <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
                  <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
                  <span>{status === 'connecting' ? 'Aguardando leitura...' : 'Desconectado'}</span>
                </div>

                <button
                  onClick={onConnect}
                  disabled={status === 'connecting' && !qrCodeBase64}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-700 bg-slate-800 hover:bg-slate-750 text-slate-300 hover:text-white text-xs font-medium transition-colors disabled:opacity-50"
                >
                  <RefreshCw className="w-3 h-3" />
                  <span>Atualizar QR</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
