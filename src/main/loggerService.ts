import { app, BrowserWindow } from 'electron';
import path from 'path';
import fs from 'fs';

export interface LogEntry {
  id: string;
  timestamp: string;
  level: 'info' | 'warn' | 'error' | 'debug';
  tag: string;
  message: string;
  meta?: any;
}

class LoggerService {
  private logDir: string = '';
  private appLogFile: string = '';
  private errorLogFile: string = '';
  private memoryLogs: LogEntry[] = [];
  private maxMemoryLogs: number = 400;
  private mainWindow: BrowserWindow | null = null;

  constructor() {
    try {
      const userData = app?.getPath('userData') || process.cwd();
      this.logDir = path.join(userData, 'logs');
      if (!fs.existsSync(this.logDir)) {
        fs.mkdirSync(this.logDir, { recursive: true });
      }
      this.appLogFile = path.join(this.logDir, 'app.log');
      this.errorLogFile = path.join(this.logDir, 'error.log');
    } catch (err) {
      console.error('[LoggerService] Falha ao inicializar diretório de logs:', err);
    }
  }

  public setMainWindow(win: BrowserWindow | null) {
    this.mainWindow = win;
  }

  public getLogDir(): string {
    return this.logDir;
  }

  public getRecentLogs(): LogEntry[] {
    return [...this.memoryLogs];
  }

  public clearLogs(): void {
    this.memoryLogs = [];
    try {
      if (fs.existsSync(this.appLogFile)) fs.writeFileSync(this.appLogFile, '');
      if (fs.existsSync(this.errorLogFile)) fs.writeFileSync(this.errorLogFile, '');
    } catch (e) {
      console.warn('[LoggerService] Falha ao limpar arquivos de log:', e);
    }
    this.info('SYSTEM', 'Logs limpos pelo usuário.');
  }

  private writeToFile(file: string, line: string) {
    try {
      fs.appendFileSync(file, line + '\n', 'utf8');
    } catch (err) {
      console.error('[LoggerService] Falha ao escrever em arquivo de log:', err);
    }
  }

  public log(level: 'info' | 'warn' | 'error' | 'debug', tag: string, message: string, meta?: any) {
    const now = new Date();
    const entry: LogEntry = {
      id: `log_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      timestamp: now.toISOString(),
      level,
      tag: tag.toUpperCase(),
      message,
      meta
    };

    // Buffer em memória
    this.memoryLogs.push(entry);
    if (this.memoryLogs.length > this.maxMemoryLogs) {
      this.memoryLogs.shift();
    }

    // Formata linha para arquivo
    const metaStr = meta ? ` | Meta: ${JSON.stringify(meta)}` : '';
    const fileLine = `[${entry.timestamp}] [${entry.level.toUpperCase()}] [${entry.tag}] ${entry.message}${metaStr}`;

    // Escreve no console local do Electron
    if (level === 'error') {
      console.error(fileLine);
      this.writeToFile(this.errorLogFile, fileLine);
    } else if (level === 'warn') {
      console.warn(fileLine);
    } else {
      console.log(fileLine);
    }

    // Sempre registra no arquivo geral app.log
    this.writeToFile(this.appLogFile, fileLine);

    // Envia em tempo real para a UI React se a janela estiver aberta
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      try {
        this.mainWindow.webContents.send('app-log', entry);
      } catch {}
    }
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

export const loggerService = new LoggerService();
