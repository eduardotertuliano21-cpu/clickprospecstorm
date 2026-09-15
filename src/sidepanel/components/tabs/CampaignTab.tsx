import React, { useState, useRef, useMemo, useEffect } from 'react';
import { 
  Play, 
  Pause, 
  Square, 
  Sparkles, 
  Clock, 
  Wand2, 
  ShieldAlert, 
  Coffee, 
  MessageSquare, 
  Mail, 
  Eye, 
  Users, 
  X, 
  Copy, 
  Check, 
  Search,
  Building2
} from 'lucide-react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type Lead, type LeadStatus } from '../../../db';
import { campaignRepository } from '../../../db/repositories/campaignRepository';
import { settingsRepository } from '../../../db/repositories/settingsRepository';
import { leadRepository } from '../../../db/repositories/leadRepository';
import { omnichannelService } from '../../../services/omnichannelService';
import { omnichannelRepository } from '../../../db/repositories/omnichannelRepository';
import { antiBanEngine, type InterleavingStrategy } from '../../../services/antiBanEngine';
import { groqService } from '../../../services/groqService';
import { webviewBridge } from '../../../services/webviewBridge';
import { Tooltip } from '../Tooltip';

const InstagramIcon: React.FC<{ className?: string }> = ({ className = 'w-4 h-4' }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect width="20" height="20" x="2" y="2" rx="5" ry="5"/>
    <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/>
    <line x1="17.5" x2="17.51" y1="6.5" y2="6.5"/>
  </svg>
);

interface CampaignTabProps {
  selectedLeadIds?: number[] | null;
  onClearSelectedLeads?: () => void;
}

