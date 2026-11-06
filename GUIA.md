# Guia: o que VOCÊ precisa fazer (passo a passo)

O que já está pronto no repositório:

| Pasta / arquivo | O que é |
|---|---|
| `coletor/` | Código Python (sem dependências) que consulta o TCE-PE e o Portal da Transparência e gera `data/*.json` |
| `supabase/schema.sql`, `seed.sql` | Tabelas (fontes, despesas, documents, perfis, query_log) + funções seguras de busca |
| `coletor/carregar.py` | Envia os dados ao Supabase e cria os embeddings (grátis, via Gemini) |
| `workflows/agente-transparencia.json` | Agente do n8n (importar e ativar) |
| `site/` | Dashboard + chatbot (HTML/JS puro) |

Tudo é gratuito: Supabase Free, n8n (Docker local), Google AI Studio (Gemini free tier), Python.
Pré-requisitos instalados: **Python 3.10+** e **Docker Desktop**.

---

## 0. Testar o coletor (nenhuma conta necessária)

```bash
python -m coletor.main --ano 2025 --limite 1500
```

Gera `data/fontes.json`, `data/despesas.json`, `data/documents.json` e `site/data/dashboard.json`.
Para ver o dashboard já funcionando (sem Supabase nem n8n):

```bash
cd site
python -m http.server 8080
```

Abra http://localhost:8080. (Precisa ser por servidor; abrir o arquivo direto não carrega o JSON.)

> Os dados do TCE-PE são lidos do início de cada lista (a API devolve até 100 mil linhas por chamada).
> Aumente com `--limite`. Alguns acentos chegam corrompidos (�) da própria API do TCE-PE.

## 1. Criar o `.env`

```bash
cp .env.example .env
```

Abra o `.env` no editor e vá preenchendo conforme os passos abaixo. **Nunca** envie esse arquivo ao GitHub (já está no `.gitignore`).
Para `N8N_ENCRYPTION_KEY` invente qualquer texto longo e aleatório (ex.: 32 letras e números).

## 2. (Opcional) Chave do Portal da Transparência federal

1. Acesse https://portaldatransparencia.gov.br/api-de-dados/cadastrar-email
2. Informe seu e-mail → você recebe a chave por e-mail.
3. Coloque em `PORTAL_TRANSPARENCIA_API_KEY=` no `.env`.
4. Rode `python -m coletor.main --ano 2025 --federal`.

> Este trecho **não pôde ser testado** (exige a chave). Se a API retornar campos com nomes diferentes,
> ajuste `coletor/federal.py` (os campos estão em um só lugar). Sem a chave, o resto funciona normalmente com PE.

## 3. Supabase (banco de dados)

1. Crie conta em https://supabase.com (login com GitHub) → **New project**.
   Nome: `transparencia`; defina a senha do banco (guarde); região: **South America (São Paulo)**; plano **Free**.
2. Espere ~2 min o projeto subir.
3. Menu esquerdo → **SQL Editor** → **New query**.
   - Cole o conteúdo de `supabase/schema.sql` → **Run**. Deve aparecer "Success".
   - Nova query: cole `supabase/seed.sql` → **Run** (cria 3 perfis de demonstração).
4. Menu **Project Settings → API** (ou *Data API*). Copie:
   - **Project URL** → `SUPABASE_URL` no `.env`
   - **service_role** key (clique em *Reveal*) → `SUPABASE_SERVICE_KEY` no `.env`
   - ⚠️ A `service_role` ignora todas as proteções. Nunca coloque no site, no GitHub ou em print.
5. Confira em **Table Editor** que as 5 tabelas existem (fontes, despesas, documents, perfis, query_log).

## 4. Chave grátis do Gemini (LLM + embeddings)

1. Acesse https://aistudio.google.com/apikey → entre com sua conta Google → **Create API key**.
2. Copie para `GEMINI_API_KEY` no `.env`.
3. O plano gratuito tem limite de requisições por minuto; o carregador espera e tenta de novo sozinho.
   (Se `gemini-2.5-flash` for descontinuado, troque `GEMINI_CHAT_MODEL` no `.env` por outro modelo flash disponível no AI Studio.)

## 5. Carregar os dados no Supabase

```bash
python -m coletor.carregar --max-docs 1500
```

