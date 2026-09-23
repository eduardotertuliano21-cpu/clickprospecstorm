import React, { useState, useEffect, useRef } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { leadRepository } from '../../../db/repositories/leadRepository';
import { omnichannelRepository, type UnifiedConversationSummary } from '../../../db/repositories/omnichannelRepository';
import { omnichannelService } from '../../../services/omnichannelService';
import { settingsRepository } from '../../../db/repositories/settingsRepository';
import { groqService } from '../../../services/groqService';
import { webviewBridge } from '../../../services/webviewBridge';
import type { ChannelType, UnifiedMessage } from '../../../types/omnichannel';
import { 
  MessageSquare, 
  Send, 
  Search, 
  Plus, 
  User, 
  Building2, 
  Phone, 
  Mail, 
  MessageCircle, 
  CheckCheck, 
  Sparkles, 
  RefreshCw, 
  X,
  Inbox,
  Copy,
  Trash2,
  ExternalLink,
  Image as ImageIcon,
  Smile,
  Mic,
  Video,
  FileText,
  Wand2,
  Loader2,
  Smartphone
} from 'lucide-react';
import { ContextMenu, type ContextMenuItem } from '../ContextMenu';
import { Tooltip } from '../Tooltip';

const InstagramIcon: React.FC<{ className?: string }> = ({ className = 'w-4 h-4' }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect width="20" height="20" x="2" y="2" rx="5" ry="5"/>
    <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/>
    <line x1="17.5" x2="17.51" y1="6.5" y2="6.5"/>
  </svg>
);

const LinkedinIcon: React.FC<{ className?: string }> = ({ className = 'w-4 h-4' }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor">
    <path d="M19 3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14m-.5 15.5v-5.3a3.26 3.26 0 0 0-3.26-3.26c-.85 0-1.84.52-2.28 1.3v-1.11h-2.79v8.37h2.79v-4.93c0-.77.62-1.4 1.39-1.4a1.4 1.4 0 0 1 1.4 1.4v4.93h2.75M6.46 10.9v8.37H9.2V10.9H6.46M7.83 6.45c-.96 0-1.74.78-1.74 1.74 0 .96.78 1.74 1.74 1.74.96 0 1.74-.78 1.74-1.74 0-.96-.78-1.74-1.74-1.74Z"/>
  </svg>
);

