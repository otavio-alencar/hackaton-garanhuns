// =====================================================================
// session.js — sessão SIMULADA, com dois estados: ANÔNIMO e AUTENTICADO.
//
// ATENÇÃO: não é autenticação real. Para integrar Supabase Auth, troque APENAS o
// objeto `provider` abaixo (signIn / signOut / read). O resto do site só usa PP.session.*.
// A barreira real é o servidor: o n8n/Supabase decidem o acesso pelo user_id (função painel()).
//
// Como incluir (no <head>, ANTES de a página aparecer):
//   telas abertas:      <script src="js/session.js"></script>
//   telas protegidas:   <script src="js/session.js" data-guard data-tab="risk"></script>
// =====================================================================
window.PP = window.PP || {};

(function () {
  const cfg = PP.config;
  const SESSION_KEY = "pp_session";   // sessionStorage: some ao fechar a aba
  const FLASH_KEY = "pp_flash";       // aviso para a PRÓXIMA página
  const REGISTRY_KEY = "pp_registry"; // usuários "cadastrados" na demonstração
  const PENDING_KEY = "pp_pending";   // cadastro aguardando confirmação de e-mail

  // ---------- armazenamento (sessionStorage pode falhar em modo restrito) ----------
  const store = {
    get(key) { try { return sessionStorage.getItem(key); } catch { return null; } },
    set(key, value) { try { sessionStorage.setItem(key, value); } catch { /* sem armazenamento: segue sem */ } },
    remove(key) { try { sessionStorage.removeItem(key); } catch { /* idem */ } },
    clear() { try { sessionStorage.clear(); } catch { /* idem */ } },
    json(key, fallback) { try { return JSON.parse(store.get(key)) ?? fallback; } catch { return fallback; } }
  };

  // ---------- aviso entre páginas ----------
  const flash = {
    set(message, kind) { store.set(FLASH_KEY, JSON.stringify({ message, kind: kind || "info" })); },
    consume() { const f = store.json(FLASH_KEY, null); store.remove(FLASH_KEY); return f; }
  };

  // ---------- usuários de demonstração e cadastrados ----------
  const registry = {
    all() { return store.json(REGISTRY_KEY, {}); },
    add(username, data) { const r = registry.all(); r[username] = data; store.set(REGISTRY_KEY, JSON.stringify(r)); }
  };

  function resolveUsername(raw) {
    const username = String(raw || "").trim().toLowerCase();
    if (cfg.DEMO_USERS[username]) {
      const u = cfg.DEMO_USERS[username];
      return { username, profileKey: u.profile, userId: u.userId, name: u.name };
    }
    const reg = registry.all()[username];
    if (reg) { // cadastrado na demonstração: sempre perfil Cidadão
      return { username, profileKey: "citizen", userId: cfg.DEMO_USERS.cidadao_pe.userId, name: reg.name };
    }
    return null;
  }

  // ---------- provedor da sessão (ponto de troca por Supabase Auth) ----------
  const provider = {
    read() { return store.json(SESSION_KEY, null); },
    signIn(identity) {
      const now = Date.now();
      store.set(SESSION_KEY, JSON.stringify({ ...identity, issuedAt: now, expiresAt: now + cfg.SESSION_MINUTES * 60000 }));
    },
    signOut() { store.clear(); }
  };

  // 'anonymous' | 'authenticated' | 'expired'
  function status() {
    const s = provider.read();
    if (!s) return "anonymous";
    return Date.now() > s.expiresAt ? "expired" : "authenticated";
  }

  function getUser() {
    if (status() !== "authenticated") {
      return { authenticated: false, userId: cfg.VISITOR.userId, name: cfg.VISITOR.name, role: "Sem login", initial: "", profileKey: null, allowedTabs: [] };
    }
    const s = provider.read();
    const profile = cfg.PROFILES[s.profileKey];
    return { authenticated: true, userId: s.userId, username: s.username, name: s.name, role: profile.role, profileName: profile.name,
             initial: profile.initial, profileKey: s.profileKey, allowedTabs: profile.allowedTabs };
  }

  const canAccess = (tab) => getUser().allowedTabs.includes(tab);

  // Páginas permitidas como destino pós-login (evita redirecionar para endereços externos)
  function safeNext(value) {
    return /^[a-z0-9-]+\.html$/i.test(value || "") ? value : "chat.html";
  }

  function go(url, message, kind) {
    if (message) flash.set(message, kind);
    location.href = url;
  }

  function signIn(username, next) {
    const identity = resolveUsername(username);
    if (!identity) return false;
    provider.signIn(identity);
    location.href = safeNext(next);
    return true;
  }

  function signOut() {
    provider.signOut(); // apaga sessão, histórico do usuário e demais dados temporários
    flash.set("Você saiu da sua conta.", "info");
    location.replace("chat.html");
  }

  // Cadastro pendente (entre cadastro.html e confirmar-email.html)
  const pending = {
    get: () => store.json(PENDING_KEY, null),
    set: (data) => store.set(PENDING_KEY, JSON.stringify(data)),
    clear: () => store.remove(PENDING_KEY)
  };

  PP.session = { status, getUser, canAccess, signIn, signOut, safeNext, go, resolveUsername, flash, registry, pending, store };

  // ---------- GUARDA DA PÁGINA (roda no <head>, antes de qualquer conteúdo) ----------
  const script = document.currentScript;
  const needsGuard = script && script.hasAttribute("data-guard");
  if (!needsGuard) return;

  const here = location.pathname.split("/").pop() || "chat.html";
  const state = status();
  const block = (url, message, kind) => {
    document.documentElement.style.visibility = "hidden"; // nada aparece enquanto redireciona
    flash.set(message, kind);
    location.replace(url);
  };

  if (state !== "authenticated") {
    if (state === "expired") provider.signOut();
    block(`login.html?next=${encodeURIComponent(here)}`,
      state === "expired" ? "Sua sessão expirou. Entre novamente." : "Entre na sua conta para acessar os dashboards.",
      state === "expired" ? "warn" : "info");
  } else if (script.dataset.tab && !canAccess(script.dataset.tab)) {
    block(cfg.TAB_PAGES.citizen, "Seu perfil não permite ver esses dados.", "error");
  }

  // Botão "voltar" pode restaurar a página do cache (bfcache) depois do logout: revalida ao reaparecer
  window.addEventListener("pageshow", (event) => {
    if (event.persisted && status() !== "authenticated") location.reload();
  });
})();
