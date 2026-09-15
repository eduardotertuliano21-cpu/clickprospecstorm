import React, { useState } from 'react';
import { 
  UserPlus, 
  Search, 
  Building2, 
  UploadCloud, 
  X, 
  Phone, 
  User, 
  MapPin, 
  Tag, 
  CheckCircle2, 
  AlertCircle, 
  Sparkles,
  FileSpreadsheet,
  Check,
  Filter,
  CheckCheck,
  Briefcase,
  ExternalLink
} from 'lucide-react';
import { leadRepository } from '../../db/repositories/leadRepository';
import { cnpjEnrichmentService, type EnrichedCnpjData } from '../../services/cnpjEnrichmentService';
import { mapsScraperService } from '../../services/mapsScraperService';
import { type Lead, type LeadStatus } from '../../db';

export interface MapsEnrichedLead extends Omit<Lead, 'id' | 'createdAt' | 'updatedAt'> {
  whatsappStatus?: 'checking' | 'yes' | 'no' | 'unverified';
  cnpjInfo?: {
    cnpj?: string;
    decisionMaker?: string;
    qsa?: string[];
    status: 'found' | 'not_found' | 'enriching';
  };
}

interface AddLeadModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultTab?: 'manual' | 'maps' | 'cnpj' | 'csv' | 'linkedin';
  onLeadAdded?: () => void;
}

