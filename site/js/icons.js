// =====================================================================
// icons.js — ícones SVG e logo (sem biblioteca). Strings estáticas e confiáveis:
// só entram no DOM via innerHTML deste arquivo, nunca com texto vindo de usuário/API.
// =====================================================================
window.PP = window.PP || {};

(function () {
  const paths = {
    chat: '<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12Z"/><path d="M8.5 11h7M8.5 14h4"/>',
    dashboard: '<rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/>',
    user: '<circle cx="12" cy="8" r="3.6"/><path d="M4.5 20a7.5 7.5 0 0 1 15 0"/>',
    logout: '<path d="M9 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h3"/><path d="M16 8l4 4-4 4M20 12H9"/>',
    login: '<path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3"/><path d="M10 8l-4 4 4 4M6 12h11"/>',
    send: '<path d="M4 12 20 4l-4.5 16-3.5-6.5L4 12Z"/><path d="m12 13.5 3.5-4"/>',
    menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
    close: '<path d="M6 6l12 12M18 6 6 18"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
    lock: '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
    alert: '<path d="M12 4 3 20h18L12 4Z"/><path d="M12 10v4M12 17v.5"/>',
    check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
    refresh: '<path d="M20 11a8 8 0 0 0-14.5-4M4 4v4h4"/><path d="M4 13a8 8 0 0 0 14.5 4M20 20v-4h-4"/>',
    shield: '<path d="M12 3 5 6v5.5c0 4.2 2.9 7.6 7 9.5 4.1-1.9 7-5.3 7-9.5V6l-7-3Z"/><path d="m9 12 2.2 2.2L15.5 10"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8v.5"/>',
    quote: '<path d="M7 17h3l1.5-4V7H6v6h3M15 17h3l1.5-4V7H14v6h3"/>'
  };

  // Ícone de linha, herda a cor do texto (currentColor)
  PP.icon = function (name, size) {
    const s = size || 20;
    return `<svg class="icon" width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${paths[name] || ""}</svg>`;
  };

  // Marca "PP": balão de pergunta em verde-mata com ponto dourado
  PP.logo = function (size) {
    const s = size || 40;
    return `<svg class="logo" width="${s}" height="${s}" viewBox="0 0 48 48" role="img" aria-label="Pergunta Pública">
      <rect width="48" height="48" rx="14" fill="#0B5D4B"/>
      <path d="M14 34V14h8.2a6 6 0 0 1 0 12H14" fill="none" stroke="#fff" stroke-width="3.6" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M26 34V20h6.4a4.6 4.6 0 0 1 0 9.2H26" fill="none" stroke="#9FD8C6" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round" opacity=".9"/>
      <circle cx="37" cy="36" r="3.2" fill="#E2A82E"/></svg>`;
  };
})();
