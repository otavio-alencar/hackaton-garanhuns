// =====================================================================
// config.js — configuração única do front. Nenhum segredo aqui.
// Todos os scripts compartilham o namespace global `PP` (sem build, sem módulos).
// Ordem de carga: config.js → icons.js → session.js → (ui.js, shell.js, api.js) → script da página
// =====================================================================
window.PP = window.PP || {};

PP.config = {
  // Backend (n8n). Em produção troque pela URL pública do n8n.
  API_BASE: "http://localhost:5678/webhook",
  CHAT_PATH: "/transparencia",   // POST { user_id, session_id, pergunta }
  PANEL_PATH: "/painel",         // POST { user_id, visao }  visao: cidadao | risco | governanca

  // true = o chat responde com texto de demonstração, sem chamar o n8n (útil sem backend)
  USE_MOCK_CHAT: false,

  // Duração da sessão SIMULADA. Na integração com Supabase Auth, vem do token.
  SESSION_MINUTES: 60,

  // Quem usa o chat sem login. É um perfil restrito cadastrado em `perfis` (supabase/seed.sql).
  VISITOR: { userId: "00000000-0000-0000-0000-000000000000", name: "Visitante" },

  // Perfis do front → abas do dashboard liberadas (data-tab das páginas).
  // O mesmo controle é refeito no servidor (função painel() do Supabase).
  PROFILES: {
    citizen: { name: "Cidadão", role: "Acesso público", initial: "C", allowedTabs: ["citizen"] },
    risk: { name: "Risco / Compliance", role: "Acesso profissional", initial: "R", allowedTabs: ["citizen", "risk"] },
    admin: { name: "Administrador", role: "Governança", initial: "A", allowedTabs: ["citizen", "risk", "admin"] }
  },

  // Usuários de DEMONSTRAÇÃO → perfil do front + user_id (UUID) da tabela `perfis`.
  DEMO_USERS: {
    cidadao_pe: { profile: "citizen", userId: "00000000-0000-0000-0000-000000000001", name: "Cidadão PE" },
    analista: { profile: "risk", userId: "00000000-0000-0000-0000-000000000002", name: "Analista" },
    admin: { profile: "admin", userId: "00000000-0000-0000-0000-000000000003", name: "Administrador" }
  },

  // Página → aba (usado pela navegação e pelo guarda)
  TAB_PAGES: { citizen: "dashboard-cidadao.html", risk: "dashboard-risco.html", admin: "dashboard-governanca.html" },
  // Visão do dashboard → nome enviado ao backend
  TAB_VIEWS: { citizen: "cidadao", risk: "risco", admin: "governanca" }
};
