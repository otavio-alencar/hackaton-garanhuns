"""Envia data/*.json para o Supabase e gera os embeddings (Gemini, camada gratuita).
Registra cada coleta no histórico (coletas / despesas_historico) antes de atualizar as despesas.

Uso:
    python -m coletor.carregar                  # carrega tudo (fontes, despesas, documents)
    python -m coletor.carregar --max-docs 1500  # limita quantos documentos recebem embedding
Precisa no .env: SUPABASE_URL, SUPABASE_SERVICE_KEY, GEMINI_API_KEY
"""
import argparse
import hashlib
import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

from .util import RAIZ, USER_AGENT, carregar_env

DIM = 768


def ler(nome):
    with open(os.path.join(RAIZ, "data", nome), encoding="utf-8") as f:
        return json.load(f)


def http_json(url, corpo, headers, tentativas=6):
    dados = json.dumps(corpo).encode("utf-8")
    for i in range(tentativas):
        req = urllib.request.Request(url, data=dados, method="POST",
                                     headers={"Content-Type": "application/json", "User-Agent": USER_AGENT, **headers})
        try:
            with urllib.request.urlopen(req, timeout=120) as r:
                txt = r.read().decode("utf-8")
                return json.loads(txt) if txt else None
        except urllib.error.HTTPError as e:
            msg = e.read().decode("utf-8", "replace")[:300]
            if e.code in (429, 503) and i < tentativas - 1:
                espera = 20 * (i + 1)
                print(f"  limite da API gratuita ({e.code}); aguardando {espera}s ...")
                time.sleep(espera)
                continue
            sys.exit(f"ERRO {e.code} em {url.split('?')[0]}: {msg}")


def upsert(tabela, linhas, lote=500):
    base = os.environ["SUPABASE_URL"].rstrip("/")
    chave = os.environ["SUPABASE_SERVICE_KEY"]
    headers = {"apikey": chave, "Authorization": f"Bearer {chave}",
               "Prefer": "resolution=merge-duplicates,return=minimal"}
    for i in range(0, len(linhas), lote):
        http_json(f"{base}/rest/v1/{tabela}?on_conflict=id", linhas[i:i + lote], headers)
        print(f"  {tabela}: {min(i + lote, len(linhas))}/{len(linhas)}")


def rpc(nome, corpo):
    """Chama uma função SQL do Supabase (POST /rest/v1/rpc/<nome>) e devolve o JSON."""
    base = os.environ["SUPABASE_URL"].rstrip("/")
    chave = os.environ["SUPABASE_SERVICE_KEY"]
    req = urllib.request.Request(
        f"{base}/rest/v1/rpc/{nome}", data=json.dumps(corpo).encode("utf-8"), method="POST",
        headers={"apikey": chave, "Authorization": f"Bearer {chave}", "Content-Type": "application/json", "User-Agent": USER_AGENT})
    try:
        with urllib.request.urlopen(req, timeout=120) as r:
            texto = r.read().decode("utf-8")
            return json.loads(texto) if texto else None
    except urllib.error.HTTPError as e:
        detalhe = e.read().decode("utf-8", "replace")[:300]
        if e.code == 404:
            sys.exit("A função '" + nome + "' não existe no Supabase. Rode de novo o supabase/schema.sql no SQL Editor (veja GUIA.md).")
        sys.exit(f"ERRO {e.code} em {nome}: {detalhe}")


def registrar_historico(despesas, observacao):
    """Guarda a coleta com data e grava no histórico só o que é NOVO ou MUDOU (valor, órgão, fornecedor…).
    Precisa rodar ANTES de atualizar a tabela despesas, porque compara com o estado atual dela."""
    coleta_id = rpc("iniciar_coleta", {"p_observacao": observacao})
    totais = {"lidos": 0, "novos": 0, "alterados": 0}
    for i in range(0, len(despesas), 500):
        r = rpc("registrar_lote", {"p_coleta": coleta_id, "p_registros": despesas[i:i + 500]})
        for k in totais:
            totais[k] += r[k]
    print(f"  coleta #{coleta_id}: {totais['lidos']} lidos, {totais['novos']} novos no histórico, {totais['alterados']} alterados")
    return totais


def remover_orfaos(tabela, ids_validos):
    """Apaga do banco os registros que não estão mais no arquivo carregado (ex.: textos antigos)."""
    base = os.environ["SUPABASE_URL"].rstrip("/")
    chave = os.environ["SUPABASE_SERVICE_KEY"]
    h = {"apikey": chave, "Authorization": f"Bearer {chave}"}
    existentes, ini = [], 0
    while True:  # lista os ids em páginas de 1000
        req = urllib.request.Request(f"{base}/rest/v1/{tabela}?select=id", headers={**h, "Range": f"{ini}-{ini + 999}"})
        with urllib.request.urlopen(req, timeout=60) as r:
            lote = json.loads(r.read().decode("utf-8"))
        existentes += [x["id"] for x in lote]
        if len(lote) < 1000:
            break
        ini += 1000
    orfaos = [i for i in existentes if i not in ids_validos]
    for i in range(0, len(orfaos), 40):
        lista = ",".join('"' + x.replace('"', "") + '"' for x in orfaos[i:i + 40])
        req = urllib.request.Request(f"{base}/rest/v1/{tabela}?id=in.({urllib.parse.quote(lista)})", method="DELETE", headers=h)
        urllib.request.urlopen(req, timeout=60).read()
    print(f"  {tabela}: {len(orfaos)} registro(s) antigo(s) removido(s)")


