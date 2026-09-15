# Click Lead Storm ⚡ (Chrome & Edge Extension)

> **Extensão B2B Prospect & CRM Local com IA para WhatsApp Web (Manifest V3)**  
> 100% Client-Side First • Zero Custo de Servidor • IndexedDB Local • Proteção Anti-Ban Estocástica

---

## 🚀 Como Instalar e Rodar no Navegador (Chrome / Edge)

A extensão já está compilada e pronta para uso no diretório `dist/`.

1. Abra seu navegador baseado em Chromium (Google Chrome, Brave ou Microsoft Edge).
2. Acesse a página de extensões digitando na barra de endereço:
   - **Chrome:** `chrome://extensions/`
   - **Edge:** `edge://extensions/`
3. Ative a chave **Modo do desenvolvedor** (Developer mode) no canto superior direito.
4. Clique no botão **Carregar sem compactação** (Load unpacked).
5. Selecione a pasta:
   ```text
   c:\Users\eduar\Desktop\Click Lead Storm\dist
   ```
6. A extensão **Click Lead Storm** será ativada instantaneamente!
7. Acesse o [WhatsApp Web](https://web.whatsapp.com/) e clique no ícone da extensão ou no botão do Side Panel para abrir a interface lateral.

---

## 🛠️ Filosofia e Pilares de Engenharia

1. **Custo de Servidor Zero:** Todo o processamento de DOM, injeção de scripts e filas é executado no próprio computador do usuário. Não há navegadores headless consumindo memória em servidores externos.
2. **Armazenamento 100% Local (IndexedDB com Dexie.js):** Seus leads, histórico de campanhas, funil de vendas e configurações ficam salvos estritamente no banco `ClickLeadStorm_DB` do seu navegador.
3. **Motor Anti-Banimento Estocástico:**
   - Delays calculados via distribuição gaussiana (Box-Muller) para evitar padrões previsíveis.
   - Simulação de digitação humana baseada no tamanho do texto.
   - Trava de segurança para respeito a horários comerciais e cotas diárias.
4. **Inteligência Artificial de Alta Performance:** Integração com Groq Cloud SDK (`llama-3.3-70b-versatile` e `llama-3.1-8b-instant`) para gerar variações semânticas únicas de mensagens e auto-resposta contextualizada.
5. **Enriquecimento B2B com QSA:** Consulta automática a bases públicas (BrasilAPI / MinhaReceita) para extrair o Quadro de Sócios e Administradores (QSA) e identificar o nome do tomador de decisão (CEO/Sócio-Administrador).

---

## 📁 Estrutura do Projeto

```text
Click Lead Storm/
├── dist/                               # Build de produção pronto para carregar no navegador
├── public/
│   ├── manifest.json                   # Manifesto da extensão (V3)
│   ├── icons/                          # Ícones da extensão (16, 48, 128)
│   └── vendor/
│       └── wppconnect-wa-js.js         # Pacote injetável do WPPConnect
├── src/
│   ├── background/
│   │   └── service-worker.ts           # Service Worker Manifest V3
│   ├── content/
│   │   ├── injector.ts                 # Injetor seguro do WA-JS no WhatsApp Web
│   │   └── bridge.ts                   # Ponte de mensageria com o Side Panel
│   ├── db/
│   │   ├── index.ts                    # Schema Dexie (ClickLeadStorm_DB)
│   │   └── repositories/               # Repositórios (Leads, Campanhas, Configurações)
│   ├── services/
│   │   ├── antiBanEngine.ts            # Delays gaussianos e checagem de horários
│   │   ├── groqService.ts              # Spintax, variação semântica e auto-resposta IA
│   │   ├── mapsScraperService.ts       # Saneamento de números e parser CSV
│   │   ├── cnpjEnrichmentService.ts    # Consulta CNPJ e QSA (BrasilAPI/MinhaReceita)
│   │   └── backupService.ts            # Exportação e importação de backups JSON
│   └── sidepanel/
│       ├── index.html
│       ├── main.tsx
│       ├── App.tsx                     # Navegação principal do Side Panel
│       └── components/
│           ├── Header.tsx              # Status da conexão e contador diário
│           └── tabs/
│               ├── CRMTab.tsx          # Funil Kanban e Gestão de Leads
│               ├── ProspectTab.tsx     # Busca de Estabelecimentos e Enriquecimento CNPJ
│               ├── CampaignTab.tsx     # Disparador com Spintax, IA e Controle Anti-Ban
│               ├── AutoResponderTab.tsx# Respostas automáticas por palavras-chave e IA
│               └── SettingsTab.tsx     # Chaves de API, Cotas e Backup JSON
```

---

## ⚡ Comandos para Desenvolvimento

- **Instalar dependências:** `npm install`
- **Verificar tipos TypeScript:** `npx tsc --noEmit`
- **Recompilar a extensão:** `npm run build`
