import { db, type SemanticCacheEntry } from '../db';
import { autoResponderRepository } from '../db/repositories/autoResponderRepository';
import { settingsRepository } from '../db/repositories/settingsRepository';
import { chatRepository } from '../db/repositories/chatRepository';
import { leadRepository } from '../db/repositories/leadRepository';
import { omnichannelRepository } from '../db/repositories/omnichannelRepository';
import { omnichannelService } from './omnichannelService';
import type { ChannelType } from '../types/omnichannel';
import { semanticCacheService } from './semanticCacheService';
import { groqService } from './groqService';
import { webviewBridge, type IncomingMessageEvent } from './webviewBridge';
import { logger } from './logger';

class AutoResponderService {
  private isInitialized = false;
  private activeSenders = new Set<string>();

  public async init() {
    if (this.isInitialized) return;
    this.isInitialized = true;

    logger.info('AUTO-IA', 'Serviço global de Auto-Resposta e Sincronização Multicanal ativo.');

    // 1. Garante que existem regras padrão se a tabela estiver vazia
    await this.seedDefaultRulesIfEmpty();

    // 2. Registra listener permanente de mensagens recebidas no WhatsApp
    webviewBridge.onIncomingMessage(async (msg) => {
      await this.processOmniMessage({
        channel: 'whatsapp',
        sender: msg.from,
        body: msg.body,
        contactName: msg.pushName,
        fromMe: msg.fromMe,
        jid: msg.jid,
        timestamp: msg.timestamp
      });
    });

    // 2.1 Registra listener para entradas dos canais Omnichannel (Instagram Direct, Messenger)
    if (typeof window !== 'undefined' && (window as any).electronAPI?.onOmniIncomingMessage) {
      (window as any).electronAPI.onOmniIncomingMessage(async (data: any) => {
        if (!data) return;
        await this.processOmniMessage({
          channel: data.channel || 'instagram',
          sender: data.sender || data.from || data.recipientId,
          body: data.body || data.text || data.content,
          contactName: data.contactName || data.name,
          fromMe: false,
          timestamp: data.timestamp
        });
      });
    }

    // 3. Registra listener de sincronização inicial de histórico
    webviewBridge.onHistorySync(async (data) => {
      if (data && Array.isArray(data.messages)) {
        logger.info('CHAT', `Gravando ${data.messages.length} mensagens do histórico no banco de dados local...`);
        for (const m of data.messages) {
          try {
            await chatRepository.saveMessage({
              phone: m.from,
              contactName: m.pushName,
              fromMe: !!m.fromMe,
              body: m.body,
              timestamp: m.timestamp || Date.now(),
              status: m.fromMe ? 'sent' : 'received'
            });
          } catch {}
        }
        logger.info('CHAT', 'Histórico de conversas gravado com sucesso no CRM local!');
      }
    });
  }

