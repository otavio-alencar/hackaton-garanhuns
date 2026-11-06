// =====================================================================
// chat.js — conversa, histórico e renderização das mensagens.
//
// Histórico (ConversationStore):
//   • VISITANTE  → só em memória (variável JS). Recarregar ou sair da página apaga tudo.
//                  Nada em localStorage/sessionStorage.
//   • AUTENTICADO → sessionStorage por usuário ("pp_chat:<user_id>"); some no logout.
//                  Estrutura pronta para virar tabelas: usuário → conversas → mensagens → fontes.
//                  Para persistir de verdade, troque só createStore() (ex.: Supabase).
// =====================================================================
(function () {
  const { el, fmt } = PP.ui;
  const MAX_LENGTH = 500; // limite que o backend também aplica

  // ---------- ConversationStore ----------
  function createStore(user) {
    if (user.authenticated) {
      const key = `pp_chat:${user.userId}`;
      return {
        persistent: true,
        load: () => PP.session.store.json(key, { conversations: [], currentId: null }),
        save: (state) => PP.session.store.set(key, JSON.stringify(state))
      };
    }
    let memory = { conversations: [], currentId: null }; // vive só enquanto a página estiver aberta
    return { persistent: false, load: () => memory, save: (state) => { memory = state; } };
  }

  const user = PP.session.getUser();
  const store = createStore(user);
  let state = store.load();
  let waiting = false;

  const $ = (selector) => document.querySelector(selector);
  const makeId = () => (window.crypto && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`);
  const current = () => state.conversations.find(c => c.id === state.currentId) || null;
  const persist = () => store.save(state);

  // ---------- Montagem das mensagens ----------
  function buildSources(fontes) {
    const list = el("ol", { class: "source-list" });
    fontes.forEach(f => {
      const title = f.url
        ? el("a", { href: f.url, target: "_blank", rel: "noopener noreferrer" }, f.titulo, el("span", { class: "sr-only" }, " (abre em nova aba)"))
        : el("span", {}, f.titulo);
      list.append(el("li", { class: "source" },
        el("span", { class: "source-n", "aria-hidden": "true" }, f.n),
        el("div", {},
          el("div", { class: "source-title" }, title),
          f.meta ? el("div", { class: "source-meta" }, f.meta) : null,
          f.trecho ? el("p", { class: "source-excerpt" }, f.trecho) : null)));
    });
    return el("details", { class: "sources", open: true },
      el("summary", {}, el("span", { html: PP.icon("link", 16) }), `Fontes consultadas (${fontes.length})`), list);
  }

  function buildMessage(m) {
    const isUser = m.role === "user";
    const bubble = el("div", { class: "bubble" + (m.blocked ? " blocked" : "") + (m.error ? " error" : "") },
      el("div", { class: "bubble-name" }, isUser ? (user.authenticated ? user.name : "Você") : "Pergunta Pública"));

    if (m.blocked) bubble.append(el("div", { class: "bubble-tag" }, el("span", { html: PP.icon("shield", 14) }), "Bloqueado pelo controle de acesso"));
    bubble.append(isUser ? el("p", { class: "plain" }, m.text) : PP.ui.richText(m.text));
    if (!isUser && Array.isArray(m.fontes) && m.fontes.length) bubble.append(buildSources(m.fontes));
    if (m.error) bubble.append(el("button", { class: "button button-small", type: "button", onclick: () => retry(m.id) },
      el("span", { html: PP.icon("refresh", 16) }), "Tentar novamente"));
    if (m.ts) bubble.append(el("time", { class: "bubble-time", datetime: new Date(m.ts).toISOString() }, fmt.time(m.ts)));

    return el("article", { class: `msg-row ${isUser ? "user" : "assistant"}` }, PP.ui.avatar(isUser ? "user" : "assistant", user), bubble);
  }

  function buildTyping() {
    return el("article", { class: "msg-row assistant", id: "typing", "aria-label": "Pergunta Pública está pensando" },
      PP.ui.avatar("assistant"),
      el("div", { class: "bubble typing" }, el("span", { class: "dots", "aria-hidden": "true" }, el("i"), el("i"), el("i")),
        el("span", { class: "sr-only" }, "Pergunta Pública está pensando…"), el("span", { class: "typing-text", "aria-hidden": "true" }, "Pergunta Pública está pensando…")));
  }

  const WELCOME = "Olá! Posso ajudar a consultar despesas, contratos e outros dados públicos. Eu respondo só com os dados abertos coletados e sempre mostro a fonte. O que você gostaria de saber?";

  // ---------- Renderização ----------
  function renderMessages() {
    const box = $("#chat-messages");
    box.replaceChildren(buildMessage({ id: "welcome", role: "assistant", text: WELCOME }));
    const conversation = current();
    if (conversation) conversation.messages.forEach(m => box.append(buildMessage(m)));
    if (waiting) box.append(buildTyping());
    box.scrollTop = box.scrollHeight;
    box.setAttribute("aria-busy", String(waiting));
  }

  function renderHistory() {
    const slot = $("#history-slot");
    slot.replaceChildren(
      el("div", { class: "side-label" }, user.authenticated ? "Suas consultas" : "Consultas desta sessão"),
      el("button", { class: "new-chat", type: "button", onclick: newChat }, el("span", { html: PP.icon("plus", 16) }), "Nova consulta"));
    if (!user.authenticated) slot.append(el("p", { class: "history-note" }, "Temporárias: somem ao recarregar ou sair da página."));

    const list = el("div", { class: "history-list" });
    if (!state.conversations.length) list.append(el("p", { class: "history-empty" }, "Nenhuma consulta ainda."));
    state.conversations.forEach(c => {
      list.append(el("button", { class: "history-item" + (c.id === state.currentId ? " active" : ""), type: "button",
        "aria-current": c.id === state.currentId ? "true" : false, onclick: () => { state.currentId = c.id; persist(); render(); } }, c.title));
    });
    slot.append(list);
  }

  function render() {
    const conversation = current();
    $("#page-title").textContent = conversation ? conversation.title : "Nova consulta";
    renderHistory();
    renderMessages();
    updateComposer();
  }

  // ---------- Envio ----------
  function newChat() {
    state.currentId = null; persist(); render();
    $("#question-input").focus();
  }

  // Memória: as últimas mensagens desta conversa (sem a pergunta atual, sem erros e sem bloqueios)
  function buildHistory(conversation) {
    return conversation.messages.slice(0, -1)
      .filter(m => !m.error && !m.blocked)
      .slice(-8)
      .map(m => ({ role: m.role, text: m.text }));
  }

  async function answer(conversation, question) {
    waiting = true; render();
    try {
      const result = await PP.api.ask({ question, sessionId: conversation.id, history: buildHistory(conversation) });
      conversation.messages.push({ id: makeId(), role: "assistant", text: result.resposta, fontes: result.fontes, blocked: result.bloqueado, ts: Date.now() });
    } catch (error) {
      console.error("Erro no chat:", error);
      const text = error.status === 0
        ? "Não consegui conectar ao serviço. Verifique se o backend está no ar e tente novamente."
        : "O serviço não conseguiu responder agora. Tente novamente em instantes.";
      conversation.messages.push({ id: makeId(), role: "assistant", text, error: true, retryQuestion: question, ts: Date.now() });
    }
    waiting = false; persist(); render();
    $("#question-input").focus();
  }

  async function send(question) {
    if (waiting) return;
    let conversation = current();
    if (!conversation) { // a consulta só entra no histórico quando a 1ª pergunta é enviada
      conversation = { id: makeId(), title: question.slice(0, 40), messages: [] };
      state.conversations.unshift(conversation);
      state.currentId = conversation.id;
    }
    conversation.messages.push({ id: makeId(), role: "user", text: question, ts: Date.now() });
    persist();
    await answer(conversation, question);
  }

  function retry(messageId) {
    const conversation = current();
    const failed = conversation && conversation.messages.find(m => m.id === messageId);
    if (!failed || waiting) return;
    conversation.messages = conversation.messages.filter(m => m.id !== messageId);
    answer(conversation, failed.retryQuestion);
  }

  // ---------- Campo de mensagem ----------
  function updateComposer() {
    const input = $("#question-input");
    $("#send-button").disabled = waiting || !input.value.trim();
    input.disabled = waiting;
    const counter = $("#char-counter");
    counter.textContent = `${input.value.length}/${MAX_LENGTH}`;
    counter.hidden = input.value.length < MAX_LENGTH * 0.8;
    input.style.height = "auto";
    const border = input.offsetHeight - input.clientHeight; // scrollHeight não inclui a borda
    input.style.height = Math.min(input.scrollHeight + border, 140) + "px";
  }

  function submit() {
    const input = $("#question-input");
    const question = input.value.trim();
    if (!question || waiting) return;
    input.value = "";
    updateComposer();
    send(question);
  }

  function init() {
    $("#visitor-banner").hidden = user.authenticated;
    if (!user.authenticated) {
      $("#visitor-login").href = "login.html?next=chat.html";
    }
    const input = $("#question-input");
    input.addEventListener("input", updateComposer);
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey && !e.isComposing) { e.preventDefault(); submit(); }
    });
    $("#chat-form").addEventListener("submit", (e) => { e.preventDefault(); submit(); });
    document.querySelectorAll("#suggestions .suggestion").forEach(button => {
      button.addEventListener("click", () => { input.value = button.dataset.question; updateComposer(); input.focus(); });
    });
    render();
  }

  document.addEventListener("pp:shell-ready", init);
})();