const CHANNEL_CONFIG: Record<ChannelType, { label: string; icon: React.FC<{ className?: string }>; color: string; bg: string; border: string }> = {
  whatsapp: { label: 'WhatsApp', icon: MessageSquare, color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20' },
  email: { label: 'E-mail', icon: Mail, color: 'text-sky-400', bg: 'bg-sky-500/10', border: 'border-sky-500/20' },
  instagram: { label: 'Instagram', icon: InstagramIcon, color: 'text-pink-400', bg: 'bg-pink-500/10', border: 'border-pink-500/20' },
  messenger: { label: 'Messenger', icon: MessageCircle, color: 'text-blue-400', bg: 'bg-blue-500/10', border: 'border-blue-500/20' },
  linkedin: { label: 'LinkedIn', icon: LinkedinIcon, color: 'text-sky-400', bg: 'bg-sky-500/10', border: 'border-sky-500/20' }
};

/**
 * Formata os identificadores de contato de forma amigável conforme a rede social
 */
function formatContactDetails(contactId: string, channel: ChannelType, name?: string, company?: string) {
  if (channel === 'whatsapp') {
    let formattedPhone = contactId;
    const digits = contactId.replace(/\D/g, '');
    if (digits.length === 13 && digits.startsWith('55')) {
      formattedPhone = `+55 (${digits.slice(2, 4)}) ${digits.slice(4, 9)}-${digits.slice(9)}`;
    } else if (digits.length === 12 && digits.startsWith('55')) {
      formattedPhone = `+55 (${digits.slice(2, 4)}) ${digits.slice(4, 8)}-${digits.slice(8)}`;
    } else if (digits.length >= 10) {
      formattedPhone = `+${digits}`;
    }
    return {
      title: name || company || formattedPhone,
      subtitle: (name || company) ? formattedPhone : 'WhatsApp',
      displayId: formattedPhone
    };
  }
  if (channel === 'instagram') {
    const handle = contactId.startsWith('@') ? contactId : `@${contactId}`;
    return {
      title: name || company || handle,
      subtitle: (name || company) ? handle : 'Instagram Direct',
      displayId: handle
    };
  }
  if (channel === 'email') {
    return {
      title: name || company || contactId,
      subtitle: (name || company) ? contactId : 'E-mail',
      displayId: contactId
    };
  }
  return {
    title: name || company || contactId,
    subtitle: contactId,
    displayId: contactId
  };
}

/**
 * Renderiza o conteúdo da mensagem formatando mídias (áudio, figurinhas, imagens)
 */
function renderMessageText(content: string) {
  if (content === '[Imagem]') {
    return (
      <span className="flex items-center gap-1.5 py-0.5 text-emerald-300 font-medium">
        <ImageIcon className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
        <span>📷 Imagem recebida</span>
      </span>
    );
  }
  if (content === '[Figurinha]') {
    return (
      <span className="flex items-center gap-1.5 py-0.5 text-amber-300 font-medium">
        <Smile className="w-3.5 h-3.5 text-amber-400 shrink-0" />
        <span>🎨 Figurinha</span>
      </span>
    );
  }
  if (content === '[Áudio]') {
    return (
      <span className="flex items-center gap-1.5 py-0.5 text-blue-300 font-medium">
        <Mic className="w-3.5 h-3.5 text-blue-400 shrink-0" />
        <span>🎵 Mensagem de Áudio</span>
      </span>
    );
  }
  if (content === '[Vídeo]') {
    return (
      <span className="flex items-center gap-1.5 py-0.5 text-purple-300 font-medium">
        <Video className="w-3.5 h-3.5 text-purple-400 shrink-0" />
        <span>🎥 Vídeo</span>
      </span>
    );
  }
  if (content.startsWith('[Arquivo:')) {
    const filename = content.replace(/^\[Arquivo:\s*/, '').replace(/\]$/, '');
    return (
      <span className="flex items-center gap-1.5 py-0.5 text-sky-300 font-medium">
        <FileText className="w-3.5 h-3.5 text-sky-400 shrink-0" />
        <span>📄 {filename}</span>
      </span>
    );
  }
  return <p className="whitespace-pre-wrap leading-relaxed text-xs">{content}</p>;
}

export const ChatTab: React.FC = () => {
  const [selectedContactId, setSelectedContactId] = useState<string | null>(null);
  const [channelFilter, setChannelFilter] = useState<'all' | ChannelType>('all');
  const [activeChannel, setActiveChannel] = useState<ChannelType>('whatsapp');
  const [inputText, setInputText] = useState('');
  const [emailSubject, setEmailSubject] = useState('');
  const [searchFilter, setSearchFilter] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [newChatModalOpen, setNewChatModalOpen] = useState(false);
  const [newContactId, setNewContactId] = useState('');
  const [newChatChannel, setNewChatChannel] = useState<ChannelType>('whatsapp');
  const [newChatMessage, setNewChatMessage] = useState('');
  const [newChatSubject, setNewChatSubject] = useState('');

  // Estados de Context Menu e Notificações (Toast)
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    title?: string;
    subtitle?: string;
    items: ContextMenuItem[];
  } | null>(null);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 3000);
  };

  const copyToClipboard = (text: string, label: string) => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(text);
    }
    showToast(`📋 ${label}`);
  };

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Consulta reativa de conversas unificadas
  const conversations = useLiveQuery(async () => {
    const filter = channelFilter === 'all' ? undefined : channelFilter;
    return await omnichannelRepository.getConversations(filter);
  }, [channelFilter]) || [];

  // Mensagens do contato selecionado
  const activeMessages = useLiveQuery(async () => {
    if (!selectedContactId) return [];
    return await omnichannelRepository.getMessages(selectedContactId);
  }, [selectedContactId]) || [];

  // Lead correspondente
  const selectedLead = useLiveQuery(async () => {
    if (!selectedContactId) return null;
    return await leadRepository.getLeadByPhone(selectedContactId);
  }, [selectedContactId]);

  // Conversa ativa selecionada
  const activeConv = conversations.find(c => c.contactId === selectedContactId);

  // Rola para o fim das mensagens quando chegam novas
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [activeMessages]);

  // Marca como lido quando seleciona a conversa
  useEffect(() => {
    if (selectedContactId) {
      omnichannelRepository.markAsRead(selectedContactId).catch(() => {});
    }
  }, [selectedContactId]);

  // Trava e sincroniza automaticamente o canal de envio com o canal de origem da conversa selecionada
  useEffect(() => {
    if (activeConv) {
      setActiveChannel(activeConv.channel);
      if (activeConv.channel === 'email' && activeConv.subject) {
        setEmailSubject(prev => prev ? prev : `Re: ${activeConv.subject!.replace(/^Re:\s*/i, '')}`);
      }
    }
  }, [selectedContactId, activeConv?.channel]);

  // Se não houver conversa selecionada, seleciona a primeira disponível
  useEffect(() => {
    if (!selectedContactId && conversations.length > 0) {
      setSelectedContactId(conversations[0].contactId);
      setActiveChannel(conversations[0].channel);
    }
  }, [conversations, selectedContactId]);

  const [isGeneratingAiReply, setIsGeneratingAiReply] = useState(false);

  // Limpa automaticamente do banco local qualquer resíduo de newsletters e grupos antigos
  useEffect(() => {
    omnichannelRepository.purgeInvalidChats();
  }, []);

  const handleDeleteConversation = async (contactId: string, channel?: ChannelType) => {
    if (!confirm(`Deseja apagar o histórico de mensagens com este contato?`)) return;
    try {
      await omnichannelRepository.deleteConversation(contactId, channel);
      if (selectedContactId === contactId) {
        setSelectedContactId(null);
      }
      showToast('🗑️ Conversa excluída com sucesso');
    } catch (err: any) {
      alert(`Erro ao excluir conversa: ${err.message}`);
    }
  };

  const handleGenerateAiReply = async () => {
    if (!activeConv || isGeneratingAiReply) return;
    
    // Busca a última mensagem recebida do cliente
    const lastIncoming = [...activeMessages].reverse().find(m => m.direction === 'incoming');
    if (!lastIncoming) {
      showToast('⚠️ Nenhuma mensagem recebida do cliente para responder');
      return;
    }

    setIsGeneratingAiReply(true);
    try {
      const settings = await settingsRepository.getSettings();
      const suggested = await groqService.generateAutoReply({
        incomingMessage: lastIncoming.content,
        leadContext: {
          name: selectedLead?.name || activeConv.contactName,
          companyName: selectedLead?.companyName || activeConv.companyName,
          decisionMaker: selectedLead?.decisionMaker,
          niche: selectedLead?.category,
          city: selectedLead?.city,
          state: selectedLead?.state,
          notes: selectedLead?.notes
        },
        myCompanyContext: {
          name: settings.myCompanyName,
          description: settings.myCompanyDescription,
          offer: settings.myCompanyOffer
        },
        chatHistory: activeMessages.slice(-6).map(m => ({
          fromMe: m.direction === 'outgoing',
          body: m.content
        })),
        systemPrompt: settings.customSalesPrompt,
        apiKey: settings.groqApiKey,
        model: settings.groqModel
      });

      if (suggested) {
        setInputText(suggested);
        showToast('✨ Resposta com IA sugerida! Revise e envie.');
      }
    } catch (err: any) {
      showToast(`Erro na IA: ${err?.message || 'Falha ao sugerir resposta'}`);
    } finally {
      setIsGeneratingAiReply(false);
    }
  };

  // Quando o usuário troca de conversa, ajusta o canal padrão de resposta para o canal da conversa
  const handleSelectConversation = (conv: UnifiedConversationSummary) => {
    setSelectedContactId(conv.contactId);
    setActiveChannel(conv.channel);
    if (conv.channel === 'email' && conv.subject) {
      setEmailSubject(`Re: ${conv.subject.replace(/^Re:\s*/i, '')}`);
    }
  };

  const handleSendMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!inputText.trim() || !selectedContactId || isSending) return;

    const textToSend = inputText.trim();
    const subjectToSend = activeChannel === 'email' ? (emailSubject.trim() || 'Contato Comercial') : undefined;

    setInputText('');
    setIsSending(true);

    try {
      // 1. Obter configurações ativas dos canais
      const settings = await omnichannelService.getSettings();
      let channelConfig: any = null;
      if (activeChannel === 'email') channelConfig = settings.email;
      else if (activeChannel === 'instagram' || activeChannel === 'messenger') channelConfig = settings.meta;

      // 2. Chamar o handler IPC universal omni:send-message via electronAPI
      let res: any = { success: true };
      if (typeof window !== 'undefined' && (window as any).electronAPI?.sendOmniMessage) {
        res = await (window as any).electronAPI.sendOmniMessage({
          channel: activeChannel,
          recipient: selectedContactId,
          content: textToSend,
          subject: subjectToSend,
          channelConfig
        });
      } else {
        res = await omnichannelService.sendMessage({
          contactId: selectedContactId,
          channel: activeChannel,
          content: textToSend,
          subject: subjectToSend
        });
      }

      if (!res?.success) {
        alert(`Falha no envio via ${CHANNEL_CONFIG[activeChannel]?.label || activeChannel}: ${res?.error || 'Erro desconhecido'}`);
      }

      // 3. Salva a mensagem no histórico unificado do Dexie
      await omnichannelRepository.saveMessage({
        contactId: selectedContactId,
        channel: activeChannel,
        direction: 'outgoing',
        sender: 'Minha Empresa',
        recipient: selectedContactId,
        subject: subjectToSend,
        content: textToSend,
        timestamp: Date.now(),
        status: res?.success ? 'sent' : 'failed'
      });
    } catch (err: any) {
      alert(`Falha ao enviar mensagem: ${err?.message || err}`);
    } finally {
      setIsSending(false);
    }
  };

  const crmLeads = useLiveQuery(async () => {
    return await leadRepository.getLeads();
  }) || [];

  const filteredConversations = conversations.filter(c => {
    if (!searchFilter.trim()) return true;
    const term = searchFilter.toLowerCase();
    return (
      c.contactId.toLowerCase().includes(term) ||
      (c.contactName && c.contactName.toLowerCase().includes(term)) ||
      (c.companyName && c.companyName.toLowerCase().includes(term)) ||
      c.lastMessage.toLowerCase().includes(term)
    );
  });

  const getConvContextMenuItems = (conv: UnifiedConversationSummary): ContextMenuItem[] => {
    return [
      {
        label: `Copiar ${conv.channel === 'email' ? 'E-mail' : 'Telefone / ID'}`,
        icon: Copy,
        shortcut: 'Ctrl+C',
        action: () => copyToClipboard(conv.contactId, 'Identificador copiado!')
      },
      {
        label: 'Copiar Última Mensagem',
        icon: Copy,
        action: () => copyToClipboard(conv.lastMessage, 'Última mensagem copiada!')
      },
      {
        divider: true
      },
      {
        label: `Responder via ${CHANNEL_CONFIG[conv.channel]?.label || conv.channel}`,
        icon: CHANNEL_CONFIG[conv.channel]?.icon || MessageSquare,
        action: () => handleSelectConversation(conv)
      },
      {
        label: 'Marcar como Lida',
        icon: CheckCheck,
        action: async () => {
          await omnichannelRepository.markAsRead(conv.contactId, conv.channel);
          showToast('Conversa marcada como lida');
        }
      },
      {
        divider: true
      },
      {
        label: 'Limpar Conversa',
        icon: Trash2,
        danger: true,
        action: async () => {
          if (confirm(`Deseja apagar o histórico de mensagens com ${conv.contactName || conv.contactId}?`)) {
            await omnichannelRepository.deleteConversation(conv.contactId, conv.channel);
            if (selectedContactId === conv.contactId) {
              setSelectedContactId(null);
            }
            showToast('Conversa excluída com sucesso');
          }
        }
      }
    ];
  };

  const getMsgContextMenuItems = (msg: UnifiedMessage): ContextMenuItem[] => {
    return [
      {
        label: 'Copiar Mensagem',
        icon: Copy,
        shortcut: 'Ctrl+C',
        action: () => copyToClipboard(msg.content, 'Texto copiado!')
      },
      ...(msg.subject ? [{
        label: 'Copiar Assunto',
        icon: Copy,
        action: () => copyToClipboard(msg.subject!, 'Assunto copiado!')
      }] : [])
    ];
  };

  return (
    <div className="flex h-full bg-slate-950 text-slate-100 overflow-hidden select-none">
      
      {/* PAINEL LATERAL ESQUERDO: INBOX MULTICANAL */}
      <div className="w-80 border-r border-slate-800 flex flex-col bg-slate-900/40 shrink-0">
        
        {/* CABEÇALHO DO PAINEL LATERAL */}
        <div className="p-3 border-b border-slate-800 space-y-2.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="p-1.5 bg-emerald-500/10 text-emerald-400 rounded-lg">
                <Inbox className="w-4 h-4" />
              </div>
              <h2 className="text-xs font-bold text-slate-200">Inbox Unificada</h2>
            </div>

            <Tooltip text="Iniciar nova mensagem direta multicanal">
              <button
                onClick={() => setNewChatModalOpen(true)}
                className="p-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold shadow flex items-center gap-1 px-2 transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Nova</span>
              </button>
            </Tooltip>
          </div>

          {/* BUSCA DE CONVERSAS */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Buscar por nome, número ou e-mail..."
              value={searchFilter}
              onChange={(e) => setSearchFilter(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-8 pr-3 py-1 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-emerald-500"
            />
          </div>

          {/* SELETOR DE REDES SOCIAIS (ABAS DEDICADAS) */}
          <div className="grid grid-cols-4 gap-1 p-1 bg-slate-950 rounded-xl border border-slate-800 text-[11px]">
            <button
              onClick={() => setChannelFilter('whatsapp')}
              className={`py-1.5 px-1 rounded-lg font-bold flex flex-col items-center justify-center gap-0.5 transition-all ${
                channelFilter === 'whatsapp'
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
              }`}
              title="Filtrar conversas do WhatsApp"
            >
              <div className="flex items-center gap-1">
                <MessageSquare className="w-3.5 h-3.5 text-emerald-400" />
                <span className="text-[10px]">Whats</span>
              </div>
              <span className="text-[9px] opacity-80">
                {conversations.filter(c => c.channel === 'whatsapp').length}
              </span>
            </button>

            <button
              onClick={() => setChannelFilter('instagram')}
              className={`py-1.5 px-1 rounded-lg font-bold flex flex-col items-center justify-center gap-0.5 transition-all ${
                channelFilter === 'instagram'
                  ? 'bg-pink-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
              }`}
              title="Filtrar conversas do Instagram Direct"
            >
              <div className="flex items-center gap-1">
                <InstagramIcon className="w-3.5 h-3.5 text-pink-400" />
                <span className="text-[10px]">Insta</span>
              </div>
              <span className="text-[9px] opacity-80">
                {conversations.filter(c => c.channel === 'instagram').length}
              </span>
            </button>

            <button
              onClick={() => setChannelFilter('email')}
              className={`py-1.5 px-1 rounded-lg font-bold flex flex-col items-center justify-center gap-0.5 transition-all ${
                channelFilter === 'email'
                  ? 'bg-sky-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
              }`}
              title="Filtrar conversas de E-mail"
            >
              <div className="flex items-center gap-1">
                <Mail className="w-3.5 h-3.5 text-sky-400" />
                <span className="text-[10px]">E-mail</span>
              </div>
              <span className="text-[9px] opacity-80">
                {conversations.filter(c => c.channel === 'email').length}
              </span>
            </button>

            <button
              onClick={() => setChannelFilter('all')}
              className={`py-1.5 px-1 rounded-lg font-bold flex flex-col items-center justify-center gap-0.5 transition-all ${
                channelFilter === 'all'
                  ? 'bg-slate-800 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
              }`}
              title="Exibir conversas de todas as redes"
            >
              <div className="flex items-center gap-1">
                <Inbox className="w-3.5 h-3.5 text-slate-300" />
                <span className="text-[10px]">Todas</span>
              </div>
              <span className="text-[9px] opacity-80">
                {conversations.length}
              </span>
            </button>
          </div>
        </div>

        {/* LISTA DE CONVERSAS */}
        <div className="flex-1 overflow-y-auto divide-y divide-slate-800/40">
          {filteredConversations.length === 0 ? (
            <div className="p-6 text-center text-xs text-slate-500 space-y-2">
              <MessageSquare className="w-8 h-8 mx-auto text-slate-600 opacity-50" />
              <p>Nenhuma conversa encontrada neste canal.</p>
            </div>
          ) : (
            filteredConversations.map((conv) => {
              const isSelected = selectedContactId === conv.contactId;
              const chConfig = CHANNEL_CONFIG[conv.channel] || CHANNEL_CONFIG.whatsapp;
              const ChannelIcon = chConfig.icon;
              const details = formatContactDetails(conv.contactId, conv.channel, conv.contactName, conv.companyName);

              return (
                <div
                  key={`${conv.channel}:${conv.contactId}`}
                  onClick={() => handleSelectConversation(conv)}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    setContextMenu({
                      x: e.clientX,
                      y: e.clientY,
                      title: details.title,
                      subtitle: `${chConfig.label} • ${details.displayId}`,
                      items: getConvContextMenuItems(conv)
                    });
                  }}
                  className={`p-2.5 cursor-pointer transition-colors flex gap-2.5 items-start group ${
                    isSelected
                      ? 'bg-slate-800/90 border-l-2 border-emerald-500'
                      : 'hover:bg-slate-800/40'
                  }`}
                >
                  {/* AVATAR COM ÍCONE DO CANAL */}
                  <div className="relative shrink-0 mt-0.5">
                    <div className="w-8 h-8 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-300 font-bold text-xs">
                      {details.title.charAt(0).toUpperCase()}
                    </div>
                    <div className={`absolute -bottom-1 -right-1 w-4 h-4 rounded-full border border-slate-900 flex items-center justify-center ${chConfig.bg} ${chConfig.color}`}>
                      <ChannelIcon className="w-2.5 h-2.5" />
                    </div>
                  </div>

                  {/* DADOS DA CONVERSA */}
                  <div className="flex-1 min-w-0 space-y-0.5">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-xs text-slate-200 truncate">
                        {details.title}
                      </span>
                      <span className="text-[10px] text-slate-500 font-mono shrink-0">
                        {new Date(conv.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-[10px] text-slate-400 font-mono truncate">
                        {details.subtitle}
                      </span>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteConversation(conv.contactId, conv.channel);
                        }}
                        className="opacity-0 group-hover:opacity-100 p-0.5 hover:text-rose-400 text-slate-500 transition"
                        title="Excluir conversa do histórico"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>

                    {conv.subject && (
                      <p className="text-[10px] font-semibold text-sky-400 truncate">
                        ✉️ {conv.subject}
                      </p>
                    )}

                    <div className="text-xs text-slate-400 truncate">
                      {renderMessageText(conv.lastMessage)}
                    </div>
                  </div>

                  {/* BADGE NÃO LIDO */}
                  {conv.unreadCount > 0 && (
                    <span className="px-1.5 py-0.5 bg-emerald-500 text-slate-950 font-bold rounded-full text-[9px] shrink-0">
                      {conv.unreadCount}
                    </span>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* ÁREA CENTRAL: MENSAGENS E ENVIO */}
      {selectedContactId ? (
        <div className="flex-1 flex flex-col bg-slate-950">
          
          {/* CABEÇALHO DO CHAT */}
          <div className="p-3 border-b border-slate-800 bg-slate-900/70 flex items-center justify-between">
            {(() => {
              const activeDetails = formatContactDetails(
                selectedContactId,
                activeConv?.channel || activeChannel,
                selectedLead?.name || activeConv?.contactName,
                selectedLead?.companyName || activeConv?.companyName
              );
              const chConfig = CHANNEL_CONFIG[activeConv?.channel || activeChannel] || CHANNEL_CONFIG.whatsapp;

              return (
                <>
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-200 font-bold text-sm">
                      {activeDetails.title.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-xs font-bold text-slate-100">
                          {activeDetails.title}
                        </h3>
                        {selectedLead?.companyName && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400">
                            {selectedLead.companyName}
                          </span>
                        )}
                        <span className={`text-[10px] px-2 py-0.5 rounded-full border font-semibold flex items-center gap-1 ${chConfig.bg} ${chConfig.border} ${chConfig.color}`}>
                          {React.createElement(chConfig.icon || MessageSquare, { className: 'w-2.5 h-2.5' })}
                          {chConfig.label}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-400 font-mono">
                        {activeDetails.displayId} {selectedLead?.decisionMaker ? `• Sócio: ${selectedLead.decisionMaker}` : ''}
                      </p>
                    </div>
                  </div>

                  {/* AÇÕES RÁPIDAS DA REDE SOCIAL (FIM DA MISTURA) */}
                  <div className="flex items-center gap-2">
                    {activeConv?.channel === 'whatsapp' && (
                      <button
                        type="button"
                        onClick={() => {
                          const clean = selectedContactId.replace(/\D/g, '');
                          window.open(`https://web.whatsapp.com/send?phone=${clean}`, '_blank');
                        }}
                        className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-750 text-slate-300 hover:text-emerald-400 border border-slate-700 transition text-xs flex items-center gap-1"
                        title="Abrir no WhatsApp Web"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                        <span className="hidden sm:inline text-[11px]">Abrir Web</span>
                      </button>
                    )}

                    {activeConv?.channel === 'instagram' && (
                      <button
                        type="button"
                        onClick={() => {
                          const handle = selectedContactId.replace(/^@/, '');
                          window.open(`https://instagram.com/${handle}`, '_blank');
                        }}
                        className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-750 text-slate-300 hover:text-pink-400 border border-slate-700 transition text-xs flex items-center gap-1"
                        title="Ver perfil no Instagram"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                        <span className="hidden sm:inline text-[11px]">Ver Perfil</span>
                      </button>
                    )}

                    {activeConv?.channel === 'email' && (
                      <button
                        type="button"
                        onClick={() => {
                          window.open(`mailto:${selectedContactId}`, '_blank');
                        }}
                        className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-750 text-slate-300 hover:text-sky-400 border border-slate-700 transition text-xs flex items-center gap-1"
                        title="Abrir no cliente de e-mail padrão"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                        <span className="hidden sm:inline text-[11px]">Cliente E-mail</span>
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => handleDeleteConversation(selectedContactId, activeConv?.channel)}
                      className="p-1.5 rounded-lg bg-slate-800 hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 border border-slate-700 hover:border-rose-500/30 transition text-xs flex items-center gap-1"
                      title="Excluir esta conversa do histórico local"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline text-[11px]">Excluir</span>
                    </button>
                  </div>
                </>
              );
            })()}
          </div>

          {/* HISTÓRICO DE MENSAGENS */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {activeMessages.length === 0 ? (
              <div className="text-center py-12 text-xs text-slate-500 space-y-2">
                <MessageSquare className="w-8 h-8 mx-auto text-slate-600 opacity-40" />
                <p>Nenhuma mensagem trocada com este contato ainda.</p>
                <p className="text-[11px] text-slate-600">Inicie uma conversa abaixo escolhendo o canal desejado.</p>
              </div>
            ) : (
              activeMessages.map((msg, idx) => {
                const isMe = msg.direction === 'outgoing';
                const chCfg = CHANNEL_CONFIG[msg.channel] || CHANNEL_CONFIG.whatsapp;
                const Icon = chCfg.icon;

                return (
                  <div
                    key={msg.id || idx}
                    className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}
                  >
                    <div
                      onContextMenu={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setContextMenu({
                          x: e.clientX,
                          y: e.clientY,
                          title: 'Mensagem',
                          subtitle: `${chCfg.label} • ${new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`,
                          items: getMsgContextMenuItems(msg)
                        });
                      }}
                      className={`max-w-[75%] rounded-2xl p-3 text-xs shadow-md space-y-1 cursor-context-menu ${
                        isMe
                          ? 'bg-emerald-600 text-white rounded-tr-none'
                          : 'bg-slate-900 border border-slate-800 text-slate-200 rounded-tl-none'
                      }`}
                    >
                      {/* HEADER DA MENSAGEM COM IDENTIFICAÇÃO DO CANAL */}
                      <div className="flex items-center justify-between gap-3 text-[10px] opacity-75 border-b border-white/10 pb-1">
                        <span className="flex items-center gap-1 font-semibold">
                          <Icon className="w-2.5 h-2.5" />
                          {chCfg.label}
                        </span>
                        <span>
                          {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>

                      {/* ASSUNTO (SE E-MAIL) */}
                      {msg.subject && (
                        <div className="font-bold text-[11px] text-sky-200">
                          Assunto: {msg.subject}
                        </div>
                      )}

                      {/* CONTEÚDO DA MENSAGEM COM SUPORTE A MÍDIAS */}
                      {renderMessageText(msg.content)}

                      {/* STATUS DE ENVIO */}
                      {isMe && (
                        <div className="flex justify-end pt-0.5">
                          <CheckCheck className="w-3 h-3 text-emerald-200 opacity-80" />
                        </div>
                      )}
                    </div>
                  </div>
                );
              })
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* FORMULÁRIO DE ENVIO */}
          <form onSubmit={handleSendMessage} className="p-3 border-t border-slate-800 bg-slate-900/60 space-y-2">
            
            {/* BARRA SUPERIOR DE AÇÕES RÁPIDAS: IA E IDENTIFICAÇÃO DO CANAL */}
            <div className="flex items-center justify-between gap-2">
              <button
                type="button"
                disabled={isGeneratingAiReply || activeMessages.length === 0}
                onClick={handleGenerateAiReply}
                className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-teal-500/15 hover:bg-teal-500/25 border border-teal-500/30 text-teal-300 text-xs font-semibold transition shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                title="A IA analisa a conversa e sugere uma resposta persuasiva e personalizada"
              >
                {isGeneratingAiReply ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-teal-400" />
                    <span>Gerando sugestão de resposta...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-3.5 h-3.5 text-teal-400" />
                    <span>✨ Sugerir Resposta com IA</span>
                  </>
                )}
              </button>

              <span className="text-[11px] text-slate-400 font-mono">
                Enviando via: <strong className={CHANNEL_CONFIG[activeChannel]?.color}>{CHANNEL_CONFIG[activeChannel]?.label}</strong>
              </span>
            </div>

            {/* SE O CANAL FOR E-MAIL: EXIBE CAMPO DE ASSUNTO */}
            {activeChannel === 'email' && (
              <div className="flex items-center gap-2 bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5">
                <span className="text-xs font-semibold text-sky-400">Assunto:</span>
                <input
                  type="text"
                  value={emailSubject}
                  onChange={(e) => setEmailSubject(e.target.value)}
                  placeholder="Ex: Re: Oportunidade Comercial"
                  className="flex-1 bg-transparent text-xs text-slate-100 placeholder-slate-500 focus:outline-none"
                />
              </div>
            )}

            <div className="flex gap-2 items-end">
              <textarea
                rows={2}
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSendMessage();
                  }
                }}
                placeholder={
                  activeChannel === 'whatsapp'
                    ? `Digite sua mensagem via WhatsApp para ${selectedLead?.name || activeConv?.contactName || selectedContactId}...`
                    : activeChannel === 'instagram'
                    ? `Enviar Direct no Instagram para ${activeConv?.contactName || selectedContactId}...`
                    : `Escreva o corpo do e-mail para ${selectedContactId}...`
                }
                className="flex-1 bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-emerald-500 resize-none leading-relaxed"
              />

              <button
                type="submit"
                disabled={!inputText.trim() || isSending}
                className={`px-4 py-2.5 rounded-xl text-xs font-bold shadow-md flex items-center justify-center gap-1.5 transition-all disabled:opacity-50 h-[46px] shrink-0 ${
                  activeChannel === 'whatsapp'
                    ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-600/20'
                    : activeChannel === 'instagram'
                    ? 'bg-pink-600 hover:bg-pink-500 text-white shadow-pink-600/20'
                    : 'bg-sky-600 hover:bg-sky-500 text-white shadow-sky-600/20'
                }`}
              >
                {isSending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Send className="w-4 h-4" />
                )}
                <span>
                  {isSending ? 'Enviando...' : activeChannel === 'whatsapp' ? 'Enviar WhatsApp' : activeChannel === 'instagram' ? 'Enviar Direct' : 'Enviar E-mail'}
                </span>
              </button>
            </div>
          </form>
        </div>
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center text-center p-6 text-slate-500 space-y-3">
          <div className="w-14 h-14 rounded-2xl bg-slate-900 border border-slate-800 flex items-center justify-center text-slate-600">
            <Inbox className="w-7 h-7" />
          </div>
          <h3 className="text-sm font-bold text-slate-300">Nenhuma conversa selecionada</h3>
          <p className="text-xs max-w-sm text-slate-500">
            Selecione uma conversa na Inbox Unificada ao lado ou inicie um novo contato por WhatsApp, E-mail ou Meta.
          </p>
        </div>
      )}

      {/* MODAL: NOVA CONVERSA MULTICANAL */}
      {newChatModalOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 w-full max-w-md space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-sm font-bold text-slate-100">Iniciar Nova Mensagem</h3>
              <button onClick={() => setNewChatModalOpen(false)} className="text-slate-400 hover:text-slate-200">
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* SELEÇÃO DO CANAL */}
            <div>
              <label className="text-xs font-semibold text-slate-300 block mb-1.5">Selecione o Canal:</label>
              <div className="grid grid-cols-4 gap-1.5">
                {(['whatsapp', 'email', 'instagram', 'messenger'] as ChannelType[]).map((ch) => {
                  const cfg = CHANNEL_CONFIG[ch];
                  const Icon = cfg.icon;
                  const isSel = newChatChannel === ch;
                  return (
                    <button
                      key={ch}
                      type="button"
                      onClick={() => setNewChatChannel(ch)}
                      className={`p-2 rounded-xl text-xs font-semibold flex flex-col items-center gap-1 transition-all border ${
                        isSel
                          ? `${cfg.bg} ${cfg.border} ${cfg.color} shadow-md`
                          : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      <Icon className="w-4 h-4" />
                      <span className="text-[10px]">{cfg.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* DESTINATÁRIO */}
            <div>
              <label className="text-xs font-semibold text-slate-300 block mb-1">
                {newChatChannel === 'email' ? 'E-mail do Destinatário' : (newChatChannel === 'whatsapp' ? 'WhatsApp (com DDD)' : 'Identificador / ID do Contato')}
              </label>
              <input
                type="text"
                value={newContactId}
                onChange={(e) => setNewContactId(e.target.value)}
                placeholder={newChatChannel === 'email' ? 'cliente@empresa.com' : '5511999998888'}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-100 font-mono focus:outline-none focus:border-emerald-500"
              />
            </div>

            {/* SE FOR E-MAIL: ASSUNTO */}
            {newChatChannel === 'email' && (
              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">Assunto do E-mail</label>
                <input
                  type="text"
                  value={newChatSubject}
                  onChange={(e) => setNewChatSubject(e.target.value)}
                  placeholder="Ex: Apresentação Click Lead Storm"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-emerald-500"
                />
              </div>
            )}

            {/* MENSAGEM */}
            <div>
              <label className="text-xs font-semibold text-slate-300 block mb-1">Mensagem Inicial</label>
              <textarea
                rows={3}
                value={newChatMessage}
                onChange={(e) => setNewChatMessage(e.target.value)}
                placeholder="Olá, tudo bem? Gostaria de apresentar..."
                className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-xs text-slate-100 focus:outline-none focus:border-emerald-500 resize-none"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setNewChatModalOpen(false)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-medium"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={async () => {
                  if (!newContactId.trim() || !newChatMessage.trim()) return;
                  await omnichannelService.sendMessage({
                    contactId: newContactId.trim(),
                    channel: newChatChannel,
                    content: newChatMessage.trim(),
                    subject: newChatSubject.trim() || undefined
                  });
                  setSelectedContactId(newContactId.trim());
                  setActiveChannel(newChatChannel);
                  setNewChatModalOpen(false);
                  setNewContactId('');
                  setNewChatMessage('');
                  setNewChatSubject('');
                }}
                className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-semibold shadow-md"
              >
                Enviar Mensagem
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Context Menu flutuante */}
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          title={contextMenu.title}
          subtitle={contextMenu.subtitle}
          items={contextMenu.items}
          onClose={() => setContextMenu(null)}
        />
      )}

      {/* Toast de notificação / feedback */}
      {toastMsg && (
        <div className="fixed bottom-6 right-6 z-50 bg-slate-900/95 border border-emerald-500/40 text-emerald-300 text-xs px-4 py-2.5 rounded-2xl shadow-2xl backdrop-blur-xl animate-in fade-in slide-in-from-bottom-3 duration-200 flex items-center gap-2 ring-1 ring-white/10">
          <span>{toastMsg}</span>
        </div>
      )}
    </div>
  );
};
