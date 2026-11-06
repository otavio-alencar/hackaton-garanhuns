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

revoke all on function obter_perfil(uuid), buscar_documentos(uuid, vector, int) from public, anon, authenticated;
grant execute on function obter_perfil(uuid), buscar_documentos(uuid, vector, int) to service_role;