Envia fontes, despesas e documentos (com embeddings). 1500 documentos levam alguns minutos no plano grátis.
Depois confira no **Table Editor** → `documents`: a coluna `embedding` deve estar preenchida.
Pode rodar de novo quando quiser (atualiza sem duplicar).

## 6. n8n (o agente de IA)

1. Suba o n8n:
   ```bash
   docker compose up -d
   ```
2. Abra http://localhost:5678 e crie a conta de dono (local, só sua).
3. Importe o workflow, de uma destas formas:
   - Pelo terminal: `sh scripts/import.sh` (Git Bash) ou
   - Pela tela: menu **⋯ → Import from file…** → `workflows/agente-transparencia.json`.
4. Abra o workflow **Portal Transparência — Agente RAG** e clique **Publish / Active** (interruptor no topo).
   Enquanto estiver só em teste, a URL é `/webhook-test/...`; ativo, é `/webhook/...`.
5. Se o `.env` mudou depois do primeiro `up`, rode `docker compose up -d --force-recreate`.
6. Teste rápido no terminal:
   ```bash
   curl -X POST http://localhost:5678/webhook/transparencia -H "Content-Type: application/json" \
     -d '{"user_id":"00000000-0000-0000-0000-000000000002","pergunta":"Quais os maiores contratos?"}'
   ```
   Deve voltar `resposta`, `fontes`, `bloqueado`.

> O workflow não foi executado em um n8n real por mim (sem as suas chaves). A lógica de bloqueio foi testada isoladamente;
> se algum nó acusar erro ao importar (versões do n8n mudam campos), abra o nó indicado e me envie a mensagem.

### Como o agente funciona (5 passos, cada um é um bloco com nota no n8n)

1. **Entrada + segurança**: barra prompt injection ("ignore as instruções", "mostre o prompt", chaves, SQL…).
2. **Controle de acesso**: busca o perfil no Supabase; bloqueia se a pergunta citar estado ou tipo fora do perfil.
3. **RAG**: pergunta → vetor (Gemini) → busca no Supabase **já filtrada por estado e tipo do perfil** (feito dentro do banco).
4. **Resposta**: Gemini responde só com o contexto e cita `[1] [2]`; o código monta a lista de fontes reais.
5. **Auditoria**: grava tudo em `query_log` (inclusive bloqueios) e devolve ao site.

## 7. Site

1. Em `site/config.js` confira `CHAT_URL` (padrão: `http://localhost:5678/webhook/transparencia`).
2. `cd site && python -m http.server 8080` → http://localhost:8080 → botão **💬 Pergunte aos dados**.
3. Teste os três perfis e as sugestões (a última é um ataque de prompt e deve ser **bloqueada**).
4. Veja os registros no Supabase → `query_log`.

### Publicar (gratuito) — opcional
- Site: **Cloudflare Pages**, **Netlify** ou **GitHub Pages** (pasta `site/`).
- n8n precisa de URL pública: `cloudflared tunnel --url http://localhost:5678` (grátis) e troque `CHAT_URL` pela URL gerada
  + `/webhook/transparencia`. Rode isso só durante a apresentação.

## 8. Limitações conhecidas (diga isso na apresentação!)

- **Login de demonstração**: o site deixa escolher o perfil (UUIDs fixos). Em produção use **Supabase Auth**: o site enviaria
  o token JWT e o n8n extrairia o `user_id` dele, em vez de aceitar um UUID digitado.
- **Multi-tenant**: o isolamento por estado/tipo está na função SQL `buscar_documentos` + tabela `perfis` (e RLS ligado sem políticas).
  Para novos estados, basta coletar com outro `estado` e conceder em `perfis.estados_permitidos`.
- **Prompt injection**: lista de padrões (primeira barreira) + instruções fixas + dados delimitados + fontes montadas pelo código.
  Não existe proteção 100%; ela reduz o risco, não o elimina.
- Os valores do dashboard vêm de uma **amostra** (início da lista da API), não do total do estado.
- Empenho e pagamento da mesma despesa aparecem como dois registros; por isso o dashboard não soma tipos entre si.
- CPFs de pessoas físicas **não são guardados** (só CNPJ), por causa da LGPD.

## 9. Ideias para impressionar a banca

- Mais um estado (outro TCE com API aberta) → provar o multi-tenant.
- Tela admin lendo `query_log` (consultas bloqueadas e motivos).
- Um perfil "cidadão do estado X" que não enxerga nenhum dado de Y.
