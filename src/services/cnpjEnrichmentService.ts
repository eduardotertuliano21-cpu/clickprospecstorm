export interface QsaMember {
  nome: string;
  qualificacao: string;
  isDecisionMaker?: boolean;
}

export interface EnrichedCnpjData {
  cnpj: string;
  razaoSocial: string;
  nomeFantasia: string;
  situacaoCadastral: string;
  decisionMaker: string;
  qsa: QsaMember[];
  phone?: string;
  email?: string;
  address?: string;
  city?: string;
  state?: string;
  cnaePrincipal?: string;
}

let lastRequestTimestamp = 0;

export const cnpjEnrichmentService = {
  /**
   * Garante throttle obrigatório de 1500ms a 2000ms entre requisições
   * para mitigar bloqueios por HTTP 429 nas APIs públicas
   */
  async throttleRateLimit(): Promise<void> {
    const now = Date.now();
    const elapsed = now - lastRequestTimestamp;
    const requiredWait = 1800; // 1.8 segundos

    if (elapsed < requiredWait) {
      await new Promise(r => setTimeout(r, requiredWait - elapsed));
    }
    lastRequestTimestamp = Date.now();
  },

  /**
   * Limpa formatação de CNPJ mantendo apenas os 14 dígitos numéricos
   */
  sanitizeCnpj(raw: string): string {
    return raw.replace(/\D/g, '').padStart(14, '0').slice(-14);
  },

  /**
   * Consulta dados do CNPJ na BrasilAPI com fallback para MinhaReceita
   */
  async consultCnpj(rawCnpj: string): Promise<EnrichedCnpjData | null> {
    const cleanCnpj = this.sanitizeCnpj(rawCnpj);
    if (cleanCnpj.length !== 14) {
      throw new Error('CNPJ inválido. Forneça exatamente 14 dígitos.');
    }

    // Aplica o throttle anti-429
    await this.throttleRateLimit();

    try {
      // 1. BrasilAPI
      const res = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cleanCnpj}`);
      if (res.ok) {
        const data = await res.json();
        return this.parseBrasilApiResponse(data);
      }
    } catch (e) {
      console.warn('[ClickLeadStorm CNPJ] Falha na BrasilAPI, tentando MinhaReceita...', e);
    }

    // Novo throttle antes do fallback
    await this.throttleRateLimit();

    try {
      // 2. Minha Receita
      const resFallback = await fetch(`https://minhareceita.org/${cleanCnpj}`);
      if (resFallback.ok) {
        const data = await resFallback.json();
        return this.parseMinhaReceitaResponse(data);
      }
    } catch (e) {
      console.error('[ClickLeadStorm CNPJ] Falha em ambas as fontes públicas de CNPJ:', e);
    }

    return null;
  },

  /**
   * Identifica o tomador de decisão prioritário pelo cargo
   * Se vazio (ex: MEI), aplica fallback seguro: "Responsável pela {empresa}"
   */
  findMainDecisionMaker(qsa: QsaMember[], companyName: string): string {
    if (!qsa || qsa.length === 0) {
      return `Responsável pela ${companyName}`;
    }

    const priorities = [
      /s[oó]cio-administrador/i,
      /administrador/i,
      /diretor/i,
      /presidente/i,
      /titular/i,
      /s[oó]cio/i
    ];

    for (const regex of priorities) {
      const match = qsa.find(m => regex.test(m.qualificacao));
      if (match && match.nome) {
        return this.formatCapitalizedName(match.nome);
      }
    }

    return qsa[0]?.nome
      ? this.formatCapitalizedName(qsa[0].nome)
      : `Responsável pela ${companyName}`;
  },

  formatCapitalizedName(rawName: string): string {
    const lowerExceptions = ['de', 'da', 'do', 'dos', 'das', 'e'];
    return rawName
      .toLowerCase()
      .split(' ')
      .filter(Boolean)
      .map((word, idx) => {
        if (idx > 0 && lowerExceptions.includes(word)) return word;
        return word.charAt(0).toUpperCase() + word.slice(1);
      })
      .join(' ');
  },

  parseBrasilApiResponse(data: any): EnrichedCnpjData {
    const qsa: QsaMember[] = (data.qsa || []).map((m: any) => ({
      nome: m.nome_socio || m.nome || '',
      qualificacao: m.qualificacao_socio || m.qualificacao_representante_legal || 'Sócio'
    }));

    const companyName = data.nome_fantasia || data.razao_social || 'Empresa';
    const decisionMaker = this.findMainDecisionMaker(qsa, companyName);

    let phone = '';
    if (data.ddd_telefone_1) {
      const digits = data.ddd_telefone_1.replace(/\D/g, '');
      phone = digits.startsWith('55') ? digits : `55${digits}`;
    }

    const address = [data.descricao_tipo_de_logradouro, data.logradouro, data.numero, data.bairro]
      .filter(Boolean)
      .join(' ');

    return {
      cnpj: data.cnpj,
      razaoSocial: data.razao_social,
      nomeFantasia: companyName,
      situacaoCadastral: data.descricao_situacao_cadastral || 'ATIVA',
      decisionMaker,
      qsa,
      phone,
      email: data.email || undefined,
      address,
      city: data.municipio,
      state: data.uf,
      cnaePrincipal: data.cnae_fiscal_descricao
    };
  },

  parseMinhaReceitaResponse(data: any): EnrichedCnpjData {
    const qsa: QsaMember[] = (data.qsa || []).map((m: any) => ({
      nome: m.nome_socio || '',
      qualificacao: m.qualificacao_socio || 'Sócio'
    }));

    const companyName = data.nome_fantasia || data.razao_social || 'Empresa';
    const decisionMaker = this.findMainDecisionMaker(qsa, companyName);

    let phone = '';
    if (data.ddd_telefone_1) {
      const digits = data.ddd_telefone_1.replace(/\D/g, '');
      phone = digits.startsWith('55') ? digits : `55${digits}`;
    }

    const address = [data.logradouro, data.numero, data.bairro].filter(Boolean).join(' ');

    return {
      cnpj: data.cnpj,
      razaoSocial: data.razao_social,
      nomeFantasia: companyName,
      situacaoCadastral: data.descricao_situacao_cadastral || 'ATIVA',
      decisionMaker,
      qsa,
      phone,
      email: data.email || undefined,
      address,
      city: data.municipio,
      state: data.uf,
      cnaePrincipal: data.cnae_fiscal_descricao
    };
  },

  /**
   * Busca inteligente de CNPJ a partir do nome da empresa e cidade
   * Consultando buscadores via IPC do Electron e enriquecendo com a Receita Federal / BrasilAPI
   */
  async searchCnpjByNameAndCity(companyName: string, city?: string): Promise<EnrichedCnpjData | null> {
    try {
      let foundCnpj: string | null = null;

      if (typeof window !== 'undefined' && (window as any).electronAPI?.findCompanyCnpj) {
        foundCnpj = await (window as any).electronAPI.findCompanyCnpj({ companyName, city });
      }

      if (!foundCnpj) {
        // Fallback direto via fetch se não estiver em Electron
        const q = encodeURIComponent(`"${companyName}" ${city || ''} CNPJ`);
        const res = await fetch(`https://html.duckduckgo.com/html/?q=${q}`);
        if (res.ok) {
          const text = await res.text();
          const match = text.match(/\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}/);
          if (match) foundCnpj = match[0];
        }
      }

      if (foundCnpj) {
        return await this.consultCnpj(foundCnpj);
      }
      return null;
    } catch (err) {
      console.warn(`[CNPJ Enrichment] Não foi possível localizar CNPJ para "${companyName}":`, err);
      return null;
    }
  }
};