export const CampaignTab: React.FC<CampaignTabProps> = ({ selectedLeadIds, onClearSelectedLeads }) => {
  // Carregamento Reativo da Base de Leads pelo Dexie
  const rawLeads = useLiveQuery(() => db.leads.toArray(), []) || [];

  // Configurações da Campanha (Coluna Esquerda)
  const [selectedChannel, setSelectedChannel] = useState<'whatsapp' | 'instagram' | 'email'>('whatsapp');
  const [emailSubjectTemplate, setEmailSubjectTemplate] = useState('Oportunidade Comercial para {empresa}');
  const [campaignName, setCampaignName] = useState('Campanha B2B Desktop Primária');
  const [targetStatuses, setTargetStatuses] = useState<LeadStatus[]>(['novo', 'qualificado']);
  const [messageMode, setMessageMode] = useState<'template' | 'ia_automatica'>('template');
  const [campaignObjective, setCampaignObjective] = useState('');
  const [messageTemplate, setMessageTemplate] = useState(
    '{Olá|Oi|Tudo bem}, {decisor}! Acompanho o trabalho da {empresa} em {cidade}. Temos gerado novas oportunidades comerciais qualificadas para o seu nicho. Poderíamos conversar 5 minutos essa semana?'
  );
  const [useSpintax, setUseSpintax] = useState(true);
  const [useGroqAi, setUseGroqAi] = useState(true);
  const [delayMin, setDelayMin] = useState(30);
  const [delayMax, setDelayMax] = useState(75);
  const [breakAfterCount, setBreakAfterCount] = useState(12);
  const [breakDurationMin, setBreakDurationMin] = useState(7);

  // Pré-visualização
  const [previewText, setPreviewText] = useState('');
  const [isPreviewing, setIsPreviewing] = useState(false);

  // Execução do Disparador
  const [isRunning, setIsRunning] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [currentProgress, setCurrentProgress] = useState(0);
  const [totalToDispatch, setTotalToDispatch] = useState(0);
  const [currentStatusMsg, setCurrentStatusMsg] = useState('');
  const [liveLogs, setLiveLogs] = useState<Array<{ text: string; success: boolean; time: string; strategy?: string }>>([]);

  const abortControllerRef = useRef<AbortController | null>(null);
  const isPausedRef = useRef(false);
  isPausedRef.current = isPaused;

  // --- FILTROS & SEGMENTAÇÃO DE AUDIÊNCIA (Coluna Direita) ---
  const [selectedNiche, setSelectedNiche] = useState<string>('all');
  const [selectedCity, setSelectedCity] = useState<string>('all');
  const [selectedAudienceStatus, setSelectedAudienceStatus] = useState<string>('all');
  const [audienceSearch, setAudienceSearch] = useState<string>('');

  // Fila de IDs selecionados para disparo
  const [checkedLeadIds, setCheckedLeadIds] = useState<number[]>([]);
  const [hasInitializedChecked, setHasInitializedChecked] = useState(false);

  // Modal de Prévia Individual de Lead
  const [previewModalLead, setPreviewModalLead] = useState<Lead | null>(null);
  const [individualPreviewText, setIndividualPreviewText] = useState<string>('');
  const [isGeneratingIndividualPreview, setIsGeneratingIndividualPreview] = useState(false);
  const [copiedIndividual, setCopiedIndividual] = useState(false);

  // Lista dinâmica de nichos únicos cadastrados
  const availableNiches = useMemo(() => {
    const set = new Set<string>();
    rawLeads.forEach(l => {
      if (l.category && l.category.trim()) {
        set.add(l.category.trim());
      }
    });
    return Array.from(set).sort();
  }, [rawLeads]);

  // Lista dinâmica de cidades únicas cadastradas
  const availableCities = useMemo(() => {
    const set = new Set<string>();
    rawLeads.forEach(l => {
      if (l.city && l.city.trim()) {
        set.add(l.city.trim());
      }
    });
    return Array.from(set).sort();
  }, [rawLeads]);

  // Leads filtrados para o canal e critérios atuais
  const filteredAudienceLeads = useMemo(() => {
    return rawLeads.filter(lead => {
      // 1. Validação mínima por canal de envio
      if (selectedChannel === 'whatsapp') {
        if (!lead.phone || lead.phone.startsWith('li_')) return false;
      } else if (selectedChannel === 'instagram') {
        const hasIg = lead.origin === 'instagram' || lead.notes?.includes('instagram') || lead.phone || lead.name;
        if (!hasIg) return false;
      } else if (selectedChannel === 'email') {
        if (!lead.email || !lead.email.includes('@')) return false;
      }

      // 2. Filtro por Nicho / Ramo
      if (selectedNiche !== 'all' && lead.category !== selectedNiche) {
        return false;
      }

      // 3. Filtro por Cidade
      if (selectedCity !== 'all' && lead.city !== selectedCity) {
        return false;
      }

      // 4. Filtro por Status / Etapa
      if (selectedAudienceStatus !== 'all' && lead.status !== selectedAudienceStatus) {
        return false;
      }

      // 5. Busca textual rápida
      if (audienceSearch.trim()) {
        const q = audienceSearch.toLowerCase();
        const matchCompany = lead.companyName?.toLowerCase().includes(q);
        const matchName = lead.name?.toLowerCase().includes(q);
        const matchDecisor = lead.decisionMaker?.toLowerCase().includes(q);
        const matchPhone = lead.phone?.toLowerCase().includes(q);
        const matchCity = lead.city?.toLowerCase().includes(q);
        const matchCategory = lead.category?.toLowerCase().includes(q);
        if (!matchCompany && !matchName && !matchDecisor && !matchPhone && !matchCity && !matchCategory) {
          return false;
        }
      }

      return true;
    });
  }, [rawLeads, selectedChannel, selectedNiche, selectedCity, selectedAudienceStatus, audienceSearch]);

  // Inicialização da seleção de leads
  useEffect(() => {
    if (selectedLeadIds && selectedLeadIds.length > 0 && !hasInitializedChecked) {
      setCheckedLeadIds(selectedLeadIds);
      setHasInitializedChecked(true);
    } else if (!hasInitializedChecked && filteredAudienceLeads.length > 0) {
      setCheckedLeadIds(filteredAudienceLeads.map(l => l.id!).filter(Boolean));
      setHasInitializedChecked(true);
    }
  }, [selectedLeadIds, filteredAudienceLeads, hasInitializedChecked]);

  // Sincronização com o Tray do Sistema (Pausar / Retomar Disparos)
  useEffect(() => {
    if (typeof window !== 'undefined' && (window as any).electronAPI?.onTrayCampaignTogglePause) {
      const unsub = (window as any).electronAPI.onTrayCampaignTogglePause(() => {
        setIsPaused(prev => !prev);
      });
      return unsub;
    }
  }, []);

  useEffect(() => {
    if (typeof window !== 'undefined' && (window as any).electronAPI?.setTrayCampaignStatus) {
      (window as any).electronAPI.setTrayCampaignStatus(isRunning && !isPaused);
    }
  }, [isRunning, isPaused]);

  // Ações de seleção de leads
  const handleToggleLead = (id: number) => {
    setCheckedLeadIds(prev =>
      prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
    );
  };

  const handleSelectAllFiltered = () => {
    const ids = filteredAudienceLeads.map(l => l.id!).filter(Boolean);
    setCheckedLeadIds(prev => Array.from(new Set([...prev, ...ids])));
  };

  const handleDeselectAllFiltered = () => {
    const idsToRemove = new Set(filteredAudienceLeads.map(l => l.id!).filter(Boolean));
    setCheckedLeadIds(prev => prev.filter(id => !idsToRemove.has(id)));
  };

  const insertVariable = (variable: string) => {
    setMessageTemplate(prev => prev + ` {${variable}}`);
  };

  // Testar prévia da copy
  const handlePreview = async () => {
    setIsPreviewing(true);
    try {
      const settings = await settingsRepository.getSettings();
      const mockLead: Lead = {
        name: 'Dr. Roberto Mendes',
        companyName: 'Mendes Odontologia Integrada',
        phone: '5511999999999',
        city: 'São Paulo',
        category: 'Clínica Odontológica',
        decisionMaker: 'Roberto Mendes',
        status: 'qualificado',
        createdAt: '',
        updatedAt: ''
      };

      let result = '';
      if (messageMode === 'ia_automatica') {
        if (!settings.groqApiKey) {
          result = '⚠️ Para pré-visualizar a IA Autônoma, configure sua Groq API Key na aba Ajustes.';
        } else {
          result = await groqService.generateAutonomousB2BCopy({
            lead: mockLead,
            apiKey: settings.groqApiKey,
            model: settings.groqModel || 'qwen/qwen3.8-27b',
            campaignObjective,
            businessContext: {
              myCompanyName: settings.myCompanyName,
              myCompanyDescription: settings.myCompanyDescription,
              myCompanyOffer: settings.myCompanyOffer,
              customSalesPrompt: settings.customSalesPrompt
            }
          });
        }
      } else if (useGroqAi && settings.groqApiKey) {
        result = await groqService.generateCopyVariation({
          baseText: messageTemplate,
          lead: mockLead,
          apiKey: settings.groqApiKey,
          model: settings.groqModel,
          customSalesPrompt: settings.customSalesPrompt
        });
      } else {
        result = groqService.resolveSpintax(groqService.replaceVariables(messageTemplate, mockLead));
      }
      setPreviewText(result);
    } catch (e: any) {
      setPreviewText(`Erro na prévia: ${e.message}`);
    } finally {
      setIsPreviewing(false);
    }
  };

  // Abrir modal de prévia para um lead individual da fila
  const handleOpenIndividualPreview = async (lead: Lead) => {
    setPreviewModalLead(lead);
    setIsGeneratingIndividualPreview(true);
    setIndividualPreviewText('');
    setCopiedIndividual(false);

    try {
      const settings = await settingsRepository.getSettings();
      if (messageMode === 'ia_automatica') {
        if (!settings.groqApiKey) {
          setIndividualPreviewText(
            `Olá, ${lead.decisionMaker || lead.name || 'tudo bem'}! Acompanho o trabalho da ${lead.companyName || 'sua empresa'}${lead.city ? ` em ${lead.city}` : ''}. Gostaria de apresentar nossas soluções comerciais.\n\n⚠️ Para ver a versão gerada em tempo real pelo modelo Qwen, configure sua Groq API Key na aba Ajustes.`
          );
        } else {
          const generated = await groqService.generateAutonomousB2BCopy({
            lead,
            apiKey: settings.groqApiKey,
            model: settings.groqModel || 'qwen/qwen3.8-27b',
            campaignObjective,
            businessContext: {
              myCompanyName: settings.myCompanyName,
              myCompanyDescription: settings.myCompanyDescription,
              myCompanyOffer: settings.myCompanyOffer,
              customSalesPrompt: settings.customSalesPrompt
            }
          });
          setIndividualPreviewText(generated);
        }
      } else {
        const substituted = groqService.replaceVariables(messageTemplate, lead);
        const resolved = groqService.resolveSpintax(substituted);
        setIndividualPreviewText(resolved);
      }
    } catch (err: any) {
      setIndividualPreviewText(`Erro ao gerar prévia: ${err.message}`);
    } finally {
      setIsGeneratingIndividualPreview(false);
    }
  };

  // Disparar Campanha: opera estritamente sobre os leads marcados na fila visual
  const handleStartCampaign = async () => {
    const queue = rawLeads.filter(l => l.id && checkedLeadIds.includes(l.id));

    if (queue.length === 0) {
      alert('Nenhum lead selecionado na Audiência da Campanha. Marque ao menos um contato na lista da direita para iniciar o disparo.');
      return;
    }

    // 1. Verificação de Licença e Cota Diária do Modo Trial
    let licenseInfo: any = null;
    try {
      if (typeof window !== 'undefined' && (window as any).electronAPI?.getLicenseInfo) {
        licenseInfo = await (window as any).electronAPI.getLicenseInfo();
      }
    } catch (e) {
      console.warn('Erro ao obter dados de licença:', e);
    }

    let remainingTrialQuota = Infinity;
    if (licenseInfo?.isTrial) {
      const todaySendsCount = await campaignRepository.getTodaySentCount();
      const limit = licenseInfo.dailyLimit || 20;
      remainingTrialQuota = Math.max(0, limit - todaySendsCount);

      if (remainingTrialQuota <= 0) {
        alert(
          `🔒 Limite Diário do Modo Demonstração (Trial) Atingido!\n\nVocê já realizou ${todaySendsCount} de ${limit} disparos permitidos por dia na versão de testes.\nPara disparos ilimitados e automações 24h, ative sua licença oficial.`
        );
        return;
      }

      if (queue.length > remainingTrialQuota) {
        if (!confirm(
          `⚠️ Modo Demonstração (Trial)\n\nVocê possui apenas ${remainingTrialQuota} disparo(s) restante(s) hoje (limite de ${limit}/dia).\nA fila contém ${queue.length} contatos. Apenas os primeiros ${remainingTrialQuota} serão processados.\n\nDeseja continuar?`
        )) {
          return;
        }
      }
    }

    const settings = await settingsRepository.getSettings();

    // 2. Trava de Horário Comercial
    const timeCheck = antiBanEngine.isWithinOperatingHours({
      businessHoursStart: settings.businessHoursStart,
      businessHoursEnd: settings.businessHoursEnd,
      workingDaysOnly: settings.workingDaysOnly
    });

    if (!timeCheck.allowed) {
      if (!confirm(`Atenção Anti-Ban: ${timeCheck.reason}. Deseja prosseguir mesmo assim?`)) {
        return;
      }
    }

    // 3. Registrar campanha no banco
    const campaignId = await campaignRepository.createCampaign({
      name: campaignName,
      promptTemplate: messageMode === 'ia_automatica' ? `[IA Autônoma Qwen] ${campaignObjective || 'Prospecção B2B'}` : messageTemplate,
      spintaxEnabled: useSpintax,
      delayMin,
      delayMax,
      dailyLimit: settings.dailyQuota,
      breakAfterCount,
      breakDurationMinutes: breakDurationMin,
      targetStatuses,
      status: 'running',
      totalLeads: queue.length
    });

    setIsRunning(true);
    setIsPaused(false);
    setTotalToDispatch(queue.length);
    setCurrentProgress(0);
    setLiveLogs([]);
    abortControllerRef.current = new AbortController();

    let sentCount = 0;
    let failedCount = 0;
    let consecutiveSent = 0;

    for (let i = 0; i < queue.length; i++) {
      if (abortControllerRef.current?.signal.aborted) break;

      // Trava de cota da versão trial
      if (licenseInfo?.isTrial && sentCount >= remainingTrialQuota) {
        setCurrentStatusMsg('🔒 Limite diário de 20 disparos do Modo Demonstração (Trial) atingido.');
        break;
      }

      // Pausa manual
      while (isPausedRef.current) {
        setCurrentStatusMsg('Campanha pausada pelo operador...');
        await new Promise(r => setTimeout(r, 1000));
        if (abortControllerRef.current?.signal.aborted) break;
      }

      // Trava de Pausa Preventiva Obrigatória (ex: a cada 12 envios)
      if (antiBanEngine.shouldTriggerSafetyPause(consecutiveSent, breakAfterCount)) {
        const breakSeconds = breakDurationMin * 60;
        for (let b = breakSeconds; b > 0; b--) {
          if (abortControllerRef.current?.signal.aborted) break;
          const minLeft = Math.floor(b / 60);
          const secLeft = b % 60;
          setCurrentStatusMsg(
            `🛡️ Pausa Anti-Ban Preventiva (${consecutiveSent} envios feitos): retomando em ${minLeft}m ${secLeft}s...`
          );
          await antiBanEngine.sleep(1000, abortControllerRef.current.signal);
        }
      }

      const lead = queue[i];
      setCurrentProgress(i + 1);

      // Determina estratégia de intercalação ou geração autônoma por IA
      const strategy: InterleavingStrategy = antiBanEngine.getInterleavingStrategy(i);
      let finalMessage = '';

      try {
        if (messageMode === 'ia_automatica') {
          setCurrentStatusMsg(`[IA Qwen 2.5] Redigindo abordagem exclusiva para ${lead.companyName || lead.name}...`);
          finalMessage = await groqService.generateAutonomousB2BCopy({
            lead,
            apiKey: settings.groqApiKey,
            model: settings.groqModel || 'qwen/qwen3.8-27b',
            campaignObjective,
            businessContext: {
              myCompanyName: settings.myCompanyName,
              myCompanyDescription: settings.myCompanyDescription,
              myCompanyOffer: settings.myCompanyOffer,
              customSalesPrompt: settings.customSalesPrompt
            }
          });
        } else if (strategy === 'ai' && useGroqAi && settings.groqApiKey) {
          setCurrentStatusMsg(`[Estratégia IA] Gerando variação semântica para ${lead.companyName}...`);
          finalMessage = await groqService.generateCopyVariation({
            baseText: messageTemplate,
            lead,
            apiKey: settings.groqApiKey,
            model: settings.groqModel,
            customSalesPrompt: settings.customSalesPrompt
          });
        } else if (strategy === 'spintax' && useSpintax) {
          setCurrentStatusMsg(`[Estratégia Spintax] Resolvendo variações para ${lead.companyName}...`);
          finalMessage = groqService.resolveSpintax(groqService.replaceVariables(messageTemplate, lead));
        } else {
          setCurrentStatusMsg(`[Estratégia Base] Preparando mensagem para ${lead.companyName}...`);
          finalMessage = groqService.replaceVariables(messageTemplate, lead);
        }

        // --- ROTEAMENTO DINÂMICO POR CANAL SELECIONADO ---
        if (selectedChannel === 'whatsapp') {
          // Simulação de digitação real (3 a 6 segundos com evento markIsComposing)
          const typingDurationMs = antiBanEngine.getTypingSimulationDelay(finalMessage.length);
          setCurrentStatusMsg(
            `Simulando digitação humana (${(typingDurationMs / 1000).toFixed(1)}s) para ${lead.phone}...`
          );
          
          try {
            await webviewBridge.setComposing(lead.phone, typingDurationMs);
          } catch {}
          await antiBanEngine.sleep(typingDurationMs, abortControllerRef.current.signal);

          // Envio oficial pelo bridge WhatsApp ou despachador universal
          setCurrentStatusMsg(`Enviando mensagem via WhatsApp para ${lead.phone}...`);
          if (typeof window !== 'undefined' && (window as any).electronAPI?.sendOmniMessage) {
            await (window as any).electronAPI.sendOmniMessage({
              channel: 'whatsapp',
              recipient: lead.phone,
              content: finalMessage
            });
          } else {
            await webviewBridge.sendTextMessage(lead.phone, finalMessage);
          }
        } else if (selectedChannel === 'instagram') {
          const recipientIg = lead.notes?.match(/@([a-zA-Z0-9._]+)/)?.[1] || lead.phone || lead.name;
          setCurrentStatusMsg(`Enviando Direct no Instagram para ${lead.companyName || lead.name} (${recipientIg})...`);

          const igRes = await omnichannelService.sendMessage({
            contactId: recipientIg,
            channel: 'instagram',
            content: finalMessage
          });

          if (!igRes.success) {
            throw new Error(igRes.error || 'Falha no envio via Instagram Direct.');
          }
        } else if (selectedChannel === 'email') {
          const rawSubject = emailSubjectTemplate || 'Oportunidade Comercial para {empresa}';
          const finalSubject = groqService.resolveSpintax(groqService.replaceVariables(rawSubject, lead));
          setCurrentStatusMsg(`Disparando E-mail para ${lead.email} ("${finalSubject}")...`);

          const emailRes = await omnichannelService.sendMessage({
            contactId: lead.email!,
            channel: 'email',
            content: finalMessage,
            subject: finalSubject
          });

          if (!emailRes.success) {
            throw new Error(emailRes.error || 'Falha no envio via SMTP.');
          }
        }

        sentCount++;
        consecutiveSent++;

        if (lead.id) {
          await leadRepository.updateLead(lead.id, {
            status: 'contatado',
            lastContactAt: new Date().toISOString()
          });
        }

        const recipientLabel = selectedChannel === 'email' ? lead.email! : (selectedChannel === 'instagram' ? lead.name : lead.phone);

        const strategyLabel = messageMode === 'ia_automatica' ? 'ia_autonoma' : strategy;

        await campaignRepository.logMessage({
          campaignId,
          leadId: lead.id || 0,
          leadName: lead.name,
          phone: recipientLabel,
          content: finalMessage,
          status: 'sent',
          strategyUsed: strategyLabel,
          sentAt: new Date().toISOString()
        });

        setLiveLogs(prev => [
          {
            text: `[${selectedChannel.toUpperCase()} | ${messageMode === 'ia_automatica' ? '🤖 100% IA' : strategy.toUpperCase()}] ${lead.companyName} (${recipientLabel})`,
            success: true,
            strategy: strategyLabel,
            time: new Date().toLocaleTimeString()
          },
          ...prev.slice(0, 49)
        ]);
      } catch (err: any) {
        if (err.name === 'AbortError') break;

        failedCount++;
        const recipientLabel = selectedChannel === 'email' ? (lead.email || 'sem-email') : (selectedChannel === 'instagram' ? lead.name : lead.phone);

        if (lead.id) {
          await campaignRepository.logMessage({
            campaignId,
            leadId: lead.id,
            leadName: lead.name,
            phone: recipientLabel,
            content: messageTemplate,
            status: 'failed',
            strategyUsed: strategy,
            error: err.message
          });
        }

        setLiveLogs(prev => [
          {
            text: `[FALHA ${selectedChannel.toUpperCase()}] ${lead.companyName}: ${err.message}`,
            success: false,
            time: new Date().toLocaleTimeString()
          },
          ...prev.slice(0, 49)
        ]);
      }

      // Intervalo Gaussiano Estocástico entre disparos (Anti-Ban aplicado para WhatsApp, Instagram e E-mail)
      if (i < queue.length - 1 && !abortControllerRef.current?.signal.aborted) {
        const delayMs = antiBanEngine.getGaussianDelay(delayMin, delayMax);
        const delaySec = Math.round(delayMs / 1000);

        for (let s = delaySec; s > 0; s--) {
          if (abortControllerRef.current?.signal.aborted) break;
          setCurrentStatusMsg(`Cadência Anti-Ban (${selectedChannel.toUpperCase()}): aguardando ${s}s (distribuição normal)...`);
          await antiBanEngine.sleep(1000, abortControllerRef.current.signal);
        }
      }
    }

    await campaignRepository.updateCampaign(campaignId, {
      status: 'finished',
      sentCount,
      failedCount
    });

    setIsRunning(false);
    setIsPaused(false);
    setCurrentStatusMsg(`Campanha concluída: ${sentCount} enviados, ${failedCount} falhas.`);

    // Notificação Nativa do Windows no System Tray
    try {
      if (typeof window !== 'undefined' && (window as any).electronAPI?.notifyCampaignCompleted) {
        (window as any).electronAPI.notifyCampaignCompleted({
          totalSent: sentCount,
          failed: failedCount
        });
      }
    } catch (err) {
      console.warn('Falha ao emitir notificação nativa:', err);
    }
  };

  const handleStopCampaign = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    setIsRunning(false);
    setIsPaused(false);
    setCurrentStatusMsg('Campanha cancelada pelo operador.');
  };

  return (
    <div className="p-4 space-y-4 max-w-[1600px] mx-auto overflow-y-auto">
      {/* Banner de Foco em Seleção do CRM (se houver seleção prévia) */}
      {selectedLeadIds && selectedLeadIds.length > 0 && (
        <div className="bg-emerald-950/40 border border-emerald-500/50 rounded-xl p-3 flex items-center justify-between gap-3 text-xs shadow-lg shadow-emerald-950/40">
          <div className="flex items-center gap-2 text-emerald-300">
            <span className="flex h-2.5 w-2.5 relative">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
            </span>
            <span className="font-semibold">
              🎯 Foco Ativo: <strong>{selectedLeadIds.length} contato(s) selecionados</strong> no CRM
            </span>
          </div>
          {onClearSelectedLeads && (
            <button
              type="button"
              onClick={onClearSelectedLeads}
              className="text-[11px] bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white px-2.5 py-1 rounded-lg border border-slate-700 transition-colors"
            >
              Desmarcar foco / Ver todos
            </button>
          )}
        </div>
      )}

      {/* Bloco de Progresso em Execução */}
      {isRunning && (
        <div className="bg-slate-900 border border-emerald-500/40 rounded-xl p-3.5 space-y-3 shadow-xl">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-emerald-400 flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping" />
              DISPARADOR CADENCIADO ATIVO
            </span>
            <span className="text-xs font-mono text-slate-300">
              {currentProgress} / {totalToDispatch} ({totalToDispatch > 0 ? Math.round((currentProgress / totalToDispatch) * 100) : 0}%)
            </span>
          </div>

          <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden">
            <div
              className="bg-gradient-to-r from-emerald-500 to-teal-400 h-full transition-all duration-300"
              style={{ width: `${totalToDispatch > 0 ? (currentProgress / totalToDispatch) * 100 : 0}%` }}
            />
          </div>

          <div className="text-[11px] text-slate-300 font-mono bg-slate-950/80 p-2.5 rounded-lg border border-slate-800 flex items-center gap-2">
            <Clock className="w-3.5 h-3.5 text-emerald-400 shrink-0 animate-spin" />
            <span className="truncate">{currentStatusMsg}</span>
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => setIsPaused(!isPaused)}
              className="flex-1 py-1.5 px-3 bg-amber-600 hover:bg-amber-500 text-white rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5"
            >
              {isPaused ? <Play className="w-3.5 h-3.5" /> : <Pause className="w-3.5 h-3.5" />}
              {isPaused ? 'Retomar' : 'Pausar'}
            </button>
            <button
              onClick={handleStopCampaign}
              className="flex-1 py-1.5 px-3 bg-rose-600 hover:bg-rose-500 text-white rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5"
            >
              <Square className="w-3.5 h-3.5" />
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* --- GRID SPLIT EM 2 COLUNAS (LADO ESQUERDO: 7 / LADO DIREITO: 5) --- */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        
        {/* COLUNA ESQUERDA (lg:col-span-7): CONFIGURAÇÃO DO DISPARO */}
        <div className="lg:col-span-7 space-y-4">
          <div className="bg-slate-900/60 p-4 rounded-xl border border-slate-800 space-y-3.5 shadow-lg">
            
            {/* SELETOR VISUAL DO CANAL DE ENVIO */}
            <div>
              <label className="text-[11px] font-semibold text-slate-300 block mb-1.5">
                Canal de Envio da Campanha
              </label>
              <div className="grid grid-cols-3 gap-2">
                <Tooltip text="Disparos pelo WhatsApp nativo com Anti-Ban e digitação humana">
                  <button
                    type="button"
                    disabled={isRunning}
                    onClick={() => setSelectedChannel('whatsapp')}
                    className={`p-2.5 rounded-xl border flex items-center justify-center gap-2 text-xs font-bold transition-all w-full ${
                      selectedChannel === 'whatsapp'
                        ? 'bg-emerald-600/20 border-emerald-500 text-emerald-300 shadow-md shadow-emerald-500/10'
                        : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <MessageSquare className="w-4 h-4 text-emerald-400" />
                    <span>WhatsApp</span>
                  </button>
                </Tooltip>

                <Tooltip text="Envios pelo Instagram Direct para contatos vinculados">
                  <button
                    type="button"
                    disabled={isRunning}
                    onClick={() => setSelectedChannel('instagram')}
                    className={`p-2.5 rounded-xl border flex items-center justify-center gap-2 text-xs font-bold transition-all w-full ${
                      selectedChannel === 'instagram'
                        ? 'bg-pink-600/20 border-pink-500 text-pink-300 shadow-md shadow-pink-500/10'
                        : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <InstagramIcon className="w-4 h-4 text-pink-400" />
                    <span>Instagram Direct</span>
                  </button>
                </Tooltip>

                <Tooltip text="Envio em massa via servidor SMTP configurado">
                  <button
                    type="button"
                    disabled={isRunning}
                    onClick={() => setSelectedChannel('email')}
                    className={`p-2.5 rounded-xl border flex items-center justify-center gap-2 text-xs font-bold transition-all w-full ${
                      selectedChannel === 'email'
                        ? 'bg-sky-600/20 border-sky-500 text-sky-300 shadow-md shadow-sky-500/10'
                        : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <Mail className="w-4 h-4 text-sky-400" />
                    <span>E-mail (SMTP)</span>
                  </button>
                </Tooltip>
              </div>
            </div>

            {/* ASSUNTO DO E-MAIL SE O CANAL FOR EMAIL */}
            {selectedChannel === 'email' && (
              <div>
                <label className="text-[11px] font-semibold text-slate-300 block mb-1">
                  Assunto do E-mail (Suporta Spintax e Variáveis como &#123;empresa&#125;, &#123;decisor&#125;)
                </label>
                <input
                  type="text"
                  disabled={isRunning}
                  value={emailSubjectTemplate}
                  onChange={(e) => setEmailSubjectTemplate(e.target.value)}
                  placeholder="Ex: Oportunidade Comercial para {empresa}"
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-sky-500 font-medium"
                />
              </div>
            )}

            <div>
              <label className="text-[11px] font-semibold text-slate-300 block mb-1">Nome da Campanha</label>
              <input
                type="text"
                disabled={isRunning}
                value={campaignName}
                onChange={(e) => setCampaignName(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-emerald-500"
              />
            </div>

            {/* MODO DE CRIAÇÃO DA MENSAGEM: TEMPLATE vs IA AUTÔNOMA */}
            <div>
              <label className="text-[11px] font-semibold text-slate-300 block mb-1.5">
                Modo de Criação da Mensagem
              </label>
              <div className="grid grid-cols-2 gap-2 bg-slate-950 p-1 rounded-xl border border-slate-800">
                <button
                  type="button"
                  disabled={isRunning}
                  onClick={() => setMessageMode('template')}
                  className={`py-2 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-2 transition-all ${
                    messageMode === 'template'
                      ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/20'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <span>📝 Mensagem Padrão (Template)</span>
                </button>
                <button
                  type="button"
                  disabled={isRunning}
                  onClick={() => setMessageMode('ia_automatica')}
                  className={`py-2 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-2 transition-all ${
                    messageMode === 'ia_automatica'
                      ? 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-md shadow-teal-600/20'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <Sparkles className="w-3.5 h-3.5 text-teal-300" />
                  <span>🤖 100% Automático via IA</span>
                </button>
              </div>
            </div>

            {/* EDITOR DE MENSAGEM OU CARD DA IA */}
            {messageMode === 'ia_automatica' ? (
              <div className="bg-slate-950/90 border border-teal-500/30 rounded-xl p-3.5 space-y-3">
                <div className="flex items-center gap-2 text-xs font-bold text-teal-300">
                  <Sparkles className="w-4 h-4 text-teal-400" />
                  <span>Copywriting B2B Autônomo com IA (Qwen 2.5)</span>
                </div>
                <p className="text-[11px] text-slate-300 leading-relaxed">
                  O motor de IA analisa o nicho, decisor e cidade de cada lead marcado e cruza com a proposta de valor da sua empresa (definida em <strong>Ajustes</strong>). Cada mensagem é redigida individualmente na hora do disparo, 100% única e humana.
                </p>
                <div>
                  <label className="text-[11px] font-semibold text-slate-300 block mb-1">
                    Objetivo da Prospecção / Call-to-Action (Opcional):
                  </label>
                  <input
                    type="text"
                    disabled={isRunning}
                    value={campaignObjective}
                    onChange={(e) => setCampaignObjective(e.target.value)}
                    placeholder="Ex: Agendar call rápida de 10 min para demonstrar nossa solução..."
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-teal-500"
                  />
                </div>
              </div>
            ) : (
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-[11px] font-semibold text-slate-300">Mensagem Template</label>
                  <div className="flex gap-1 text-[10px]">
                    {['decisor', 'empresa', 'cidade'].map((v) => (
                      <Tooltip key={v} text={`Inserir variável {${v}} automaticamente`}>
                        <button
                          type="button"
                          disabled={isRunning}
                          onClick={() => insertVariable(v)}
                          className="px-1.5 py-0.5 bg-slate-800 hover:bg-slate-700 text-emerald-400 rounded transition-colors"
                        >
                          +{v}
                        </button>
                      </Tooltip>
                    ))}
                  </div>
                </div>
                <textarea
                  rows={4}
                  disabled={isRunning}
                  value={messageTemplate}
                  onChange={(e) => setMessageTemplate(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-xs text-slate-100 focus:outline-none focus:border-emerald-500 leading-relaxed"
                />
              </div>
            )}

            {/* SEGURANÇA ANTI-BAN & DELAYS */}
            <div className="space-y-2 border-t border-slate-800/80 pt-2.5">
              <div className="text-[10px] uppercase font-bold text-emerald-400 flex items-center gap-1">
                <ShieldAlert className="w-3.5 h-3.5" />
                Proteção Anti-Ban & Distribuição Normal
              </div>

              {messageMode === 'ia_automatica' ? (
                <div className="bg-emerald-950/30 border border-emerald-500/30 rounded-lg p-2.5 text-xs text-emerald-300 flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>
                    <strong>Anti-Spam Máximo:</strong> Cada abordagem possui léxico e estrutura únicos, eliminando repetição textual detectável por filtros de spam.
                  </span>
                </div>
              ) : (
                <>
                  <Tooltip text="A IA Groq Llama 3 reescreve o texto com naturalidade, tornando cada mensagem única">
                    <label className="flex items-center gap-2 cursor-pointer text-xs text-slate-300">
                      <input
                        type="checkbox"
                        disabled={isRunning}
                        checked={useGroqAi}
                        onChange={(e) => setUseGroqAi(e.target.checked)}
                        className="rounded border-slate-700 text-emerald-500 focus:ring-0"
                      />
                      <span className="flex items-center gap-1 font-medium">
                        <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
                        Intercalar Variações com IA Groq Llama 3 (Lead 2, 5, 8...)
                      </span>
                    </label>
                  </Tooltip>

                  <Tooltip text="Alterna blocos de sinônimos configurados entre chaves {Olá|Oi|Tudo bem}">
                    <label className="flex items-center gap-2 cursor-pointer text-xs text-slate-300">
                      <input
                        type="checkbox"
                        disabled={isRunning}
                        checked={useSpintax}
                        onChange={(e) => setUseSpintax(e.target.checked)}
                        className="rounded border-slate-700 text-emerald-500 focus:ring-0"
                      />
                      <span>Intercalar Variações com Spintax (Lead 3, 6, 9...)</span>
                    </label>
                  </Tooltip>
                </>
              )}

              {/* Delays Gaussianos */}
              <div className="grid grid-cols-2 gap-2 pt-1">
                <Tooltip text="Tempo mínimo de espera entre cada envio individual">
                  <div>
                    <label className="text-[10px] text-slate-400 block mb-0.5">Delay Mínimo (seg)</label>
                    <input
                      type="number"
                      disabled={isRunning}
                      value={delayMin}
                      onChange={(e) => setDelayMin(Number(e.target.value))}
                      className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs text-slate-100"
                    />
                  </div>
                </Tooltip>
                <Tooltip text="Tempo máximo de espera. O motor calcula uma curva normal aleatória">
                  <div>
                    <label className="text-[10px] text-slate-400 block mb-0.5">Delay Máximo (seg)</label>
                    <input
                      type="number"
                      disabled={isRunning}
                      value={delayMax}
                      onChange={(e) => setDelayMax(Number(e.target.value))}
                      className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs text-slate-100"
                    />
                  </div>
                </Tooltip>
              </div>

              {/* Pausa Preventiva */}
              <div className="grid grid-cols-2 gap-2 pt-1">
                <Tooltip text="Interrompe os envios periodicamente para descansar a conta">
                  <div>
                    <label className="text-[10px] text-slate-400 block mb-0.5 flex items-center gap-1">
                      <Coffee className="w-3 h-3 text-amber-400" /> Pausa a cada (envios)
                    </label>
                    <input
                      type="number"
                      disabled={isRunning}
                      value={breakAfterCount}
                      onChange={(e) => setBreakAfterCount(Number(e.target.value))}
                      className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs text-slate-100"
                    />
                  </div>
                </Tooltip>
                <Tooltip text="Duração do intervalo de descanso antes de retomar a fila">
                  <div>
                    <label className="text-[10px] text-slate-400 block mb-0.5">Tempo da Pausa (minutos)</label>
                    <input
                      type="number"
                      disabled={isRunning}
                      value={breakDurationMin}
                      onChange={(e) => setBreakDurationMin(Number(e.target.value))}
                      className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs text-slate-100"
                    />
                  </div>
                </Tooltip>
              </div>
            </div>

            {/* BOTÕES DE AÇÃO DO DISPARADOR */}
            <div className="flex gap-2 pt-2">
              <Tooltip text="Gera um exemplo de mensagem com variáveis e IA aplicadas">
                <button
                  type="button"
                  onClick={handlePreview}
                  disabled={isPreviewing || isRunning}
                  className="flex-1 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors w-full"
                >
                  <Wand2 className="w-3.5 h-3.5 text-emerald-400" />
                  {isPreviewing ? 'Gerando...' : 'Testar Prévia Geral'}
                </button>
              </Tooltip>

              <Tooltip text="Iniciar o envio estritamente para os leads marcados na lista da direita">
                <button
                  type="button"
                  onClick={handleStartCampaign}
                  disabled={isRunning}
                  className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors shadow-lg shadow-emerald-600/20 w-full"
                >
                  <Play className="w-3.5 h-3.5" />
                  Iniciar Disparos ({checkedLeadIds.length})
                </button>
              </Tooltip>
            </div>
          </div>

          {/* PRÉVIA GERAL GERADA */}
          {previewText && (
            <div className="bg-slate-900/40 p-3 rounded-xl border border-slate-800 space-y-1">
              <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                <Sparkles className="w-3 h-3 text-emerald-400" />
                Exemplo de Variação Sanitizada:
              </div>
              <p className="text-xs text-slate-200 whitespace-pre-line bg-slate-950 p-2.5 rounded-lg border border-slate-800">
                {previewText}
              </p>
            </div>
          )}

          {/* LOGS EM TEMPO REAL */}
          {liveLogs.length > 0 && (
            <div className="space-y-1.5">
              <div className="text-[11px] font-semibold text-slate-400">Log em Tempo Real:</div>
              <div className="max-h-40 overflow-y-auto space-y-1 text-[11px] font-mono pr-1">
                {liveLogs.map((log, i) => (
                  <div
                    key={i}
                    className={`p-1.5 rounded border ${
                      log.success
                        ? 'bg-emerald-950/20 border-emerald-500/20 text-emerald-300'
                        : 'bg-rose-950/20 border-rose-500/20 text-rose-300'
                    }`}
                  >
                    <span className="opacity-50 mr-1.5">{log.time}</span>
                    {log.text}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* COLUNA DIREITA (lg:col-span-5): AUDIÊNCIA E FILA VISUAL DE LEADS */}
        <div className="lg:col-span-5 space-y-3 sticky top-2">
          <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-3.5 space-y-3 shadow-xl">
            
            {/* Cabeçalho da Audiência */}
            <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-emerald-400" />
                <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider">
                  Audiência da Campanha
                </h3>
              </div>
              <div className="bg-emerald-500/10 border border-emerald-500/30 px-2.5 py-0.5 rounded-full text-[11px] font-semibold text-emerald-300">
                {checkedLeadIds.length} selecionado{checkedLeadIds.length === 1 ? '' : 's'}
              </div>
            </div>

            {/* Filtros por Nicho e Cidade */}
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div>
                <label className="text-[10px] font-semibold text-slate-400 block mb-1">
                  🏷️ Nicho / Ramo:
                </label>
                <select
                  value={selectedNiche}
                  onChange={(e) => setSelectedNiche(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-emerald-500 font-medium"
                >
                  <option value="all">Todos os Nichos ({availableNiches.length})</option>
                  {availableNiches.map((niche) => (
                    <option key={niche} value={niche}>{niche}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-[10px] font-semibold text-slate-400 block mb-1">
                  📍 Cidade / Região:
                </label>
                <select
                  value={selectedCity}
                  onChange={(e) => setSelectedCity(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-emerald-500 font-medium"
                >
                  <option value="all">Todas as Cidades ({availableCities.length})</option>
                  {availableCities.map((city) => (
                    <option key={city} value={city}>{city}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Filtro por Etapa e Busca Textual Rápida */}
            <div className="grid grid-cols-12 gap-2 text-xs">
              <div className="col-span-5">
                <label className="text-[10px] font-semibold text-slate-400 block mb-1">
                  📊 Etapa:
                </label>
                <select
                  value={selectedAudienceStatus}
                  onChange={(e) => setSelectedAudienceStatus(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-emerald-500 font-medium"
                >
                  <option value="all">Todas</option>
                  <option value="novo">Novo</option>
                  <option value="qualificado">Qualificado</option>
                  <option value="contatado">Contatado</option>
                  <option value="negociacao">Negociação</option>
                </select>
              </div>

              <div className="col-span-7">
                <label className="text-[10px] font-semibold text-slate-400 block mb-1">
                  🔍 Buscar na lista:
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={audienceSearch}
                    onChange={(e) => setAudienceSearch(e.target.value)}
                    placeholder="Empresa, decisor..."
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg pl-7 pr-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-emerald-500 placeholder-slate-500"
                  />
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2 top-2 pointer-events-none" />
                </div>
              </div>
            </div>

            {/* Barra de Ações Rápidas da Audiência */}
            <div className="flex items-center justify-between pt-1 border-t border-slate-800/80 text-[11px]">
              <span className="text-slate-400 font-medium">
                Fila: <strong className="text-emerald-400">{filteredAudienceLeads.filter(l => l.id && checkedLeadIds.includes(l.id)).length}</strong> de <strong className="text-slate-300">{filteredAudienceLeads.length}</strong> filtrados
              </span>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={handleSelectAllFiltered}
                  className="px-2 py-0.5 bg-slate-800 hover:bg-slate-700 text-emerald-400 rounded-md font-semibold transition-colors"
                >
                  ✓ Marcar Todos
                </button>
                <button
                  type="button"
                  onClick={handleDeselectAllFiltered}
                  className="px-2 py-0.5 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-slate-200 rounded-md font-medium transition-colors"
                >
                  ✕ Desmarcar
                </button>
              </div>
            </div>

            {/* LISTA VISUAL DA FILA DE LEADS */}
            <div className="max-h-[460px] overflow-y-auto space-y-2 pr-1 custom-scrollbar">
              {filteredAudienceLeads.length === 0 ? (
                <div className="py-12 text-center text-slate-500 text-xs space-y-1">
                  <div>Nenhum lead encontrado para os filtros selecionados.</div>
                  <div className="text-[10px] text-slate-600">Alterne o Nicho, Cidade ou Canal de envio.</div>
                </div>
              ) : (
                filteredAudienceLeads.map((lead) => {
                  const isChecked = lead.id ? checkedLeadIds.includes(lead.id) : false;
                  return (
                    <div
                      key={lead.id}
                      className={`p-2.5 rounded-xl border transition-all flex items-start justify-between gap-2.5 ${
                        isChecked
                          ? 'bg-slate-950/90 border-slate-700/80 hover:border-emerald-500/40'
                          : 'bg-slate-950/30 border-slate-800/50 opacity-60 hover:opacity-100'
                      }`}
                    >
                      <div className="flex items-start gap-2.5 min-w-0 flex-1">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => lead.id && handleToggleLead(lead.id)}
                          className="mt-1 rounded border-slate-700 text-emerald-500 focus:ring-0 cursor-pointer"
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs font-bold text-slate-200 truncate">
                              {lead.companyName || lead.name}
                            </span>
                          </div>
                          {lead.decisionMaker && (
                            <div className="text-[11px] text-slate-400 truncate">
                              👤 {lead.decisionMaker}
                            </div>
                          )}
                          <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                            {lead.category && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-amber-300 font-medium truncate max-w-[130px]">
                                🏷️ {lead.category}
                              </span>
                            )}
                            {lead.city && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 font-medium truncate max-w-[130px]">
                                📍 {lead.city}
                              </span>
                            )}
                            {selectedChannel === 'whatsapp' && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-950/50 text-emerald-400 border border-emerald-500/20 font-mono">
                                🟢 {lead.phone}
                              </span>
                            )}
                            {selectedChannel === 'email' && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-sky-950/50 text-sky-300 border border-sky-500/20 font-mono truncate max-w-[140px]">
                                ✉️ {lead.email}
                              </span>
                            )}
                            {selectedChannel === 'instagram' && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-pink-950/50 text-pink-300 border border-pink-500/20 font-mono truncate max-w-[130px]">
                                📸 {lead.name}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Botão de Prévia Individual com Tooltip */}
                      <Tooltip text="Ver mensagem personalizada para este contato">
                        <button
                          type="button"
                          onClick={() => handleOpenIndividualPreview(lead)}
                          className="p-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-emerald-400 transition-colors shrink-0"
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </button>
                      </Tooltip>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </div>

      {/* --- MODAL DE PRÉVIA INDIVIDUAL DO LEAD --- */}
      {previewModalLead && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl p-5 max-w-lg w-full shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Eye className="w-4 h-4 text-emerald-400" />
                <span className="font-bold text-sm text-slate-100">
                  Prévia: {previewModalLead.companyName || previewModalLead.name}
                </span>
              </div>
              <button
                onClick={() => setPreviewModalLead(null)}
                className="text-slate-400 hover:text-slate-200 p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="text-xs text-slate-300 space-y-1 bg-slate-950/50 p-2.5 rounded-xl border border-slate-800/60">
              <div className="flex items-center gap-1.5">
                <Building2 className="w-3.5 h-3.5 text-slate-400" />
                <span><strong>Empresa:</strong> {previewModalLead.companyName || previewModalLead.name} {previewModalLead.city ? `(${previewModalLead.city})` : ''}</span>
              </div>
              <div><strong>Decisor:</strong> {previewModalLead.decisionMaker || 'Não identificado'}</div>
              <div><strong>Destinatário ({selectedChannel.toUpperCase()}):</strong> {selectedChannel === 'email' ? previewModalLead.email : (selectedChannel === 'instagram' ? previewModalLead.name : previewModalLead.phone)}</div>
              <div><strong>Modo:</strong> {messageMode === 'ia_automatica' ? '🤖 100% Automático via IA (Qwen 2.5)' : '📝 Mensagem Padrão (Template)'}</div>
            </div>

            <div className="bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs text-slate-200 whitespace-pre-line leading-relaxed min-h-[110px] max-h-[260px] overflow-y-auto">
              {isGeneratingIndividualPreview ? (
                <div className="flex items-center justify-center h-28 text-slate-400 gap-2 font-medium">
                  <Clock className="w-4 h-4 text-emerald-400 animate-spin" />
                  <span>Redigindo abordagem sob medida...</span>
                </div>
              ) : (
                individualPreviewText
              )}
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(individualPreviewText);
                  setCopiedIndividual(true);
                  setTimeout(() => setCopiedIndividual(false), 2000);
                }}
                disabled={isGeneratingIndividualPreview || !individualPreviewText}
                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-lg transition-colors flex items-center gap-1.5"
              >
                {copiedIndividual ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                {copiedIndividual ? 'Copiado!' : 'Copiar Texto'}
              </button>
              <button
                type="button"
                onClick={() => setPreviewModalLead(null)}
                className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-lg transition-colors"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