  public async seedDefaultRulesIfEmpty() {
    try {
      // Limpa do cache semântico qualquer resposta robótica genérica do erro anterior
      await db.semanticCache.filter((e: SemanticCacheEntry) => e.responseTemplate.includes('Recebi sua mensagem com atenção')).delete();

      const existing = await autoResponderRepository.getRules();
      if (existing.length === 0) {
        logger.info('AUTO-IA', 'Cadastrando regras inteligentes recomendadas no banco...');
        await autoResponderRepository.addRule({
          title: 'Quem Somos & Apresentação',
          triggerKeywords: ['quem sao voces', 'quem são vocês', 'quem e voce', 'quem é você', 'o que voces fazem', 'o que fazem', 'como funciona', 'do que se trata', 'o que é isso'],
          matchType: 'contains',
          responseTemplate: 'Somos uma assessoria especializada em prospecção B2B e automação comercial no WhatsApp, ajudando empresas a acelerar vendas e captar leads qualificados. Quer saber como funciona?',
          useAi: true,
          aiPrompt: 'Explique quem somos de forma atrativa, calorosa e focada no benefício direto para o lead em 2 frases, convidando para saber mais.',
          active: true
        });

        await autoResponderRepository.addRule({
          title: 'Saudação e Boas-vindas',
          triggerKeywords: ['ola', 'olá', 'oi', 'bom dia', 'boa tarde', 'boa noite', 'opa'],
          matchType: 'contains',
          responseTemplate: 'Olá! Tudo ótimo por aqui. Como posso ajudar sua empresa a alcançar novos clientes hoje?',
          useAi: true,
          aiPrompt: 'Responda à saudação com cordialidade e simpatia em 1 ou 2 frases curtas, usando o nome do lead se disponível, apresentando nossa empresa e perguntando como podemos ajudar o negócio dele hoje.',
          active: true
        });

        await autoResponderRepository.addRule({
          title: 'Orçamento e Valores',
          triggerKeywords: ['preço', 'preco', 'valor', 'quanto custa', 'orçamento', 'orcamento', 'tabela', 'proposta'],
          matchType: 'contains',
          responseTemplate: 'Nossos planos e serviços são flexíveis e personalizados para a necessidade de cada empresa. Me conta: qual o foco principal da sua operação no momento?',
          useAi: true,
          aiPrompt: 'O lead perguntou sobre valores ou preços. Apresente brevemente como nossos serviços se adaptam à realidade da empresa dele e pergunte qual é o objetivo ou foco comercial dele no momento.',
          active: true
        });

        await autoResponderRepository.addRule({
          title: 'Atendente Humano',
          triggerKeywords: ['humano', 'atendente', 'falar com alguém', 'pessoa', 'consultor', 'especialista'],
          matchType: 'contains',
          responseTemplate: 'Perfeito! Já notifiquei um de nossos consultores especialistas. Em instantes uma pessoa da nossa equipe entrará em contato direto com você por aqui.',
          useAi: false,
          active: true
        });
      } else {
        // Se já existem regras antigas sem IA, atualiza para IA ativa para evitar respostas robóticas
        for (const r of existing) {
          if (r.id && (r.title.includes('Saudação') || r.title.includes('Orçamento')) && !r.useAi) {
            await autoResponderRepository.updateRule(r.id, {
              useAi: true,
              aiPrompt: r.title.includes('Saudação')
                ? 'Responda à saudação com cordialidade e simpatia em 1 ou 2 frases curtas, usando o nome do lead se disponível, apresentando nossa empresa e perguntando como podemos ajudar o negócio dele hoje.'
                : 'O lead perguntou sobre valores ou preços. Apresente brevemente como nossos serviços se adaptam à realidade da empresa dele e pergunte qual é o foco principal dele no momento.'
            });
          }
        }
      }
    } catch (err: any) {
      logger.warn('AUTO-IA', 'Erro ao semear/atualizar regras iniciais:', err?.message);
    }
  }

