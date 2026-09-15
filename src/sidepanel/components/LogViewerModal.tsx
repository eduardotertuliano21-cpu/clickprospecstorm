import React, { useState, useEffect, useRef } from 'react';
import { logger, type LogEntry } from '../../services/logger';
import { 
  X, 
  Copy, 
  Trash2, 
  FolderOpen, 
  Search, 
  Terminal, 
  Check, 
  AlertTriangle, 
  Info, 
  CheckCircle2, 
  ArrowDown
} from 'lucide-react';

interface LogViewerModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const LogViewerModal: React.FC<LogViewerModalProps> = ({ isOpen, onClose }) => {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [activeFilter, setActiveFilter] = useState<'all' | 'error' | 'whatsapp' | 'auto-ia' | 'system'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [copied, setCopied] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);

  const logsEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;

    // Carrega logs iniciais
    setLogs(logger.getLogs());

    // Se estiver no Electron, também busca do backend
    if (typeof window !== 'undefined' && (window as any).electronAPI?.getLogs) {
      (window as any).electronAPI.getLogs().then((backendLogs: LogEntry[]) => {
        if (Array.isArray(backendLogs) && backendLogs.length > 0) {
          setLogs(backendLogs);
        }
      }).catch(() => {});
    }

    // Inscreve-se para novos logs
    const unsubscribe = logger.subscribe((newEntry) => {
      setLogs((prev) => [...prev, newEntry]);
    });

    return () => unsubscribe();
  }, [isOpen]);

  useEffect(() => {
    if (autoScroll && isOpen) {
      logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs, autoScroll, isOpen]);

  if (!isOpen) return null;

  // Filtragem
  const filteredLogs = logs.filter((entry) => {
    if (activeFilter === 'error' && entry.level !== 'error') return false;
    if (activeFilter === 'whatsapp' && !entry.tag.includes('WHATSAPP')) return false;
    if (activeFilter === 'auto-ia' && !entry.tag.includes('AUTO-IA')) return false;
    if (activeFilter === 'system' && !['SYSTEM', 'FRONTEND', 'CHAT'].includes(entry.tag)) return false;

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchMsg = entry.message.toLowerCase().includes(q);
      const matchTag = entry.tag.toLowerCase().includes(q);
      return matchMsg || matchTag;
    }
    return true;
  });

  const errorCount = logs.filter((l) => l.level === 'error').length;

  const handleCopyLogs = () => {
    const text = filteredLogs
      .map((l) => `[${l.timestamp}] [${l.level.toUpperCase()}] [${l.tag}] ${l.message}`)
      .join('\n');
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const handleClearLogs = () => {
    logger.clear();
    setLogs([]);
  };

  const handleOpenFolder = () => {
    if (typeof window !== 'undefined' && (window as any).electronAPI?.openLogDir) {
      (window as any).electronAPI.openLogDir();
    } else {
      alert('Abertura de diretório disponível na versão Desktop.');
    }
  };

  const formatTime = (iso: string) => {
    try {
      const d = new Date(iso);
      return d.toLocaleTimeString('pt-BR', { hour12: false });
    } catch {
      return iso;
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="bg-slate-900 border border-slate-700/80 rounded-2xl w-full max-w-5xl h-[85vh] flex flex-col shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        
        {/* CABEÇALHO DO MODAL */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950/80">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
              <Terminal className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-slate-100">Logs do Sistema & Diagnóstico</h3>
                <span className="text-xs bg-slate-800 text-slate-400 px-2 py-0.5 rounded-full font-mono">
                  {logs.length} eventos
                </span>
                {errorCount > 0 && (
                  <span className="text-xs bg-red-500/20 text-red-400 border border-red-500/30 px-2 py-0.5 rounded-full font-bold">
                    {errorCount} {errorCount === 1 ? 'erro' : 'erros'}
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400">
                Monitore em tempo real o fluxo de mensagens, respostas da IA e chamadas de API
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleCopyLogs}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium transition-colors border border-slate-700"
              title="Copiar logs visíveis para a área de transferência"
            >
              {copied ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="text-emerald-400">Copiado!</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  <span>Copiar</span>
                </>
              )}
            </button>

            <button
              onClick={handleOpenFolder}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium transition-colors border border-slate-700"
              title="Abrir pasta de logs no Windows Explorer"
            >
              <FolderOpen className="w-3.5 h-3.5 text-amber-400" />
              <span>Pasta de Logs</span>
            </button>

            <button
              onClick={handleClearLogs}
              className="p-1.5 rounded-lg bg-slate-800/80 hover:bg-red-500/20 text-slate-400 hover:text-red-400 transition-colors border border-slate-700"
              title="Limpar logs"
            >
              <Trash2 className="w-4 h-4" />
            </button>

            <button
              onClick={onClose}
              className="p-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-400 hover:text-slate-100 transition-colors border border-slate-700 ml-2"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* BARRA DE FILTROS E BUSCA */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-3 bg-slate-900/90 border-b border-slate-800">
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setActiveFilter('all')}
              className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
                activeFilter === 'all'
                  ? 'bg-emerald-600 text-white'
                  : 'bg-slate-800 text-slate-400 hover:text-slate-200'
              }`}
            >
              Todos ({logs.length})
            </button>
            <button
              onClick={() => setActiveFilter('error')}
              className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all flex items-center gap-1 ${
                activeFilter === 'error'
                  ? 'bg-red-600 text-white'
                  : 'bg-slate-800 text-red-400 hover:bg-red-950/40'
              }`}
            >
              <AlertTriangle className="w-3 h-3" />
              Erros ({errorCount})
            </button>
            <button
              onClick={() => setActiveFilter('whatsapp')}
              className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
                activeFilter === 'whatsapp'
                  ? 'bg-emerald-600 text-white'
                  : 'bg-slate-800 text-slate-400 hover:text-slate-200'
              }`}
            >
              WhatsApp
            </button>
            <button
              onClick={() => setActiveFilter('auto-ia')}
              className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
                activeFilter === 'auto-ia'
                  ? 'bg-purple-600 text-white'
                  : 'bg-slate-800 text-slate-400 hover:text-slate-200'
              }`}
            >
              Auto-IA
            </button>
            <button
              onClick={() => setActiveFilter('system')}
              className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
                activeFilter === 'system'
                  ? 'bg-blue-600 text-white'
                  : 'bg-slate-800 text-slate-400 hover:text-slate-200'
              }`}
            >
              Sistema
            </button>
          </div>

          <div className="flex items-center gap-3">
            <label className="flex items-center gap-1.5 text-xs text-slate-400 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={autoScroll}
                onChange={(e) => setAutoScroll(e.target.checked)}
                className="w-3.5 h-3.5 rounded bg-slate-800 border-slate-700 text-emerald-500 focus:ring-0"
              />
              <ArrowDown className="w-3 h-3" />
              Rolar automático
            </label>

            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                type="text"
                placeholder="Filtrar mensagem, telefone..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8 pr-3 py-1 bg-slate-950 border border-slate-700/80 rounded-lg text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-emerald-500 w-56"
              />
            </div>
          </div>
        </div>

        {/* LISTAGEM DE LOGS EM TEMPO REAL (ESTILO TERMINAL) */}
        <div className="flex-1 overflow-y-auto p-4 font-mono text-xs bg-slate-950/90 space-y-1.5 select-text">
          {filteredLogs.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-slate-500">
              <Terminal className="w-12 h-12 mb-3 text-slate-700" />
              <p className="text-sm font-sans font-medium">Nenhum registro encontrado para este filtro.</p>
              <p className="text-xs text-slate-600 font-sans mt-1">
                Conecte o WhatsApp ou envie uma mensagem para gerar eventos.
              </p>
            </div>
          ) : (
            filteredLogs.map((entry) => {
              const isErr = entry.level === 'error';
              const isWarn = entry.level === 'warn';
              const isWhatsApp = entry.tag === 'WHATSAPP';
              const isAi = entry.tag === 'AUTO-IA';

              return (
                <div
                  key={entry.id}
                  className={`p-2 rounded-lg border transition-colors flex items-start gap-2.5 ${
                    isErr
                      ? 'bg-red-950/30 border-red-900/60 text-red-200'
                      : isWarn
                      ? 'bg-amber-950/20 border-amber-900/50 text-amber-200'
                      : 'bg-slate-900/60 border-slate-800/80 text-slate-300 hover:bg-slate-900'
                  }`}
                >
                  <span className="text-slate-500 text-[11px] whitespace-nowrap select-none mt-0.5">
                    {formatTime(entry.timestamp)}
                  </span>

                  <span
                    className={`text-[10px] font-bold px-1.5 py-0.5 rounded uppercase select-none whitespace-nowrap ${
                      isErr
                        ? 'bg-red-500/20 text-red-400 border border-red-500/40'
                        : isWarn
                        ? 'bg-amber-500/20 text-amber-400 border border-amber-500/40'
                        : 'bg-slate-800 text-slate-400 border border-slate-700'
                    }`}
                  >
                    {entry.level}
                  </span>

                  <span
                    className={`text-[10px] font-bold px-1.5 py-0.5 rounded uppercase select-none whitespace-nowrap ${
                      isWhatsApp
                        ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                        : isAi
                        ? 'bg-purple-500/20 text-purple-400 border border-purple-500/30'
                        : 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                    }`}
                  >
                    {entry.tag}
                  </span>

                  <div className="flex-1 break-words leading-relaxed whitespace-pre-wrap">
                    {entry.message}
                    {entry.meta && (
                      <span className="block mt-1 text-[11px] text-slate-400 bg-black/40 p-1.5 rounded border border-slate-800">
                        {typeof entry.meta === 'object' ? JSON.stringify(entry.meta, null, 2) : String(entry.meta)}
                      </span>
                    )}
                  </div>
                </div>
              );
            })
          )}
          <div ref={logsEndRef} />
        </div>

        {/* RODAPÉ INFORMATIVO */}
        <div className="px-6 py-2.5 bg-slate-950 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span>Escuta ativa de eventos em tempo real</span>
          </div>
          <span>Pressione ESC ou clique em Fechar</span>
        </div>

      </div>
    </div>
  );
};