def ids_com_embedding():
    base = os.environ["SUPABASE_URL"].rstrip("/")
    chave = os.environ["SUPABASE_SERVICE_KEY"]
    h = {"apikey": chave, "Authorization": f"Bearer {chave}"}
    ids, ini = set(), 0
    while True:
        req = urllib.request.Request(f"{base}/rest/v1/documents?select=id&embedding=not.is.null", headers={**h, "Range": f"{ini}-{ini + 999}"})
        with urllib.request.urlopen(req, timeout=60) as r:
            lote = json.loads(r.read().decode("utf-8"))
        ids |= {x["id"] for x in lote}
        if len(lote) < 1000:
            return ids
        ini += 1000


def atualizar_textos():
    """Atualiza só `content` e `metadata` dos documentos que já existem, SEM gerar embeddings
    (não gasta a cota diária gratuita do Gemini). Útil quando só o texto mudou, ex.: correção de acentos."""
    base = os.environ["SUPABASE_URL"].rstrip("/")
    chave = os.environ["SUPABASE_SERVICE_KEY"]
    h = {"apikey": chave, "Authorization": f"Bearer {chave}"}
    novos = {d["id"]: d for d in ler("documents.json")}
    existentes, ini = [], 0
    while True:
        req = urllib.request.Request(f"{base}/rest/v1/documents?select=id", headers={**h, "Range": f"{ini}-{ini + 999}"})
        with urllib.request.urlopen(req, timeout=60) as r:
            lote = json.loads(r.read().decode("utf-8"))
        existentes += [x["id"] for x in lote]
        if len(lote) < 1000:
            break
        ini += 1000
    manter = [{"id": i, "content": novos[i]["content"], "metadata": novos[i]["metadata"]} for i in existentes if i in novos]
    upsert("documents", manter, lote=100)  # sem a coluna embedding: o vetor existente é preservado
    remover_orfaos("documents", set(novos))
    print(f"{len(manter)} documento(s) com texto atualizado, embeddings preservados.")


def embeddings(textos):
    modelo = os.environ.get("GEMINI_EMBED_MODEL", "gemini-embedding-001")
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{modelo}:batchEmbedContents"
    corpo = {"requests": [{
        "model": f"models/{modelo}",
        "content": {"parts": [{"text": t[:6000]}]},
        "taskType": "RETRIEVAL_DOCUMENT",
        "outputDimensionality": DIM,
    } for t in textos]}
    res = http_json(url, corpo, {"x-goog-api-key": os.environ["GEMINI_API_KEY"]})
    return [e["values"] for e in res["embeddings"]]


def main():
    carregar_env()
    ap = argparse.ArgumentParser()
    ap.add_argument("--max-docs", type=int, default=2000)
    ap.add_argument("--lote-embedding", type=int, default=50)
    ap.add_argument("--so-texto", action="store_true", help="atualiza só o texto dos documentos já existentes (sem embeddings)")
    args = ap.parse_args()
    faltam = [v for v in ("SUPABASE_URL", "SUPABASE_SERVICE_KEY", "GEMINI_API_KEY") if not os.environ.get(v)]
    if faltam:
        sys.exit(f"Faltam no .env: {', '.join(faltam)} (veja GUIA.md)")

    if args.so_texto:
        return atualizar_textos()

    print("1/3 fontes");  upsert("fontes", ler("fontes.json"))
    print("2/3 despesas")
    despesas = ler("despesas.json")
    registrar_historico(despesas, f"{len(despesas)} registros de data/despesas.json")  # ANTES do upsert
    upsert("despesas", despesas)
    # Não se apagam despesas que sumiram da amostra: o histórico é acumulativo

    print("3/3 documents + embeddings")
    docs = ler("documents.json")
    # mistura tipos para o RAG cobrir empenho, pagamento e contrato (e todas as fontes)
    docs.sort(key=lambda d: hashlib.md5(d["id"].encode()).hexdigest())  # ordem estável
    docs = docs[:args.max_docs]
    # A cota gratuita de embeddings é de ~1000 por dia: não refaz quem já tem vetor no banco
    ja = ids_com_embedding()
    novos = [d for d in docs if d["id"] not in ja]
    if ja:
        atualizar_existentes = [{"id": d["id"], "content": d["content"], "metadata": d["metadata"]} for d in docs if d["id"] in ja]
        upsert("documents", atualizar_existentes, lote=100)  # só texto: o vetor existente é preservado
    print(f"  {len(ja & {d['id'] for d in docs})} já tinham embedding; gerando {len(novos)} novo(s)")
    for i in range(0, len(novos), args.lote_embedding):
        parte = novos[i:i + args.lote_embedding]
        for d, v in zip(parte, embeddings([d["content"] for d in parte])):
            d["embedding"] = "[" + ",".join(f"{x:.6f}" for x in v) + "]"
        upsert("documents", parte, lote=args.lote_embedding)
        time.sleep(1.5)
    # só remove o que não existe mais nos dados coletados (não o que ficou fora do limite --max-docs)
    remover_orfaos("documents", {d["id"] for d in ler("documents.json")})
    print("Pronto!")


if __name__ == "__main__":
    main()
