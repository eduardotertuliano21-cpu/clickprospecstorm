import React, { useState } from 'react';
import { ShieldCheck, Lock, Mail, X, KeyRound, AlertCircle, CheckCircle2 } from 'lucide-react';
import { useAdminStore } from '../stores/useAdminStore';

interface MasterLoginModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export const MasterLoginModal: React.FC<MasterLoginModalProps> = ({ isOpen, onClose, onSuccess }) => {
  const { login, loginError, isAdmin } = useAdminStore();
  const [email, setEmail] = useState('eduardo.tertuliano21@gmail.com');
  const [password, setPassword] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);
  const [localSuccess, setLocalSuccess] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);

    const ok = login(email, password, true);
    if (ok) {
      setLocalSuccess(true);
      setTimeout(() => {
        setLocalSuccess(false);
        setPassword('');
        onSuccess?.();
        onClose();
      }, 700);
    } else {
      setLocalError('Credenciais inválidas. Verifique seu e-mail e senha.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div 
        className="w-full max-w-md bg-slate-950 border border-amber-500/30 rounded-2xl shadow-2xl shadow-amber-500/10 overflow-hidden relative"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Glow de fundo */}
        <div className="absolute -top-16 left-1/2 -translate-x-1/2 w-48 h-24 bg-amber-500/15 rounded-full blur-3xl pointer-events-none" />

        {/* Header do Modal */}
        <div className="flex items-center justify-between p-5 border-b border-slate-800/80 bg-slate-900/40">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 shadow-inner">
              <KeyRound className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-100 flex items-center gap-1.5">
                Autenticação de Modo Mestre
                <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20 font-semibold">
                  Admin
                </span>
              </h3>
              <p className="text-[11px] text-slate-400">Acesso irrestrito a chaves e modelos de IA</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-800/60 rounded-lg transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Formulário */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {(localError || loginError) && !localSuccess && (
            <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl flex items-center gap-2.5 text-xs text-red-300">
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
              <span>{localError || loginError}</span>
            </div>
          )}

          {localSuccess && (
            <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl flex items-center gap-2.5 text-xs text-emerald-300">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>Modo Mestre ativado com sucesso! Carregando...</span>
            </div>
          )}

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
              <Mail className="w-3.5 h-3.5 text-amber-400" />
              E-mail do Administrador
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="eduardo.tertuliano21@gmail.com"
              className="w-full bg-slate-900 border border-slate-700/80 rounded-xl px-3.5 py-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-500 transition-colors"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
              <Lock className="w-3.5 h-3.5 text-amber-400" />
              Senha Mestre
            </label>
            <input
              type="password"
              required
              autoFocus
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Digite sua senha de administrador"
              className="w-full bg-slate-900 border border-slate-700/80 rounded-xl px-3.5 py-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-500 transition-colors"
            />
            <p className="text-[10px] text-slate-500">
              Atalho de segurança: <kbd className="font-mono bg-slate-800 px-1.5 py-0.5 rounded text-slate-400">Ctrl + Shift + Alt + M</kbd>
            </p>
          </div>

          <div className="pt-2 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium text-slate-400 hover:text-slate-200 hover:bg-slate-900 rounded-xl transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={localSuccess}
              className="px-5 py-2 bg-gradient-to-r from-amber-600 to-amber-500 hover:from-amber-500 hover:to-amber-400 text-slate-950 font-bold rounded-xl text-xs shadow-lg shadow-amber-500/20 transition-all flex items-center gap-1.5 disabled:opacity-50"
            >
              <ShieldCheck className="w-4 h-4" />
              <span>Desbloquear Modo Mestre</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
