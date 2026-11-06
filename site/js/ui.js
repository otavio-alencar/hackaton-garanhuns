// =====================================================================
// ui.js — peças reutilizáveis: criar elementos, toast, avatares, formatação e texto rico seguro.
// Regra: texto vindo da API/usuário entra SEMPRE por textContent (nunca innerHTML).
// =====================================================================
window.PP = window.PP || {};

(function () {
  // el("div", { class: "x", "aria-label": "y" }, filho1, "texto") → elemento
  function el(tag, attrs, ...children) {
    const node = document.createElement(tag);
    Object.entries(attrs || {}).forEach(([key, value]) => {
      if (value === false || value == null) return;
      if (key === "class") node.className = value;
      else if (key === "text") node.textContent = value;
      else if (key === "html") node.innerHTML = value; // SOMENTE com strings estáticas (ícones)
      else if (key.startsWith("on") && typeof value === "function") node.addEventListener(key.slice(2), value);
      else node.setAttribute(key, value === true ? "" : value);
    });
    children.flat().forEach(child => { if (child != null) node.append(child.nodeType ? child : document.createTextNode(String(child))); });
    return node;
  }

  // ---------- Toast ----------
  function toastRegion() {
    let region = document.getElementById("toast-region");
    if (!region) { region = el("div", { id: "toast-region", class: "toast-region", role: "status", "aria-live": "polite" }); document.body.append(region); }
    return region;
  }

  function showToast(message, kind) {
    const toast = el("div", { class: `toast toast-${kind || "info"}` }, message);
    toastRegion().append(toast);
    setTimeout(() => { toast.classList.add("leaving"); setTimeout(() => toast.remove(), 250); }, 4200);
  }

  // ---------- Avatares ----------
  // kind: "assistant" | "user" | "visitor". Para user, ajusta a cor pelo perfil.
  function avatar(kind, user) {
    if (kind === "assistant") return el("span", { class: "avatar avatar-assistant", html: PP.logo(36) });
    if (!user || !user.authenticated) return el("span", { class: "avatar avatar-visitor", html: PP.icon("user", 20), title: "Visitante" });
    return el("span", { class: `avatar avatar-user avatar-${user.profileKey}`, title: user.name }, user.initial || user.name.charAt(0).toUpperCase());
  }

  function hydrateAvatars() {
    document.querySelectorAll("[data-avatar]").forEach(slot => {
      slot.replaceChildren(avatar(slot.dataset.avatar, PP.session.getUser()));
    });
    // Logos nas telas de acesso (SVG estático de icons.js)
    document.querySelectorAll("[data-logo]").forEach(slot => { slot.innerHTML = PP.logo(34); });
    document.querySelectorAll("[data-logo-lg]").forEach(slot => { slot.innerHTML = PP.logo(72); });
  }

  // ---------- Formatação ----------
  const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
  const fmt = {
    brl: (v) => brl.format(Number(v) || 0),
    // R$ 1,2 mi · R$ 340 mil
    brlShort(v) {
      const n = Number(v) || 0;
      const abs = Math.abs(n);
      if (abs >= 1e9) return `R$ ${(n / 1e9).toFixed(1).replace(".", ",")} bi`;
      if (abs >= 1e6) return `R$ ${(n / 1e6).toFixed(1).replace(".", ",")} mi`;
      if (abs >= 1e3) return `R$ ${Math.round(n / 1e3)} mil`;
      return brl.format(n);
    },
    num: (v) => (Number(v) || 0).toLocaleString("pt-BR"),
    pct: (v) => `${(Number(v) || 0).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`,
    time: (date) => new Date(date).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }),
    date(value) { // aceita AAAA-MM-DD ou timestamp ISO
      if (!value) return "—";
      const only = String(value).slice(0, 10).split("-");
      return only.length === 3 ? `${only[2]}/${only[1]}/${only[0]}` : String(value);
    },
    dateTime: (value) => new Date(value).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }),
    month(yyyymm) { const [y, m] = String(yyyymm).split("-"); return `${m}/${y.slice(2)}`; }
  };

  // Só links http(s) viram <a>; qualquer outro esquema (javascript:, data:) é descartado
  const safeUrl = (url) => /^https?:\/\//i.test(String(url || "")) ? url : "";

  // ---------- Texto rico seguro (negrito, listas e citações [1]) ----------
  function inline(parent, text) {
    String(text).split(/(\*\*[^*]+\*\*|\[\d+\])/g).forEach(part => {
      if (!part) return;
      if (/^\*\*[^*]+\*\*$/.test(part)) parent.append(el("strong", {}, part.slice(2, -2)));
      else if (/^\[\d+\]$/.test(part)) parent.append(el("sup", { class: "cite", title: `Fonte ${part.slice(1, -1)}` }, part));
      else parent.append(document.createTextNode(part));
    });
  }

  function richText(text) {
    const box = el("div", { class: "rich" });
    let list = null;
    String(text || "").split("\n").forEach(raw => {
      const line = raw.trim();
      const item = line.match(/^(?:[*•-]|\d+[.)])\s+(.*)$/);
      if (item) {
        if (!list) { list = el("ul", {}); box.append(list); }
        const li = el("li"); inline(li, item[1]); list.append(li);
      } else {
        list = null;
        if (line) { const p = el("p"); inline(p, line); box.append(p); }
      }
    });
    return box;
  }

  // Mostra o aviso deixado pela página anterior
  function showPendingFlash() {
    const f = PP.session.flash.consume();
    if (f) showToast(f.message, f.kind);
  }

  PP.ui = { el, showToast, avatar, hydrateAvatars, fmt, safeUrl, richText };

  document.addEventListener("DOMContentLoaded", () => { hydrateAvatars(); showPendingFlash(); });
})();
