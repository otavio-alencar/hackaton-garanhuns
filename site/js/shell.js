// =====================================================================
// shell.js — monta a moldura das telas internas (barra lateral, topo, menu no celular).
// A página só declara:  <body data-shell="chat|dashboard" data-title="..."> <div id="page">…</div>
// Assim a navegação existe em UM lugar (antes estava copiada em cada HTML).
// =====================================================================
window.PP = window.PP || {};

(function () {
  const { el } = PP.ui;

  function navLink(href, icon, label, active) {
    return el("a", { class: "nav-item" + (active ? " active" : ""), href, "aria-current": active ? "page" : false },
      el("span", { class: "nav-icon", html: PP.icon(icon, 20) }), label);
  }

  function buildSidebar(user, current) {
    const sidebar = el("aside", { class: "sidebar", id: "sidebar", "aria-label": "Menu principal" });

    sidebar.append(
      el("a", { class: "brand", href: "chat.html", "aria-label": "Pergunta Pública — ir para o chat" },
        el("span", { html: PP.logo(36) }),
        el("span", { class: "brand-text" }, el("strong", {}, "Pergunta"), el("span", {}, "Pública"))),
      el("nav", { "aria-label": "Seções" },
        el("div", { class: "side-label" }, "Menu"),
        navLink("chat.html", "chat", "Chat", current === "chat"),
        // Dashboards só existem na navegação depois do login
        user.authenticated ? navLink("dashboard-cidadao.html", "dashboard", "Dashboard", current === "dashboard") : null),
      // O chat preenche este espaço com o histórico de consultas
      el("div", { id: "history-slot", class: "history-slot" })
    );

    const bottom = el("div", { class: "sidebar-bottom" });
    if (user.authenticated) {
      bottom.append(
        el("div", { class: "profile-box" }, PP.ui.avatar("user", user),
          el("div", {}, el("strong", { id: "profile-name" }, user.name), el("small", { id: "profile-role" }, user.profileName))),
        el("button", { class: "button button-ghost button-block", type: "button", id: "logout-button", onclick: PP.session.signOut },
          el("span", { html: PP.icon("logout", 18) }), "Sair"));
    } else {
      bottom.append(
        el("div", { class: "visitor-card" },
          el("strong", {}, "Você é visitante"),
          el("p", {}, "Entre para acessar os dashboards e guardar suas consultas na conta.")),
        el("a", { class: "button button-gold button-block", href: "login.html?next=" + encodeURIComponent(location.pathname.split("/").pop() || "chat.html") },
          el("span", { html: PP.icon("login", 18) }), "Entrar"),
        el("a", { class: "link-light", href: "cadastro.html" }, "Criar conta"));
    }
    sidebar.append(bottom);
    return sidebar;
  }

  function buildTopbar(user, title) {
    return el("header", { class: "topbar" },
      el("div", {}, el("p", { class: "eyebrow" }, "Plataforma de consulta"), el("h1", { id: "page-title" }, title)),
      user.authenticated ? el("span", { class: "pill", title: "O login é uma simulação; o backend ainda não valida identidade." },
        el("span", { html: PP.icon("shield", 16) }), "Login simulado") : null);
  }

  function mount() {
    const page = document.getElementById("page");
    if (!page) return;
    const user = PP.session.getUser();
    const current = document.body.dataset.shell;

    const sidebar = buildSidebar(user, current);
    const scrim = el("div", { class: "scrim", "aria-hidden": "true" });
    const menuButton = el("button", { class: "icon-button", type: "button", "aria-controls": "sidebar", "aria-expanded": "false", "aria-label": "Abrir menu" },
      el("span", { html: PP.icon("menu", 24) }));
    const mobilebar = el("header", { class: "mobilebar" }, menuButton,
      el("a", { class: "brand brand-inline", href: "chat.html", "aria-label": "Pergunta Pública" }, el("span", { html: PP.logo(30) }), el("strong", {}, "Pergunta Pública")));

    const main = el("main", { class: "main-content", id: "main", tabindex: "-1" }, buildTopbar(user, document.body.dataset.title || "Pergunta Pública"), page);
    const app = el("div", { class: "app-shell" },
      el("a", { class: "skip-link", href: "#main" }, "Pular para o conteúdo"), mobilebar, sidebar, scrim, main);
    document.body.prepend(app);

    // Menu lateral no celular
    const setOpen = (open) => {
      app.classList.toggle("nav-open", open);
      menuButton.setAttribute("aria-expanded", String(open));
      menuButton.setAttribute("aria-label", open ? "Fechar menu" : "Abrir menu");
    };
    menuButton.addEventListener("click", () => setOpen(!app.classList.contains("nav-open")));
    scrim.addEventListener("click", () => setOpen(false));
    document.addEventListener("keydown", (e) => { if (e.key === "Escape") setOpen(false); });
    sidebar.addEventListener("click", (e) => { if (e.target.closest("a, .history-item, .new-chat")) setOpen(false); });

    PP.shell.closeMenu = () => setOpen(false);
    document.dispatchEvent(new CustomEvent("pp:shell-ready"));
  }

  PP.shell = { mount, closeMenu() {} };
  // O shell monta antes dos scripts de página (que ouvem "pp:shell-ready" ou rodam depois dele)
  document.addEventListener("DOMContentLoaded", mount);
})();
