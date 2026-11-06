// =====================================================================
// dashboard.js — renderiza as 3 visões com dados REAIS vindos de PP.api.getPanel().
// Cada página declara <body data-view="citizen|risk|admin">. O servidor (função painel())
// decide se o perfil pode ver a visão; aqui só tratamos 401/403 e desenhamos os dados.
// =====================================================================
(function () {
  const { el, fmt } = PP.ui;
  const SVG_NS = "http://www.w3.org/2000/svg";

  const TIPO = { contrato: "Contratos", empenho: "Empenhado", pagamento: "Pago" };
  const TIPO_COLOR = { contrato: "var(--forest)", empenho: "var(--gold)", pagamento: "var(--ocean)" };
  const PERFIL = { cidadao: "Cidadão", analista: "Analista", admin: "Administrador", desconhecido: "Não identificado" };
  const FONTE = { "tcepe-contratos": "TCE-PE · Contratos", "tcepe-despesas": "TCE-PE · Despesas", "federal-contratos": "Portal da Transparência · Contratos" };

  const root = () => document.getElementById("dashboard-view");

  // ---------- Estados da interface ----------
  function stateBox(kind, title, text, action) {
    const icons = { error: "alert", denied: "lock", empty: "info" };
    return el("div", { class: `state state-${kind}`, role: kind === "error" ? "alert" : "status" },
      el("span", { class: "state-icon", html: PP.icon(icons[kind], 28) }),
      el("h3", {}, title), el("p", {}, text), action || null);
  }

  function showLoading() {
    root().setAttribute("aria-busy", "true");
    root().replaceChildren(
      el("p", { class: "sr-only", role: "status" }, "Carregando dados do painel…"),
      el("div", { class: "metric-grid", "aria-hidden": "true" }, [1, 2, 3, 4].map(() => el("div", { class: "metric-card skeleton" }))),
      el("div", { class: "panel-grid", "aria-hidden": "true" }, [1, 2].map(() => el("div", { class: "panel skeleton tall" }))));
  }

  // ---------- Blocos reutilizáveis ----------
  const metric = (label, value, hint) => el("article", { class: "metric-card" }, el("span", {}, label), el("strong", {}, value), hint ? el("small", {}, hint) : null);
  const panel = (title, ...content) => el("article", { class: "panel" }, el("h3", {}, title), ...content);
  const note = (text) => el("p", { class: "muted small" }, text);
  const metricGrid = (...cards) => el("div", { class: "metric-grid" }, cards);

  function barList(items) {
    if (!items.length) return note("Sem dados para este recorte.");
    const max = Math.max(...items.map(i => i.value), 1);
    return el("div", { class: "bar-list" }, items.map(i => el("div", { class: "bar-row" },
      el("span", { class: "bar-label", title: i.label }, i.label), el("b", {}, i.display),
      el("i", { style: `--bar:${Math.max((i.value / max) * 100, 2).toFixed(1)}%`, "aria-hidden": "true" }))));
  }

  function rankList(items) {
    if (!items.length) return note("Sem dados para este recorte.");
    return el("ol", { class: "rank-list" }, items.map(i => el("li", {}, el("span", {}, i.label), el("b", {}, i.display))));
  }

  // Tabela que vira lista de cartões no celular (cada célula carrega seu rótulo em data-label)
  function table(caption, columns, rows) {
    const head = el("tr", {}, columns.map(c => el("th", { scope: "col", class: c.num ? "num" : "" }, c.label)));
    const body = rows.map(row => el("tr", {}, columns.map(c => {
      const content = c.render ? c.render(row) : row[c.key];
      return el("td", { "data-label": c.label, class: c.num ? "num" : "" }, content ?? "—");
    })));
    return el("div", { class: "table-wrap" }, el("table", { class: "data-table" }, el("caption", { class: "sr-only" }, caption), el("thead", {}, head), el("tbody", {}, body)));
  }

  const sourceLink = (url) => PP.ui.safeUrl(url)
    ? el("a", { href: url, target: "_blank", rel: "noopener noreferrer" }, "ver fonte", el("span", { class: "sr-only" }, " (abre em nova aba)")) : "—";
  const badge = (blocked) => el("span", { class: `status ${blocked ? "blocked" : "success"}` }, blocked ? "Bloqueada" : "Permitida");

  // Colunas empilhadas por mês (SVG simples, sem biblioteca)
  function monthChart(rows) {
    const data = rows.slice(-18);
    if (!data.length) return note("Sem datas para montar a evolução.");
    const types = ["contrato", "empenho", "pagamento"].filter(t => data.some(r => r[t]));
    const W = 640, H = 240, pad = { l: 8, r: 8, t: 8, b: 26 };
    const totals = data.map(r => types.reduce((s, t) => s + (Number(r[t]) || 0), 0));
    const max = Math.max(...totals, 1);
    const slot = (W - pad.l - pad.r) / data.length;
    const bw = Math.min(slot * 0.68, 34);
    const svg = document.createElementNS(SVG_NS, "svg");
    svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
    svg.setAttribute("class", "month-chart");
    svg.setAttribute("role", "img");
    svg.setAttribute("aria-label", `Valor por mês, de ${fmt.month(data[0].mes)} a ${fmt.month(data[data.length - 1].mes)}. Maior mês: ${fmt.brlShort(max)}.`);
    const add = (tag, attrs, text) => { const n = document.createElementNS(SVG_NS, tag); Object.entries(attrs).forEach(([k, v]) => n.setAttribute(k, v)); if (text) n.textContent = text; svg.append(n); return n; };

    data.forEach((row, i) => {
      const x = pad.l + i * slot + (slot - bw) / 2;
      let y = H - pad.b;
      types.forEach(t => {
        const h = ((Number(row[t]) || 0) / max) * (H - pad.b - pad.t);
        if (h <= 0) return;
        y -= h;
        const rect = add("rect", { x: x.toFixed(1), y: y.toFixed(1), width: bw.toFixed(1), height: Math.max(h, 1).toFixed(1), rx: 3, fill: TIPO_COLOR[t] });
        const title = document.createElementNS(SVG_NS, "title");
        title.textContent = `${fmt.month(row.mes)} · ${TIPO[t]}: ${fmt.brl(row[t])}`;
        rect.append(title);
      });
      if (data.length <= 9 || i % 2 === 0) add("text", { x: (x + bw / 2).toFixed(1), y: H - 8, "text-anchor": "middle", class: "axis-label" }, fmt.month(row.mes));
    });
    const legend = el("ul", { class: "legend" }, types.map(t => el("li", {}, el("i", { style: `background:${TIPO_COLOR[t]}`, "aria-hidden": "true" }), TIPO[t])));
    return el("figure", { class: "chart" }, svg, legend);
  }

  // ---------- Visão: Cidadão ----------
  function renderCitizen(d) {
    const tipos = d.por_tipo || [];
    const cards = tipos.map(t => metric(TIPO[t.tipo] || t.tipo, fmt.brlShort(t.valor), `${fmt.num(t.qtd)} registros`));
    cards.push(metric("Órgãos", fmt.num(d.orgaos), "com registros no recorte"), metric("Fornecedores", fmt.num(d.fornecedores), "distintos"));

    const sections = [
      el("p", { class: "scope" }, el("span", { html: PP.icon("shield", 16) }),
        `Seu acesso: estados ${d.estados.join(", ")} · tipos ${d.tipos.map(t => (TIPO[t] || t).toLowerCase()).join(", ")}`),
      metricGrid(...cards),
      el("div", { class: "panel-grid" },
        panel("Valor por tipo", barList(tipos.map(t => ({ label: TIPO[t.tipo] || t.tipo, value: t.valor, display: fmt.brlShort(t.valor) })))),
        panel("Evolução por mês", monthChart(d.por_mes || []))),
      el("div", { class: "panel-grid" },
        panel("Órgãos com maior valor", barList((d.top_orgaos || []).map(o => ({ label: o.orgao, value: o.valor, display: fmt.brlShort(o.valor) })))),
        panel("Maiores fornecedores", barList((d.top_fornecedores || []).map(f => ({ label: f.fornecedor, value: f.valor, display: fmt.brlShort(f.valor) })))))
    ];

    // Maiores registros, com filtro por tipo quando houver mais de um
    const allRows = d.maiores || [];
    const tableHolder = el("div");
    const drawTable = (tipo) => tableHolder.replaceChildren(table("Maiores registros", [
      { label: "Data", render: r => fmt.date(r.data) },
      { label: "Tipo", render: r => el("span", { class: `tag tag-${r.tipo}` }, TIPO[r.tipo] || r.tipo) },
      { label: "Órgão", key: "orgao" },
      { label: "Fornecedor", render: r => r.fornecedor || "—" },
      { label: "Valor", num: true, render: r => fmt.brl(r.valor) },
      { label: "Fonte", render: r => sourceLink(r.fonte_url) }
    ], tipo ? allRows.filter(r => r.tipo === tipo) : allRows));
    drawTable("");
    const filterId = "filtro-tipo";
    const select = el("select", { id: filterId, onchange: (e) => drawTable(e.target.value) },
      el("option", { value: "" }, "Todos os tipos"), tipos.map(t => el("option", { value: t.tipo }, TIPO[t.tipo] || t.tipo)));
    sections.push(el("article", { class: "panel table-panel" },
      el("div", { class: "panel-head" }, el("h3", {}, "Maiores registros"),
        tipos.length > 1 ? el("label", { class: "inline-field", for: filterId }, el("span", { class: "sr-only" }, "Filtrar por tipo"), select) : null),
      tableHolder,
      note(`Amostra dos dados abertos coletados (última data: ${fmt.date(d.ultima_data)}). Valores como publicados pela fonte, sem auditoria: podem existir valores atípicos ou erros de digitação na origem.`)));
    return sections;
  }

  // ---------- Histórico de coletas ----------
  const CAMPO = { valor: "valor", orgao: "órgão", fornecedor: "fornecedor", cnpj_fornecedor: "CNPJ", descricao: "descrição", data: "data", tipo: "tipo" };

  // Variação do valor entre duas coletas, ex.: "+50,0%"
  function variacao(anterior, atual) {
    if (!anterior) return "—";
    const v = ((atual - anterior) / anterior) * 100;
    return `${v > 0 ? "+" : ""}${v.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
  }

  function mudancasPanel(d) {
    const lista = d.mudancas || [];
    const titulo = `Mudanças detectadas entre coletas (${fmt.num(d.qtd_mudancas || 0)})`;
    if (!lista.length) {
      return panel(titulo, note(`Nenhuma alteração detectada até agora (${fmt.num(d.qtd_coletas || 0)} coleta(s) registrada(s)). Quando um valor ou dado mudar em uma nova coleta, ele aparece aqui com o valor anterior.`));
    }
    return el("article", { class: "panel table-panel" }, el("h3", {}, titulo),
      table("Mudanças detectadas entre coletas", [
        { label: "Quando", render: r => fmt.dateTime(r.registrado_em) },
        { label: "Órgão", key: "orgao" },
        { label: "Fornecedor", render: r => r.fornecedor || "—" },
        { label: "O que mudou", render: r => (r.campos_alterados || []).map(c => CAMPO[c] || c).join(", ") },
        { label: "Valor", num: true, render: r => (r.campos_alterados || []).includes("valor") ? `${fmt.brl(r.valor_anterior)} → ${fmt.brl(r.valor)}` : "—" },
        { label: "Variação", num: true, render: r => (r.campos_alterados || []).includes("valor") ? variacao(r.valor_anterior, r.valor) : "—" }
      ], lista),
      note("Cada coleta é guardada com data. A comparação é feita contra a versão anterior do mesmo registro."));
  }

  function coletasPanel(d) {
    const lista = d.coletas || [];
    if (!lista.length) return panel("Histórico de coletas", note("Nenhuma coleta registrada ainda. Rode o carregador (python -m coletor.carregar) para registrar a primeira."));
    return el("article", { class: "panel table-panel" }, el("h3", {}, "Histórico de coletas"),
      table("Histórico de coletas", [
        { label: "Coleta", render: r => `#${r.id}` },
        { label: "Quando", render: r => fmt.dateTime(r.iniciada_em) },
        { label: "Lidos", num: true, render: r => fmt.num(r.lidos) },
        { label: "Novos", num: true, render: r => fmt.num(r.novos) },
        { label: "Alterados", num: true, render: r => fmt.num(r.alterados) },
        { label: "Inalterados", num: true, render: r => fmt.num(r.inalterados) }
      ], lista),
      note("Cada rodada do coletor é guardada sem sobrescrever as anteriores: é o histórico de dados que cresce com o tempo."));
  }

  // ---------- Visão: Risco / Compliance ----------
  function renderRisk(d) {
    return [
      metricGrid(
        metric("Fornecedores", fmt.num(d.fornecedores), "distintos no recorte"),
        metric("Contratos", fmt.num(d.contratos), fmt.brlShort(d.valor_contratado) + " contratados"),
        metric("Estados na análise", fmt.num(d.qtd_estados), (d.por_estado || []).map(s => s.estado).join(", ") || "sem dados"),
        metric("Concentração top 5", d.concentracao_top5 == null ? "—" : fmt.pct(d.concentracao_top5), "do valor em 5 fornecedores")),
      el("article", { class: "panel table-panel" }, el("h3", {}, "Resumo por estado e fornecedor"),
        table("Resumo por estado e fornecedor", [
          { label: "Estado", key: "estado" }, { label: "Fornecedor", key: "fornecedor" },
          { label: "Contratos", num: true, render: r => fmt.num(r.contratos) },
          { label: "Contratado", num: true, render: r => fmt.brlShort(r.contratado) },
          { label: "Pagamentos", num: true, render: r => fmt.brlShort(r.pago) }
        ], d.por_fornecedor || []),
        note("Concentração alta é um indício para olhar com atenção, não prova de irregularidade.")),
      mudancasPanel(d),
      el("div", { class: "panel-grid" },
        panel("Fornecedores em vários órgãos", (d.multi_orgao || []).length
          ? rankList(d.multi_orgao.map(f => ({ label: f.fornecedor, display: `${f.orgaos} órgãos · ${fmt.brlShort(f.valor)}` })))
          : note("Nenhum fornecedor aparece em mais de um órgão neste recorte.")),
        panel("Cobertura por estado", barList((d.por_estado || []).map(s => ({ label: `${s.estado} · ${fmt.num(s.qtd)} registros`, value: s.valor, display: fmt.brlShort(s.valor) }))),
          note("O mapa geográfico entra quando houver mais estados coletados.")))
    ];
  }

  // ---------- Visão: Governança ----------
  function renderAdmin(d) {
    const cards = [
      metric("Versões no histórico", fmt.num(d.versoes_historico || 0), `${fmt.num(d.mudancas_total || 0)} alteração(ões) detectada(s)`)
    ];
    if (!d.total) {
      return [metricGrid(...cards), coletasPanel(d),
        stateBox("empty", "Nenhuma consulta registrada ainda", "Quando o chat for usado, as consultas aparecem aqui (inclusive as bloqueadas).")];
    }
    const share = (qtd) => (qtd / d.total) * 100;
    return [
      metricGrid(
        metric("Consultas registradas", fmt.num(d.total), "no query_log"),
        metric("Respostas com fonte", d.com_fonte_pct == null ? "—" : fmt.pct(d.com_fonte_pct), "entre as não bloqueadas"),
        metric("Consultas bloqueadas", fmt.num(d.bloqueadas), fmt.pct(share(d.bloqueadas)) + " do total"),
        ...cards),
      el("div", { class: "panel-grid" },
        panel("Consultas por perfil", barList((d.por_perfil || []).map(p => ({ label: PERFIL[p.perfil] || p.perfil, value: p.qtd, display: `${fmt.num(p.qtd)} · ${fmt.pct(share(p.qtd))}` })))),
        panel("Fontes mais utilizadas", rankList((d.fontes_usadas || []).map(f => ({ label: FONTE[f.fonte_id] || f.fonte_id, display: fmt.num(f.qtd) }))))),
      (d.motivos || []).length ? panel("Motivos de bloqueio", rankList(d.motivos.map(m => ({ label: m.motivo, display: fmt.num(m.qtd) })))) : null,
      el("article", { class: "panel table-panel" }, el("h3", {}, "Atividade recente"),
        table("Atividade recente", [
          { label: "Quando", render: r => fmt.dateTime(r.criado_em) },
          { label: "Perfil", render: r => PERFIL[r.perfil] || r.perfil },
          { label: "Pergunta", key: "pergunta" },
          { label: "Status", render: r => badge(r.bloqueado) }
        ], d.recentes || []),
        note("Perguntas truncadas em 90 caracteres. Visível apenas para administradores.")),
      coletasPanel(d)
    ];
  }

  const RENDER = { citizen: renderCitizen, risk: renderRisk, admin: renderAdmin };
  const TAG = { citizen: "DADOS REAIS · TCE-PE", risk: "DADOS REAIS · TCE-PE", admin: "REGISTRO REAL DE CONSULTAS" };

  // ---------- Carregamento ----------
  async function load(tab) {
    showLoading();
    try {
      const data = await PP.api.getPanel(tab);
      const nodes = RENDER[tab](data).filter(Boolean);
      root().replaceChildren(...nodes);
    } catch (error) {
      if (error.status === 401) { // o servidor não reconhece o usuário: sessão inválida
        PP.session.flash.set("Sua sessão não é mais válida. Entre novamente.", "warn");
        PP.session.signOut();
        return;
      }
      if (error.status === 403) {
        root().replaceChildren(stateBox("denied", "Acesso negado", "Seu perfil não permite ver esses dados.",
          el("a", { class: "button button-small", href: PP.config.TAB_PAGES.citizen }, "Voltar ao dashboard do cidadão")));
      } else {
        root().replaceChildren(stateBox("error", "Não foi possível carregar o painel",
          error.status === 0 ? "O serviço não respondeu. Verifique se o backend está no ar." : "O serviço devolveu um erro. Tente novamente.",
          el("button", { class: "button button-small", type: "button", onclick: () => load(tab) }, el("span", { html: PP.icon("refresh", 16) }), "Tentar novamente")));
      }
    } finally {
      root().setAttribute("aria-busy", "false");
    }
  }

  function init() {
    const tab = document.body.dataset.view;
    const tag = document.getElementById("data-tag");
    if (tag) tag.textContent = TAG[tab];

    // Abas fora do perfil ficam trancadas: clicar só avisa (o bloqueio real está no servidor)
    document.querySelectorAll("a.tab[data-tab]").forEach(link => {
      if (link.dataset.tab === tab) link.setAttribute("aria-current", "page");
      if (PP.session.canAccess(link.dataset.tab)) return;
      link.classList.add("locked");
      link.setAttribute("aria-disabled", "true");
      link.prepend(el("span", { html: PP.icon("lock", 14) }));
      link.addEventListener("click", (e) => { e.preventDefault(); PP.ui.showToast("Seu perfil não permite ver esses dados.", "error"); });
    });
    load(tab);
  }

  document.addEventListener("pp:shell-ready", init);
})();
