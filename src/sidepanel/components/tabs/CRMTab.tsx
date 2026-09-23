import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type Lead, type LeadStatus } from '../../../db';
import { leadRepository } from '../../../db/repositories/leadRepository';
import { webviewBridge } from '../../../services/webviewBridge';
import { cnpjEnrichmentService } from '../../../services/cnpjEnrichmentService';
import { AddLeadModal } from '../AddLeadModal';
import { 
  Phone, 
  User, 
  Trash2, 
  Search, 
  MessageSquare, 
  Kanban, 
  List, 
  Edit3, 
  Check, 
  X, 
  UserPlus,
  Mail,
  Building2,
  MapPin,
  Tag,
  Filter,
  Sparkles,
  Loader2,
  Copy,
  Share2,
  ExternalLink,
  Rocket,
  MoreVertical
} from 'lucide-react';
import { ContextMenu, type ContextMenuItem } from '../ContextMenu';
import { Tooltip } from '../Tooltip';

const STATUS_CONFIG: Record<LeadStatus, { label: string; color: string; bg: string; border: string }> = {
  novo: { label: 'Novo', color: 'text-blue-400', bg: 'bg-blue-500/10', border: 'border-blue-500/20' },
  qualificado: { label: 'Qualificado', color: 'text-purple-400', bg: 'bg-purple-500/10', border: 'border-purple-500/20' },
  contatado: { label: 'Contatado', color: 'text-amber-400', bg: 'bg-amber-500/10', border: 'border-amber-500/20' },
  negociacao: { label: 'Negociação', color: 'text-indigo-400', bg: 'bg-indigo-500/10', border: 'border-indigo-500/20' },
  ganho: { label: 'Ganho (Fechado)', color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20' },
  perdido: { label: 'Perdido', color: 'text-rose-400', bg: 'bg-rose-500/10', border: 'border-rose-500/20' }
};

export interface OriginInfo {
  id: string;
  label: string;
  icon: string;
  bg: string;
  text: string;
  border: string;
}

export function getLeadOriginInfo(lead: Lead): OriginInfo {
  let o = lead.origin?.toLowerCase();
  if (!o) {
    const tags = lead.tags || [];
    if (tags.some(t => t.toLowerCase().includes('maps'))) o = 'maps';
    else if (tags.some(t => t.toLowerCase().includes('manual'))) o = 'manual';
    else if (tags.some(t => t.toLowerCase().includes('cnpj'))) o = 'cnpj';
    else if (tags.some(t => t.toLowerCase().includes('csv'))) o = 'csv';
    else if (tags.some(t => t.toLowerCase().includes('linkedin'))) o = 'linkedin';
    else if (lead.cnpj) o = 'cnpj';
    else if (lead.linkedinUrl) o = 'linkedin';
    else o = 'manual';
  }

  switch (o) {
    case 'maps':
      return { id: 'maps', label: 'Google Maps', icon: '🗺️', bg: 'bg-blue-500/10', text: 'text-blue-400', border: 'border-blue-500/20' };
    case 'manual':
      return { id: 'manual', label: 'Manual', icon: '✍️', bg: 'bg-amber-500/10', text: 'text-amber-400', border: 'border-amber-500/20' };
    case 'cnpj':
      return { id: 'cnpj', label: 'Consulta CNPJ', icon: '🏢', bg: 'bg-purple-500/10', text: 'text-purple-400', border: 'border-purple-500/20' };
    case 'csv':
      return { id: 'csv', label: 'Planilha CSV', icon: '📄', bg: 'bg-cyan-500/10', text: 'text-cyan-400', border: 'border-cyan-500/20' };
    case 'linkedin':
      return { id: 'linkedin', label: 'LinkedIn', icon: '💼', bg: 'bg-sky-600/10', text: 'text-sky-400', border: 'border-sky-600/20' };
    case 'whatsapp':
      return { id: 'whatsapp', label: 'WhatsApp', icon: '💬', bg: 'bg-emerald-500/10', text: 'text-emerald-400', border: 'border-emerald-500/20' };
    case 'email':
      return { id: 'email', label: 'E-mail', icon: '✉️', bg: 'bg-violet-500/10', text: 'text-violet-400', border: 'border-violet-500/20' };
    case 'instagram':
      return { id: 'instagram', label: 'Instagram', icon: '📸', bg: 'bg-pink-500/10', text: 'text-pink-400', border: 'border-pink-500/20' };
    default:
      return { id: 'other', label: lead.origin || 'Importado', icon: '📍', bg: 'bg-slate-800', text: 'text-slate-300', border: 'border-slate-700' };
  }
}

export interface CRMTabProps {
  onStartCampaignWithLeads?: (leadIds: number[]) => void;
}

export const CRMTab: React.FC<CRMTabProps> = ({ onStartCampaignWithLeads }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [selectedOrigin, setSelectedOrigin] = useState<string>('all');
  const [viewMode, setViewMode] = useState<'list' | 'kanban'>('list');
  const [selectedLeadIds, setSelectedLeadIds] = useState<number[]>([]);

  // Menu de Contexto (botão direito)
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; lead: Lead } | null>(null);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 3000);
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    showToast(`📋 ${label} copiado para a área de transferência!`);
  };

  // Modal completo de edição de contato
  const [editingLead, setEditingLead] = useState<Lead | null>(null);
  const [editForm, setEditForm] = useState<Partial<Lead>>({});

  // Modal unificado de cadastro / prospecção de leads
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [addModalTab, setAddModalTab] = useState<'manual' | 'maps' | 'cnpj' | 'csv' | 'linkedin'>('maps');

  // useLiveQuery com busca e filtros
  const rawLeads = useLiveQuery(async () => {
    return await leadRepository.getLeads({
      status: selectedStatus === 'all' ? undefined : (selectedStatus as LeadStatus),
      search: searchTerm
    });
  }, [searchTerm, selectedStatus]);

  // Filtro client-side por origem
  const leads = (rawLeads || []).filter(lead => {
    if (selectedOrigin === 'all') return true;
    const originInfo = getLeadOriginInfo(lead);
    return originInfo.id === selectedOrigin;
  });

  // Estatísticas de origens
  const allLeadsCount = rawLeads?.length || 0;
  const mapsCount = (rawLeads || []).filter(l => getLeadOriginInfo(l).id === 'maps').length;
  const manualCount = (rawLeads || []).filter(l => getLeadOriginInfo(l).id === 'manual').length;
  const cnpjCount = (rawLeads || []).filter(l => getLeadOriginInfo(l).id === 'cnpj').length;
  const csvCount = (rawLeads || []).filter(l => getLeadOriginInfo(l).id === 'csv').length;
  const linkedinCount = (rawLeads || []).filter(l => getLeadOriginInfo(l).id === 'linkedin').length;

  // Abrir modal de edição
  const handleOpenEdit = (lead: Lead) => {
    setEditingLead(lead);
    setEditForm({
      name: lead.name || '',
      companyName: lead.companyName || '',
      phone: lead.phone || '',
      email: lead.email || '',
      cnpj: lead.cnpj || '',
      city: lead.city || '',
      category: lead.category || '',
      decisionMaker: lead.decisionMaker || '',
      linkedinUrl: lead.linkedinUrl || '',
      origin: lead.origin || getLeadOriginInfo(lead).id,
      status: lead.status || 'novo',
      notes: lead.notes || ''
    });
  };

  // Salvar alterações completas do lead
  const handleSaveEdit = async () => {
    if (!editingLead?.id) return;
    try {
      await leadRepository.updateLead(editingLead.id, editForm);
      setEditingLead(null);
    } catch (err: any) {
      alert(`Erro ao salvar contato: ${err.message}`);
    }
  };

  // Disparo de mensagem rápida direta no WhatsApp Web
  const handleQuickSend = async (lead: Lead) => {
    const text = prompt(
      `Enviar mensagem rápida no WhatsApp para ${lead.name} (${lead.phone}):`,
      `Olá ${lead.decisionMaker || lead.name}, tudo bem? Aqui é da equipe Click Lead Storm.`
    );
    if (!text) return;

    try {
      await webviewBridge.setComposing(lead.phone, 3000);
      await webviewBridge.sendTextMessage(lead.phone, text);
      alert('Mensagem enviada com sucesso no WhatsApp!');
      if (lead.id) {
        await leadRepository.updateLead(lead.id, { status: 'contatado' });
      }
    } catch (err: any) {
      alert(`Erro no envio: ${err.message || 'WhatsApp Web não respondeu'}`);
    }
  };

  const handleDelete = async (id: number) => {
    if (confirm('Deseja realmente remover este contato do sistema?')) {
      await leadRepository.deleteLead(id);
      if (editingLead?.id === id) setEditingLead(null);
    }
  };

  const handleUpdateStatus = async (leadId: number, newStatus: LeadStatus) => {
    await leadRepository.updateLeadStatus(leadId, newStatus);
  };

  // --- ENRIQUECIMENTO DE CONTATOS ---
  const [enrichingLeadId, setEnrichingLeadId] = useState<number | null>(null);
  const [bulkEnriching, setBulkEnriching] = useState(false);
  const [enrichProgress, setEnrichProgress] = useState<{ current: number; total: number } | null>(null);
  const [enrichMsg, setEnrichMsg] = useState<string | null>(null);
  const [searchingLiId, setSearchingLiId] = useState<number | null>(null);

  // Enriquecer um único contato (busca CNPJ, sócios, verifica WhatsApp)
  const handleEnrichLead = async (lead: Lead) => {
    if (!lead.id) return;
    setEnrichingLeadId(lead.id);
    setEnrichMsg(null);

    try {
      const updates: Partial<Lead> = {};
      let foundInfo: string[] = [];

      // 1. Buscar CNPJ e sócios se não tiver CNPJ ainda
      if (!lead.cnpj && lead.companyName) {
        try {
          const enriched = await cnpjEnrichmentService.searchCnpjByNameAndCity(lead.companyName, lead.city);
          if (enriched) {
            updates.cnpj = enriched.cnpj;
            if (enriched.decisionMaker) updates.decisionMaker = enriched.decisionMaker;
            if (enriched.email && !lead.email) updates.email = enriched.email;
            if (enriched.address && !lead.address) updates.address = enriched.address;
            if (enriched.phone && !lead.phone) updates.phone = enriched.phone;
            if (enriched.city && !lead.city) updates.city = enriched.city;
            if (enriched.state && !lead.state) updates.state = enriched.state;
            if (enriched.cnaePrincipal && !lead.category) updates.category = enriched.cnaePrincipal;

            const qsaInfo = enriched.qsa.map(q => `${q.nome} (${q.qualificacao})`).join(', ');
            const existingNotes = lead.notes || '';
            updates.notes = existingNotes ? `${existingNotes} | Sócios: ${qsaInfo}` : `Sócios: ${qsaInfo}`;

            foundInfo.push(`CNPJ: ${enriched.cnpj}`);
            if (enriched.decisionMaker) foundInfo.push(`Decisor: ${enriched.decisionMaker}`);
          } else {
            foundInfo.push('CNPJ não encontrado');
          }
        } catch (err: any) {
          foundInfo.push('Erro na busca CNPJ');
        }
      } else if (lead.cnpj) {
        // Se já tem CNPJ mas falta decisor, consultar direto
        if (!lead.decisionMaker) {
          try {
            const enriched = await cnpjEnrichmentService.consultCnpj(lead.cnpj);
            if (enriched) {
              if (enriched.decisionMaker) updates.decisionMaker = enriched.decisionMaker;
              if (enriched.email && !lead.email) updates.email = enriched.email;
              foundInfo.push(`Decisor: ${enriched.decisionMaker || 'não encontrado'}`);
            }
          } catch {
            foundInfo.push('Erro na consulta CNPJ');
          }
        }
      }

      // 1.5 Se o lead não possui telefone nem CNPJ identificados (ou se faltar decisor/perfil)
      const hasRealPhone = lead.phone && !lead.phone.startsWith('li_') && /\d{10,}/.test(lead.phone.replace(/\D/g, ''));
      const hasCnpj = !!lead.cnpj || !!updates.cnpj;

      if ((!hasRealPhone && !hasCnpj) || !lead.decisionMaker || !lead.linkedinUrl) {
        const companyToSearch = lead.companyName || (lead.origin !== 'linkedin' ? lead.name : '');
        if (companyToSearch && typeof window !== 'undefined' && (window as any).electronAPI?.findLinkedInDecisionMakers) {
          try {
            const liRes = await (window as any).electronAPI.findLinkedInDecisionMakers({
              companyName: companyToSearch,
              city: lead.city
            });
            if (liRes?.success && liRes.leads && liRes.leads.length > 0) {
              const bestMatch = liRes.leads[0];
              if (!lead.decisionMaker && bestMatch.name) {
                updates.decisionMaker = bestMatch.name;
                foundInfo.push(`💼 Decisor LinkedIn: ${bestMatch.name} (${bestMatch.role || 'Liderança'})`);
              }
              if (!lead.linkedinUrl && bestMatch.profileUrl) {
                updates.linkedinUrl = bestMatch.profileUrl;
              }
              if (bestMatch.role) {
                const currentNotes = updates.notes || lead.notes || '';
                updates.notes = currentNotes
                  ? `${currentNotes} | Cargo LinkedIn: ${bestMatch.role} na ${bestMatch.company}`
                  : `Cargo LinkedIn: ${bestMatch.role} na ${bestMatch.company}`;
              }
            } else if (!hasRealPhone && !hasCnpj) {
              foundInfo.push('LinkedIn: decisor não localizado');
            }
          } catch {
            foundInfo.push('Erro na busca LinkedIn');
          }
        }
      }

      // 2. Verificar se tem WhatsApp (apenas se for telefone real)
      if (hasRealPhone && lead.phone) {
        try {
          if (typeof window !== 'undefined' && (window as any).electronAPI?.checkWhatsAppNumbers) {
            const waResult = await (window as any).electronAPI.checkWhatsAppNumbers([lead.phone]);
            const hasWa = waResult?.[lead.phone]?.exists;
            const currentTags = lead.tags || [];
            const newTags = currentTags.filter(t => t !== 'WhatsApp Confirmado' && t !== 'Sem WhatsApp');
            newTags.push(hasWa ? 'WhatsApp Confirmado' : 'Sem WhatsApp');
            updates.tags = newTags;
            foundInfo.push(hasWa ? '✅ WhatsApp confirmado' : '❌ Sem WhatsApp');
          }
        } catch {
          foundInfo.push('Erro na verificação WhatsApp');
        }
      }

      // Salvar atualizações
      if (Object.keys(updates).length > 0) {
        await leadRepository.updateLead(lead.id, updates);
      }

      setEnrichMsg(`${lead.companyName}: ${foundInfo.join(' | ')}`);
      setTimeout(() => setEnrichMsg(null), 6000);
    } catch (err: any) {
      setEnrichMsg(`Erro ao enriquecer ${lead.companyName}: ${err.message}`);
      setTimeout(() => setEnrichMsg(null), 5000);
    } finally {
      setEnrichingLeadId(null);
    }
  };

  // Enriquecer contatos em lote (ou apenas os selecionados)
  const handleBulkEnrich = async (targetIds?: number[]) => {
    const pool = targetIds && targetIds.length > 0
      ? leads.filter(l => l.id && targetIds.includes(l.id))
      : leads.filter(l => !l.cnpj || !l.decisionMaker);

    if (pool.length === 0) {
      setEnrichMsg('Nenhum contato pendente de enriquecimento.');
      setTimeout(() => setEnrichMsg(null), 4000);
      return;
    }

    if (!confirm(`Deseja enriquecer ${pool.length} contatos? Isso pode levar alguns instantes.`)) return;

    setBulkEnriching(true);
    setEnrichProgress({ current: 0, total: pool.length });

    for (let i = 0; i < pool.length; i++) {
      setEnrichProgress({ current: i + 1, total: pool.length });
      await handleEnrichLead(pool[i]);
      // Pequeno delay para não sobrecarregar APIs
      await new Promise(r => setTimeout(r, 400));
    }

    setBulkEnriching(false);
    setEnrichProgress(null);
    setEnrichMsg(`✅ Enriquecimento concluído! ${pool.length} contatos processados.`);
    setTimeout(() => setEnrichMsg(null), 5000);
  };

  // Localizar Decisores no LinkedIn especificamente para uma empresa
  const handleFindLinkedInDecisionMakers = async (lead: Lead) => {
    if (!lead.id) return;
    const company = lead.companyName || lead.name;
    if (!company) {
      alert('Preencha o nome da empresa para localizar os decisores no LinkedIn.');
      return;
    }
    setSearchingLiId(lead.id);
    try {
      if (typeof window !== 'undefined' && (window as any).electronAPI?.findLinkedInDecisionMakers) {
        const res = await (window as any).electronAPI.findLinkedInDecisionMakers({
          companyName: company,
          city: lead.city
        });
        if (res?.success && res.leads && res.leads.length > 0) {
          const top = res.leads[0];
          const confirmApply = confirm(
            `Encontramos ${res.leads.length} decisor(es) no LinkedIn para "${company}":\n\n` +
            `• Nome: ${top.name}\n` +
            `• Cargo: ${top.role}\n` +
            `• Empresa: ${top.company}\n\n` +
            `Deseja atualizar este contato com "${top.name}" como Decisor e vincular o Perfil do LinkedIn?`
          );
          if (confirmApply) {
            await leadRepository.updateLead(lead.id, {
              decisionMaker: top.name,
              linkedinUrl: top.profileUrl,
              notes: lead.notes ? `${lead.notes} | Decisor LinkedIn: ${top.role} na ${top.company}` : `Decisor LinkedIn: ${top.role} na ${top.company}`
            });
            setEnrichMsg(`✅ Decisor ${top.name} (${top.role}) vinculado com sucesso!`);
            setTimeout(() => setEnrichMsg(null), 5000);
          }
        } else {
          alert(`Nenhum perfil de decisor encontrado no LinkedIn para "${company}".`);
        }
      } else {
        alert('Disponível apenas no Desktop App.');
      }
    } catch (err: any) {
      alert(`Erro na busca do LinkedIn: ${err.message || err}`);
    } finally {
      setSearchingLiId(null);
    }
  };

  // Itens do Menu de Contexto (botão direito do mouse)
  const getLeadContextMenuItems = (lead: Lead): ContextMenuItem[] => [
    {
      id: 'quick-send',
      label: 'Enviar WhatsApp Rápido',
      icon: <MessageSquare className="w-3.5 h-3.5 text-emerald-400" />,
      shortcut: 'W',
      onClick: () => handleQuickSend(lead)
    },
    {
      id: 'linkedin-decisors',
      label: 'Buscar Decisores no LinkedIn',
      icon: <span className="text-sky-400 text-xs">💼</span>,
      shortcut: 'L',
      onClick: () => handleFindLinkedInDecisionMakers(lead)
    },
    {
      id: 'enrich',
      label: 'Enriquecer (CNPJ / Sócios)',
      icon: <Sparkles className="w-3.5 h-3.5 text-purple-400" />,
      shortcut: 'E',
      onClick: () => handleEnrichLead(lead)
    },
    {
      id: 'copy-phone',
      label: `Copiar WhatsApp: ${lead.phone}`,
      icon: <Phone className="w-3.5 h-3.5 text-slate-400" />,
      dividerBefore: true,
      onClick: () => copyToClipboard(lead.phone, 'Número de WhatsApp')
    },
    ...(lead.cnpj ? [{
      id: 'copy-cnpj',
      label: `Copiar CNPJ: ${lead.cnpj}`,
      icon: <Building2 className="w-3.5 h-3.5 text-slate-400" />,
      onClick: () => copyToClipboard(lead.cnpj!, 'CNPJ')
    }] : []),
    ...(lead.linkedinUrl ? [{
      id: 'open-linkedin',
      label: 'Abrir Perfil no LinkedIn',
      icon: <ExternalLink className="w-3.5 h-3.5 text-sky-400" />,
      onClick: () => window.open(lead.linkedinUrl, '_blank')
    }] : []),
    ...(lead.email ? [{
      id: 'copy-email',
      label: `Copiar E-mail: ${lead.email}`,
      icon: <Mail className="w-3.5 h-3.5 text-slate-400" />,
      onClick: () => copyToClipboard(lead.email!, 'E-mail')
    }] : []),
    {
      id: 'copy-all',
      label: 'Copiar Ficha Completa',
      icon: <Copy className="w-3.5 h-3.5 text-slate-400" />,
      onClick: () => {
        const fullData = `Empresa: ${lead.companyName || lead.name}\nDecisor: ${lead.decisionMaker || 'N/A'}\nTelefone: ${lead.phone}\nE-mail: ${lead.email || 'N/A'}\nCNPJ: ${lead.cnpj || 'N/A'}\nOrigem: ${getLeadOriginInfo(lead).label}\nStatus: ${lead.status}`;
        copyToClipboard(fullData, 'Ficha completa do lead');
      }
    },
    {
      id: 'edit',
      label: 'Editar Contato',
      icon: <Edit3 className="w-3.5 h-3.5 text-amber-400" />,
      dividerBefore: true,
      onClick: () => handleOpenEdit(lead)
    },
    {
      id: 'delete',
      label: 'Excluir Contato',
      icon: <Trash2 className="w-3.5 h-3.5 text-rose-400" />,
      color: 'text-rose-400 hover:text-rose-300 hover:bg-rose-500/10',
      onClick: () => lead.id && handleDelete(lead.id)
    }
  ];

  // Seleção múltipla para prospecção e ações em lote
  const isAllSelected = leads.length > 0 && leads.every(l => l.id && selectedLeadIds.includes(l.id));

  const handleToggleLead = (id: number) => {
    setSelectedLeadIds(prev => 
      prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
    );
  };

  const handleToggleSelectAll = () => {
    if (isAllSelected) {
      setSelectedLeadIds([]);
    } else {
      const allFilteredIds = leads.map(l => l.id!).filter(Boolean);
      setSelectedLeadIds(allFilteredIds);
    }
  };

  return (
    <div className="flex flex-col h-full overflow-hidden p-4 space-y-3 bg-slate-950 text-slate-100">
      
      {/* 1. BARRA SUPERIOR UNIFICADA (LINHA ÚNICA) */}
      <div className="bg-slate-900/50 p-3 rounded-xl border border-slate-800 flex flex-wrap items-center justify-between gap-3 shrink-0">
        {/* Esquerda: Busca e Filtros Rápidos */}
        <div className="flex items-center gap-2 flex-1 min-w-[280px]">
          {/* Input de busca textual */}
          <div className="relative flex-1 max-w-xs">
            <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Buscar empresa, sócio ou telefone..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-8 pr-3 py-1.5 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-emerald-500 transition-colors"
            />
          </div>

          {/* Dropdown compacto de Origem */}
          <select
            value={selectedOrigin}
            onChange={(e) => setSelectedOrigin(e.target.value)}
            className="bg-slate-950 border border-slate-800 text-slate-300 text-xs rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-emerald-500 font-medium"
          >
            <option value="all">Todas as Origens ({allLeadsCount})</option>
            <option value="maps">🗺️ Google Maps ({mapsCount})</option>
            <option value="linkedin">💼 LinkedIn ({linkedinCount})</option>
            <option value="manual">✍️ Manual ({manualCount})</option>
            <option value="cnpj">🏢 CNPJ ({cnpjCount})</option>
            <option value="csv">📄 Planilha CSV ({csvCount})</option>
          </select>

          {/* Dropdown compacto de Etapa */}
          <select
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value)}
            className="bg-slate-950 border border-slate-800 text-slate-300 text-xs rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-emerald-500 font-medium"
          >
            <option value="all">Todas as Etapas</option>
            <option value="novo">Novo</option>
            <option value="qualificado">Qualificado</option>
            <option value="contatado">Contatado</option>
            <option value="negociacao">Negociação</option>
            <option value="ganho">Ganho (Fechado)</option>
            <option value="perdido">Perdido</option>
          </select>
        </div>

        {/* Direita: Ações em Lote e Cadastro */}
        <div className="flex items-center gap-2 shrink-0">
          {/* Ação Condicional: Iniciar Prospecção com Selecionados */}
          {selectedLeadIds.length > 0 && (
            <Tooltip text="Carrega os contatos marcados diretamente na fila do Disparador">
              <button
                onClick={() => onStartCampaignWithLeads?.(selectedLeadIds)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-emerald-600 to-teal-500 hover:from-emerald-500 hover:to-teal-400 text-white rounded-lg text-xs font-bold shadow-md shadow-emerald-600/30 transition-all animate-in fade-in zoom-in-95 active:scale-95 whitespace-nowrap"
              >
                <Rocket className="w-3.5 h-3.5" />
                <span>Iniciar Prospecção ({selectedLeadIds.length})</span>
              </button>
            </Tooltip>
          )}

          {/* Botão Secundário: Enriquecer Selecionados */}
          <Tooltip text={selectedLeadIds.length > 0 ? `Enriquecer CNPJ e Sócios dos ${selectedLeadIds.length} leads selecionados` : 'Selecione leads para enriquecer em lote'}>
            <button
              onClick={() => handleBulkEnrich(selectedLeadIds.length > 0 ? selectedLeadIds : undefined)}
              disabled={bulkEnriching || leads.length === 0}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all whitespace-nowrap ${
                selectedLeadIds.length > 0
                  ? 'bg-purple-600/20 border-purple-500/40 text-purple-300 hover:bg-purple-600/30'
                  : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
              } disabled:opacity-50`}
            >
              {bulkEnriching ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5 text-purple-400" />}
              <span>{selectedLeadIds.length > 0 ? `Enriquecer (${selectedLeadIds.length})` : 'Enriquecer'}</span>
            </button>
          </Tooltip>

          {/* Botão de Destaque: Buscar no Google Maps */}
          <button
            onClick={() => {
              setAddModalTab('maps');
              setIsAddModalOpen(true);
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-sky-950/80 hover:bg-sky-900 border border-sky-500/40 text-sky-300 rounded-lg text-xs font-bold shadow-md transition-all active:scale-95 whitespace-nowrap"
            title="Extrair leads e empresas diretamente do Google Maps"
          >
            <span>🗺️ Buscar no Google Maps</span>
          </button>

          {/* Botão Primário: Adicionar Contato */}
          <button
            onClick={() => {
              setAddModalTab('manual');
              setIsAddModalOpen(true);
            }}
            className="flex items-center gap-1.5 px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold shadow-md shadow-emerald-600/20 transition-all active:scale-95 whitespace-nowrap"
          >
            <UserPlus className="w-3.5 h-3.5" />
            <span>+ Adicionar Contato</span>
          </button>

          {/* Toggle de Visualização Compacto */}
          <div className="flex bg-slate-950 border border-slate-800 rounded-lg p-0.5">
            <button
              onClick={() => setViewMode('list')}
              title="Visualização em Tabela"
              className={`p-1.5 rounded-md text-xs transition-colors ${
                viewMode === 'list' ? 'bg-slate-800 text-emerald-400' : 'text-slate-500 hover:text-slate-300'
              }`}
            >
              <List className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setViewMode('kanban')}
              title="Visualização em Kanban"
              className={`p-1.5 rounded-md text-xs transition-colors ${
                viewMode === 'kanban' ? 'bg-slate-800 text-emerald-400' : 'text-slate-500 hover:text-slate-300'
              }`}
            >
              <Kanban className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* BANNER DE PROGRESSO DE ENRIQUECIMENTO EM LOTE */}
      {enrichProgress && (
        <div className="bg-purple-950/60 border border-purple-800/80 rounded-xl p-3 flex flex-col gap-2 animate-in fade-in shrink-0">
          <div className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-2 text-purple-200 font-semibold">
              <Loader2 className="w-4 h-4 animate-spin text-purple-400" />
              <span>Enriquecendo contatos com CNPJ, Sócios e WhatsApp ({enrichProgress.current} de {enrichProgress.total})...</span>
            </div>
            <span className="font-mono text-purple-300 text-xs">
              {Math.round((enrichProgress.current / enrichProgress.total) * 100)}%
            </span>
          </div>
          <div className="w-full bg-slate-900 rounded-full h-1.5 overflow-hidden">
            <div 
              className="bg-purple-500 h-full transition-all duration-300 rounded-full"
              style={{ width: `${(enrichProgress.current / enrichProgress.total) * 100}%` }}
            />
          </div>
        </div>
      )}

      {/* MENSAGEM / TOAST DE ENRIQUECIMENTO */}
      {enrichMsg && !enrichProgress && (
        <div className="bg-purple-950/50 border border-purple-800/60 rounded-xl px-3.5 py-2 flex items-center justify-between text-xs text-purple-200 animate-in fade-in shrink-0">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-purple-400 shrink-0" />
            <span>{enrichMsg}</span>
          </div>
          <button onClick={() => setEnrichMsg(null)} className="text-purple-400 hover:text-purple-200">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* 3. MODAL UNIFICADO: ADICIONAR NOVO CONTATO / MAPS / CNPJ / CSV */}
      <AddLeadModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
      />

      {/* 4. MODAL COMPLETO: EDITAR CONTATO */}
      {editingLead && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl p-5 w-full max-w-lg space-y-4 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <Edit3 className="w-5 h-5 text-emerald-400" />
                <h3 className="text-sm font-bold text-slate-100">Editar Contato</h3>
              </div>
              <button onClick={() => setEditingLead(null)} className="text-slate-400 hover:text-slate-200">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="col-span-2">
                <label className="block text-[11px] font-semibold text-slate-400 mb-1">Nome da Empresa</label>
                <input
                  type="text"
                  value={editForm.companyName || ''}
                  onChange={(e) => setEditForm({ ...editForm, companyName: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-slate-100 focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-400 mb-1">Decisor / Responsável</label>
                <input
                  type="text"
                  value={editForm.decisionMaker || ''}
                  onChange={(e) => setEditForm({ ...editForm, decisionMaker: e.target.value })}
                  placeholder="Nome do sócio ou decisor"
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-slate-100 focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-400 mb-1">Nome de Contato</label>
                <input
                  type="text"
                  value={editForm.name || ''}
                  onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-slate-100 focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-400 mb-1">WhatsApp / Telefone</label>
                <input
                  type="text"
                  value={editForm.phone || ''}
                  onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 font-mono text-slate-100 focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-400 mb-1">E-mail</label>
                <input
                  type="email"
                  value={editForm.email || ''}
                  onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                  placeholder="contato@empresa.com.br"
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-slate-100 focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-400 mb-1">CNPJ</label>
                <input
                  type="text"
                  value={editForm.cnpj || ''}
                  onChange={(e) => setEditForm({ ...editForm, cnpj: e.target.value })}
                  placeholder="00.000.000/0000-00"
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 font-mono text-slate-100 focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-400 mb-1">Cidade / Estado</label>
                <input
                  type="text"
                  value={editForm.city || ''}
                  onChange={(e) => setEditForm({ ...editForm, city: e.target.value })}
                  placeholder="São Paulo, SP"
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-slate-100 focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-400 mb-1">Origem do Contato</label>
                <select
                  value={editForm.origin || 'manual'}
                  onChange={(e) => setEditForm({ ...editForm, origin: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-slate-100 focus:outline-none focus:border-emerald-500"
                >
                  <option value="maps">🗺️ Google Maps</option>
                  <option value="manual">✍️ Cadastro Manual</option>
                  <option value="cnpj">🏢 Consulta CNPJ</option>
                  <option value="csv">📄 Planilha CSV</option>
                  <option value="whatsapp">💬 WhatsApp</option>
                  <option value="email">✉️ E-mail</option>
                  <option value="instagram">📸 Instagram</option>
                  <option value="linkedin">💼 LinkedIn</option>
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-400 mb-1">Status no CRM</label>
                <select
                  value={editForm.status || 'novo'}
                  onChange={(e) => setEditForm({ ...editForm, status: e.target.value as LeadStatus })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-slate-100 focus:outline-none focus:border-emerald-500"
                >
                  {Object.entries(STATUS_CONFIG).map(([k, c]) => (
                    <option key={k} value={k}>{c.label}</option>
                  ))}
                </select>
              </div>

              <div className="col-span-2">
                <label className="block text-[11px] font-semibold text-slate-400 mb-1">Perfil do LinkedIn (URL)</label>
                <input
                  type="text"
                  placeholder="https://www.linkedin.com/in/nome-do-perfil"
                  value={editForm.linkedinUrl || ''}
                  onChange={(e) => setEditForm({ ...editForm, linkedinUrl: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 font-mono text-xs text-slate-100 focus:outline-none focus:border-sky-500"
                />
              </div>

              <div className="col-span-2">
                <label className="block text-[11px] font-semibold text-slate-400 mb-1">Anotações / Histórico de Negociação</label>
                <textarea
                  rows={3}
                  value={editForm.notes || ''}
                  onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
                  placeholder="Detalhes da conversa, propostas enviadas, sócios..."
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-slate-100 focus:outline-none focus:border-emerald-500"
                />
              </div>
            </div>

            <div className="flex items-center justify-between pt-3 border-t border-slate-800">
              <button
                type="button"
                onClick={() => editingLead.id && handleDelete(editingLead.id)}
                className="flex items-center gap-1 text-xs text-rose-400 hover:text-rose-300 font-semibold px-2 py-1 rounded"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Excluir Contato
              </button>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setEditingLead(null)}
                  className="px-3.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleSaveEdit}
                  className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-md shadow-emerald-600/20"
                >
                  <Check className="w-4 h-4" />
                  Salvar Alterações
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 5. VISUALIZAÇÃO PRINCIPAL: TABELA SAAS ESTRUTURADA */}
      {viewMode === 'list' && (
        <div className="flex-1 flex flex-col bg-slate-900/40 rounded-xl border border-slate-800 overflow-hidden shadow-sm">
          {leads.length === 0 ? (
            <div className="text-center py-16 p-8 space-y-3 m-auto">
              <div className="w-12 h-12 rounded-full bg-slate-800/80 flex items-center justify-center mx-auto text-slate-500">
                <Search className="w-6 h-6" />
              </div>
              <h4 className="text-sm font-bold text-slate-300">Nenhum contato localizado</h4>
              <p className="text-xs text-slate-500 max-w-sm mx-auto">
                Não encontramos contatos com os filtros atuais. Você pode adicionar manualmente ou buscar empresas no Google Maps.
              </p>
              <button
                onClick={() => setIsAddModalOpen(true)}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition-colors inline-flex items-center gap-2"
              >
                <UserPlus className="w-4 h-4" />
                Adicionar Contatos
              </button>
            </div>
          ) : (
            <>
              {/* CABEÇALHO DA TABELA */}
              <div className="bg-slate-900/80 border-b border-slate-800 px-4 py-2.5 grid grid-cols-12 text-[11px] font-bold text-slate-400 uppercase tracking-wider items-center select-none shrink-0">
                <div className="col-span-1 flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={isAllSelected}
                    onChange={handleToggleSelectAll}
                    title={isAllSelected ? "Desmarcar todos" : "Selecionar todos os leads filtrados"}
                    className="w-4 h-4 rounded border-slate-700 text-emerald-500 focus:ring-0 cursor-pointer accent-emerald-500"
                  />
                  <span className="text-[10px] text-slate-500 font-mono">
                    {selectedLeadIds.length > 0 ? `${selectedLeadIds.length}/${leads.length}` : ''}
                  </span>
                </div>
                <div className="col-span-4">Empresa & Cidade</div>
                <div className="col-span-3">Decisor / Telefone</div>
                <div className="col-span-2">Origem & Etapa</div>
                <div className="col-span-2 text-right pr-2">Ações Rápidas</div>
              </div>

              {/* CORPO DA TABELA COM SCROLL */}
              <div className="flex-1 overflow-y-auto divide-y divide-slate-800/40">
                {leads.map((lead) => {
                  const isSelected = lead.id ? selectedLeadIds.includes(lead.id) : false;
                  const statusCfg = STATUS_CONFIG[lead.status];
                  const originInfo = getLeadOriginInfo(lead);
                  const hasPhone = !!(lead.phone && lead.phone.replace(/\D/g, '').length >= 8 && !lead.phone.startsWith('li_'));

                  return (
                    <div
                      key={lead.id}
                      onContextMenu={(e) => {
                        e.preventDefault();
                        setContextMenu({ x: e.clientX, y: e.clientY, lead });
                      }}
                      className={`grid grid-cols-12 px-4 py-2.5 items-center transition-colors cursor-context-menu ${
                        isSelected 
                          ? 'bg-emerald-950/20 hover:bg-emerald-950/30' 
                          : 'hover:bg-slate-800/30'
                      }`}
                    >
                      {/* Checkbox de seleção */}
                      <div className="col-span-1 flex items-center">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => lead.id && handleToggleLead(lead.id)}
                          className="w-4 h-4 rounded border-slate-700 text-emerald-500 focus:ring-0 cursor-pointer accent-emerald-500"
                        />
                      </div>

                      {/* Empresa & Cidade */}
                      <div className="col-span-4 min-w-0 pr-3 space-y-0.5">
                        <div className="flex items-center gap-1.5 truncate">
                          <span className="font-bold text-slate-100 text-xs truncate">
                            {lead.companyName || lead.name}
                          </span>
                          {lead.cnpj && (
                            <span className="text-[9px] font-mono px-1 py-0.2 rounded bg-slate-800 text-slate-400 shrink-0">
                              CNPJ
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-slate-400 truncate flex items-center gap-1">
                          <MapPin className="w-3 h-3 text-slate-500 shrink-0" />
                          <span className="truncate">{lead.city || 'Local não informado'}</span>
                          {lead.category && (
                            <span className="text-slate-500 truncate">• {lead.category}</span>
                          )}
                        </div>
                      </div>

                      {/* Decisor & Telefone & Badge WA */}
                      <div className="col-span-3 min-w-0 pr-3 space-y-0.5">
                        <div className="text-xs text-slate-200 font-medium truncate flex items-center gap-1">
                          <User className="w-3 h-3 text-emerald-400 shrink-0" />
                          <span className="truncate">{lead.decisionMaker || lead.name || 'Decisor não localizado'}</span>
                        </div>
                        <div className="flex items-center gap-2 text-[11px]">
                          <span className="font-mono text-slate-400">{lead.phone || 'Sem telefone'}</span>
                          {hasPhone ? (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded-full text-[9px] font-bold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                              Tem WA
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded-full text-[9px] font-medium bg-rose-500/10 text-rose-400 border border-rose-500/20">
                              <span className="w-1.5 h-1.5 rounded-full bg-rose-400" />
                              Sem WA
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Origem & Etapa */}
                      <div className="col-span-2 min-w-0 pr-2 flex flex-col gap-1 items-start">
                        <Tooltip text={`Origem: ${originInfo.label}`}>
                          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded border truncate max-w-full ${originInfo.bg} ${originInfo.border} ${originInfo.text}`}>
                            {originInfo.icon} {originInfo.label}
                          </span>
                        </Tooltip>

                        <select
                          value={lead.status}
                          onChange={(e) => lead.id && handleUpdateStatus(lead.id, e.target.value as LeadStatus)}
                          className="text-[10px] bg-slate-950 border border-slate-700 rounded px-1.5 py-0.5 text-slate-300 focus:outline-none focus:border-emerald-500 cursor-pointer"
                        >
                          {Object.entries(STATUS_CONFIG).map(([k, c]) => (
                            <option key={k} value={k}>{c.label}</option>
                          ))}
                        </select>
                      </div>

                      {/* Ações Rápidas */}
                      <div className="col-span-2 flex items-center justify-end gap-1.5 pr-2">
                        {/* Botão de WhatsApp Rápido */}
                        <Tooltip text="Disparar no WhatsApp imediato" shortcut="W">
                          <button
                            onClick={() => handleQuickSend(lead)}
                            className="p-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg transition-colors shadow-sm"
                          >
                            <MessageSquare className="w-3.5 h-3.5" />
                          </button>
                        </Tooltip>

                        {/* Menu de Três Pontinhos (Ações Secundárias) */}
                        <Tooltip text="Mais opções (Buscar Decisores, Enriquecer, Editar, Excluir)">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setContextMenu({ x: e.clientX, y: e.clientY, lead });
                            }}
                            className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-lg transition-colors border border-slate-700/60"
                          >
                            <MoreVertical className="w-3.5 h-3.5" />
                          </button>
                        </Tooltip>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      )}

      {/* 6. VISUALIZAÇÃO KANBAN (QUADRO DE PROCESSO) */}
      {viewMode === 'kanban' && (
        <div className="flex-1 flex gap-3 overflow-x-auto pb-2 scrollbar-thin">
          {(Object.keys(STATUS_CONFIG) as LeadStatus[]).map((statusKey) => {
            const columnLeads = leads.filter(l => l.status === statusKey);
            const cfg = STATUS_CONFIG[statusKey];

            return (
              <div
                key={statusKey}
                className="w-72 shrink-0 bg-slate-900/50 rounded-2xl border border-slate-800/80 p-3 flex flex-col h-full overflow-hidden"
              >
                {/* Cabeçalho da Coluna */}
                <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-800 shrink-0">
                  <div className="flex items-center gap-2">
                    <span className={`w-2.5 h-2.5 rounded-full ${cfg.bg} ${cfg.border} border`} />
                    <span className="text-xs font-bold text-slate-200">{cfg.label}</span>
                  </div>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 font-bold">
                    {columnLeads.length}
                  </span>
                </div>

                {/* Cards da Coluna */}
                <div className="space-y-2 overflow-y-auto pr-1 flex-1">
                  {columnLeads.map((lead) => {
                    const originInfo = getLeadOriginInfo(lead);
                    return (
                      <div
                        key={lead.id}
                        onContextMenu={(e) => {
                          e.preventDefault();
                          setContextMenu({ x: e.clientX, y: e.clientY, lead });
                        }}
                        className="p-3 bg-slate-950/85 border border-slate-800 rounded-xl space-y-2 hover:border-slate-700 transition-all text-xs shadow-sm cursor-context-menu"
                      >
                        <div className="flex items-start justify-between gap-1">
                          <div className="font-bold text-slate-100 line-clamp-1">{lead.companyName}</div>
                          <Tooltip text="Excluir lead">
                            <button
                              onClick={() => lead.id && handleDelete(lead.id)}
                              className="text-slate-500 hover:text-rose-400 transition-colors p-0.5"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </Tooltip>
                        </div>

                        {/* Origem do Contato */}
                        <div className="flex items-center justify-between">
                          <Tooltip text={`Origem: ${originInfo.label}`}>
                            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded border ${originInfo.bg} ${originInfo.border} ${originInfo.text}`}>
                              {originInfo.icon} {originInfo.label}
                            </span>
                          </Tooltip>
                          {lead.city && <span className="text-[10px] text-slate-500">{lead.city}</span>}
                        </div>

                        {lead.decisionMaker && (
                          <div className="text-[10px] text-emerald-400/90 flex items-center gap-1 font-medium">
                            <User className="w-3 h-3 shrink-0" />
                            <span className="truncate">{lead.decisionMaker}</span>
                          </div>
                        )}

                        <div className="text-[10px] text-slate-400 font-mono flex items-center justify-between">
                          <span>{lead.phone}</span>
                          {lead.linkedinUrl && (
                            <Tooltip text="Abrir perfil no LinkedIn">
                              <a
                                href={lead.linkedinUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="text-sky-400 hover:text-sky-300 font-sans font-medium hover:underline text-[10px]"
                              >
                                💼 LinkedIn ↗
                              </a>
                            </Tooltip>
                          )}
                        </div>

                        {lead.notes && (
                          <div className="text-[10px] text-slate-400 bg-slate-900/60 p-1.5 rounded border border-slate-800/80 line-clamp-2 italic">
                            {lead.notes}
                          </div>
                        )}

                        <div className="flex items-center justify-between pt-2 border-t border-slate-800/80">
                          <Tooltip text="Alterar etapa do funil">
                            <select
                              value={lead.status}
                              onChange={(e) => lead.id && handleUpdateStatus(lead.id, e.target.value as LeadStatus)}
                              className="text-[10px] bg-slate-900 border border-slate-700 rounded px-1.5 py-0.5 text-slate-300 focus:outline-none"
                            >
                              {Object.entries(STATUS_CONFIG).map(([k, c]) => (
                                <option key={k} value={k}>{c.label}</option>
                              ))}
                            </select>
                          </Tooltip>

                          <div className="flex gap-1">
                            <Tooltip text="Enriquecer CNPJ / Sócios">
                              <button
                                onClick={() => handleEnrichLead(lead)}
                                disabled={enrichingLeadId === lead.id || bulkEnriching}
                                className="p-1 bg-purple-950/80 hover:bg-purple-900 border border-purple-700/60 text-purple-300 rounded disabled:opacity-50"
                              >
                                {enrichingLeadId === lead.id ? (
                                  <Loader2 className="w-3 h-3 animate-spin text-purple-400" />
                                ) : (
                                  <Sparkles className="w-3 h-3 text-purple-400" />
                                )}
                              </button>
                            </Tooltip>
                            <Tooltip text="Buscar Decisores no LinkedIn">
                              <button
                                onClick={() => handleFindLinkedInDecisionMakers(lead)}
                                disabled={searchingLiId === lead.id}
                                className="p-1 bg-blue-950/80 hover:bg-blue-900 border border-blue-700/60 text-blue-300 rounded disabled:opacity-50"
                              >
                                {searchingLiId === lead.id ? (
                                  <Loader2 className="w-3 h-3 animate-spin text-blue-400" />
                                ) : (
                                  <span>💼</span>
                                )}
                              </button>
                            </Tooltip>
                            <Tooltip text="Editar ficha do lead">
                              <button
                                onClick={() => handleOpenEdit(lead)}
                                className="p-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded"
                              >
                                <Edit3 className="w-3 h-3" />
                              </button>
                            </Tooltip>
                            <Tooltip text="Enviar WhatsApp imediato">
                              <button
                                onClick={() => handleQuickSend(lead)}
                                className="p-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded"
                              >
                                <MessageSquare className="w-3 h-3" />
                              </button>
                            </Tooltip>
                          </div>
                        </div>
                      </div>
                    );
                  })}

                  {columnLeads.length === 0 && (
                    <div className="text-center py-8 text-[11px] text-slate-600">
                      Nenhum contato nesta etapa
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Context Menu flutuante para Leads */}
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          title={contextMenu.lead.companyName || contextMenu.lead.name}
          subtitle={`${contextMenu.lead.phone || 'Sem telefone'} • ${getLeadOriginInfo(contextMenu.lead).label}`}
          items={getLeadContextMenuItems(contextMenu.lead)}
          onClose={() => setContextMenu(null)}
        />
      )}

      {/* Toast de notificação / feedback */}
      {toastMsg && (
        <div className="fixed bottom-6 right-6 z-50 bg-slate-900/95 border border-emerald-500/40 text-emerald-300 text-xs px-4 py-2.5 rounded-2xl shadow-2xl backdrop-blur-xl animate-in fade-in slide-in-from-bottom-3 duration-200 flex items-center gap-2 ring-1 ring-white/10">
          <span>{toastMsg}</span>
        </div>
      )}

      {/* Modal Unificado de Cadastro / Busca no Google Maps */}
      <AddLeadModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        defaultTab={addModalTab}
      />
    </div>
  );
};
