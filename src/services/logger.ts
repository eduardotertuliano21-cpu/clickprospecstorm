export interface LogEntry {
  id: string;
  timestamp: string;
  level: 'info' | 'warn' | 'error' | 'debug';
  tag: string;
  message: string;
  meta?: any;
}

type LogListener = (entry: LogEntry) => void;

class ClientLogger {
  private listeners: Set<LogListener> = new Set();
  private logsBuffer: LogEntry[] = [];
  private maxLogs: number = 500;

  constructor() {
    // Escuta logs vindos do Electron Main Process
    if (typeof window !== 'undefined' && (window as any).electronAPI?.onLog) {
      (window as any).electronAPI.onLog((entry: LogEntry) => {
        this.addEntry(entry, false);
      });
    }
  }

  public subscribe(listener: LogListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  public getLogs(): LogEntry[] {
    return [...this.logsBuffer];
  }

  public clear(): void {
    this.logsBuffer = [];
    if (typeof window !== 'undefined' && (window as any).electronAPI?.clearLogs) {
      (window as any).electronAPI.clearLogs().catch(() => {});
    }
    this.notify({
      id: `log_${Date.now()}`,
      timestamp: new Date().toISOString(),
      level: 'info',
      tag: 'SISTEMA',
      message: 'Logs limpos.'
    });
  }

  private addEntry(entry: LogEntry, forwardToElectron: boolean = true) {
    this.logsBuffer.push(entry);
    if (this.logsBuffer.length > this.maxLogs) {
      this.logsBuffer.shift();
    }
    this.notify(entry);

    if (forwardToElectron && typeof window !== 'undefined' && (window as any).electronAPI?.logMessage) {
      (window as any).electronAPI.logMessage(entry.level, entry.tag, entry.message, entry.meta).catch(() => {});
    }
  }

  private notify(entry: LogEntry) {
    this.listeners.forEach((cb) => {
      try {
        cb(entry);
      } catch {}
    });
  }

  public log(level: 'info' | 'warn' | 'error' | 'debug', tag: string, message: string, meta?: any) {
    const entry: LogEntry = {
      id: `log_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      timestamp: new Date().toISOString(),
      level,
      tag: tag.toUpperCase(),
      message,
      meta
    };

    const color =
      level === 'error'
        ? '#ef4444'
        : level === 'warn'
        ? '#f59e0b'
        : level === 'debug'
        ? '#8b5cf6'
        : '#10b981';

    console.log(
      `%c[${entry.tag}]%c ${entry.message}`,
      `color: ${color}; font-weight: bold;`,
      'color: inherit;',
      meta || ''
    );

    this.addEntry(entry, true);
  }

  public info(tag: string, message: string, meta?: any) {
    this.log('info', tag, message, meta);
  }

  public warn(tag: string, message: string, meta?: any) {
    this.log('warn', tag, message, meta);
  }

  public error(tag: string, message: string, meta?: any) {
    this.log('error', tag, message, meta);
  }

  public debug(tag: string, message: string, meta?: any) {
    this.log('debug', tag, message, meta);
  }
}

export const logger = new ClientLogger();
