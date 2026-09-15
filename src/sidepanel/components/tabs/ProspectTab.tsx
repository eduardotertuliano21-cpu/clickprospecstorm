import React, { useState } from 'react';
import { 
  Search, 
  UploadCloud, 
  Sparkles, 
  Building2, 
  User, 
  Phone, 
  CheckCircle2, 
  AlertCircle, 
  FileSpreadsheet, 
  UserPlus, 
  MapPin, 
  Tag, 
  Check 
} from 'lucide-react';
import { leadRepository } from '../../../db/repositories/leadRepository';
import { cnpjEnrichmentService, type EnrichedCnpjData } from '../../../services/cnpjEnrichmentService';
import { mapsScraperService } from '../../../services/mapsScraperService';
import { type Lead, type LeadStatus } from '../../../db';

export const ProspectTab: React.FC = () => {
  const [activeSubTab, setActiveSubTab] = useState<'search' | 'cnpj' | 'csv' | 'manual'>('search');

  // Busca rápida / Simulação Maps
  const [niche, setNiche] = useState('Clínica Odontológica');
  const [city, setCity] = useState('São Paulo, SP');
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<Array<Omit<Lead, 'id' | 'createdAt' | 'updatedAt'>>>([]);
  const [selectedIndices, setSelectedIndices] = useState<number[]>([]);
  const [saveSuccessMessage, setSaveSuccessMessage] = useState<string | null>(null);

  // Importação CSV
  const [csvText, setCsvText] = useState('');
  const [csvParsed, setCsvParsed] = useState<Array<Omit<Lead, 'id' | 'createdAt' | 'updatedAt'>>>([]);

  // Consulta CNPJ
  const [cnpjInput, setCnpjInput] = useState('');
  const [isEnriching, setIsEnriching] = useState(false);
  const [enrichedData, setEnrichedData] = useState<EnrichedCnpjData | null>(null);
  const [enrichError, setEnrichError] = useState<string | null>(null);

  // Cadastro Manual
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

  // Simulação de busca no Maps local
  const handleSearch = () => {
    if (!niche || !city) return;
    setIsSearching(true);
    setSaveSuccessMessage(null);

    setTimeout(() => {
      const sampleResults: Array<Omit<Lead, 'id' | 'createdAt' | 'updatedAt'>> = [
        {
          name: `${niche} Estética & Saúde`,
          companyName: `${niche} Estética & Saúde`,
          phone: '5511987654321',
          category: niche,
          city: city,
          address: 'Av. Paulista, 1000 - Bela Vista',
          status: 'novo',
          tags: ['Maps Prospect'],
          notes: 'Avaliação: 4.8★ (92 avaliações)'
        },
        {
          name: `Centro Integrado ${niche}`,
          companyName: `Centro Integrado ${niche}`,
          phone: '5511998765432',
          category: niche,
          city: city,
          address: 'Rua Augusta, 500 - Consolação',
          status: 'novo',
          tags: ['Maps Prospect'],
          notes: 'Avaliação: 4.9★ (140 avaliações)'
        },
        {
          name: `Grupo Alpha ${niche}`,
          companyName: `Grupo Alpha ${niche}`,
          phone: '5511976543210',
          category: niche,
          city: city,
          address: 'Alameda Santos, 200 - Jardins',
          status: 'novo',
          tags: ['Maps Prospect'],
          notes: 'Avaliação: 4.7★ (45 avaliações)'
        }
      ];

      setSearchResults(sampleResults);
      setSelectedIndices(sampleResults.map((_, i) => i));
      setIsSearching(false);
    }, 800);
  };

  const handleSaveToDb = async (leadsToSave: Array<Omit<Lead, 'id' | 'createdAt' | 'updatedAt'>>) => {
    try {
      const { added, updated } = await leadRepository.bulkAddLeads(leadsToSave);
      setSaveSuccessMessage(`${added} leads novos adicionados e ${updated} atualizados no CRM!`);
      setTimeout(() => setSaveSuccessMessage(null), 5000);
    } catch (err: any) {
      alert(`Erro ao salvar leads: ${err.message}`);
    }
  };

  const handleProcessCsv = () => {
    if (!csvText.trim()) return;
    const parsed = mapsScraperService.parseCsvImport(csvText);
    setCsvParsed(parsed);
  };

  const handleEnrichCnpj = async () => {
    if (!cnpjInput.trim()) return;
    setIsEnriching(true);
    setEnrichError(null);
    setEnrichedData(null);

    try {
      const data = await cnpjEnrichmentService.consultCnpj(cnpjInput);
      if (data) {
        setEnrichedData(data);
      } else {
        setEnrichError('CNPJ não encontrado nas bases oficiais.');
      }
    } catch (err: any) {
      setEnrichError(err.message || 'Erro ao consultar CNPJ');
    } finally {
      setIsEnriching(false);
    }
  };

  const handleSaveEnriched = async () => {
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
        tags: ['CNPJ Enriquecido', enrichedData.situacaoCadastral],
        notes: `Sócios: ${enrichedData.qsa.map(q => `${q.nome} (${q.qualificacao})`).join(', ')}`
      });
      setSaveSuccessMessage(`Lead ${enrichedData.nomeFantasia} salvo com sucesso no CRM!`);
      setEnrichedData(null);
      setCnpjInput('');
    } catch (err: any) {
      alert(`Erro ao salvar: ${err.message}`);
    }
  };

  // Preenchimento com CNPJ no cadastro manual
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

  // Submissão do cadastro manual
  const handleManualSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMError(null);

    const cleanPhone = mPhone.replace(/\D/g, '');
    if (cleanPhone.length < 10) {
      setMError('Telefone inválido. Informe DDD + Número (pelo menos 10 dígitos).');
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
        notes: mNotes.trim() || undefined,
        tags: ['Cadastro Manual']
      });

      setSaveSuccessMessage(`Contato ${mName || mCompany} adicionado com sucesso ao CRM!`);
      setMName('');
      setMCompany('');
      setMPhone('');
      setMCnpj('');
      setMCity('');
      setMCategory('');
      setMDecisionMaker('');
      setMNotes('');
      setMStatus('novo');
      setTimeout(() => setSaveSuccessMessage(null), 5000);
    } catch (err: any) {
      setMError(`Erro ao salvar: ${err.message}`);
    }
  };

  return (
    <div className="p-4 space-y-4">
      {/* Subtabs com opção Manual */}
      <div className="grid grid-cols-4 gap-1 bg-slate-900 p-1 rounded-xl border border-slate-800 text-xs font-medium">
        <button
          onClick={() => setActiveSubTab('search')}
          className={`py-2 rounded-lg transition-all flex items-center justify-center gap-1 ${
            activeSubTab === 'search' ? 'bg-emerald-600 text-white shadow-md' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Search className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Prospecção</span>
        </button>
        <button
          onClick={() => setActiveSubTab('cnpj')}
          className={`py-2 rounded-lg transition-all flex items-center justify-center gap-1 ${
            activeSubTab === 'cnpj' ? 'bg-emerald-600 text-white shadow-md' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Building2 className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">CNPJ/QSA</span>
        </button>
        <button
          onClick={() => setActiveSubTab('csv')}
          className={`py-2 rounded-lg transition-all flex items-center justify-center gap-1 ${
            activeSubTab === 'csv' ? 'bg-emerald-600 text-white shadow-md' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <UploadCloud className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">CSV</span>
        </button>
        <button
          onClick={() => setActiveSubTab('manual')}
          className={`py-2 rounded-lg transition-all flex items-center justify-center gap-1 ${
            activeSubTab === 'manual' ? 'bg-emerald-600 text-white shadow-md' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <UserPlus className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Manual</span>
        </button>
      </div>

      {saveSuccessMessage && (
        <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-xs text-emerald-400 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{saveSuccessMessage}</span>
        </div>
      )}

      {/* SUBTAB 4: CADASTRO MANUAL */}
      {activeSubTab === 'manual' && (
        <div className="bg-slate-900/70 p-4 rounded-xl border border-slate-800 space-y-3">
          <div className="flex items-center gap-2 border-b border-slate-800 pb-2">
            <UserPlus className="w-4 h-4 text-emerald-400" />
            <div>
              <h3 className="text-xs font-bold text-slate-100">Cadastro Manual de Contato</h3>
              <p className="text-[10px] text-slate-400">Insira um contato específico para disparar mensagens ou gerenciar no CRM</p>
            </div>
          </div>

          {mError && (
            <div className="p-2.5 bg-rose-500/10 border border-rose-500/30 rounded-lg text-xs text-rose-400 flex items-center gap-2">
              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
              <span>{mError}</span>
            </div>
          )}

          <form onSubmit={handleManualSubmit} className="space-y-3">
            <div>
              <label className="text-[11px] font-semibold text-slate-300 block mb-1">
                Telefone WhatsApp <span className="text-rose-400">*</span>
              </label>
              <div className="relative">
                <Phone className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  required
                  value={mPhone}
                  onChange={(e) => setMPhone(e.target.value)}
                  placeholder="Ex: 11999998888 ou 5511999998888"
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg pl-8 pr-3 py-1.5 text-xs text-slate-100 font-mono focus:outline-none focus:border-emerald-500"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[11px] font-semibold text-slate-300 block mb-1">Nome do Contato</label>
                <div className="relative">
                  <User className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={mName}
                    onChange={(e) => setMName(e.target.value)}
                    placeholder="Ex: Roberto Mendes"
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg pl-8 pr-2.5 py-1.5 text-xs text-slate-100 focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              <div>
                <label className="text-[11px] font-semibold text-slate-300 block mb-1">Empresa</label>
                <div className="relative">
                  <Building2 className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={mCompany}
                    onChange={(e) => setMCompany(e.target.value)}
                    placeholder="Ex: Mendes Odontologia"
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg pl-8 pr-2.5 py-1.5 text-xs text-slate-100 focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[11px] font-semibold text-slate-300 block mb-1">Decisor / Sócio</label>
                <input
                  type="text"
                  value={mDecisionMaker}
                  onChange={(e) => setMDecisionMaker(e.target.value)}
                  placeholder="Ex: Roberto Mendes"
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-100 focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-[11px] font-semibold text-slate-300">CNPJ (Opcional)</label>
                  {mCnpj.trim().length >= 14 && (
                    <button
                      type="button"
                      onClick={handleManualCnpjConsult}
                      disabled={mConsulting}
                      className="text-[10px] text-emerald-400 hover:underline flex items-center gap-0.5"
                    >
                      <Sparkles className="w-2.5 h-2.5" />
                      {mConsulting ? 'Buscando...' : 'Auto-Preencher'}
                    </button>
                  )}
                </div>
                <input
                  type="text"
                  value={mCnpj}
                  onChange={(e) => setMCnpj(e.target.value)}
                  placeholder="00.000.000/0000-00"
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-100 focus:outline-none focus:border-emerald-500"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[11px] font-semibold text-slate-300 block mb-1">Cidade</label>
                <div className="relative">
                  <MapPin className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={mCity}
                    onChange={(e) => setMCity(e.target.value)}
                    placeholder="Curitiba, PR"
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg pl-8 pr-2.5 py-1.5 text-xs text-slate-100 focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              <div>
                <label className="text-[11px] font-semibold text-slate-300 block mb-1">Nicho / Categoria</label>
                <div className="relative">
                  <Tag className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={mCategory}
                    onChange={(e) => setMCategory(e.target.value)}
                    placeholder="Clínica, Advocacia..."
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg pl-8 pr-2.5 py-1.5 text-xs text-slate-100 focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>
            </div>

            <div>
              <label className="text-[11px] font-semibold text-slate-300 block mb-1">Status Inicial no Funil</label>
              <select
                value={mStatus}
                onChange={(e) => setMStatus(e.target.value as LeadStatus)}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-100 focus:outline-none focus:border-emerald-500"
              >
                <option value="novo">Novo</option>
                <option value="qualificado">Qualificado</option>
                <option value="contatado">Contatado</option>
                <option value="negociacao">Negociação</option>
                <option value="ganho">Ganho (Fechado)</option>
                <option value="perdido">Perdido</option>
              </select>
            </div>

            <div>
              <label className="text-[11px] font-semibold text-slate-300 block mb-1">Observações</label>
              <textarea
                rows={2}
                value={mNotes}
                onChange={(e) => setMNotes(e.target.value)}
                placeholder="Anotações comerciais sobre o contato..."
                className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-xs text-slate-100 focus:outline-none focus:border-emerald-500"
              />
            </div>

            <button
              type="submit"
              className="w-full py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded-lg text-xs flex items-center justify-center gap-1.5 shadow-md shadow-emerald-600/20 transition-colors"
            >
              <Check className="w-3.5 h-3.5" />
              Salvar Contato no CRM
            </button>
          </form>
        </div>
      )}

      {/* ABA 1: PROSPECÇÃO LOCAL */}
      {activeSubTab === 'search' && (
        <div className="space-y-4">
          <div className="bg-slate-900/60 p-3.5 rounded-xl border border-slate-800 space-y-3">
            <div>
              <label className="text-[11px] font-semibold text-slate-300 block mb-1">Nicho / Palavra-chave</label>
              <input
                type="text"
                value={niche}
                onChange={(e) => setNiche(e.target.value)}
                placeholder="Ex: Clínicas, Imobiliárias, Restaurantes..."
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-emerald-500"
              />
            </div>

            <div>
              <label className="text-[11px] font-semibold text-slate-300 block mb-1">Cidade / Região</label>
              <input
                type="text"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                placeholder="Ex: São Paulo, SP ou Curitiba, PR"
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-emerald-500"
              />
            </div>

            <button
              onClick={handleSearch}
              disabled={isSearching}
              className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-semibold py-2 px-4 rounded-lg text-xs flex items-center justify-center gap-2 transition-colors shadow-lg shadow-emerald-600/20"
            >
              {isSearching ? (
                <>Buscando estabelecimentos...</>
              ) : (
                <>
                  <Search className="w-3.5 h-3.5" />
                  Buscar Leads B2B
                </>
              )}
            </button>
          </div>

          {searchResults.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span>{searchResults.length} estabelecimentos encontrados</span>
                <button
                  onClick={() => {
                    const toSave = searchResults.filter((_, i) => selectedIndices.includes(i));
                    handleSaveToDb(toSave);
                  }}
                  disabled={selectedIndices.length === 0}
                  className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white rounded text-[11px] font-medium"
                >
                  Salvar {selectedIndices.length} no CRM
                </button>
              </div>

              <div className="space-y-2 max-h-[340px] overflow-y-auto pr-1">
                {searchResults.map((item, idx) => {
                  const isSelected = selectedIndices.includes(idx);
                  return (
                    <div
                      key={idx}
                      onClick={() => {
                        setSelectedIndices(prev =>
                          prev.includes(idx) ? prev.filter(i => i !== idx) : [...prev, idx]
                        );
                      }}
                      className={`p-3 rounded-xl border text-xs cursor-pointer transition-all ${
                        isSelected
                          ? 'bg-emerald-950/20 border-emerald-500/40 text-slate-100'
                          : 'bg-slate-900/40 border-slate-800 text-slate-400 hover:border-slate-700'
                      }`}
                    >
                      <div className="flex items-start justify-between">
                        <div className="font-semibold text-slate-200">{item.companyName}</div>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => {}}
                          className="rounded border-slate-700 text-emerald-500 focus:ring-0"
                        />
                      </div>
                      <div className="mt-1 flex items-center gap-3 text-[11px] text-slate-400">
                        <span className="flex items-center gap-1">
                          <Phone className="w-3 h-3 text-emerald-400" />
                          {item.phone}
                        </span>
                        <span>{item.city}</span>
                      </div>
                      {item.notes && <div className="mt-1 text-[10px] text-amber-400">{item.notes}</div>}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ABA 2: ENRIQUECIMENTO CNPJ (QSA) */}
      {activeSubTab === 'cnpj' && (
        <div className="space-y-4">
          <div className="bg-slate-900/60 p-3.5 rounded-xl border border-slate-800 space-y-3">
            <div>
              <label className="text-[11px] font-semibold text-slate-300 block mb-1">
                CNPJ da Empresa (com ou sem pontuação)
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={cnpjInput}
                  onChange={(e) => setCnpjInput(e.target.value)}
                  placeholder="00.000.000/0000-00"
                  className="flex-1 bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                />
                <button
                  onClick={handleEnrichCnpj}
                  disabled={isEnriching || !cnpjInput.trim()}
                  className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white px-3 py-2 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  {isEnriching ? 'Consultando...' : 'Consultar'}
                </button>
              </div>
            </div>
          </div>

          {enrichError && (
            <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-xs text-rose-400 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{enrichError}</span>
            </div>
          )}

          {enrichedData && (
            <div className="p-3.5 bg-slate-900/80 border border-emerald-500/30 rounded-xl space-y-3 text-xs">
              <div className="flex items-start justify-between border-b border-slate-800 pb-2">
                <div>
                  <h4 className="font-bold text-slate-100">{enrichedData.nomeFantasia}</h4>
                  <p className="text-[11px] text-slate-400">{enrichedData.razaoSocial}</p>
                </div>
                <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-emerald-500/20 text-emerald-400">
                  {enrichedData.situacaoCadastral}
                </span>
              </div>

              <div className="space-y-1.5 text-[11px]">
                <div className="flex items-center gap-2">
                  <User className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="text-slate-400">Decisor Principal:</span>
                  <span className="font-semibold text-slate-200">{enrichedData.decisionMaker || 'Não identificado'}</span>
                </div>

                {enrichedData.phone && (
                  <div className="flex items-center gap-2">
                    <Phone className="w-3.5 h-3.5 text-emerald-400" />
                    <span className="text-slate-400">Telefone:</span>
                    <span className="font-mono text-slate-200">{enrichedData.phone}</span>
                  </div>
                )}

                {enrichedData.address && (
                  <div className="text-slate-400">
                    <span>Endereço: </span>
                    <span className="text-slate-300">{enrichedData.address}, {enrichedData.city} - {enrichedData.state}</span>
                  </div>
                )}
              </div>

              {enrichedData.qsa.length > 0 && (
                <div className="pt-2 border-t border-slate-800">
                  <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
                    Quadro de Sócios (QSA):
                  </div>
                  <div className="space-y-1 max-h-24 overflow-y-auto pr-1">
                    {enrichedData.qsa.map((s, i) => (
                      <div key={i} className="text-[11px] bg-slate-950/60 px-2 py-1 rounded border border-slate-800 flex justify-between">
                        <span className="font-medium text-slate-200">{s.nome}</span>
                        <span className="text-[10px] text-slate-500">{s.qualificacao}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <button
                onClick={handleSaveEnriched}
                className="w-full mt-2 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold py-2 rounded-lg text-xs flex items-center justify-center gap-1.5 shadow"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                Salvar Lead Qualificado no CRM
              </button>
            </div>
          )}
        </div>
      )}

      {/* ABA 3: IMPORTAÇÃO CSV */}
      {activeSubTab === 'csv' && (
        <div className="space-y-3">
          <div className="bg-slate-900/60 p-3.5 rounded-xl border border-slate-800 space-y-2">
            <label className="text-[11px] font-semibold text-slate-300 block">
              Cole o conteúdo CSV ou planilha (Nome, Telefone, Empresa, Cidade, Decisor)
            </label>
            <textarea
              rows={4}
              value={csvText}
              onChange={(e) => setCsvText(e.target.value)}
              placeholder="Nome, Telefone, Empresa, Cidade, Decisor&#10;Dr. Lucas, 11987654321, Odonto Saúde, SP, Lucas Silva"
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
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span>{csvParsed.length} leads prontos para importar</span>
                <button
                  onClick={() => handleSaveToDb(csvParsed)}
                  className="px-3 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-xs font-semibold"
                >
                  Importar Todos
                </button>
              </div>
              <div className="max-h-48 overflow-y-auto space-y-1.5">
                {csvParsed.map((l, i) => (
                  <div key={i} className="p-2 bg-slate-900/60 border border-slate-800 rounded text-xs flex justify-between">
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
    </div>
  );
};
