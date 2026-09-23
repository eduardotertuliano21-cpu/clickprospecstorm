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
import { ErrorBoundary } from './components/ErrorBoundary';
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

      {/* 1. CABEÇALHO SUPERIOR UNIFICADO COM NAVEGAÇÃO E STATUS */}
      <Header 
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        isExpiringSoon={isExpiringSoon}
        daysRemaining={daysRemaining}
        customerName={licenseData?.customerName}
      />
      {/* 2. ÁREA DE CONTEÚDO PRINCIPAL (100% DA LARGURA E ALTURA ÚTIL) */}
      <main className="flex-1 flex flex-col overflow-hidden bg-slate-950">
        <ErrorBoundary fallbackTitle={`Ocorreu um erro ao carregar a aba ${activeTab.toUpperCase()}`}>
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
        </ErrorBoundary>
      </main>
    </div>
  );
};

export default App;
