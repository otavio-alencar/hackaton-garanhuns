// =====================================================================
// api.js — única camada que fala com o backend (n8n). O resto do site nunca chama fetch.
//
// Chat   POST {API_BASE}/transparencia  { user_id, session_id, pergunta }
//        → { resposta, fontes:[{ n, titulo, url, trecho, ... }], bloqueado, motivo }
// Painel POST {API_BASE}/painel         { user_id, visao }
//        → dados da visão  |  HTTP 403 { erro:"acesso_negado" }  |  HTTP 401 { erro:"sem_perfil" }
// Contrato completo: docs/CONTRATO.md
// =====================================================================
window.PP = window.PP || {};

(function () {
  const cfg = PP.config;

  // Erro com status HTTP e código (0 = não conseguiu conectar)
  class ApiError extends Error {
    constructor(status, code, message) { super(message); this.status = status; this.code = code; }
  }

  async function post(path, body) {
    let response;
    try {
      response = await fetch(cfg.API_BASE + path, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body)
      });
    } catch {
      throw new ApiError(0, "rede", "Não foi possível conectar ao serviço.");
    }
    let data = null;
    try { data = await response.json(); } catch { /* corpo vazio ou inválido */ }
    if (!response.ok) {
      throw new ApiError(response.status, (data && data.erro) || `http_${response.status}`,
        (data && (data.mensagem || data.message)) || `Erro ${response.status} no serviço.`);
    }
    return data;
  }

  // ---------- Chat ----------
  // Aceita as fontes no formato do contrato (titulo/url/trecho) e no formato bruto do n8n.
  function normalizeSources(list) {
    return (Array.isArray(list) ? list : []).map((f, i) => ({
      n: f.n ?? i + 1,
      titulo: f.titulo || f.nome || [f.orgao, f.tipo].filter(Boolean).join(" — ") || "Fonte consultada",
      url: PP.ui.safeUrl(f.url || f.fonte_url),
      trecho: f.trecho || "",
      meta: [f.estado, f.data ? PP.ui.fmt.date(f.data) : ""].filter(Boolean).join(" · ")
    }));
  }

  function normalizeAnswer(data) {
    const blocked = Boolean(data && data.bloqueado);
    // o n8n anexa "Fontes:" ao texto; aqui só o corpo, as fontes vêm estruturadas
    const text = String((data && data.resposta) || "").split(/\n\s*\nFontes:/)[0].trim();
    return {
      resposta: text || (blocked ? "Seu perfil não permite ver esses dados." : "Não foi encontrada uma resposta para esta consulta."),
      fontes: blocked ? [] : normalizeSources(data && data.fontes),
      bloqueado: blocked,
      motivo: (data && data.motivo) || null
    };
  }

  async function mockAnswer(question) {
    await new Promise(resolve => setTimeout(resolve, 700));
    return {
      resposta: `Resposta demonstrativa para: "${question}". Com o backend ligado, esta área mostra informações dos dados abertos coletados. [1]`,
      fontes: [{ n: 1, titulo: "Exemplo de fonte (modo demonstração)", url: "https://www.gov.br/pt-br", trecho: "Texto de exemplo, sem valor oficial.", meta: "" }],
      bloqueado: false, motivo: null
    };
  }

  // history: mensagens anteriores da conversa [{ role: "user"|"assistant", text }] — é a "memória" do chat.
  // O backend não guarda conversas: quem envia o contexto a cada pergunta é o front.
  async function ask({ question, sessionId, history }) {
    if (cfg.USE_MOCK_CHAT) return mockAnswer(question);
    const user = PP.session.getUser();
    try {
      return normalizeAnswer(await post(cfg.CHAT_PATH, {
        user_id: user.userId, session_id: sessionId, pergunta: question, historico: history || []
      }));
    } catch (error) {
      if (error.status === 403) return normalizeAnswer({ bloqueado: true, resposta: error.message, motivo: error.code });
      throw error;
    }
  }

  // ---------- Painel ----------
  async function getPanel(tab) {
    const user = PP.session.getUser();
    return post(cfg.PANEL_PATH, { user_id: user.userId, visao: cfg.TAB_VIEWS[tab] });
  }

  PP.api = { ask, getPanel, ApiError };
})();
