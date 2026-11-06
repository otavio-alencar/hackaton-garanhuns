-- =====================================================================
-- Portal Inteligente de Transparência — schema do Supabase
-- Cole TUDO no SQL Editor do Supabase e clique em RUN (pode rodar de novo sem medo).
-- =====================================================================
create extension if not exists vector;

-- 1) fontes ------------------------------------------------------------
create table if not exists fontes (
  id          text primary key,
  nome        text not null,
  estado      text not null,                       -- sigla (PE) ou BR
  url_portal  text not null,
  tipo        text not null check (tipo in ('api','portal'))
);

-- 2) despesas (dados estruturados) --------------------------------------
create table if not exists despesas (
  id               text primary key,
  estado           text not null,
  orgao            text,
  tipo             text not null check (tipo in ('contrato','pagamento','empenho')),
  cnpj_fornecedor  text,
  fornecedor       text,
  valor            numeric(16,2),
  data             date,
  descricao        text,
  fonte_url        text,
  fonte_id         text references fontes(id)
);
create index if not exists despesas_estado_tipo_idx on despesas (estado, tipo);
create index if not exists despesas_data_idx on despesas (data);

-- 3) documents (texto + vetor para o RAG) --------------------------------
-- 768 dimensões = modelo gratuito gemini-embedding-001 (outputDimensionality 768)
create table if not exists documents (
  id         text primary key,                    -- mesmo id da despesa
  content    text not null,
  embedding  vector(768),
  metadata   jsonb not null                       -- estado, orgao, tipo, fonte_url, data, cnpj, fonte_id
);
create index if not exists documents_embedding_idx
  on documents using hnsw (embedding vector_cosine_ops);
create index if not exists documents_meta_idx on documents using gin (metadata);

-- 4) perfis (controle de acesso) ------------------------------------------
create table if not exists perfis (
  user_id            uuid primary key,
  perfil             text not null check (perfil in ('cidadao','analista','admin')),
  estados_permitidos text[] not null default '{}',
  tipos_permitidos   text[] not null default '{}'
);

-- 5) query_log (auditoria de todas as perguntas) -------------------------
create table if not exists query_log (
  id         bigint generated always as identity primary key,
  user_id    uuid,
  perfil     text,
  pergunta   text,
  resposta   text,
  fontes     jsonb,
  bloqueado  boolean not null default false,
  motivo     text,
  criado_em  timestamptz not null default now()
);
create index if not exists query_log_user_idx on query_log (user_id, criado_em desc);

-- =====================================================================
-- Segurança: RLS ligado e SEM políticas = ninguém usando a chave "anon"
-- consegue ler nada. Só o n8n (chave service_role) acessa.
-- =====================================================================
alter table fontes    enable row level security;
alter table despesas  enable row level security;
alter table documents enable row level security;
alter table perfis    enable row level security;
alter table query_log enable row level security;

-- =====================================================================
-- Histórico de coletas: cada rodada do coletor fica registrada com data, e cada
-- versão NOVA ou ALTERADA de uma despesa vira uma linha que nunca é sobrescrita.
--   despesas            = estado atual (como a fonte publica hoje)
--   despesas_historico  = linha do tempo (só acrescenta; guarda valor anterior)
--   coletas             = resumo de cada rodada (lidos, novos, alterados)
-- =====================================================================
create table if not exists coletas (
  id           bigint generated always as identity primary key,
  iniciada_em  timestamptz not null default now(),
  observacao   text,
  lidos        int not null default 0,
  novos        int not null default 0,   -- vistos pela primeira vez no histórico
  alterados    int not null default 0,   -- já existiam e mudaram (valor, órgão, fornecedor…)
  inalterados  int not null default 0
);

create table if not exists despesas_historico (
  id                bigint generated always as identity primary key,
  despesa_id        text not null,
  coleta_id         bigint not null references coletas(id),
  registrado_em     timestamptz not null default now(),
  evento            text not null check (evento in ('novo', 'inicial', 'alterado')),
  campos_alterados  text[] not null default '{}',
  valor_anterior    numeric(16,2),
  estado            text,
  orgao             text,
  tipo              text,
  cnpj_fornecedor   text,
  fornecedor        text,
  valor             numeric(16,2),
  data              date,
  descricao         text,
  fonte_url         text,
  fonte_id          text
);
create index if not exists despesas_historico_despesa_idx on despesas_historico (despesa_id, registrado_em desc);
create index if not exists despesas_historico_coleta_idx on despesas_historico (coleta_id);
create index if not exists despesas_historico_evento_idx on despesas_historico (evento, registrado_em desc);

