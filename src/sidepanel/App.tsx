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
import { 
  Kanban,
  MessageSquare, 
  Users, 
  Send, 
  Bot, 
  Settings
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
    status: 'active' | 'trial' | 'blocked' | 'expired';
    isTrial: boolean;
    dailyLimit?: number;
    message?: string;
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

  const navItems: Array<{ 
    id: TabType; 
    label: string; 
    icon: React.FC<{ className?: string }>; 
    tooltip: string; 
    shortcut: string;
  }> = [
    { id: 'crm', label: 'Contatos', icon: Users, tooltip: 'Gestão de Leads, Enriquecimento CNPJ e Decisores LinkedIn', shortcut: 'Alt+1' },
    { id: 'chat', label: 'Conversas', icon: MessageSquare, tooltip: 'Inbox Unificada Multicanal (WhatsApp, E-mail, Meta)', shortcut: 'Alt+2' },
    { id: 'campaign', label: 'Disparador', icon: Send, tooltip: 'Disparos em Lote com Anti-Ban e IA Groq', shortcut: 'Alt+3' },
    { id: 'autoresponder', label: 'Auto-IA', icon: Bot, tooltip: 'Atendimento Automático com IA Generativa', shortcut: 'Alt+4' },
    { id: 'settings', label: 'Ajustes', icon: Settings, tooltip: 'Configurações de Contas, Canais e Segurança', shortcut: 'Alt+5' },
  ];

  const { isAdmin } = useAdminStore();
  const isLocked = !isAdmin && (licenseData?.status === 'blocked' || licenseData?.status === 'expired');

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

      {/* 2. BARRA DE NAVEGAÇÃO REFINADA (ESTILO PILL MODERNO) */}
      <nav className="bg-slate-900/90 backdrop-blur-md border-b border-slate-800/80 px-4 py-1.5 flex gap-1.5 items-center overflow-x-auto scrollbar-none">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <Tooltip key={item.id} text={item.tooltip} shortcut={item.shortcut} position="bottom">
              <button
                onClick={() => setActiveTab(item.id)}
                className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all whitespace-nowrap ${
                  isActive
                    ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/25 scale-[1.02]'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                }`}
              >
                <Icon className={`w-4 h-4 ${isActive ? 'text-white' : 'text-slate-400'}`} />
                <span>{item.label}</span>
              </button>
            </Tooltip>
          );
        })}
      </nav>

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
