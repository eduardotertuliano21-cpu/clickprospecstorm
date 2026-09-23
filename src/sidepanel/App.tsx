import React, { useState, useEffect } from 'react';
import { Header } from './components/Header';
import { CRMTab } from './components/tabs/CRMTab';
import { ChatTab } from './components/tabs/ChatTab';
import { CampaignTab } from './components/tabs/CampaignTab';
import { AutoResponderTab } from './components/tabs/AutoResponderTab';
import { SettingsTab } from './components/tabs/SettingsTab';
import { LockScreen } from './components/LockScreen';
import { MasterLoginModal } from './components/MasterLoginModal';
import { ForceUpdateModal, type ForceUpdateInfo } from './components/ForceUpdateModal';
import { autoResponderService } from '../services/autoResponderService';
import { useAdminStore } from './stores/useAdminStore';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import { 
  Kanban,
  MessageSquare, 
  Users, 
  Send, 
  Bot, 
  Settings,
  AlertTriangle,
  CheckCircle2,
  Sparkles,
  ChevronDown,
  ChevronUp,
  X,
  ArrowRight,
  QrCode,
  Smartphone
} from 'lucide-react';
import { Tooltip } from './components/Tooltip';

type TabType = 'crm' | 'chat' | 'campaign' | 'autoresponder' | 'settings';

