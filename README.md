# Portal Inteligente de Transparência com IA

Hackathon Garanhuns — captura dados de portais de transparência (TCE-PE e Portal da Transparência federal), estrutura em um banco (Supabase), e permite perguntar em linguagem natural a um agente de IA (n8n + Gemini grátis) com **RAG com citação de fonte, controle de acesso por estado/perfil/tipo, multi-tenant e proteção contra prompt injection**.

```
Portais ──► coletor/ (Python) ──► data/*.json ──► Supabase (tabelas + pgvector)
                                        │                       ▲
                                        ▼                       │ busca filtrada pelo perfil
                              site/ (dashboard) ◄── n8n (webhook) ──► Gemini
                                        └── chatbot ───────────────┘   └─► query_log
```

**Para rodar: leia o [GUIA.md](GUIA.md).**

- `coletor/` — `python -m coletor.main` (coleta) e `python -m coletor.carregar` (Supabase + embeddings)
- `supabase/` — `schema.sql`, `seed.sql`
- `workflows/` — agente do n8n
- `site/` — dashboard e chatbot
