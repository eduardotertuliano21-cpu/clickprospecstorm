import React, { useState, useEffect, useRef } from 'react';
import { ShieldAlert, Key, Copy, Check, Lock, MessageCircle, RefreshCw } from 'lucide-react';
import { MasterLoginModal } from './MasterLoginModal';

interface LockScreenProps {
  machineId: string;
  hostname?: string;
  customerName?: string;
  status: 'blocked' | 'expired';
  message?: string;
  onKeyActivated: () => void;
}

export const LockScreen: React.FC<LockScreenProps> = ({ machineId, hostname, customerName, status, message, onKeyActivated }) => {
  const [licenseKey, setLicenseKey] = useState('');
  const [copied, setCopied] = useState(false);
  const [activating, setActivating] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isMasterModalOpen, setIsMasterModalOpen] = useState(false);
  const escPressCountRef = useRef(0);
  const lastEscTimeRef = useRef(0);

  // Escuta 5 toques consecutivos na tecla ESC para abrir tela de login de Administrador Mestre
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        const now = Date.now();
        if (now - lastEscTimeRef.current > 2500) {
          escPressCountRef.current = 1;
        } else {
          escPressCountRef.current += 1;
        }
        lastEscTimeRef.current = now;

        if (escPressCountRef.current >= 5) {
          escPressCountRef.current = 0;
          setIsMasterModalOpen(true);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleCopyMachineId = () => {
    navigator.clipboard.writeText(machineId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleActivate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!licenseKey.trim()) return;

    setActivating(true);
    setErrorMsg(null);

    try {
      if (typeof window !== 'undefined' && (window as any).electronAPI?.verifyLicense) {
        const res = await (window as any).electronAPI.verifyLicense(licenseKey.trim());
        if (res.status === 'active' || res.status === 'trial') {
          onKeyActivated();
        } else {
          setErrorMsg(res.message || 'Chave não autorizada para este computador.');
        }
      } else {
        setErrorMsg('Disponível apenas no Desktop App.');
      }
    } catch (err: any) {
      const rawMsg = err?.message || 'Erro ao validar licença.';
      const cleanMsg = rawMsg
        .replace(/Error invoking remote method '[^']+':\s*/g, '')
        .replace(/^Error:\s*/, '')
        .trim();
      setErrorMsg(cleanMsg || 'Erro ao validar licença.');
    } finally {
      setActivating(false);
    }
  };

  const handleOpenWhatsAppSupport = () => {
    const text = encodeURIComponent(`Olá Eduardo! Preciso ativar minha licença do Click Lead Storm.\nMeu Machine ID é: ${machineId}`);
    window.open(`https://wa.me/5511996773805?text=${text}`, '_blank');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/95 backdrop-blur-md p-4 select-none">
      <div className="w-full max-w-lg bg-slate-900 border border-rose-500/30 rounded-3xl p-7 shadow-2xl shadow-rose-500/10 text-center relative overflow-hidden">
        {/* Glow de alerta */}
        <div className="absolute -top-20 left-1/2 -translate-x-1/2 w-64 h-32 bg-rose-500/15 rounded-full blur-3xl pointer-events-none" />

        <div className="w-16 h-16 rounded-2xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-400 mx-auto mb-5 shadow-lg shadow-rose-500/10">
          <Lock className="w-8 h-8" />
        </div>

        <h2 className="text-xl font-extrabold text-slate-100 tracking-tight mb-1">
          {status === 'blocked' ? 'Acesso ao Sistema Bloqueado' : 'Período de Demonstração Expirado'}
        </h2>
        <p className="text-xs text-slate-400 max-w-sm mx-auto mb-6">
          {message || 'Sua licença precisa ser ativada ou regularizada para continuar utilizando os módulos de prospecção e IA.'}
        </p>

        {/* Card do Machine ID & Identificação */}
        <div className="bg-slate-950 border border-slate-800 rounded-2xl p-3.5 mb-6 text-left space-y-2">
          {customerName && (
            <div className="text-[11px] text-slate-300 flex items-center justify-between pb-1.5 border-b border-slate-900">
              <span className="text-slate-500 font-semibold uppercase text-[9px]">Cliente Vinculado:</span>
              <span className="font-bold text-emerald-400">{customerName}</span>
            </div>
          )}
          {hostname && (
            <div className="text-[11px] text-slate-300 flex items-center justify-between pb-1.5 border-b border-slate-900">
              <span className="text-slate-500 font-semibold uppercase text-[9px]">Estação / Computador:</span>
              <span className="font-bold text-blue-300">{hostname}</span>
            </div>
          )}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">ID da Placa-Mãe (Machine ID)</span>
              <button
                onClick={handleCopyMachineId}
                className="text-[11px] text-emerald-400 hover:text-emerald-300 flex items-center gap-1 font-medium transition-colors"
              >
                {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copied ? 'Copiado!' : 'Copiar ID'}</span>
              </button>
            </div>
            <div className="font-mono text-xs text-slate-200 bg-slate-900 px-3 py-1.5 rounded-xl border border-slate-800/80 break-all select-all">
              {machineId}
            </div>
          </div>
        </div>

        {/* Formulário de Ativação */}
        <form onSubmit={handleActivate} className="space-y-3 mb-5">
          {errorMsg && (
            <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-xs text-red-300 flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-red-400 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          <div>
            <input
              type="text"
              required
              value={licenseKey}
              onChange={(e) => setLicenseKey(e.target.value.toUpperCase())}
              placeholder="Cole sua Chave (CLS-...) ou Senha Temporária"
              className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-2.5 text-xs text-slate-100 font-mono text-center tracking-widest placeholder:tracking-normal placeholder-slate-500 focus:outline-none focus:border-emerald-500"
            />
          </div>

          <button
            type="submit"
            disabled={activating || !licenseKey.trim()}
            className="w-full py-2.5 bg-gradient-to-r from-emerald-600 to-teal-500 hover:from-emerald-500 hover:to-teal-400 text-white font-bold rounded-xl text-xs shadow-lg shadow-emerald-500/20 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {activating ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Key className="w-4 h-4" />}
            <span>{activating ? 'Verificando chave...' : 'Ativar Licença Agora'}</span>
          </button>
        </form>

        {/* Suporte WhatsApp */}
        <button
          onClick={handleOpenWhatsAppSupport}
          className="w-full py-2 bg-slate-800/80 hover:bg-slate-800 text-slate-300 rounded-xl text-xs font-semibold border border-slate-700/80 transition-all flex items-center justify-center gap-2"
        >
          <MessageCircle className="w-4 h-4 text-emerald-400" />
          <span>Falar com o Suporte Oficial no WhatsApp</span>
        </button>

        {/* Modal de Autenticação Mestre (Acionado com 5x tecla ESC) */}
        <MasterLoginModal
          isOpen={isMasterModalOpen}
          onClose={() => setIsMasterModalOpen(false)}
          onSuccess={() => {
            setIsMasterModalOpen(false);
            onKeyActivated();
          }}
        />
      </div>
    </div>
  );
};