  public async processOmniMessage(params: {
    channel: ChannelType;
    sender: string;
    body: string;
    contactName?: string;
    fromMe?: boolean;
    jid?: string;
    timestamp?: number;
  }) {
    const { channel, sender, body, contactName, fromMe, jid, timestamp } = params;
    if (!body || !sender) return;

    const cleanSender = channel === 'whatsapp' ? sender.replace(/\D/g, '') : sender.trim().replace(/^@/, '');
    
    // Ignora canais de transmissão, newsletters e grupos do WhatsApp
    if (channel === 'whatsapp') {
      if (cleanSender.length > 15 || cleanSender.length < 8 || cleanSender.startsWith('120363')) {
        return;
      }
      if (jid && (jid.endsWith('@g.us') || jid.endsWith('@newsletter') || jid.includes('broadcast'))) {
        return;
      }
    }

    const text = body.trim();
    const textLower = text.toLowerCase();
    const isFromMe = !!fromMe;
    const msgTimestamp = timestamp ? (timestamp > 10000000000 ? timestamp : timestamp * 1000) : Date.now();

    // 1. Localiza ou resolve lead correspondente
    let lead: any = undefined;
    if (channel === 'whatsapp') {
      lead = await leadRepository.getLeadByPhone(cleanSender);
    } else {
      const allLeads = await leadRepository.getLeads();
      lead = allLeads.find(l => 
        (l.name && l.name.toLowerCase() === cleanSender.toLowerCase()) ||
        (l.notes && l.notes.includes(cleanSender)) ||
        (l.phone && l.phone.includes(cleanSender))
      );
    }

    const resolvedContactName = lead?.name || contactName || (channel === 'instagram' ? `@${cleanSender}` : cleanSender);

    // 2. Sempre registra no repositório unificado (Omnichannel)
    try {
      await omnichannelRepository.saveMessage({
        contactId: cleanSender,
        channel,
        direction: isFromMe ? 'outgoing' : 'incoming',
        sender: isFromMe ? 'Minha Empresa' : resolvedContactName,
        recipient: isFromMe ? cleanSender : 'me',
        content: text,
        timestamp: msgTimestamp,
        status: isFromMe ? 'sent' : 'delivered'
      });

      // Se for WhatsApp, mantém também no chatRepository legado
      if (channel === 'whatsapp') {
        await chatRepository.saveMessage({
          phone: cleanSender,
          jid,
          contactName: resolvedContactName,
          fromMe: isFromMe,
          body: text,
          timestamp: msgTimestamp,
          status: isFromMe ? 'sent' : 'received'
        });
      }
    } catch (dbErr: any) {
      logger.warn('CHAT', `Erro ao salvar mensagem omnichannel (${channel} - ${cleanSender}):`, dbErr?.message);
    }

    // Se a mensagem foi enviada por mim mesmo, não dispara auto-resposta
    if (isFromMe) return;

    // 3. Checa se o Auto-Responder está ligado
    const settings = await settingsRepository.getSettings();
    if (!settings.autoResponderActive) {
      logger.info('AUTO-IA', `Mensagem de ${cleanSender} (${channel}) gravada. Auto-Resposta está DESLIGADA.`);
      return;
    }

    // Trava de concorrência por remetente/canal
    const senderLockKey = `${channel}:${cleanSender}`;
    if (this.activeSenders.has(senderLockKey)) {
      logger.warn('AUTO-IA', `Já existe resposta em andamento para ${senderLockKey}.`);
      return;
    }

    this.activeSenders.add(senderLockKey);

    try {
      let replyText: string | null = null;
      let usedCache = false;

      logger.info('AUTO-IA', `Processando auto-resposta [${channel.toUpperCase()}] para ${cleanSender}: "${text}"`);

      // 4. Checa regras manuais de palavras-chave
      const activeRules = await autoResponderRepository.getRules();
      const enabledRules = activeRules.filter((r) => r.active);

      for (const rule of enabledRules) {
        let matched = false;

        if (rule.matchType === 'exact') {
          matched = rule.triggerKeywords.some((kw) => textLower === kw.toLowerCase().trim());
        } else if (rule.matchType === 'contains') {
          matched = rule.triggerKeywords.some((kw) => textLower.includes(kw.toLowerCase().trim()));
        } else if (rule.matchType === 'ai') {
          matched = true;
        }

        if (matched) {
          logger.info('AUTO-IA', `Regra acionada [${channel}]: "${rule.title}" (tipo: ${rule.matchType})`);

          if (rule.useAi && settings.groqApiKey) {
            try {
              replyText = await groqService.generateAutoResponse({
                incomingMessage: text,
                myCompanyContext: {
                  name: settings.myCompanyName,
                  description: settings.myCompanyDescription,
                  offer: settings.myCompanyOffer
                },
                leadContext: {
                  name: lead?.name || resolvedContactName,
                  companyName: lead?.companyName,
                  decisionMaker: lead?.decisionMaker,
                  niche: lead?.category,
                  city: lead?.city,
                  state: lead?.state,
                  notes: lead?.notes
                },
                systemPrompt: rule.aiPrompt || settings.systemPrompt || '',
                apiKey: settings.groqApiKey,
                model: settings.groqModel
              });
            } catch (aiErr: any) {
              logger.error('AUTO-IA', `Erro no Groq para regra "${rule.title}":`, aiErr?.message);
              replyText = rule.responseTemplate;
            }
          } else {
            replyText = rule.responseTemplate;
          }
          break;
        }
      }

      // 5. Se não houve regra de palavra-chave, verifica Cache Semântico e Groq IA Fallback
      if (!replyText && settings.autoResponderAiFallback !== false) {
        logger.info('AUTO-IA', 'Nenhuma regra coincidiu. Verificando Cache Semântico...');

        const cacheHit = await semanticCacheService.findMatch(text);
        if (cacheHit && cacheHit.response) {
          logger.info('AUTO-IA', `Cache Semântico: HIT (${(cacheHit.similarity * 100).toFixed(1)}% similaridade).`);
          replyText = cacheHit.response;
          usedCache = true;
        } else if (settings.groqApiKey) {
          logger.info('AUTO-IA', `Consultando IA Groq Llama 3 para resposta omnichannel (${channel})...`);

          try {
            // Histórico recente da conversa unificada
            const allMsgs = await omnichannelRepository.getMessages(cleanSender);
            const recentHistory = allMsgs.slice(-4).map((m) => ({
              fromMe: m.direction === 'outgoing',
              body: m.content
            }));

            const generated = await groqService.generateAutoResponse({
              incomingMessage: text,
              myCompanyContext: {
                name: settings.myCompanyName,
                description: settings.myCompanyDescription,
                offer: settings.myCompanyOffer
              },
              leadContext: {
                name: lead?.name || resolvedContactName,
                companyName: lead?.companyName,
                decisionMaker: lead?.decisionMaker,
                niche: lead?.category,
                city: lead?.city,
                state: lead?.state,
                notes: lead?.notes
              },
              chatHistory: recentHistory,
              systemPrompt: settings.systemPrompt || settings.customSalesPrompt || 'Você é o assistente virtual da nossa empresa.',
              apiKey: settings.groqApiKey,
              model: settings.groqModel
            });

            replyText = generated;

            if (generated && generated.length > 10) {
              await semanticCacheService.save(text, generated, lead?.category || 'geral');
            }
          } catch (groqErr: any) {
            logger.error('AUTO-IA', 'Falha ao consultar Groq Llama:', groqErr?.message);
          }
        }
      }

      // 6. Envia a resposta personalizada pelo canal correspondente
      if (replyText && replyText.trim()) {
        const finalReply = groqService.replaceVariables(
          replyText,
          lead || { name: resolvedContactName, phone: cleanSender }
        );

        logger.info('AUTO-IA', `Disparando resposta via ${channel.toUpperCase()} para ${cleanSender}: "${finalReply}"`);

        if (channel === 'whatsapp') {
          const recipient = jid || cleanSender;
          try {
            await webviewBridge.setComposing(recipient, 2000);
          } catch {}
          await new Promise((r) => setTimeout(r, 1200));
          await webviewBridge.sendTextMessage(recipient, finalReply);

          await chatRepository.saveMessage({
            phone: cleanSender,
            jid,
            contactName: resolvedContactName,
            fromMe: true,
            body: finalReply,
            timestamp: Date.now(),
            status: 'sent'
          });
        } else {
          // Instagram Direct / Messenger
          await omnichannelService.sendMessage({
            contactId: cleanSender,
            channel,
            content: finalReply
          });
        }

        // Salva resposta no histórico unificado
        await omnichannelRepository.saveMessage({
          contactId: cleanSender,
          channel,
          direction: 'outgoing',
          sender: 'Minha Empresa',
          recipient: cleanSender,
          content: finalReply,
          timestamp: Date.now(),
          status: 'sent'
        });

        logger.info('AUTO-IA', `Auto-resposta [${channel.toUpperCase()}] entregue com sucesso para ${cleanSender}!`);
      }
    } catch (error: any) {
      logger.error('AUTO-IA', `Erro no processamento da auto-resposta (${senderLockKey}):`, error?.message);
    } finally {
      this.activeSenders.delete(senderLockKey);
    }
  }

  private async handleIncomingMessage(msg: IncomingMessageEvent) {
    if (!msg) return;
    await this.processOmniMessage({
      channel: 'whatsapp',
      sender: msg.from,
      body: msg.body,
      contactName: msg.pushName,
      fromMe: msg.fromMe,
      jid: msg.jid,
      timestamp: msg.timestamp
    });
  }
}

export const autoResponderService = new AutoResponderService();
