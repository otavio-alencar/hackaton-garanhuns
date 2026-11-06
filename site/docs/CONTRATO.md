# Contrato front ↔ backend (implementado)

Este documento descreve o que o front **realmente** chama hoje. Substitui o rascunho
`CONTRATO-PROPOSTO.md` da demo inicial. A camada que fala com o backend é só `js/api.js`.

Base: `PP.config.API_BASE` (padrão `http://localhost:5678/webhook`, o n8n).

## 1. Chat — `POST /transparencia`

Entrada:

```json
{ "user_id": "uuid-do-perfil", "session_id": "uuid-da-conversa", "pergunta": "Quais os maiores contratos?" }
```

- `user_id`: UUID de uma linha da tabela `perfis`. Visitante (sem login) usa o UUID `…0000`, um perfil restrito.
- O front **não** envia estado, tipo nem perfil como autoridade: o backend lê `perfis` pelo `user_id`.
- `session_id`: id da conversa (hoje o n8n apenas ignora).
- `pergunta`: até 500 caracteres.
- `historico` (opcional): memória da conversa, `[{ "role": "user" | "assistant", "text": "…" }]`, as últimas 8 mensagens
  sem a pergunta atual. O backend **não guarda conversas**: o front reenvia o contexto a cada pergunta. O n8n limita a
  8 itens de 600 caracteres, remove `<` e `>` e descarta mensagens do usuário que pareçam ataque de prompt. O histórico é
  tratado como dado, nunca como instrução.

Saída (HTTP 200):

```json
{
  "resposta": "Texto com citações [1] [2]\n\nFontes:\n[1] …",
  "fontes": [
    { "n": 1, "titulo": "Órgão — contrato (PE)", "url": "https://…", "trecho": "Trecho que sustenta a resposta…",
      "fonte_id": "tcepe-contratos", "orgao": "…", "tipo": "contrato", "estado": "PE", "data": "2025-03-17", "cnpj": "…" }
  ],
  "bloqueado": false,
  "motivo": null
}
```

- O front remove o bloco `Fontes:` do texto e usa `fontes[]` estruturado (`titulo`, `url`, `trecho`).
- `fontes` só traz o que a resposta **citou** (`[n]` no texto). Conversa comum ("o que você faz?", "meu nome é…") volta com `fontes: []`.
- Consulta bloqueada (prompt injection, estado/tipo fora do perfil): HTTP 200 com `"bloqueado": true`,
  `motivo` e `resposta` explicando. HTTP `403` com `{ "erro", "mensagem" }` também é tratado como bloqueio.
- Erros de rede/servidor viram uma mensagem no chat com botão "Tentar novamente".

## 2. Painel dos dashboards — `POST /painel`

Entrada: `{ "user_id": "uuid", "visao": "cidadao" | "risco" | "governanca" }`

| Visão | Quem pode | Conteúdo |
|---|---|---|
| `cidadao` | qualquer perfil cadastrado (limitado a estados/tipos do perfil) | totais por tipo, órgãos, fornecedores, evolução mensal, maiores registros |
| `risco` | `analista`, `admin` | concentração de fornecedores, resumo por estado/fornecedor, fornecedores em vários órgãos, **mudanças detectadas entre coletas** |
| `governanca` | `admin` | consultas, bloqueios, fontes usadas, atividade recente (lê `query_log`), **histórico de coletas** |

Respostas: `200` com os dados · `403 { "erro": "acesso_negado" }` · `401 { "erro": "sem_perfil" }` · `400 { "erro": "pedido_invalido" }`.

A decisão é tomada na função SQL `painel(p_user_id, p_visao)` (Supabase), **não** no navegador.
As guardas do front (`session.js`) são só experiência de uso.

## 3. Sessão (simulada)

`js/session.js` guarda a identidade em `sessionStorage` (`pp_session`). Estados: `anonymous`, `authenticated`, `expired`.
Para trocar por Supabase Auth: substitua o objeto `provider` e envie o JWT ao n8n (que extrairia o `user_id`).
**Limitação atual:** como o login é simulado, quem souber o UUID de um perfil consegue chamar o webhook como ele.
