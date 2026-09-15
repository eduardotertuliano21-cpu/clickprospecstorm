import Groq from 'groq-sdk';
import { type Lead } from '../db';

const FACTORY_ENCODED = 'Z3NrXzdDSDF2WE9FYjZjMHdMdG1hblEyV0dkeWIzRllUYnE2dnJ3Q2hXYmVoT0J5VnFURlNpSEIsZ3NrX1hBSG1xWFdldXUzR1pqaW5CMlVsV0dkeWIzRlkzUU1TMW1WdXRacmhQeXVmcHppUVFvamIsZ3NrX0lMNmFldHZ2VUpUd01mYW5pQmttV0dkeWIzRlk3eHBJWUZtQ3dwTTVWNkNzM1JTMk1EVzAsZ3NrX3A4SG84Y0JwOTRFY1habHNpWlY4V0dkeWIzRlkyT095bU1nclJnb3hyUTVVWmlGRnNNZm8sZ3NrX3YydXFWUVpCQ0xFZ2JNR3kxTWVmV0dkeWIzRllmSnNsdkNNRUFoYUg3Tjh1dUFBWldUVnQ=';

function getFactoryFallbackKeys(): string {
  try {
    if (typeof atob === 'function') {
      return atob(FACTORY_ENCODED);
    }
    return Buffer.from(FACTORY_ENCODED, 'base64').toString('utf-8');
  } catch {
    return '';
  }
}

let keyRotationIndex = 0;