export const AddLeadModal: React.FC<AddLeadModalProps> = ({
  isOpen,
  onClose,
  defaultTab = 'maps',
  onLeadAdded
}) => {
  const [activeTab, setActiveTab] = useState<'manual' | 'maps' | 'cnpj' | 'csv' | 'linkedin'>(defaultTab);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // --- 1. ESTADOS DO CADASTRO MANUAL ---
  const [mName, setMName] = useState('');
  const [mCompany, setMCompany] = useState('');
  const [mPhone, setMPhone] = useState('');
  const [mCnpj, setMCnpj] = useState('');
  const [mCity, setMCity] = useState('');
  const [mCategory, setMCategory] = useState('');
  const [mDecisionMaker, setMDecisionMaker] = useState('');
  const [mStatus, setMStatus] = useState<LeadStatus>('novo');
  const [mNotes, setMNotes] = useState('');
  const [mConsulting, setMConsulting] = useState(false);
  const [mError, setMError] = useState<string | null>(null);

  // --- 2. ESTADOS DO GOOGLE MAPS AUTOMATIZADO ---
  const [mapsNiche, setMapsNiche] = useState('Clínica Odontológica');
  const [mapsCity, setMapsCity] = useState('São Paulo, SP');
  const [isMapsSearching, setIsMapsSearching] = useState(false);
  const [mapsResults, setMapsResults] = useState<MapsEnrichedLead[]>([]);
  const [selectedMapsIndices, setSelectedMapsIndices] = useState<number[]>([]);
  const [isEnrichingBatch, setIsEnrichingBatch] = useState(false);
  const [enrichProgress, setEnrichProgress] = useState<{ current: number; total: number } | null>(null);

  // --- 3. ESTADOS DA CONSULTA CNPJ ---
  const [cnpjInput, setCnpjInput] = useState('');
  const [isEnriching, setIsEnriching] = useState(false);
  const [enrichedData, setEnrichedData] = useState<EnrichedCnpjData | null>(null);
  const [enrichError, setEnrichError] = useState<string | null>(null);

  // --- 4. ESTADOS DO CSV ---
  const [csvText, setCsvText] = useState('');
  const [csvParsed, setCsvParsed] = useState<Array<Omit<Lead, 'id' | 'createdAt' | 'updatedAt'>>>([]);

  // --- 5. ESTADOS DO LOCALIZADOR LINKEDIN B2B ---
  const [liRole, setLiRole] = useState('CEO, Diretor');
  const [liCompany, setLiCompany] = useState('');
  const [liLocation, setLiLocation] = useState('São Paulo, Brasil');
  const [isLiSearching, setIsLiSearching] = useState(false);
  const [liResults, setLiResults] = useState<Array<{
    name: string;
    role: string;
    company: string;
    location?: string;
    profileUrl: string;
    snippet?: string;
  }>>([]);
  const [selectedLiIndices, setSelectedLiIndices] = useState<number[]>([]);
  const [isSavingLi, setIsSavingLi] = useState(false);

  if (!isOpen) return null;

  // --- AÇÕES DO CADASTRO MANUAL ---
  const handleManualCnpjConsult = async () => {
    if (!mCnpj.trim()) return;
    setMConsulting(true);
    setMError(null);

    try {
      const data = await cnpjEnrichmentService.consultCnpj(mCnpj);
      if (data) {
        if (!mCompany) setMCompany(data.nomeFantasia || data.razaoSocial);
        if (!mDecisionMaker) setMDecisionMaker(data.decisionMaker);
        if (!mName) setMName(data.decisionMaker || data.nomeFantasia);
        if (!mPhone && data.phone) setMPhone(data.phone);
        if (!mCity && data.city) setMCity(`${data.city}, ${data.state || ''}`);
        if (!mCategory && data.cnaePrincipal) setMCategory(data.cnaePrincipal);
      } else {
        setMError('CNPJ não localizado nas bases públicas.');
      }
    } catch (err: any) {
      setMError(err.message || 'Erro na consulta do CNPJ');
    } finally {
      setMConsulting(false);
    }
  };

  const handleManualSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMError(null);

    const cleanPhone = mPhone.replace(/\D/g, '');
    if (cleanPhone.length < 8) {
      setMError('Telefone inválido. Informe DDD + Número de WhatsApp.');
      return;
    }

    try {
      await leadRepository.addLead({
        name: mName.trim() || mCompany.trim() || 'Contato',
        companyName: mCompany.trim() || mName.trim() || 'Empresa',
        phone: cleanPhone,
        cnpj: mCnpj.trim() || undefined,
        city: mCity.trim() || undefined,
        category: mCategory.trim() || undefined,
        decisionMaker: mDecisionMaker.trim() || undefined,
        status: mStatus,
        origin: 'manual',
        notes: mNotes.trim() || undefined,
        tags: ['Cadastro Manual']
      });

      setSuccessMessage(`Contato ${mName || mCompany} cadastrado com sucesso!`);
      setMName('');
      setMCompany('');
      setMPhone('');
      setMCnpj('');
      setMCity('');
      setMCategory('');
      setMDecisionMaker('');
      setMNotes('');
      onLeadAdded?.();
      setTimeout(() => setSuccessMessage(null), 3500);
    } catch (err: any) {
      setMError(`Erro ao salvar: ${err.message}`);
    }
  };

  // --- AÇÕES DO GOOGLE MAPS AUTOMATIZADO ---
  const handleMapsSearch = async () => {
    if (!mapsNiche || !mapsCity) return;
    setIsMapsSearching(true);
    setSuccessMessage(null);
    setMapsResults([]);
    setSelectedMapsIndices([]);

    try {
      const places = await mapsScraperService.searchPlaces(mapsNiche, mapsCity, 25);
      const mapped: MapsEnrichedLead[] = places.map((p) => ({
        ...p,
        whatsappStatus: 'unverified'
      }));

      setMapsResults(mapped);
      // Todos os contatos vêm selecionados por padrão!
      setSelectedMapsIndices(mapped.map((_, i) => i));
    } catch (err: any) {
      alert(`Erro na busca do Google Maps: ${err.message}`);
    } finally {
      setIsMapsSearching(false);
    }
  };

  // Enriquecer contatos (Busca CNPJ / Sócios) e verifica WhatsApp
  const handleEnrichAndVerify = async () => {
    if (mapsResults.length === 0) return;
    setIsEnrichingBatch(true);
    setEnrichProgress({ current: 0, total: mapsResults.length });

    // 1. Verificação em lote de WhatsApp se o ElectronAPI estiver disponível
    const phones = mapsResults.map(m => m.phone).filter(Boolean);
    let waCheckResults: Record<string, { exists: boolean }> = {};
    if (typeof window !== 'undefined' && (window as any).electronAPI?.checkWhatsAppNumbers) {
      try {
        waCheckResults = await (window as any).electronAPI.checkWhatsAppNumbers(phones);
      } catch (err) {
        console.warn('Erro ao verificar WhatsApp via API nativa:', err);
      }
    }

    const updated = [...mapsResults];

    for (let i = 0; i < updated.length; i++) {
      setEnrichProgress({ current: i + 1, total: updated.length });
      const item = updated[i];

      // Atualiza WhatsApp status
      if (waCheckResults[item.phone]) {
        item.whatsappStatus = waCheckResults[item.phone].exists ? 'yes' : 'no';
      } else {
        const cleanDigits = item.phone.replace(/\D/g, '');
        item.whatsappStatus = cleanDigits.length >= 10 ? 'yes' : 'no';
      }

      // 2. Busca enriquecimento de CNPJ e Sócios na Receita
      try {
        const enriched = await cnpjEnrichmentService.searchCnpjByNameAndCity(item.name, item.city);
        if (enriched) {
          item.cnpj = enriched.cnpj;
          item.decisionMaker = enriched.decisionMaker;
          item.cnpjInfo = {
            cnpj: enriched.cnpj,
            decisionMaker: enriched.decisionMaker,
            qsa: enriched.qsa.map(q => `${q.nome} (${q.qualificacao})`),
            status: 'found'
          };
          if (enriched.phone && !item.phone) item.phone = enriched.phone;
          if (enriched.address && !item.address) item.address = enriched.address;
        } else {
          item.cnpjInfo = { status: 'not_found' };
        }
      } catch {
        item.cnpjInfo = { status: 'not_found' };
      }

      setMapsResults([...updated]);
    }

    setIsEnrichingBatch(false);
    setEnrichProgress(null);
  };

  // Salvar leads selecionados no CRM
  const handleSaveMapsLeads = async () => {
    const leadsToSave = mapsResults.filter((_, i) => selectedMapsIndices.includes(i));
    if (leadsToSave.length === 0) return;

    try {
      const formatted = leadsToSave.map(l => {
        const tags = [...(l.tags || [])];
        if (l.whatsappStatus === 'yes') tags.push('WhatsApp Confirmado');
        if (l.cnpjInfo?.status === 'found') tags.push('CNPJ Enriquecido');

        let notes = l.notes || '';
        if (l.cnpjInfo?.decisionMaker) {
          notes = `Decisor: ${l.cnpjInfo.decisionMaker}. ${notes}`;
        }
        if (l.cnpjInfo?.qsa && l.cnpjInfo.qsa.length > 0) {
          notes = `${notes} | Sócios: ${l.cnpjInfo.qsa.slice(0, 3).join(', ')}`;
        }

        return {
          name: l.decisionMaker || l.name,
          companyName: l.companyName,
          phone: l.phone,
          cnpj: l.cnpj,
          address: l.address,
          city: l.city,
          category: l.category,
          decisionMaker: l.decisionMaker,
          status: 'novo' as LeadStatus,
          origin: 'maps',
          tags,
          notes: notes.trim()
        };
      });

      const { added, updated } = await leadRepository.bulkAddLeads(formatted);
      setSuccessMessage(`${added} contatos salvos com sucesso! (${updated} já existiam e foram atualizados)`);
      onLeadAdded?.();
      setTimeout(() => {
        setSuccessMessage(null);
        onClose();
      }, 2500);
    } catch (err: any) {
      alert(`Erro ao salvar leads: ${err.message}`);
    }
  };

  // Ações de seleção rápida
  const handleSelectAll = () => setSelectedMapsIndices(mapsResults.map((_, i) => i));
  const handleDeselectAll = () => setSelectedMapsIndices([]);
  const handleSelectOnlyWithWhatsApp = () => {
    const idxs = mapsResults.map((m, i) => (m.whatsappStatus === 'yes' ? i : -1)).filter(i => i !== -1);
    setSelectedMapsIndices(idxs);
  };
  const handleSelectOnlyNoWhatsApp = () => {
    const idxs = mapsResults.map((m, i) => (m.whatsappStatus === 'no' ? i : -1)).filter(i => i !== -1);
    setSelectedMapsIndices(idxs);
  };
  const handleExcludeNoWhatsApp = () => {
    const idxs = mapsResults.map((m, i) => (m.whatsappStatus !== 'no' ? i : -1)).filter(i => i !== -1);
    setSelectedMapsIndices(idxs);
  };

  // --- AÇÕES DA CONSULTA CNPJ ---
  const handleConsultCnpj = async () => {
    if (!cnpjInput.trim()) return;
    setIsEnriching(true);
    setEnrichError(null);
    setEnrichedData(null);

    try {
      const data = await cnpjEnrichmentService.consultCnpj(cnpjInput);
      if (data) {
        setEnrichedData(data);
      } else {
        setEnrichError('CNPJ não encontrado nas bases públicas.');
      }
    } catch (err: any) {
      setEnrichError(err.message || 'Erro ao consultar CNPJ');
    } finally {
      setIsEnriching(false);
    }
  };

  const handleSaveEnrichedCnpj = async () => {
    if (!enrichedData) return;
    try {
      await leadRepository.addLead({
        name: enrichedData.decisionMaker || enrichedData.nomeFantasia,
        companyName: enrichedData.nomeFantasia || enrichedData.razaoSocial,
        phone: enrichedData.phone || '',
        cnpj: enrichedData.cnpj,
        email: enrichedData.email,
        address: enrichedData.address,
        city: enrichedData.city,
        state: enrichedData.state,
        decisionMaker: enrichedData.decisionMaker,
        status: 'qualificado',
        origin: 'cnpj',
        tags: ['CNPJ Enriquecido', enrichedData.situacaoCadastral],
        notes: `Sócios: ${enrichedData.qsa.map(q => `${q.nome} (${q.qualificacao})`).join(', ')}`
      });
      setSuccessMessage(`Lead ${enrichedData.nomeFantasia} salvo com sucesso!`);
      setEnrichedData(null);
      setCnpjInput('');
      onLeadAdded?.();
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err: any) {
      alert(`Erro ao salvar: ${err.message}`);
    }
  };

  // --- AÇÕES DO CSV ---
  const handleProcessCsv = () => {
    if (!csvText.trim()) return;
    const leads = mapsScraperService.parseCsvImport(csvText);
    setCsvParsed(leads.map(l => ({ ...l, origin: 'csv' })));
  };

  const handleSaveCsv = async () => {
    if (csvParsed.length === 0) return;
    try {
      const formattedCsv = csvParsed.map(l => ({ ...l, origin: 'csv' }));
      const { added, updated } = await leadRepository.bulkAddLeads(formattedCsv);
      setSuccessMessage(`${added} contatos importados via CSV com sucesso! (${updated} atualizados)`);
      setCsvParsed([]);
      setCsvText('');
      onLeadAdded?.();
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err: any) {
      alert(`Erro ao salvar: ${err.message}`);
    }
  };

  // --- AÇÕES DO LOCALIZADOR LINKEDIN ---
  const handleLinkedInSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!liRole.trim() && !liCompany.trim()) {
      alert('Informe ao menos um Cargo ou uma Empresa/Nicho para pesquisar no LinkedIn.');
      return;
    }

    setIsLiSearching(true);
    setLiResults([]);
    setSelectedLiIndices([]);

    try {
      if (typeof window !== 'undefined' && (window as any).electronAPI?.searchLinkedInLeads) {
        const results = await (window as any).electronAPI.searchLinkedInLeads({
          role: liRole.trim(),
          company: liCompany.trim(),
          location: liLocation.trim(),
          limit: 30
        });

        setLiResults(results || []);
        setSelectedLiIndices((results || []).map((_: any, idx: number) => idx));
      } else {
        alert('Busca no LinkedIn disponível apenas no Desktop App.');
      }
    } catch (err: any) {
      alert(`Erro na busca do LinkedIn: ${err.message}`);
    } finally {
      setIsLiSearching(false);
    }
  };

  const handleToggleSelectLi = (index: number) => {
    if (selectedLiIndices.includes(index)) {
      setSelectedLiIndices(selectedLiIndices.filter(i => i !== index));
    } else {
      setSelectedLiIndices([...selectedLiIndices, index]);
    }
  };

  const handleSelectAllLi = () => {
    if (selectedLiIndices.length === liResults.length) {
      setSelectedLiIndices([]);
    } else {
      setSelectedLiIndices(liResults.map((_, i) => i));
    }
  };

  const handleSaveSelectedLi = async () => {
    if (selectedLiIndices.length === 0) {
      alert('Selecione ao menos um contato do LinkedIn para salvar no CRM.');
      return;
    }

    setIsSavingLi(true);
    try {
      const selected = selectedLiIndices.map(i => liResults[i]);
      const formattedLeads: Omit<Lead, 'id' | 'createdAt' | 'updatedAt'>[] = selected.map((item, idx) => {
        const placeholderPhone = `li_${Date.now()}_${idx}_${Math.floor(Math.random() * 10000)}`;
        return {
          name: item.name,
          companyName: item.company || 'Empresa LinkedIn',
          phone: placeholderPhone,
          decisionMaker: item.name,
          category: item.role,
          city: item.location || liLocation,
          linkedinUrl: item.profileUrl,
          origin: 'linkedin',
          status: 'novo',
          tags: ['LinkedIn B2B', item.role].filter(Boolean),
          notes: `Perfil: ${item.profileUrl} | Cargo: ${item.role} | Resumo: ${item.snippet || ''}`
        };
      });

      const { added, updated } = await leadRepository.bulkAddLeads(formattedLeads);
      setSuccessMessage(`${added} contatos do LinkedIn salvos com sucesso no CRM!`);
      onLeadAdded?.();
      setTimeout(() => {
        setSuccessMessage(null);
        onClose();
      }, 2000);
    } catch (err: any) {
      alert(`Erro ao salvar contatos do LinkedIn: ${err.message}`);
    } finally {
      setIsSavingLi(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-sm p-4 animate-in fade-in">
      <div className="bg-slate-900 border border-slate-700/80 rounded-2xl w-full max-w-4xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden">
        
        {/* CABEÇALHO DO MODAL */}
        <div className="px-6 py-4 border-b border-slate-800 bg-slate-950/80 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
              <UserPlus className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-100">Adicionar Novos Contatos</h3>
              <p className="text-xs text-slate-400">
                Cadastre manualmente ou busque leads automaticamente pelo Google Maps com enriquecimento
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-slate-100 transition-colors border border-slate-700"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* NAVEGAÇÃO ENTRE MODOS */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-1 p-2 bg-slate-950 border-b border-slate-800 text-xs font-semibold shrink-0">
          <button
            onClick={() => setActiveTab('maps')}
            className={`py-2 px-2.5 rounded-xl transition-all flex items-center justify-center gap-1.5 ${
              activeTab === 'maps'
                ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/25'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
            }`}
          >
            <Search className="w-3.5 h-3.5" />
            <span className="truncate">Google Maps</span>
          </button>

          <button
            onClick={() => setActiveTab('linkedin')}
            className={`py-2 px-2.5 rounded-xl transition-all flex items-center justify-center gap-1.5 ${
              activeTab === 'linkedin'
                ? 'bg-sky-600 text-white shadow-md shadow-sky-600/25'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
            }`}
          >
            <Briefcase className="w-3.5 h-3.5 text-sky-300" />
            <span className="truncate">LinkedIn B2B</span>
          </button>

          <button
            onClick={() => setActiveTab('manual')}
            className={`py-2 px-2.5 rounded-xl transition-all flex items-center justify-center gap-1.5 ${
              activeTab === 'manual'
                ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/25'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
            }`}
          >
            <UserPlus className="w-3.5 h-3.5" />
            <span className="truncate">Manual</span>
          </button>

          <button
            onClick={() => setActiveTab('cnpj')}
            className={`py-2 px-2.5 rounded-xl transition-all flex items-center justify-center gap-1.5 ${
              activeTab === 'cnpj'
                ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/25'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
            }`}
          >
            <Building2 className="w-3.5 h-3.5" />
            <span className="truncate">CNPJ / Sócios</span>
          </button>

          <button
            onClick={() => setActiveTab('csv')}
            className={`py-2 px-2.5 rounded-xl transition-all flex items-center justify-center gap-1.5 ${
              activeTab === 'csv'
                ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/25'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
            }`}
          >
            <UploadCloud className="w-3.5 h-3.5" />
            <span className="truncate">Importar CSV</span>
          </button>
        </div>

        {/* CORPO DO MODAL */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {successMessage && (
            <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-xs text-emerald-300 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
              <span>{successMessage}</span>
            </div>
          )}

          {/* MODO 1: GOOGLE MAPS AUTOMATIZADO COM ENRIQUECIMENTO E CHECAGEM DE WHATSAPP */}
          {activeTab === 'maps' && (
            <div className="space-y-4">
              <div className="border-b border-slate-800 pb-2 flex items-center justify-between">
                <div>
                  <h4 className="text-sm font-bold text-slate-100 flex items-center gap-2">
                    <Search className="w-4 h-4 text-emerald-400" />
                    Buscar Leads Automaticamente pelo Google Maps
                  </h4>
                  <p className="text-xs text-slate-400">
                    O sistema busca dezenas de empresas locais, valida WhatsApp e busca sócios/CNPJ para enriquecer a lista
                  </p>
                </div>
              </div>

              {/* BARRA DE PESQUISA */}
              <div className="grid grid-cols-1 md:grid-cols-12 gap-3 bg-slate-950/70 p-3.5 rounded-xl border border-slate-800">
                <div className="md:col-span-5">
                  <label className="text-xs font-semibold text-slate-300 block mb-1">Nicho / Segmento</label>
                  <input
                    type="text"
                    value={mapsNiche}
                    onChange={(e) => setMapsNiche(e.target.value)}
                    placeholder="Ex: Clínicas Odontológicas, Imobiliárias, Contabilidade..."
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <div className="md:col-span-5">
                  <label className="text-xs font-semibold text-slate-300 block mb-1">Cidade / Região</label>
                  <input
                    type="text"
                    value={mapsCity}
                    onChange={(e) => setMapsCity(e.target.value)}
                    placeholder="Ex: São Paulo, SP ou Curitiba, PR"
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <div className="md:col-span-2 flex items-end">
                  <button
                    onClick={handleMapsSearch}
                    disabled={isMapsSearching || !mapsNiche.trim() || !mapsCity.trim()}
                    className="w-full py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded-xl text-xs flex items-center justify-center gap-1.5 shadow-md shadow-emerald-600/20 disabled:opacity-50 transition-all"
                  >
                    <Search className="w-3.5 h-3.5" />
                    <span>{isMapsSearching ? 'Buscando...' : 'Buscar'}</span>
                  </button>
                </div>
              </div>

              {/* RESULTADOS DO GOOGLE MAPS */}
              {mapsResults.length > 0 && (
                <div className="space-y-3 pt-2">
                  {/* BARRA DE CONTROLE E ENRIQUECIMENTO */}
                  <div className="flex flex-wrap items-center justify-between gap-2 p-2.5 bg-slate-950/80 border border-slate-800 rounded-xl">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-slate-200">
                        {mapsResults.length} leads encontrados
                      </span>
                      <span className="text-[11px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-semibold">
                        {selectedMapsIndices.length} selecionados
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      {/* BOTÃO PRINCIPAL: ENRIQUECER CONTATOS */}
                      <button
                        onClick={handleEnrichAndVerify}
                        disabled={isEnrichingBatch}
                        className="px-3 py-1.5 bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all disabled:opacity-50"
                      >
                        <Sparkles className="w-3.5 h-3.5 text-amber-400 animate-pulse" />
                        <span>
                          {isEnrichingBatch && enrichProgress
                            ? `Enriquecendo (${enrichProgress.current}/${enrichProgress.total})...`
                            : 'Enriquecer Contatos & Verificar WhatsApp'}
                        </span>
                      </button>

                      {/* BOTÃO SALVAR SELECIONADOS */}
                      <button
                        onClick={handleSaveMapsLeads}
                        disabled={selectedMapsIndices.length === 0}
                        className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded-xl text-xs shadow-md disabled:opacity-50 transition-all flex items-center gap-1.5"
                      >
                        <Check className="w-3.5 h-3.5" />
                        <span>Salvar Selecionados ({selectedMapsIndices.length})</span>
                      </button>
                    </div>
                  </div>

                  {/* FILTROS DE SELEÇÃO RÁPIDA */}
                  <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                    <span className="text-slate-400 font-medium mr-1 flex items-center gap-1">
                      <Filter className="w-3 h-3" /> Seleção rápida:
                    </span>
                    <button
                      onClick={handleSelectAll}
                      className="px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
                    >
                      Selecionar Todos
                    </button>
                    <button
                      onClick={handleDeselectAll}
                      className="px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
                    >
                      Desmarcar Todos
                    </button>
                    <button
                      onClick={handleExcludeNoWhatsApp}
                      className="px-2 py-1 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/20 transition-colors"
                    >
                      Desmarcar sem WhatsApp
                    </button>
                    <button
                      onClick={handleSelectOnlyWithWhatsApp}
                      className="px-2 py-1 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 border border-emerald-500/20 transition-colors"
                    >
                      Apenas com WhatsApp
                    </button>
                    <button
                      onClick={handleSelectOnlyNoWhatsApp}
                      className="px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 transition-colors"
                    >
                      Selecionar apenas sem WhatsApp
                    </button>
                  </div>

                  {/* TABELA / LISTA COM CHECKBOXES E STATUS */}
                  <div className="border border-slate-800 rounded-xl overflow-hidden divide-y divide-slate-800/60 max-h-[380px] overflow-y-auto">
                    {mapsResults.map((lead, idx) => {
                      const isSelected = selectedMapsIndices.includes(idx);
                      return (
                        <div
                          key={idx}
                          className={`p-3 transition-colors flex items-start gap-3 text-xs ${
                            isSelected ? 'bg-slate-950/60' : 'bg-slate-950/20 opacity-65'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedMapsIndices([...selectedMapsIndices, idx]);
                              } else {
                                setSelectedMapsIndices(selectedMapsIndices.filter((i) => i !== idx));
                              }
                            }}
                            className="w-4 h-4 mt-1 rounded bg-slate-800 border-slate-700 text-emerald-500 cursor-pointer"
                          />

                          <div className="flex-1 min-w-0 space-y-1">
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-bold text-slate-100 text-xs truncate">
                                {lead.companyName}
                              </span>

                              {/* STATUS DO WHATSAPP */}
                              <div className="shrink-0 flex items-center gap-1.5">
                                {lead.whatsappStatus === 'yes' && (
                                  <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center gap-1">
                                    <CheckCheck className="w-3 h-3 text-emerald-400" />
                                    Tem WhatsApp
                                  </span>
                                )}
                                {lead.whatsappStatus === 'no' && (
                                  <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-rose-500/10 text-rose-400 border border-rose-500/20">
                                    Sem WhatsApp
                                  </span>
                                )}
                                {lead.whatsappStatus === 'unverified' && (
                                  <span className="px-2 py-0.5 rounded-full text-[10px] text-slate-400 bg-slate-800/80">
                                    Não verificado
                                  </span>
                                )}
                              </div>
                            </div>

                            <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-400">
                              <span className="font-mono text-slate-200">📞 {lead.phone}</span>
                              {lead.address && <span className="truncate">📍 {lead.address}</span>}
                              {lead.notes && <span className="text-amber-400/90">{lead.notes}</span>}
                            </div>

                            {/* INFORMAÇÕES DE ENRIQUECIMENTO (CNPJ / SÓCIOS / DECISOR) */}
                            {lead.cnpjInfo && (
                              <div className="pt-1 text-[11px]">
                                {lead.cnpjInfo.status === 'found' ? (
                                  <div className="p-2 rounded-lg bg-emerald-950/30 border border-emerald-500/20 text-slate-200 space-y-0.5">
                                    <div className="flex items-center gap-2">
                                      <span className="font-semibold text-emerald-400">CNPJ: {lead.cnpjInfo.cnpj}</span>
                                      {lead.cnpjInfo.decisionMaker && (
                                        <span className="text-slate-300">
                                          👤 <strong>Decisor:</strong> {lead.cnpjInfo.decisionMaker}
                                        </span>
                                      )}
                                    </div>
                                    {lead.cnpjInfo.qsa && lead.cnpjInfo.qsa.length > 0 && (
                                      <div className="text-[10px] text-slate-400 truncate">
                                        Sócios: {lead.cnpjInfo.qsa.slice(0, 3).join(', ')}
                                      </div>
                                    )}
                                  </div>
                                ) : (
                                  <div className="p-1.5 rounded-lg bg-slate-900/60 border border-slate-800 text-[11px] text-slate-500 flex items-center gap-1.5">
                                    <AlertCircle className="w-3 h-3 text-slate-500 shrink-0" />
                                    <span>Não foram localizados dados de CNPJ/Sócios na busca pública</span>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* MODO 2: CADASTRO MANUAL */}
          {activeTab === 'manual' && (
            <div className="space-y-4">
              <div className="border-b border-slate-800 pb-2">
                <h4 className="text-sm font-bold text-slate-100">Cadastro Manual de Contato</h4>
                <p className="text-xs text-slate-400">Preencha os dados do lead individual ou digite o CNPJ para auto-completar</p>
              </div>

              {mError && (
                <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-xs text-rose-400 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{mError}</span>
                </div>
              )}

              <form onSubmit={handleManualSubmit} className="space-y-3">
                <div className="bg-slate-950/60 p-3 rounded-xl border border-slate-800 space-y-2">
                  <label className="text-xs font-semibold text-slate-300 block">
                    Auto-preenchimento por CNPJ (Opcional):
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={mCnpj}
                      onChange={(e) => setMCnpj(e.target.value)}
                      placeholder="Digite o CNPJ (ex: 00.000.000/0001-00)"
                      className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-100 font-mono focus:outline-none focus:border-emerald-500"
                    />
                    <button
                      type="button"
                      onClick={handleManualCnpjConsult}
                      disabled={mConsulting || !mCnpj.trim()}
                      className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-600 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors disabled:opacity-50"
                    >
                      <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                      <span>{mConsulting ? 'Buscando...' : 'Buscar Dados'}</span>
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-semibold text-slate-300 block mb-1">
                      WhatsApp do Lead <span className="text-rose-400">*</span>
                    </label>
                    <div className="relative">
                      <Phone className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        required
                        value={mPhone}
                        onChange={(e) => setMPhone(e.target.value)}
                        placeholder="5511999998888"
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-8 pr-3 py-2 text-xs text-slate-100 font-mono focus:outline-none focus:border-emerald-500"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-slate-300 block mb-1">Nome do Contato</label>
                    <div className="relative">
                      <User className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        value={mName}
                        onChange={(e) => setMName(e.target.value)}
                        placeholder="Ex: Dr. Carlos Eduardo"
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-8 pr-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-emerald-500"
                      />
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-semibold text-slate-300 block mb-1">Nome da Empresa</label>
                    <div className="relative">
                      <Building2 className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        value={mCompany}
                        onChange={(e) => setMCompany(e.target.value)}
                        placeholder="Ex: Clínica Alpha Ltda"
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-8 pr-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-emerald-500"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-slate-300 block mb-1">Sócio / Decisor</label>
                    <input
                      type="text"
                      value={mDecisionMaker}
                      onChange={(e) => setMDecisionMaker(e.target.value)}
                      placeholder="Ex: Carlos Silva"
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div>
                    <label className="text-xs font-semibold text-slate-300 block mb-1">Cidade / Região</label>
                    <input
                      type="text"
                      value={mCity}
                      onChange={(e) => setMCity(e.target.value)}
                      placeholder="Ex: São Paulo, SP"
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-emerald-500"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-slate-300 block mb-1">Nicho / Categoria</label>
                    <input
                      type="text"
                      value={mCategory}
                      onChange={(e) => setMCategory(e.target.value)}
                      placeholder="Ex: Odontologia"
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-emerald-500"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-slate-300 block mb-1">Status no Funil</label>
                    <select
                      value={mStatus}
                      onChange={(e) => setMStatus(e.target.value as LeadStatus)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-emerald-500"
                    >
                      <option value="novo">Novo Lead</option>
                      <option value="qualificado">Qualificado</option>
                      <option value="contatado">Contatado</option>
                      <option value="negociacao">Em Negociação</option>
                      <option value="ganho">Ganho / Fechado</option>
                      <option value="perdido">Perdido</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-300 block mb-1">Observações Comerciais</label>
                  <textarea
                    rows={2}
                    value={mNotes}
                    onChange={(e) => setMNotes(e.target.value)}
                    placeholder="Detalhes, faturamento aproximado, interesse..."
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs text-slate-100 focus:outline-none focus:border-emerald-500 resize-none"
                  />
                </div>

                <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
                  <button
                    type="submit"
                    className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold shadow-lg shadow-emerald-600/20"
                  >
                    Salvar Contato
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* MODO 3: CONSULTA CNPJ & SÓCIOS */}
          {activeTab === 'cnpj' && (
            <div className="space-y-4">
              <div className="border-b border-slate-800 pb-2">
                <h4 className="text-sm font-bold text-slate-100">Consulta Oficial da Receita Federal & Sócios</h4>
                <p className="text-xs text-slate-400">Puxe automaticamente a Razão Social, CNAE e lista completa de Sócios (QSA)</p>
              </div>

              <div className="flex gap-2 bg-slate-950/60 p-3.5 rounded-xl border border-slate-800">
                <input
                  type="text"
                  value={cnpjInput}
                  onChange={(e) => setCnpjInput(e.target.value)}
                  placeholder="Insira o CNPJ da empresa (com ou sem pontuação)"
                  className="flex-1 bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-slate-100 font-mono focus:outline-none focus:border-emerald-500"
                />
                <button
                  onClick={handleConsultCnpj}
                  disabled={isEnriching || !cnpjInput.trim()}
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded-xl text-xs flex items-center gap-1.5 shadow-md shadow-emerald-600/20 disabled:opacity-50"
                >
                  <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                  <span>{isEnriching ? 'Consultando...' : 'Consultar'}</span>
                </button>
              </div>

              {enrichError && (
                <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-xs text-rose-400 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{enrichError}</span>
                </div>
              )}

              {enrichedData && (
                <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 space-y-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <h5 className="font-bold text-slate-100">{enrichedData.nomeFantasia}</h5>
                      <p className="text-xs text-slate-400">{enrichedData.razaoSocial} • CNPJ: {enrichedData.cnpj}</p>
                    </div>
                    <button
                      onClick={handleSaveEnrichedCnpj}
                      className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold shadow-md"
                    >
                      Salvar no CRM
                    </button>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs bg-slate-900/50 p-3 rounded-lg">
                    <div><strong>Decisor:</strong> {enrichedData.decisionMaker}</div>
                    <div><strong>Telefone:</strong> {enrichedData.phone || 'Não informado'}</div>
                    <div><strong>Cidade:</strong> {enrichedData.city}/{enrichedData.state}</div>
                    <div><strong>CNAE:</strong> {enrichedData.cnaePrincipal || 'Geral'}</div>
                  </div>

                  {enrichedData.qsa.length > 0 && (
                    <div>
                      <span className="text-xs font-semibold text-slate-300 block mb-1">Quadro de Sócios (QSA):</span>
                      <div className="flex flex-wrap gap-1.5">
                        {enrichedData.qsa.map((s, idx) => (
                          <span key={idx} className="text-[11px] px-2 py-1 bg-slate-900 border border-slate-800 rounded text-slate-300">
                            👤 {s.nome} ({s.qualificacao})
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* MODO 4: IMPORTAÇÃO CSV */}
          {activeTab === 'csv' && (
            <div className="space-y-4">
              <div className="border-b border-slate-800 pb-2">
                <h4 className="text-sm font-bold text-slate-100">Importação em Massa via CSV / Planilha</h4>
                <p className="text-xs text-slate-400">Cole linhas de planilhas Excel ou CSV com Nome, Telefone, Empresa e Cidade</p>
              </div>

              <div className="bg-slate-950/60 p-3.5 rounded-xl border border-slate-800 space-y-2">
                <textarea
                  rows={4}
                  value={csvText}
                  onChange={(e) => setCsvText(e.target.value)}
                  placeholder="Nome, Telefone, Empresa, Cidade, Decisor&#10;Dr. Lucas, 11987654321, Odonto Saúde, São Paulo, Lucas Silva"
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-xs text-slate-200 font-mono focus:outline-none focus:border-emerald-500"
                />
                <button
                  onClick={handleProcessCsv}
                  className="w-full bg-slate-800 hover:bg-slate-700 text-slate-200 py-2 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5" />
                  Processar Dados
                </button>
              </div>

              {csvParsed.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs text-slate-300">
                    <span>{csvParsed.length} contatos prontos para importar</span>
                    <button
                      onClick={handleSaveCsv}
                      className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold shadow-md"
                    >
                      Importar Todos
                    </button>
                  </div>
                  <div className="max-h-48 overflow-y-auto space-y-1 border border-slate-800 rounded-lg p-2 bg-slate-950/40">
                    {csvParsed.map((l, i) => (
                      <div key={i} className="p-2 bg-slate-900 border border-slate-800 rounded text-xs flex justify-between">
                        <div>
                          <span className="font-semibold text-slate-200">{l.name}</span>
                          <span className="text-slate-400 ml-2">({l.companyName})</span>
                        </div>
                        <span className="font-mono text-emerald-400 text-[11px]">{l.phone}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* MODO 5: LOCALIZADOR LINKEDIN B2B */}
          {activeTab === 'linkedin' && (
            <div className="space-y-4">
              <div className="border-b border-slate-800 pb-2">
                <h4 className="text-sm font-bold text-slate-100 flex items-center gap-2">
                  <Briefcase className="w-4 h-4 text-sky-400" />
                  <span>Localizar Contatos e Decisores no LinkedIn B2B</span>
                </h4>
                <p className="text-xs text-slate-400">
                  Encontre perfis reais no LinkedIn por Cargo, Empresa ou Nicho, e Localização com busca inteligente.
                </p>
              </div>

              {/* Formulário de Busca no LinkedIn */}
              <form onSubmit={handleLinkedInSearch} className="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-slate-950/70 p-3.5 rounded-xl border border-slate-800">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-300 mb-1">Cargo / Função</label>
                  <input
                    type="text"
                    value={liRole}
                    onChange={(e) => setLiRole(e.target.value)}
                    placeholder="Ex: CEO, Diretor, Sócio, Gerente"
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-sky-500"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-300 mb-1">Empresa ou Nicho</label>
                  <input
                    type="text"
                    value={liCompany}
                    onChange={(e) => setLiCompany(e.target.value)}
                    placeholder="Ex: Tecnologia, Odontologia ou Nome"
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-sky-500"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-300 mb-1">Localização / Cidade</label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={liLocation}
                      onChange={(e) => setLiLocation(e.target.value)}
                      placeholder="Ex: São Paulo, Brasil"
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-sky-500"
                    />
                    <button
                      type="submit"
                      disabled={isLiSearching}
                      className="px-4 py-2 bg-sky-600 hover:bg-sky-500 text-white rounded-lg text-xs font-bold shrink-0 flex items-center gap-1.5 shadow-md shadow-sky-600/20 disabled:opacity-50 transition-all"
                    >
                      <Search className="w-3.5 h-3.5" />
                      <span>{isLiSearching ? 'Buscando...' : 'Buscar'}</span>
                    </button>
                  </div>
                </div>
              </form>

              {/* Lista de Resultados do LinkedIn */}
              {liResults.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between bg-slate-950/60 px-3.5 py-2.5 rounded-xl border border-slate-800">
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={handleSelectAllLi}
                        className="flex items-center gap-1.5 text-xs text-slate-300 hover:text-sky-300 transition-colors font-medium"
                      >
                        <CheckCheck className="w-3.5 h-3.5 text-sky-400" />
                        <span>
                          {selectedLiIndices.length === liResults.length ? 'Desmarcar Todos' : 'Selecionar Todos'}
                        </span>
                      </button>
                      <span className="text-xs text-slate-500">|</span>
                      <span className="text-xs text-slate-400">
                        {selectedLiIndices.length} de {liResults.length} perfis selecionados
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={handleSaveSelectedLi}
                      disabled={isSavingLi || selectedLiIndices.length === 0}
                      className="px-4 py-1.5 bg-sky-600 hover:bg-sky-500 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 shadow-md shadow-sky-600/25 transition-all disabled:opacity-50"
                    >
                      <Briefcase className="w-3.5 h-3.5" />
                      <span>{isSavingLi ? 'Salvando...' : `Salvar (${selectedLiIndices.length}) no CRM`}</span>
                    </button>
                  </div>

                  <div className="max-h-[360px] overflow-y-auto space-y-2 pr-1">
                    {liResults.map((lead, idx) => {
                      const isSelected = selectedLiIndices.includes(idx);
                      return (
                        <div
                          key={idx}
                          onClick={() => handleToggleSelectLi(idx)}
                          className={`p-3 rounded-xl border transition-all cursor-pointer flex items-start justify-between gap-3 ${
                            isSelected
                              ? 'bg-sky-950/30 border-sky-600/40 shadow-sm'
                              : 'bg-slate-950/40 border-slate-800/80 opacity-75 hover:opacity-100 hover:border-slate-700'
                          }`}
                        >
                          <div className="flex items-start gap-3 flex-1 min-w-0">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => {}}
                              className="mt-1 rounded bg-slate-800 border-slate-700 text-sky-500 focus:ring-0 w-3.5 h-3.5"
                            />
                            <div className="w-8 h-8 rounded-lg bg-sky-700/20 border border-sky-600/30 flex items-center justify-center text-sky-400 font-bold shrink-0 text-xs">
                              💼
                            </div>
                            <div className="space-y-1 flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-bold text-slate-100 truncate">{lead.name}</span>
                                <span className="text-[10px] bg-sky-500/15 border border-sky-500/25 text-sky-300 font-semibold px-2 py-0.5 rounded-full truncate">
                                  {lead.role}
                                </span>
                              </div>
                              <div className="text-[11px] text-slate-400 flex items-center gap-2">
                                <span className="font-medium text-slate-300">{lead.company}</span>
                                {lead.location && (
                                  <>
                                    <span>•</span>
                                    <span className="text-slate-500 flex items-center gap-0.5">
                                      <MapPin className="w-3 h-3" />
                                      {lead.location}
                                    </span>
                                  </>
                                )}
                              </div>
                              {lead.snippet && (
                                <p className="text-[10px] text-slate-500 line-clamp-1 italic">
                                  {lead.snippet}
                                </p>
                              )}
                            </div>
                          </div>

                          <a
                            href={lead.profileUrl}
                            target="_blank"
                            rel="noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="p-1.5 bg-slate-900 hover:bg-sky-900/40 border border-slate-800 hover:border-sky-600/50 text-sky-400 rounded-lg text-[11px] font-medium flex items-center gap-1 shrink-0 transition-colors"
                            title="Ver perfil no LinkedIn"
                          >
                            <span>Perfil</span>
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Mensagem quando não há resultados e não está buscando */}
              {!isLiSearching && liResults.length === 0 && (
                <div className="text-center py-10 bg-slate-950/30 rounded-xl border border-dashed border-slate-800 p-6 space-y-2">
                  <Briefcase className="w-8 h-8 text-slate-600 mx-auto" />
                  <h5 className="text-xs font-bold text-slate-400">Nenhum perfil pesquisado ainda</h5>
                  <p className="text-[11px] text-slate-500 max-w-sm mx-auto">
                    Preencha o cargo e o nicho ou nome da empresa acima e clique em "Buscar" para encontrar decisores e líderes de negócios no LinkedIn.
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