export const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<TabType>('crm');
  const [selectedCampaignLeadIds, setSelectedCampaignLeadIds] = useState<number[] | null>(null);

  // Estados de Modo Mestre e Licença
  const [isMasterModalOpen, setIsMasterModalOpen] = useState(false);
  const [forceUpdateInfo, setForceUpdateInfo] = useState<ForceUpdateInfo | null>(null);
  const [licenseData, setLicenseData] = useState<{
    machineId: string;
    hostname?: string;
    customerName?: string;
    status: 'active' | 'trial' | 'blocked' | 'expired' | 'hardware_mismatch';
    isTrial: boolean;
    dailyLimit?: number;
    message?: string;
    expiresAt?: string | null;
  } | null>(null);

  const fetchLicense = async () => {
    if (typeof window !== 'undefined' && (window as any).electronAPI?.getLicenseInfo) {
      try {
        const lic = await (window as any).electronAPI.getLicenseInfo();
        setLicenseData(lic);
      } catch (err) {
        console.warn('[App] Erro ao obter dados de licença:', err);
      }
    }
  };

  useEffect(() => {
    fetchLicense();
    if (typeof window !== 'undefined' && (window as any).electronAPI?.onLicenseStatusChanged) {
      const unsub = (window as any).electronAPI.onLicenseStatusChanged((lic: any) => {
        setLicenseData(lic);
      });
      return unsub;
    }
  }, []);

  useEffect(() => {
    if (typeof window !== 'undefined' && (window as any).electronAPI?.onForceUpdate) {
      const unsub = (window as any).electronAPI.onForceUpdate((info: ForceUpdateInfo) => {
        setForceUpdateInfo(info);
      });
      return unsub;
    }
  }, []);

  const handleStartCampaignFromCRM = (leadIds: number[]) => {
    setSelectedCampaignLeadIds(leadIds);
    setActiveTab('campaign');
  };

  // Inicializa o serviço global do Auto-Responder e persistência de conversas
  useEffect(() => {
    autoResponderService.init().catch((err) => {
      console.warn('[App] Erro ao inicializar autoResponderService:', err);
    });
  }, []);

  // Atalhos de Teclado Globais (Ctrl+Shift+Alt+M para Modo Mestre e Alt+1 até Alt+5 para abas)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Atalho Mestre: Ctrl + Shift + Alt + M
      if (e.ctrlKey && e.shiftKey && e.altKey && (e.key === 'm' || e.key === 'M')) {
        e.preventDefault();
        setIsMasterModalOpen(prev => !prev);
        return;
      }

      if (e.altKey) {
        if (e.key === '1') { e.preventDefault(); setActiveTab('crm'); }
        else if (e.key === '2') { e.preventDefault(); setActiveTab('chat'); }
        else if (e.key === '3') { e.preventDefault(); setActiveTab('campaign'); }
        else if (e.key === '4') { e.preventDefault(); setActiveTab('autoresponder'); }
        else if (e.key === '5') { e.preventDefault(); setActiveTab('settings'); }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Estados do Guia Rápido de Início para Leigos
  const [showQuickGuide, setShowQuickGuide] = useState(() => {
    return localStorage.getItem('cls_hide_quick_guide') !== 'true';
  });
  const leadsCount = useLiveQuery(() => db.leads.count(), []) ?? 0;
  const [waConnected, setWaConnected] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined' && (window as any).electronAPI?.getWhatsAppStatus) {
      (window as any).electronAPI.getWhatsAppStatus().then((res: any) => {
        setWaConnected(res?.status === 'connected');
      }).catch(() => {});

      const unsub = (window as any).electronAPI.onWhatsAppStatus?.((data: any) => {
        setWaConnected(data?.status === 'connected');
      });
      return unsub;
    }
  }, []);

  const navItems: Array<{ 
    id: TabType; 
    label: string; 
    subtitle: string;
    icon: React.FC<{ className?: string }>; 
    tooltip: string; 
    shortcut: string;
  }> = [
    { id: 'crm', label: 'Meus Contatos', subtitle: 'Clientes & Maps', icon: Users, tooltip: 'Visualizar e organizar seus clientes, importar planilhas e buscar no Google Maps', shortcut: 'Alt+1' },
    { id: 'chat', label: 'Conversas', subtitle: 'WhatsApp ao vivo', icon: MessageSquare, tooltip: 'Ver e responder mensagens recebidas no WhatsApp', shortcut: 'Alt+2' },
    { id: 'campaign', label: 'Enviar Mensagens', subtitle: 'Disparador com IA', icon: Send, tooltip: 'Disparar mensagens automáticas para vários contatos de uma vez', shortcut: 'Alt+3' },
    { id: 'autoresponder', label: 'Robô de Atendimento', subtitle: 'IA 24h', icon: Bot, tooltip: 'Atendimento automático que tira dúvidas e qualifica clientes no WhatsApp', shortcut: 'Alt+4' },
    { id: 'settings', label: 'Configurações', subtitle: 'Minha Empresa', icon: Settings, tooltip: 'Configurar dados da sua empresa, produtos e conexões', shortcut: 'Alt+5' },
  ];

  const { isEmergencyBypassed } = useAdminStore();
  const isLocked = !isEmergencyBypassed && (licenseData?.status === 'blocked' || licenseData?.status === 'expired' || licenseData?.status === 'hardware_mismatch');

  const daysRemaining = licenseData?.expiresAt 
    ? Math.ceil((new Date(licenseData.expiresAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
    : null;
  const isExpiringSoon = !isLocked && daysRemaining !== null && daysRemaining > 0 && daysRemaining <= 5 && (licenseData?.status === 'active' || licenseData?.status === 'trial');

  return (
    <div className="flex flex-col h-screen bg-slate-950 text-slate-100 font-sans overflow-hidden select-none relative">
      {/* Modal de Atualização Obrigatória (Versão Descontinuada pelo Servidor Central) */}
      {forceUpdateInfo && (
        <ForceUpdateModal info={forceUpdateInfo} />
      )}

      {/* Tela de Bloqueio Remoto (se a licença for bloqueada ou expirar) */}
      {isLocked && licenseData && (
        <LockScreen 
          machineId={licenseData.machineId}
          hostname={licenseData.hostname}
          customerName={licenseData.customerName}
          status={licenseData.status as any}
          message={licenseData.message}
          onKeyActivated={fetchLicense}
        />
      )}

      {/* Modal de Autenticação do Modo Mestre (Ctrl + Shift + Alt + M) */}
      <MasterLoginModal 
        isOpen={isMasterModalOpen} 
        onClose={() => setIsMasterModalOpen(false)} 
        onSuccess={() => setActiveTab('settings')}
      />

      {/* 1. CABEÇALHO SUPERIOR ELEGANTE COM STATUS */}
      <Header />

      {/* Banner de Aviso de Expiração em Breve (≤ 5 dias) */}
      {isExpiringSoon && (
        <div className="bg-amber-500/15 border-b border-amber-500/30 px-4 py-2 flex items-center justify-between text-xs text-amber-200 shrink-0">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 animate-bounce" />
            <span>
              <strong>Aviso de Expiração:</strong> Seu acesso ao Click Lead Storm expira em <strong className="text-amber-300 font-extrabold">{daysRemaining} dia{daysRemaining > 1 ? 's' : ''}</strong> ({new Date(licenseData!.expiresAt!).toLocaleDateString('pt-BR')}). Renove sua assinatura para evitar interrupções.
            </span>
          </div>
          <button 
            type="button"
            onClick={() => window.open(`https://wa.me/5511996773805?text=${encodeURIComponent(`Olá Eduardo! Minha licença do Click Lead Storm (${licenseData?.customerName || 'Estação'}) expira em ${daysRemaining} dias e gostaria de renovar.`)}`, '_blank')}
            className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold px-3 py-1 rounded-lg text-[11px] transition shadow flex items-center gap-1.5 shrink-0"
          >
            <span>💬 Renovar Acesso no WhatsApp</span>
          </button>
        </div>
      )}

      {/* 2. BARRA DE NAVEGAÇÃO REFINADA (COM RÓTULOS CLAROS E SUBTÍTULOS) */}
      <nav className="bg-slate-900/90 backdrop-blur-md border-b border-slate-800/80 px-4 py-2 flex gap-2 items-center overflow-x-auto scrollbar-none">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <Tooltip key={item.id} text={item.tooltip} shortcut={item.shortcut} position="bottom">
              <button
                onClick={() => setActiveTab(item.id)}
                className={`flex items-center gap-2.5 px-4 py-2 rounded-xl transition-all whitespace-nowrap text-left ${
                  isActive
                    ? 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-lg shadow-emerald-600/25 scale-[1.02]'
                    : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800/60'
                }`}
              >
                <div className={`p-1.5 rounded-lg ${isActive ? 'bg-white/15' : 'bg-slate-800'}`}>
                  <Icon className={`w-4 h-4 ${isActive ? 'text-white' : 'text-slate-400'}`} />
                </div>
                <div className="flex flex-col">
                  <span className="text-xs font-bold leading-tight">{item.label}</span>
                  <span className={`text-[10px] leading-tight ${isActive ? 'text-emerald-100' : 'text-slate-500'}`}>{item.subtitle}</span>
                </div>
              </button>
            </Tooltip>
          );
        })}
      </nav>

      {/* 2.1 GUIA RÁPIDO DE INÍCIO (PASSO A PASSO EM 3 ETAPAS PARA LEIGOS) */}
      {showQuickGuide && (
        <div className="bg-gradient-to-r from-slate-900 via-slate-900/95 to-slate-900 border-b border-slate-800/90 px-4 py-2 flex items-center justify-between gap-3 text-xs shrink-0 animate-fadeIn">
          <div className="flex items-center gap-2 text-slate-300 font-semibold shrink-0">
            <Sparkles className="w-4 h-4 text-emerald-400 animate-pulse" />
            <span className="hidden md:inline text-slate-200">Guia Rápido:</span>
          </div>

          <div className="flex items-center gap-2 sm:gap-3 overflow-x-auto scrollbar-none py-0.5">
            {/* Passo 1: WhatsApp */}
            <div 
              onClick={() => {
                if (!waConnected && typeof window !== 'undefined' && (window as any).electronAPI?.initWhatsApp) {
                  (window as any).electronAPI.initWhatsApp();
                }
              }}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-bold cursor-pointer transition shadow-sm ${
                waConnected 
                  ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30' 
                  : 'bg-amber-500/20 text-amber-200 border border-amber-500/50 hover:bg-amber-500/30 animate-pulse'
              }`}
              title={waConnected ? 'WhatsApp conectado e pronto para envios!' : 'Clique para escanear o QR Code no seu WhatsApp agora'}
            >
              {waConnected ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              ) : (
                <span className="w-4 h-4 rounded-full bg-amber-500 text-slate-950 font-extrabold text-[10px] flex items-center justify-center shrink-0">1</span>
              )}
              <span>{waConnected ? '1. WhatsApp Conectado' : '1. Conectar WhatsApp'}</span>
            </div>

            <ArrowRight className="w-3.5 h-3.5 text-slate-600 shrink-0" />

            {/* Passo 2: Contatos */}
            <div 
              onClick={() => setActiveTab('crm')}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-bold cursor-pointer transition shadow-sm ${
                leadsCount > 0 
                  ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30' 
                  : 'bg-slate-800 text-slate-200 border border-slate-700 hover:bg-slate-750 hover:border-slate-600'
              }`}
              title={leadsCount > 0 ? `${leadsCount} contatos cadastrados e prontos!` : 'Clique para buscar empresas no Google Maps ou cadastrar contatos'}
            >
              {leadsCount > 0 ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              ) : (
                <span className="w-4 h-4 rounded-full bg-slate-700 text-slate-200 font-extrabold text-[10px] flex items-center justify-center shrink-0">2</span>
              )}
              <span>{leadsCount > 0 ? `2. ${leadsCount} Contatos Prontos` : '2. Adicionar Contatos'}</span>
            </div>

            <ArrowRight className="w-3.5 h-3.5 text-slate-600 shrink-0" />

            {/* Passo 3: Enviar Mensagens */}
            <div 
              onClick={() => setActiveTab('campaign')}
              className="flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-bold cursor-pointer transition bg-slate-800 text-slate-200 border border-slate-700 hover:bg-slate-750 hover:text-white shadow-sm"
              title="Clique para criar seu texto e iniciar os envios automáticos"
            >
              <span className="w-4 h-4 rounded-full bg-slate-700 text-slate-200 font-extrabold text-[10px] flex items-center justify-center shrink-0">3</span>
              <span>3. Enviar Mensagens</span>
            </div>
          </div>

          <button
            onClick={() => {
              setShowQuickGuide(false);
              localStorage.setItem('cls_hide_quick_guide', 'true');
            }}
            className="text-slate-500 hover:text-slate-300 p-1.5 rounded-lg hover:bg-slate-800 transition shrink-0"
            title="Ocultar Guia Rápido"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* 3. ÁREA DE CONTEÚDO PRINCIPAL (100% DA LARGURA E ALTURA ÚTIL) */}
      <main className="flex-1 flex flex-col overflow-hidden bg-slate-950">
        {activeTab === 'crm' && (
          <CRMTab onStartCampaignWithLeads={handleStartCampaignFromCRM} />
        )}
        {activeTab === 'chat' && <ChatTab />}
        {activeTab === 'campaign' && (
          <CampaignTab 
            selectedLeadIds={selectedCampaignLeadIds}
            onClearSelectedLeads={() => setSelectedCampaignLeadIds(null)}
          />
        )}
        {activeTab === 'autoresponder' && <AutoResponderTab />}
        {activeTab === 'settings' && <SettingsTab />}
      </main>
    </div>
  );
};

export default App;