alter table coletas            enable row level security;
alter table despesas_historico enable row level security;

-- Abre uma rodada de coleta e devolve o id dela
create or replace function iniciar_coleta(p_observacao text default null)
returns bigint language sql security definer set search_path = public as $$
  insert into coletas (observacao) values (p_observacao) returning id;
$$;

-- Compara um lote de registros com o estado atual (tabela despesas) e grava no histórico o que é
-- novo ou mudou. CHAME ANTES de atualizar a tabela despesas com esse mesmo lote.
create or replace function registrar_lote(p_coleta bigint, p_registros jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  r jsonb;
begin
  with entrada as (
    select * from jsonb_to_recordset(p_registros) as x(
      id text, estado text, orgao text, tipo text, cnpj_fornecedor text, fornecedor text,
      valor numeric, data date, descricao text, fonte_url text, fonte_id text)
  ), cmp as (
    select e.*, d.id as ja_existe, d.valor as valor_atual,
           array_remove(array[
             case when d.valor is distinct from e.valor then 'valor' end,
             case when d.orgao is distinct from e.orgao then 'orgao' end,
             case when d.fornecedor is distinct from e.fornecedor then 'fornecedor' end,
             case when d.cnpj_fornecedor is distinct from e.cnpj_fornecedor then 'cnpj_fornecedor' end,
             case when d.descricao is distinct from e.descricao then 'descricao' end,
             case when d.data is distinct from e.data then 'data' end,
             case when d.tipo is distinct from e.tipo then 'tipo' end
           ], null) as campos,
           exists (select 1 from despesas_historico h where h.despesa_id = e.id) as tem_historico
      from entrada e left join despesas d on d.id = e.id
  ), ins as (
    insert into despesas_historico (despesa_id, coleta_id, evento, campos_alterados, valor_anterior,
                                    estado, orgao, tipo, cnpj_fornecedor, fornecedor, valor, data, descricao, fonte_url, fonte_id)
    select id, p_coleta,
           case when ja_existe is null then 'novo'
                when cardinality(campos) > 0 then 'alterado'
                else 'inicial' end,                    -- 'inicial' = já existia mas ainda não tinha histórico
           case when ja_existe is not null then campos else '{}'::text[] end,
           case when 'valor' = any (campos) then valor_atual end,
           estado, orgao, tipo, cnpj_fornecedor, fornecedor, valor, data, descricao, fonte_url, fonte_id
      from cmp
     where ja_existe is null or cardinality(campos) > 0 or not tem_historico
    returning evento
  )
  select jsonb_build_object(
           'lidos', (select count(*) from entrada),
           'novos', count(*) filter (where evento in ('novo', 'inicial')),
           'alterados', count(*) filter (where evento = 'alterado'))
    into r from ins;

  update coletas
     set lidos = lidos + (r ->> 'lidos')::int,
         novos = novos + (r ->> 'novos')::int,
         alterados = alterados + (r ->> 'alterados')::int,
         inalterados = inalterados + (r ->> 'lidos')::int - (r ->> 'novos')::int - (r ->> 'alterados')::int
   where id = p_coleta;
  return r;
end;
$$;

-- =====================================================================
-- Funções chamadas pelo n8n. O filtro por estado/tipo acontece AQUI, dentro
-- do banco, lendo a tabela perfis: a IA nunca recebe documento não autorizado.
-- Retornam UM objeto JSON (facilita o n8n).
-- =====================================================================
create or replace function obter_perfil(p_user_id uuid)
returns jsonb language sql security definer set search_path = public as $$
  select coalesce(
    (select jsonb_build_object('encontrado', true, 'user_id', user_id, 'perfil', perfil,
            'estados_permitidos', estados_permitidos, 'tipos_permitidos', tipos_permitidos)
       from perfis where user_id = p_user_id),
    jsonb_build_object('encontrado', false));
$$;

create or replace function buscar_documentos(p_user_id uuid, query_embedding vector(768), p_k int default 6)
returns jsonb language sql security definer set search_path = public as $$
  with p as (select * from perfis where user_id = p_user_id),
  r as (
    select d.id, d.content, d.metadata,
           1 - (d.embedding <=> query_embedding) as similaridade
      from documents d, p
     where d.embedding is not null
       and d.metadata->>'estado' = any (p.estados_permitidos)
       and d.metadata->>'tipo'   = any (p.tipos_permitidos)
     order by d.embedding <=> query_embedding
     limit least(p_k, 10)
  )
  select jsonb_build_object('docs', coalesce(jsonb_agg(to_jsonb(r)), '[]'::jsonb)) from r;
$$;

-- =====================================================================
-- Dashboards: UMA função devolve os dados de cada visão e DECIDE no banco
-- quem pode ver o quê (não adianta trocar a URL no navegador).
--   cidadao    -> qualquer perfil cadastrado (limitado a estados/tipos do perfil)
--   risco      -> analista e admin
--   governanca -> só admin (lê o query_log)
-- Sem permissão devolve {"erro": "..."} e nenhum dado.
-- =====================================================================
create or replace function painel(p_user_id uuid, p_visao text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  p perfis%rowtype;
  v_rank text[];   -- tipos usados nos rankings (evita contar empenho + pagamento da mesma despesa 2x)
  r jsonb;
begin
  select * into p from perfis where user_id = p_user_id;
  if not found then return jsonb_build_object('erro', 'sem_perfil'); end if;

  if p_visao not in ('cidadao', 'risco', 'governanca') then
    return jsonb_build_object('erro', 'visao_invalida');
  elsif p_visao = 'risco' and p.perfil not in ('analista', 'admin') then
    return jsonb_build_object('erro', 'acesso_negado');
  elsif p_visao = 'governanca' and p.perfil <> 'admin' then
    return jsonb_build_object('erro', 'acesso_negado');
  end if;

  v_rank := case when 'empenho' = any (p.tipos_permitidos)
                 then array_remove(p.tipos_permitidos, 'pagamento') else p.tipos_permitidos end;

  if p_visao = 'cidadao' then
    with d as (select * from despesas where estado = any (p.estados_permitidos) and tipo = any (p.tipos_permitidos))
    select jsonb_build_object(
      'visao', 'cidadao', 'perfil', p.perfil, 'estados', p.estados_permitidos, 'tipos', p.tipos_permitidos,
      'total_registros', (select count(*) from d),
      'orgaos', (select count(distinct orgao) from d),
      'fornecedores', (select count(distinct coalesce(cnpj_fornecedor, fornecedor)) from d),
      'ultima_data', (select max(data) from d),
      'por_tipo', (select coalesce(jsonb_agg(jsonb_build_object('tipo', tipo, 'qtd', q, 'valor', v) order by v desc), '[]')
                     from (select tipo, count(*) q, coalesce(sum(valor), 0) v from d group by tipo) t),
      'top_orgaos', (select coalesce(jsonb_agg(jsonb_build_object('estado', estado, 'orgao', orgao, 'valor', v) order by v desc), '[]')
                       from (select estado, orgao, sum(valor) v from d
                              where tipo = any (v_rank) and orgao is not null group by 1, 2 order by v desc limit 8) t),
      'top_fornecedores', (select coalesce(jsonb_agg(jsonb_build_object('fornecedor', fornecedor, 'valor', v) order by v desc), '[]')
                             from (select fornecedor, sum(valor) v from d
                                    where tipo = any (v_rank) and coalesce(fornecedor, '') <> '' group by 1 order by v desc limit 8) t),
      'por_mes', (select coalesce(jsonb_agg(jsonb_build_object('mes', mes) || vals order by mes), '[]')
                    from (select mes, jsonb_object_agg(tipo, v) vals
                            from (select to_char(data, 'YYYY-MM') mes, tipo, sum(valor) v
                                    from d where data >= date '2000-01-01' group by 1, 2) m
                           group by mes) x),
      'maiores', (select coalesce(jsonb_agg(to_jsonb(t) order by t.valor desc), '[]')
                    from (select id, data, tipo, estado, orgao, fornecedor, valor, fonte_url
                            from d order by valor desc nulls last limit 15) t)
    ) into r;
    return r;

  elsif p_visao = 'risco' then
    with d as (select * from despesas where estado = any (p.estados_permitidos) and tipo = any (p.tipos_permitidos)),
         n as (select * from d where coalesce(fornecedor, '') <> '')
    select jsonb_build_object(
      'visao', 'risco', 'perfil', p.perfil, 'estados', p.estados_permitidos,
      'fornecedores', (select count(distinct coalesce(cnpj_fornecedor, fornecedor)) from n),
      'contratos', (select count(*) from d where tipo = 'contrato'),
      'valor_contratado', (select coalesce(sum(valor), 0) from d where tipo = 'contrato'),
      'qtd_estados', (select count(distinct estado) from d),
      'concentracao_top5', (select round(100.0 * coalesce(sum(v), 0) / nullif((select sum(valor) from n where tipo = any (v_rank)), 0), 1)
                              from (select sum(valor) v from n where tipo = any (v_rank) group by fornecedor order by 1 desc limit 5) t),
      'por_fornecedor', (select coalesce(jsonb_agg(to_jsonb(t) order by t.contratado + t.pago desc), '[]')
                           from (select estado, fornecedor,
                                        count(*) filter (where tipo = 'contrato') contratos,
                                        coalesce(sum(valor) filter (where tipo = 'contrato'), 0) contratado,
                                        coalesce(sum(valor) filter (where tipo = 'pagamento'), 0) pago
                                   from n group by estado, fornecedor
                                  order by coalesce(sum(valor) filter (where tipo = 'contrato'), 0)
                                         + coalesce(sum(valor) filter (where tipo = 'pagamento'), 0) desc
                                  limit 15) t),
      'multi_orgao', (select coalesce(jsonb_agg(to_jsonb(t) order by t.orgaos desc, t.valor desc), '[]')
                        from (select fornecedor, count(distinct orgao) orgaos, sum(valor) valor
                                from n where tipo = any (v_rank) group by fornecedor
                               having count(distinct orgao) >= 2 order by 2 desc, 3 desc limit 8) t),
      'por_estado', (select coalesce(jsonb_agg(to_jsonb(t) order by t.valor desc), '[]')
                       from (select estado, count(*) qtd, coalesce(sum(valor), 0) valor
                               from d where tipo = any (v_rank) group by estado) t),
      'qtd_coletas', (select count(*) from coletas),
      'qtd_mudancas', (select count(*) from despesas_historico h
                        where h.evento = 'alterado' and h.estado = any (p.estados_permitidos) and h.tipo = any (p.tipos_permitidos)),
      'mudancas', (select coalesce(jsonb_agg(to_jsonb(t) order by t.registrado_em desc), '[]')
                     from (select h.registrado_em, h.coleta_id, h.estado, h.orgao, h.fornecedor, h.tipo,
                                  h.valor_anterior, h.valor, h.campos_alterados
                             from despesas_historico h
                            where h.evento = 'alterado' and h.estado = any (p.estados_permitidos) and h.tipo = any (p.tipos_permitidos)
                            order by h.registrado_em desc limit 10) t)
    ) into r;
    return r;

  else  -- governanca: auditoria das consultas (query_log)
    with q as (select * from query_log)
    select jsonb_build_object(
      'visao', 'governanca', 'perfil', p.perfil,
      'total', (select count(*) from q),
      'bloqueadas', (select count(*) from q where bloqueado),
      'com_fonte_pct', (select round(100.0 * count(*) filter (where jsonb_typeof(fontes) = 'array' and jsonb_array_length(fontes) > 0)
                                     / nullif(count(*), 0), 1) from q where not bloqueado),
      'por_perfil', (select coalesce(jsonb_agg(jsonb_build_object('perfil', perfil, 'qtd', c) order by c desc), '[]')
                       from (select coalesce(perfil, 'desconhecido') perfil, count(*) c from q group by 1) t),
      'motivos', (select coalesce(jsonb_agg(jsonb_build_object('motivo', motivo, 'qtd', c) order by c desc), '[]')
                    from (select coalesce(motivo, 'não informado') motivo, count(*) c from q where bloqueado group by 1) t),
      'fontes_usadas', (select coalesce(jsonb_agg(jsonb_build_object('fonte_id', fid, 'qtd', c) order by c desc), '[]')
                          from (select f ->> 'fonte_id' fid, count(*) c
                                  from q, jsonb_array_elements(case when jsonb_typeof(q.fontes) = 'array' then q.fontes else '[]'::jsonb end) f
                                 where f ->> 'fonte_id' is not null group by 1) t),
      'recentes', (select coalesce(jsonb_agg(to_jsonb(t) order by t.criado_em desc), '[]')
                     from (select criado_em, coalesce(perfil, 'desconhecido') perfil, left(pergunta, 90) pergunta, bloqueado, motivo
                             from q order by criado_em desc limit 12) t),
      'versoes_historico', (select count(*) from despesas_historico),
      'mudancas_total', (select count(*) from despesas_historico where evento = 'alterado'),
      'coletas', (select coalesce(jsonb_agg(to_jsonb(t) order by t.iniciada_em desc), '[]')
                    from (select id, iniciada_em, observacao, lidos, novos, alterados, inalterados
                            from coletas order by iniciada_em desc limit 8) t)
    ) into r;
    return r;
  end if;
end;
$$;

revoke all on function obter_perfil(uuid), buscar_documentos(uuid, vector, int), painel(uuid, text), iniciar_coleta(text), registrar_lote(bigint, jsonb) from public, anon, authenticated;
grant execute on function obter_perfil(uuid), buscar_documentos(uuid, vector, int), painel(uuid, text), iniciar_coleta(text), registrar_lote(bigint, jsonb) to service_role;
