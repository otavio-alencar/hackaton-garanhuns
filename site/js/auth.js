// =====================================================================
// auth.js — telas de acesso: login, cadastro, confirmar e-mail e recuperar senha.
// Tudo SIMULADO: nenhum dado é enviado ou guardado (exceto o nome de usuário "cadastrado",
// em sessionStorage, para que o login da demonstração funcione). Senha e CPF nunca são guardados.
// Cada tela só tem alguns destes formulários; cada bloco abaixo só roda se o seu formulário existir.
// =====================================================================
(function () {
  const { el } = PP.ui;
  const $ = (selector) => document.querySelector(selector);
  const params = new URLSearchParams(location.search);

  // ---------- Validação (mensagem junto do campo, ligada por aria-describedby) ----------
  function errorNode(input) {
    let node = document.getElementById(`${input.id}-error`);
    if (!node) {
      node = el("p", { class: "field-error", id: `${input.id}-error`, role: "alert" });
      input.insertAdjacentElement("afterend", node);
    }
    return node;
  }
  function setError(input, message) {
    const node = errorNode(input);
    node.textContent = message || "";
    node.hidden = !message;
    input.toggleAttribute("aria-invalid", Boolean(message));
    const hint = document.getElementById(`${input.id}-hint`);
    const ids = [hint && hint.id, message && node.id].filter(Boolean).join(" ");
    if (ids) input.setAttribute("aria-describedby", ids); else input.removeAttribute("aria-describedby");
    return !message;
  }
  // Roda as regras de cada campo; foca no primeiro com erro. Devolve true se tudo válido.
  function validate(rules) {
    let firstInvalid = null;
    rules.forEach(([input, check]) => {
      const message = check(input.value.trim(), input.value);
      if (!setError(input, message) && !firstInvalid) firstInvalid = input;
    });
    if (firstInvalid) firstInvalid.focus();
    return !firstInvalid;
  }
  const rule = {
    required: (label) => (v) => (v ? "" : `Informe ${label}.`),
    email: (v) => (/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v) ? "" : "Informe um e-mail válido, como nome@exemplo.com."),
    code: (v) => (/^\d{6}$/.test(v) ? "" : "O código tem 6 números."),
    password: (v, raw) => (raw.length >= 8 && /[A-Za-z]/.test(raw) && /\d/.test(raw) ? "" : "Use pelo menos 8 caracteres, com letras e números.")
  };
  function validCpf(value) {
    const d = value.replace(/\D/g, "");
    if (d.length !== 11 || /^(\d)\1+$/.test(d)) return false;
    const digit = (len) => { let sum = 0; for (let i = 0; i < len; i++) sum += Number(d[i]) * (len + 1 - i); const r = (sum * 10) % 11; return r === 10 ? 0 : r; };
    return digit(9) === Number(d[9]) && digit(10) === Number(d[10]);
  }

  // Alterna o foco para o primeiro campo ao trocar de etapa
  function showStep(name) {
    document.querySelectorAll("[data-step]").forEach(step => { step.hidden = step.dataset.step !== name; });
    const first = document.querySelector(`[data-step="${name}"] input`);
    if (first) first.focus();
  }

  // Reenvio com espera de 30 s (simulado)
  function resendButton(button) {
    let timer = null;
    button.addEventListener("click", (e) => {
      e.preventDefault();
      if (timer) return;
      PP.ui.showToast("Código reenviado (simulação).", "success");
      let left = 30;
      const label = button.textContent;
      button.setAttribute("aria-disabled", "true");
      timer = setInterval(() => {
        left -= 1;
        button.textContent = left > 0 ? `Reenviar em ${left}s` : label;
        if (left <= 0) { clearInterval(timer); timer = null; button.removeAttribute("aria-disabled"); }
      }, 1000);
    });
  }

  // Dicas (.hint) já ligadas ao campo para leitores de tela
  document.querySelectorAll(".hint").forEach(hint => {
    const input = document.getElementById(hint.id.replace(/-hint$/, ""));
    if (input) input.setAttribute("aria-describedby", hint.id);
  });

  // ================= LOGIN =================
  const loginForm = $("#login-form");
  if (loginForm) {
    const next = PP.session.safeNext(params.get("next"));
    if (PP.session.status() === "authenticated") { location.replace(next); return; }
    if (params.get("u")) $("#login-user").value = params.get("u");
    $("#continue-link").href = "chat.html";

    const feedback = $("#login-feedback");
    loginForm.addEventListener("submit", (event) => {
      event.preventDefault();
      feedback.textContent = "";
      const ok = validate([[$("#login-user"), rule.required("seu usuário")], [$("#login-pass"), rule.required("sua senha")]]);
      if (!ok) return;
      // Demonstração: reconhece o usuário e NÃO valida a senha
      if (!PP.session.signIn($("#login-user").value, next)) {
        feedback.textContent = "Usuário não reconhecido. Na demonstração, use cidadao_pe, analista ou admin (ou crie uma conta).";
        $("#login-user").focus();
      }
    });
    document.querySelectorAll("[data-demo-user]").forEach(button => {
      button.addEventListener("click", () => PP.session.signIn(button.dataset.demoUser, next));
    });
  }

  // ================= CADASTRO =================
  const registerForm = $("#register-form");
  if (registerForm) {
    const cpf = $("#reg-cpf");
    cpf.addEventListener("input", () => { // máscara 000.000.000-00
      const d = cpf.value.replace(/\D/g, "").slice(0, 11);
      cpf.value = d.replace(/(\d{3})(\d)/, "$1.$2").replace(/(\d{3})(\d)/, "$1.$2").replace(/(\d{3})(\d{1,2})$/, "$1-$2");
    });
    registerForm.addEventListener("submit", (event) => {
      event.preventDefault();
      const taken = (u) => PP.session.resolveUsername(u);
      const ok = validate([
        [$("#reg-name"), (v) => (v.split(/\s+/).filter(p => p.length > 1).length >= 2 ? "" : "Informe nome e sobrenome.")],
        [$("#reg-email"), rule.email],
        [cpf, (v) => (validCpf(v) ? "" : "CPF inválido. Confira os números.")],
        [$("#reg-user"), (v) => (/^[a-z0-9_]{3,20}$/i.test(v) ? (taken(v) ? "Este usuário já existe." : "") : "Use 3 a 20 letras, números ou _ (sem espaços).")],
        [$("#reg-pass"), rule.password],
        [$("#reg-pass2"), (v, raw) => (raw === $("#reg-pass").value ? "" : "As senhas não são iguais.")]
      ]);
      if (!ok) return;
      PP.session.pending.set({ username: $("#reg-user").value.trim().toLowerCase(), name: $("#reg-name").value.trim(), email: $("#reg-email").value.trim() });
      PP.session.go("confirmar-email.html", "Cadastro simulado: o código seria enviado por e-mail.", "success");
    });
  }

  // ================= CONFIRMAR E-MAIL =================
  const confirmForm = $("#confirm-form");
  if (confirmForm) {
    const pending = PP.session.pending.get();
    if (!pending) { PP.session.go("cadastro.html", "Faça o cadastro primeiro.", "info"); return; }
    const [user, domain] = pending.email.split("@");
    $("#confirm-email").textContent = `${user.slice(0, 2)}${"•".repeat(Math.max(user.length - 2, 2))}@${domain}`;
    resendButton($("#resend-code"));
    confirmForm.addEventListener("submit", (event) => {
      event.preventDefault();
      if (!validate([[$("#confirm-code"), rule.code]])) return;
      PP.session.registry.add(pending.username, { name: pending.name });
      PP.session.pending.clear();
      PP.session.go(`login.html?u=${encodeURIComponent(pending.username)}`, "E-mail confirmado (simulação). Entre com seu usuário.", "success");
    });
  }

  // ================= RECUPERAR SENHA =================
  const recoverForm = $("#recover-form");
  if (recoverForm) {
    resendButton($("#resend-code"));
    recoverForm.addEventListener("submit", (event) => {
      event.preventDefault();
      if (!validate([[$("#recover-id"), rule.required("seu usuário ou e-mail")]])) return;
      // Não revela se a conta existe (boa prática)
      $("#recover-sent").textContent = "Se a conta existir, enviamos um código de 6 números (simulação).";
      showStep("code");
    });
    $("#recover-code-form").addEventListener("submit", (event) => {
      event.preventDefault();
      if (validate([[$("#recover-code"), rule.code]])) showStep("password");
    });
    $("#recover-new-form").addEventListener("submit", (event) => {
      event.preventDefault();
      const ok = validate([
        [$("#new-pass"), rule.password],
        [$("#new-pass2"), (v, raw) => (raw === $("#new-pass").value ? "" : "As senhas não são iguais.")]
      ]);
      if (ok) PP.session.go("login.html", "Senha redefinida (simulação). Entre com sua nova senha.", "success");
    });
    showStep("id");
  }
})();