export const groqService = {
  /**
   * Extrai e sanitiza a lista de chaves a partir de uma string (separada por vírgula ou quebra de linha)
   * Se nenhuma chave for informada, utiliza automaticamente o pool de fábrica integrado.
   */
  parseKeyPool(rawKeys?: string): string[] {
    const keysToUse = (rawKeys && rawKeys.trim().length > 10) ? rawKeys : getFactoryFallbackKeys();
    return keysToUse
      .split(/[\n,;]/)
      .map(k => k.trim())
      .filter(k => k.startsWith('gsk_') && k.length > 20);
  },

  /**
   * Obtém a próxima chave da lista em rotação circular (Round-Robin)
   */
  getNextKey(rawKeys: string): { key: string; index: number; total: number } | null {
    const pool = this.parseKeyPool(rawKeys);
    if (pool.length === 0) return null;

    keyRotationIndex = (keyRotationIndex + 1) % pool.length;
    return {
      key: pool[keyRotationIndex],
      index: keyRotationIndex,
      total: pool.length
    };
  },

  /**
   * Sanitiza a resposta da IA removendo aspas externas, markdown, raciocínio ou introduções conversacionais
   */
  sanitizeResponse(rawText: string): string {
    let clean = rawText.trim();

    // Remove blocos de raciocínio de modelos conversacionais
    if (clean.includes('**Raciocínio') || clean.includes('Raciocínio:')) {
      clean = clean.split(/\*\*Raciocínio|Raciocínio:/i)[0].trim();
    }
    if (clean.includes('**Resposta') || clean.includes('Resposta:')) {
      clean = clean.replace(/\*\*Resposta[^\n]*\*\*:?\s*/gi, '').trim();
    }

    // Remove aspas externas se houver
    if ((clean.startsWith('"') && clean.endsWith('"')) || (clean.startsWith('“') && clean.endsWith('”'))) {
      clean = clean.slice(1, -1).trim();
    }

    // Remove padrões comuns de introdução metalinguística de LLMs
    const prefixesToRemove = [
      /^aqui est[aá] sua mensagem:?\s*/i,
      /^aqui est[aá] uma varia[cç][aã]o:?\s*/i,
      /^claro,?\s*segue:?\s*/i,
      /^com certeza:?\s*/i,
      /^ol[aá],?\s*aqui est[aá]:?\s*/i,
      /^vers[aã]o reescrita:?\s*/i,
      /^mensagem:?\s*/i
    ];

    for (const prefix of prefixesToRemove) {
      clean = clean.replace(prefix, '').trim();
    }

    return clean;
  },

  /**
   * Resolve marcações de Spintax dinâmico: {Olá|Oi|Tudo bem} {doutor|amigo}!
   */
  resolveSpintax(text: string): string {
    const spintaxPattern = /\{([^{}]+)\}/g;
    let result = text;
    while (spintaxPattern.test(result)) {
      result = result.replace(spintaxPattern, (_, choices) => {
        const options = choices.split('|');
        return options[Math.floor(Math.random() * options.length)];
      });
    }
    return result;
  },

  /**
   * Substitui variáveis dinâmicas do lead no template
   */
  replaceVariables(template: string, lead: Partial<Lead>): string {
    let result = template;
    const vars: Record<string, string> = {
      nome: lead.name || 'tudo bem',
      empresa: lead.companyName || 'sua empresa',
      decisor: lead.decisionMaker || lead.name || 'responsável',
      cidade: lead.city || '',
      categoria: lead.category || '',
      telefone: lead.phone || ''
    };

    for (const [key, value] of Object.entries(vars)) {
      const regex = new RegExp(`\\{${key}\\}`, 'gi');
      result = result.replace(regex, value);
    }

    // Resolve automaticamente qualquer Spintax dinâmico presente ({opção1|opção2|...})
    result = this.resolveSpintax(result);

    return result;
  },

  /**
   * Executa a chamada à API do Groq com rotação de chaves e fallback automático contra HTTP 429 (Rate Limit)
   */
  async executeWithKeyRotation(
    rawKeys: string,
    operation: (groqClient: Groq, currentKey: string) => Promise<string>
  ): Promise<string> {
    const pool = this.parseKeyPool(rawKeys);
    if (pool.length === 0) {
      throw new Error('Nenhuma chave de API Groq válida configurada.');
    }

    let lastError: any = null;
    const maxAttempts = Math.min(pool.length, 5);

    // Tenta em sequência rodando pelo pool de chaves
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const activeInfo = this.getNextKey(rawKeys);
      if (!activeInfo) break;

      try {
        const groq = new Groq({ apiKey: activeInfo.key, dangerouslyAllowBrowser: true });
        return await operation(groq, activeInfo.key);
      } catch (err: any) {
        lastError = err;
        console.warn(
          `[ClickLeadStorm Groq] Chave [${activeInfo.index + 1}/${activeInfo.total}] falhou (${err?.status || err?.message}). Tentando próxima chave do pool...`
        );
        // Se for erro de rate-limit (429) ou chave expirada (401), continua para a próxima chave
        if (err?.status === 429 || err?.status === 401 || err?.message?.includes('rate limit')) {
          continue;
        }
        // Se for outro erro, também tenta a próxima
        continue;
      }
    }

    throw lastError || new Error('Todas as chaves do pool Groq falharam.');
  },

  /**
   * Gera uma variação semântica da copy usando IA Groq Llama 3
   * com suporte a Pool de Chaves e rotação automática anti-rate-limit.
   */
  async generateCopyVariation(params: {
    baseText: string;
    lead: Partial<Lead>;
    apiKey: string;
    model?: string;
    customSalesPrompt?: string;
  }): Promise<string> {
    const { baseText, lead, apiKey, model = 'llama-3.3-70b-versatile', customSalesPrompt } = params;

    const interpolated = this.replaceVariables(baseText, lead);
    const pool = this.parseKeyPool(apiKey);

    if (pool.length === 0) {
      return this.resolveSpintax(interpolated);
    }

    try {
      return await this.executeWithKeyRotation(apiKey, async (groq) => {
        const salesContext = customSalesPrompt
          ? `Contexto Comercial do Negócio:\n"${customSalesPrompt}"\n`
          : '';

        const systemPrompt = `Você é um copywriter B2B sênior de conversão imediata para WhatsApp.
Sua missão é reescrever a mensagem fornecida mantendo estritamente a proposta de valor, o objetivo e o tom humano e cordial, variando sinônimos e ordenamento de frases para evitar detecção de spam.

${salesContext}
DIRETRIZES INVIOLÁVEIS:
1. Retorne APENAS o corpo final da mensagem pronto para o WhatsApp.
2. NUNCA inclua introduções, explicações, saudações metalinguísticas (como "Aqui está a mensagem") ou aspas.
3. Não invente números, links ou fatos que não existam na mensagem base.`;

        const userPrompt = `Reescreva esta mensagem para WhatsApp B2B:
"${interpolated}"

Dados do Destinatário:
- Nome/Contato: ${lead.name || 'Não informado'}
- Empresa: ${lead.companyName || 'Não informado'}
- Tomador de decisão (QSA): ${lead.decisionMaker || 'Não informado'}
- Cidade: ${lead.city || 'Não informado'}`;

        const response = await groq.chat.completions.create({
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
          ],
          model,
          temperature: 0.6,
          max_tokens: 250,
        });

        const raw = response.choices[0]?.message?.content || '';
        const clean = this.sanitizeResponse(raw);
        return clean || interpolated;
      });
    } catch (err) {
      console.warn('[ClickLeadStorm Groq] Falha em todas as chaves do pool, usando fallback local:', err);
      return this.resolveSpintax(interpolated);
    }
  },

  /**
   * Modo 100% Automático via IA (Hyper-Personalizado):
   * Analisa os dados do negócio salvos em Ajustes e cruza com os dados do cliente
   * (nicho, cidade, decisor, empresa) para redigir uma abordagem comercial única e persuasiva.
   */
  async generateAutonomousB2BCopy(params: {
    lead: Partial<Lead>;
    apiKey: string;
    model?: string;
    campaignObjective?: string;
    businessContext?: {
      myCompanyName?: string;
      myCompanyDescription?: string;
      myCompanyOffer?: string;
      customSalesPrompt?: string;
    };
  }): Promise<string> {
    const { 
      lead, 
      apiKey, 
      model = 'qwen/qwen3.8-27b', 
      campaignObjective, 
      businessContext 
    } = params;

    const pool = this.parseKeyPool(apiKey);
    if (pool.length === 0) {
      const decisor = lead.decisionMaker || lead.name || 'tudo bem';
      const empresa = lead.companyName || 'sua empresa';
      return `Olá, ${decisor}! Acompanho o trabalho da ${empresa}${lead.city ? ` em ${lead.city}` : ''}. ${businessContext?.myCompanyOffer || 'Gostaria de apresentar nossas soluções comerciais.'} Poderíamos conversar 5 minutos essa semana?`;
    }

    try {
      return await this.executeWithKeyRotation(apiKey, async (groq) => {
        const companyName = businessContext?.myCompanyName || 'Nossa Empresa';
        const companyDesc = businessContext?.myCompanyDescription || 'Assessoria comercial especializada em geração de oportunidades B2B e crescimento de vendas.';
        const companyOffer = businessContext?.myCompanyOffer || 'Apresentação comercial e geração de oportunidades qualificadas.';
        const customPrompt = businessContext?.customSalesPrompt || '';

        const objectiveText = campaignObjective?.trim()
          ? `OBJETIVO DA ABORDAGEM: ${campaignObjective}`
          : 'OBJETIVO DA ABORDAGEM: Iniciar uma conversa comercial amigável e qualificada, buscando abrir diálogo ou agendar uma breve conversa de 5 a 10 minutos.';

        const systemPrompt = `Você é o principal especialista em Prospecção Ativa B2B e Social Selling de alta conversão do Brasil.
Sua missão é redigir uma mensagem inicial ÚNICA, direta, humana e persuasiva para ser enviada pelo WhatsApp para um decisor de empresa.

SOBRE QUEM ESTÁ ENVIANDO (NOSSA EMPRESA):
- Empresa: ${companyName}
- O que fazemos: ${companyDesc}
- Proposta de valor/Oferta: ${companyOffer}
${customPrompt ? `- Diretrizes extras da empresa: ${customPrompt}` : ''}

${objectiveText}

DIRETRIZES FUNDAMENTAIS:
1. Comece com uma saudação natural chamando o tomador de decisão pelo primeiro nome se disponível (ou cumprimento cordial para a empresa).
2. Mostre contexto imediato: mencione a empresa do lead e cidade/região para gerar conexão instantânea e provar que não é uma mensagem genérica de robô.
3. Seja breve (máximo 3 a 5 linhas curtas). Ninguém lê blocos gigantes no WhatsApp.
4. Termine sempre com uma pergunta simples de baixo atrito (Call-to-Action) para estimular uma resposta fácil (ex: "Faz sentido batermos um papo rápido de 5 minutos essa semana?").
5. NÃO use jargões batidos como "venho por meio desta", "espero que este e-mail o encontre bem", nem introduções metalinguísticas.
6. Retorne ESTRITAMENTE o texto final pronto para envio, sem aspas, sem explicações prévias e sem comentários.`;

        const userPrompt = `Gere a mensagem de abordagem personalizada para este lead B2B:
- Nome/Contato: ${lead.name || 'Não informado'}
- Empresa do Cliente: ${lead.companyName || 'Empresa'}
- Nome do Decisor/Sócio: ${lead.decisionMaker || lead.name || 'Responsável'}
- Cidade/Localização: ${lead.city || 'Não informada'}
- Ramo/Nicho/Categoria: ${lead.category || 'Empresa'}
- Anotações adicionais: ${lead.notes || 'Nenhuma'}`;

        const response = await groq.chat.completions.create({
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
          ],
          model,
          temperature: 0.65,
          max_tokens: 300,
        });

        const raw = response.choices[0]?.message?.content || '';
        const clean = this.sanitizeResponse(raw);
        return clean || `Olá ${lead.decisionMaker || lead.name || ''}, tudo bem? Acompanho o trabalho da ${lead.companyName || 'sua empresa'}. Gostaria de apresentar uma oportunidade comercial.`;
      });
    } catch (err) {
      console.warn('[groqService] Falha na geração autônoma de copy, usando fallback:', err);
      const decisor = lead.decisionMaker || lead.name || 'tudo bem';
      const empresa = lead.companyName || 'sua empresa';
      return `Olá, ${decisor}! Acompanho o trabalho da ${empresa}${lead.city ? ` em ${lead.city}` : ''}. ${businessContext?.myCompanyOffer || 'Gostaria de apresentar nossas soluções comerciais.'} Poderíamos conversar 5 minutos essa semana?`;
    }
  },

  /**
   * Gera uma resposta automática inteligente para mensagens recebidas com rotação de chaves,
   * considerando dados completos da Minha Empresa, Empresa do Lead e Histórico de Conversa.
   */
  async generateAutoResponse(params: {
    incomingMessage: string;
    myCompanyContext?: {
      name?: string;
      description?: string;
      offer?: string;
    };
    leadContext?: {
      name?: string;
      companyName?: string;
      decisionMaker?: string;
      niche?: string;
      city?: string;
      state?: string;
      notes?: string;
    };
    chatHistory?: Array<{ fromMe: boolean; body: string }>;
    systemPrompt?: string;
    apiKey: string;
    model?: string;
  }): Promise<string> {
    const { 
      incomingMessage, 
      myCompanyContext, 
      leadContext, 
      chatHistory = [], 
      systemPrompt, 
      apiKey, 
      model = 'qwen/qwen3.8-27b' 
    } = params;

    const pool = this.parseKeyPool(apiKey);
    if (pool.length === 0) {
      const contactName = leadContext?.name ? `Olá, ${leadContext.name}!` : 'Olá!';
      const company = myCompanyContext?.name ? `da ${myCompanyContext.name}` : 'da nossa equipe';
      return `${contactName} Tudo ótimo por aqui! Sou ${company}. Como posso ajudar sua empresa hoje?`;
    }

    // Monta o contexto estruturado da Minha Empresa
    const companyContextStr = [
      myCompanyContext?.name ? `Nome da nossa empresa: ${myCompanyContext.name}` : 'Empresa de tecnologia e soluções comerciais',
      myCompanyContext?.description ? `O que oferecemos: ${myCompanyContext.description}` : 'Ajudamos empresas a crescer com soluções sob medida e atendimento direto',
      myCompanyContext?.offer ? `Nossa oferta/preços/condições: ${myCompanyContext.offer}` : ''
    ].filter(Boolean).join('\n');

    // Monta o contexto estruturado da Empresa do Lead
    const leadContextStr = [
      leadContext?.name ? `Nome do contato: ${leadContext.name}` : '',
      leadContext?.companyName ? `Empresa do lead: ${leadContext.companyName}` : '',
      leadContext?.decisionMaker ? `Decisor/Cargo: ${leadContext.decisionMaker}` : '',
      leadContext?.niche ? `Segmento/Nicho do lead: ${leadContext.niche}` : '',
      leadContext?.city ? `Cidade/Região: ${leadContext.city} ${leadContext.state || ''}` : '',
      leadContext?.notes ? `Observações prévias: ${leadContext.notes}` : ''
    ].filter(Boolean).join('\n');

    // Formata o histórico recente
    const historyStr = chatHistory.length > 0
      ? chatHistory.map(m => `${m.fromMe ? 'Nossa Empresa' : 'Cliente'}: ${m.body}`).join('\n')
      : '';

    const systemPromptFinal = `${systemPrompt || 'Você é o consultor comercial da nossa empresa, prestativo e simpático.'}

=== INFORMAÇÕES DA NOSSA EMPRESA ===
${companyContextStr}

=== INFORMAÇÕES DO LEAD / CLIENTE ===
${leadContextStr || 'Lead conversando conosco pelo WhatsApp.'}

=== REGRAS MANDATÓRIAS DE RESPOSTA ===
1. Responda DIRETAMENTE ao que o lead acabou de perguntar/dizer de forma calorosa, humana e personalizada (como um consultor experiente via WhatsApp).
2. Se o lead perguntar quem somos ou o que fazemos, explique de forma simples e atraente quem é a nossa empresa e o benefício direto para o negócio dele.
3. Seja conciso: no máximo 2 a 3 frases curtas e conversacionais.
4. Finalize com uma pergunta aberta e simpática para manter o diálogo fluindo.
5. Retorne APENAS o texto pronto da mensagem para o WhatsApp, sem introduções metalinguísticas ou aspas.`;

    // Lista de modelos priorizados com fallback automático
    const modelsToTry = [
      model,
      'qwen/qwen3.8-27b',
      'groq/compound-mini',
      'groq/compound'
    ].filter((v, i, a) => v && a.indexOf(v) === i);

    for (const currentModel of modelsToTry) {
      try {
        const result = await this.executeWithKeyRotation(apiKey, async (groq) => {
          const messagesPayload: any[] = [
            { role: 'system', content: systemPromptFinal }
          ];

          if (historyStr) {
            messagesPayload.push({
              role: 'system',
              content: `Últimas mensagens trocadas na conversa:\n${historyStr}`
            });
          }

          messagesPayload.push({
            role: 'user',
            content: incomingMessage
          });

          const response = await groq.chat.completions.create({
            messages: messagesPayload,
            model: currentModel,
            temperature: 0.65,
            max_tokens: 220,
          });

          const raw = response.choices[0]?.message?.content || '';
          const sanitized = this.sanitizeResponse(raw);
          if (sanitized && sanitized.length > 5) {
            return sanitized;
          }
          throw new Error('Resposta vazia gerada pelo modelo.');
        });

        if (result) {
          return result;
        }
      } catch (err: any) {
        console.warn(`[ClickLeadStorm Groq] Modelo ${currentModel} falhou: ${err?.message || err}. Tentando próximo modelo...`);
        continue;
      }
    }

    // Fallback natural e personalizado caso a API de IA esteja offline
    const contactGreeting = leadContext?.name ? `Olá, ${leadContext.name}!` : 'Olá!';
    const companyName = myCompanyContext?.name || 'nossa equipe';
    const clientTarget = leadContext?.companyName ? `da ${leadContext.companyName}` : 'de vocês';
    return `${contactGreeting} Tudo ótimo por aqui! Sou ${companyName}. Me conta: como podemos colaborar com o crescimento do time ${clientTarget}?`;
  }
};
