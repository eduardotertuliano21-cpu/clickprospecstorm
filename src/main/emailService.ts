import nodemailer from 'nodemailer';
import { loggerService } from './loggerService.js';

export interface EmailConnectionConfig {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  fromName?: string;
}

export interface SendEmailPayload {
  to: string;
  subject: string;
  text?: string;
  html?: string;
  config: EmailConnectionConfig;
}

export const emailService = {
  /**
   * Testa conexão com o servidor SMTP
   */
  async testConnection(config: EmailConnectionConfig): Promise<{ success: boolean; message?: string }> {
    try {
      loggerService.info('EMAIL', `Testando conexão SMTP com ${config.host}:${config.port} (${config.user})...`);
      
      const transporter = nodemailer.createTransport({
        host: config.host,
        port: config.port,
        secure: config.secure,
        auth: {
          user: config.user,
          pass: config.pass
        },
        connectionTimeout: 10000
      });

      await transporter.verify();
      loggerService.info('EMAIL', 'Conexão SMTP verificada com sucesso!');
      return { success: true, message: 'Conexão SMTP estabelecida com sucesso!' };
    } catch (err: any) {
      loggerService.error('EMAIL', 'Falha ao testar conexão SMTP:', err?.message);
      return { success: false, message: err?.message || 'Falha ao conectar ao servidor SMTP.' };
    }
  },

  /**
   * Envia um e-mail transacional ou de cadência via SMTP
   */
  async sendEmail(payload: SendEmailPayload): Promise<{ success: boolean; messageId?: string; error?: string }> {
    try {
      const { to, subject, text, html, config } = payload;
      loggerService.info('EMAIL', `Disparando e-mail para: ${to} - Assunto: "${subject}"...`);

      const transporter = nodemailer.createTransport({
        host: config.host,
        port: config.port,
        secure: config.secure,
        auth: {
          user: config.user,
          pass: config.pass
        }
      });

      const fromAddress = config.fromName ? `"${config.fromName}" <${config.user}>` : config.user;

      const info = await transporter.sendMail({
        from: fromAddress,
        to,
        subject,
        text,
        html: html || (text ? text.replace(/\n/g, '<br>') : '')
      });

      loggerService.info('EMAIL', `E-mail enviado com sucesso para ${to} (MessageId: ${info.messageId})`);
      return { success: true, messageId: info.messageId };
    } catch (err: any) {
      loggerService.error('EMAIL', `Erro ao enviar e-mail para ${payload.to}:`, err?.message);
      return { success: false, error: err?.message || 'Erro no envio do e-mail.' };
    }
  }
};
