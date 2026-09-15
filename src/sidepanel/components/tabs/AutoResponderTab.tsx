import React, { useState, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type AutoResponderRule, type TriggerMatchType } from '../../../db';
import { autoResponderRepository } from '../../../db/repositories/autoResponderRepository';
import { settingsRepository } from '../../../db/repositories/settingsRepository';
import { autoResponderService } from '../../../services/autoResponderService';
import { groqService } from '../../../services/groqService';
import { 
  Bot, 
  Plus, 
  Trash2, 
  Power, 
  Sparkles, 
  CheckCircle2, 
  AlertCircle,
  HelpCircle,
  Play,
  RotateCcw,
  X,
  Layers,
  MessageSquareText
} from 'lucide-react';

export const AutoResponderTab: React.FC = () => {
  const [isActive, setIsActive] = useState(false);
  const [aiFallbackActive, setAiFallbackActive] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);

  // Form State
  const [ruleTitle, setRuleTitle] = useState('');
  const [keywords, setKeywords] = useState('');
  const [matchType, setMatchType] = useState<TriggerMatchType>('contains');
  const [responseTemplate, setResponseTemplate] = useState('');
  const [useAi, setUseAi] = useState(false);
  const [aiPrompt, setAiPrompt] = useState(
    'Responda de forma extremamente cordial e consultiva, convidando o cliente para uma conversa.'
  );

  // Simulador State
  const [simInput, setSimInput] = useState('');
  const [simOutput, setSimOutput] = useState<{ matchedRule?: string; reply?: string } | null>(null);
  const [isSimulating, setIsSimulating] = useState(false);

  const rules = useLiveQuery(async () => {
    return await autoResponderRepository.getRules();
  }, []) || [];

  useEffect(() => {
    settingsRepository.getSettings().then((s) => {
      const active = !!s.autoResponderActive;
      setIsActive(active);
      setAiFallbackActive(s.autoResponderAiFallback !== false);
      if (typeof window !== 'undefined' && (window as any).electronAPI?.setTrayAutoResponderStatus) {
        (window as any).electronAPI.setTrayAutoResponderStatus(active);
      }
    });

    if (typeof window !== 'undefined' && (window as any).electronAPI?.onTrayAutoResponderChanged) {
      const unsub = (window as any).electronAPI.onTrayAutoResponderChanged(async (enabled: boolean) => {
        setIsActive(enabled);
        await settingsRepository.updateSettings({ autoResponderActive: enabled });
      });
      return unsub;
    }
  }, []);

  const handleToggleMaster = async () => {
    const next = !isActive;
    setIsActive(next);
    await settingsRepository.updateSettings({ autoResponderActive: next });
    if (typeof window !== 'undefined' && (window as any).electronAPI?.setTrayAutoResponderStatus) {
      (window as any).electronAPI.setTrayAutoResponderStatus(next);
    }
  };

  const handleToggleAiFallback = async () => {
    const next = !aiFallbackActive;
    setAiFallbackActive(next);
    await settingsRepository.updateSettings({ autoResponderAiFallback: next });
  };

  const handleLoadDefaultRules = async () => {
    await autoResponderService.seedDefaultRulesIfEmpty();
  };

  const handleToggleRule = async (rule: AutoResponderRule) => {
    if (rule.id) {
      await autoResponderRepository.updateRule(rule.id, { active: !rule.active });
    }
  };

  const handleDeleteRule = async (id: number) => {
    if (confirm('Deseja realmente remover esta regra?')) {
      await autoResponderRepository.deleteRule(id);
    }
  };

  const handleCreateRule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ruleTitle.trim() || (!responseTemplate.trim() && !useAi)) return;

    const kwList = keywords
      .split(',')
      .map((k) => k.trim().toLowerCase())
      .filter(Boolean);

    await autoResponderRepository.addRule({
      title: ruleTitle.trim(),
      triggerKeywords: kwList,
      matchType,
      responseTemplate: responseTemplate.trim(),
      useAi,
      aiPrompt: useAi ? aiPrompt.trim() : undefined,
      active: true
    });

    setRuleTitle('');
    setKeywords('');
    setResponseTemplate('');
    setUseAi(false);
    setShowAddModal(false);
  };

  const handleSimulate = async () => {
    if (!simInput.trim()) return;
    setIsSimulating(true);
    setSimOutput(null);

    const textLower = simInput.toLowerCase().trim();
    const enabledRules = rules.filter((r) => r.active);
    let matchedRule: AutoResponderRule | null = null;

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
        matchedRule = rule;
        break;
      }
    }

    if (matchedRule) {
      let reply = matchedRule.responseTemplate;
      if (matchedRule.useAi) {
        const settings = await settingsRepository.getSettings();
        if (settings.groqApiKey) {
          reply = await groqService.generateAutoResponse({
            incomingMessage: simInput,
            systemPrompt: matchedRule.aiPrompt || settings.systemPrompt || '',
            apiKey: settings.groqApiKey,
            model: settings.groqModel
          });
        }
      }
      setSimOutput({
        matchedRule: matchedRule.title,
        reply: groqService.replaceVariables(reply, { name: 'Cliente Teste' })
      });
    } else if (aiFallbackActive) {
      const settings = await settingsRepository.getSettings();
      let reply = 'Olá! Recebemos sua mensagem e um de nossos consultores responderá em instantes.';
      if (settings.groqApiKey) {
        reply = await groqService.generateAutoResponse({
          incomingMessage: simInput,
          systemPrompt: settings.systemPrompt || 'Você é o assistente virtual da nossa empresa.',
          apiKey: settings.groqApiKey,
          model: settings.groqModel
        });
      }
      setSimOutput({
        matchedRule: 'IA Autônoma (Fallback Llama 3)',
        reply
      });
    } else {
      setSimOutput({
        matchedRule: undefined,
        reply: 'Nenhuma regra coincidiu e o Fallback de IA está desligado.'
      });
    }

    setIsSimulating(false);
  };

  return (
    <div className="flex-1 overflow-y-auto bg-slate-950 p-6 space-y-6 max-w-6xl mx-auto">
      {/* 1. HERO MASTER CARD */}
      <div className="bg-gradient-to-r from-slate-900 to-slate-900/70 border border-slate-800 rounded-2xl p-5 shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-start gap-3.5">
          <div
            className={`w-11 h-11 rounded-xl flex items-center justify-center text-white shadow-lg transition-all ${
              isActive
                ? 'bg-gradient-to-tr from-emerald-600 to-teal-400 shadow-emerald-500/20 animate-pulse'
                : 'bg-slate-800 text-slate-400'
            }`}
          >
            <Bot className="w-6 h-6" />
          </div>

          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold text-slate-100">Auto-Responder com IA</h2>
              <span
                className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider border ${
                  isActive
                    ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                    : 'bg-slate-800 text-slate-400 border-slate-700'
                }`}
              >
                {isActive ? 'Ativo 24/7' : 'Pausado'}
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-1 max-w-xl leading-relaxed">
              Monitora continuamente novas mensagens recebidas no WhatsApp e responde leads de forma autônoma e humanizada, mesmo com o app em segundo plano.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 self-end md:self-auto">
          {rules.length === 0 && (
            <button
              onClick={handleLoadDefaultRules}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 text-xs font-semibold transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Carregar Regras Padrão</span>
            </button>
          )}

          <button
            onClick={handleToggleMaster}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold transition-all shadow-lg ${
              isActive
                ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-600/25'
                : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700'
            }`}
          >
            <Power className="w-4 h-4" />
            <span>{isActive ? 'Ligado' : 'Ativar Auto-IA'}</span>
          </button>
        </div>
      </div>

      {/* 2. CARD DO MODO IA AUTÔNOMA (FALLBACK LLAMA 3) */}
      <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-4 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 flex-shrink-0">
            <Sparkles className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-xs font-bold text-slate-200">
                Resposta Inteligente Autônoma (Fallback com IA)
              </h3>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-500/10 text-indigo-300 border border-indigo-500/20 font-mono">
                Groq Llama 3
              </span>
            </div>
            <p className="text-[11px] text-slate-400 mt-0.5">
              Quando uma mensagem recebida não bater com nenhuma palavra-chave cadastrada, a IA analisa a dúvida e responde com cordialidade automaticamente.
            </p>
          </div>
        </div>

        <button
          onClick={handleToggleAiFallback}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
            aiFallbackActive
              ? 'bg-indigo-600/20 text-indigo-300 border-indigo-500/30'
              : 'bg-slate-800 text-slate-500 border-slate-700'
          }`}
        >
          {aiFallbackActive ? 'Habilitado' : 'Desabilitado'}
        </button>
      </div>

      {/* 3. SEÇÃO DE REGRAS CADASTRADAS */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-emerald-400" />
            <h3 className="text-sm font-bold text-slate-200">Regras de Palavras-chave</h3>
            <span className="text-xs px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 border border-slate-700 font-semibold">
              {rules.length}
            </span>
          </div>

          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold shadow-md shadow-emerald-600/20 transition-all"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Nova Regra</span>
          </button>
        </div>

        {rules.length === 0 ? (
          <div className="border border-dashed border-slate-800 rounded-2xl p-8 text-center flex flex-col items-center justify-center">
            <MessageSquareText className="w-10 h-10 text-slate-600 mb-2" />
            <h4 className="text-sm font-bold text-slate-300">Nenhuma regra cadastrada</h4>
            <p className="text-xs text-slate-500 mt-1 max-w-md">
              Você pode cadastrar regras personalizadas para disparar mensagens prontas quando o cliente enviar palavras específicas (ex: "preço", "orçamento").
            </p>
            <div className="flex gap-3 mt-4">
              <button
                onClick={handleLoadDefaultRules}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-750 text-emerald-400 border border-slate-700 text-xs font-semibold transition-colors"
              >
                Carregar 3 Regras Recomendadas
              </button>
              <button
                onClick={() => setShowAddModal(true)}
                className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold transition-colors shadow-md shadow-emerald-600/20"
              >
                Criar Regra Manual
              </button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
            {rules.map((rule) => (
              <div
                key={rule.id}
                className={`bg-slate-900 border rounded-2xl p-4 transition-all ${
                  rule.active
                    ? 'border-slate-800 hover:border-slate-700'
                    : 'border-slate-850 opacity-60'
                }`}
              >
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div>
                    <h4 className="text-xs font-bold text-slate-100">{rule.title}</h4>
                    <span className="text-[10px] text-slate-500 uppercase tracking-wider">
                      Tipo: {rule.matchType === 'contains' ? 'Contém palavra' : 'Exato'}
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => handleToggleRule(rule)}
                      className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase transition-colors ${
                        rule.active
                          ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                          : 'bg-slate-800 text-slate-500 border border-slate-700'
                      }`}
                    >
                      {rule.active ? 'Ativa' : 'Pausada'}
                    </button>

                    <button
                      onClick={() => rule.id && handleDeleteRule(rule.id)}
                      className="p-1 hover:bg-rose-500/20 text-slate-500 hover:text-rose-400 rounded transition-colors"
                      title="Excluir regra"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Palavras-chave Chips */}
                <div className="flex flex-wrap gap-1.5 mb-3">
                  {rule.triggerKeywords.map((kw, i) => (
                    <span
                      key={i}
                      className="px-2 py-0.5 rounded-md bg-slate-800 text-[10px] font-mono text-slate-300 border border-slate-700/60"
                    >
                      {kw}
                    </span>
                  ))}
                </div>

                {/* Preview da Resposta */}
                <div className="bg-slate-950/70 border border-slate-800/80 rounded-xl p-2.5 text-[11px] text-slate-300 leading-relaxed">
                  <p className="line-clamp-2">{rule.responseTemplate}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 4. SIMULADOR DE RESPOSTAS */}
      <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-5">
        <div className="flex items-center gap-2 mb-2">
          <Play className="w-4 h-4 text-emerald-400" />
          <h3 className="text-xs font-bold text-slate-200">Simulador de Resposta em Tempo Real</h3>
        </div>
        <p className="text-[11px] text-slate-400 mb-3">
          Digite qualquer mensagem como se fosse um cliente para testar qual regra será acionada e o que o bot responderá.
        </p>

        <div className="flex gap-2">
          <input
            type="text"
            placeholder="Ex: olá gostaria de saber o preço..."
            value={simInput}
            onChange={(e) => setSimInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSimulate()}
            className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-4 py-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-emerald-500"
          />
          <button
            onClick={handleSimulate}
            disabled={!simInput.trim() || isSimulating}
            className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-750 text-emerald-400 border border-emerald-500/30 text-xs font-semibold transition-colors disabled:opacity-50"
          >
            {isSimulating ? 'Testando...' : 'Testar'}
          </button>
        </div>

        {simOutput && (
          <div className="mt-3.5 p-3.5 rounded-xl bg-slate-950 border border-slate-800">
            {simOutput.matchedRule ? (
              <div className="flex items-center gap-2 text-[11px] text-emerald-400 font-semibold mb-1">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Regra Identificada: {simOutput.matchedRule}</span>
              </div>
            ) : (
              <div className="flex items-center gap-2 text-[11px] text-amber-400 font-semibold mb-1">
                <AlertCircle className="w-3.5 h-3.5" />
                <span>Nenhuma regra direta acionada</span>
              </div>
            )}
            <p className="text-xs text-slate-200 mt-1 pl-5 border-l-2 border-emerald-500/50 leading-relaxed whitespace-pre-wrap">
              {simOutput.reply}
            </p>
          </div>
        )}
      </div>

      {/* MODAL DE CRIAÇÃO DE REGRA */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fadeIn">
          <div className="bg-slate-900 border border-slate-800 w-full max-w-lg rounded-2xl shadow-2xl p-6">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-4">
              <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
                <Plus className="w-4 h-4 text-emerald-400" />
                Criar Nova Regra de Resposta
              </h3>
              <button
                onClick={() => setShowAddModal(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateRule} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Nome da Regra:
                </label>
                <input
                  type="text"
                  placeholder="Ex: Informações de Preço"
                  value={ruleTitle}
                  onChange={(e) => setRuleTitle(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Palavras-chave Gatilho (separadas por vírgula):
                </label>
                <input
                  type="text"
                  placeholder="Ex: preco, preço, valor, quanto custa"
                  value={keywords}
                  onChange={(e) => setKeywords(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Tipo de Correspondência:
                </label>
                <select
                  value={matchType}
                  onChange={(e) => setMatchType(e.target.value as TriggerMatchType)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-emerald-500"
                >
                  <option value="contains">Contém qualquer uma das palavras (Recomendado)</option>
                  <option value="exact">Mensagem exatamente igual à palavra</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Texto da Resposta Automática:
                </label>
                <textarea
                  placeholder="Olá! Nossos planos começam em R$ 99/mês. Gostaria de agendar uma demonstração rápida?"
                  rows={3}
                  value={responseTemplate}
                  onChange={(e) => setResponseTemplate(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-emerald-500 resize-none"
                  required
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="flex-1 py-2 px-4 rounded-xl border border-slate-700 text-slate-300 hover:bg-slate-800 text-xs font-medium"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold shadow-md shadow-emerald-600/20"
                >
                  Salvar Regra
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default AutoResponderTab;
