"""Envia data/*.json para o Supabase e gera os embeddings (Gemini, camada gratuita).

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
    args = ap.parse_args()
    faltam = [v for v in ("SUPABASE_URL", "SUPABASE_SERVICE_KEY", "GEMINI_API_KEY") if not os.environ.get(v)]
    if faltam:
        sys.exit(f"Faltam no .env: {', '.join(faltam)} (veja GUIA.md)")

    print("1/3 fontes");  upsert("fontes", ler("fontes.json"))
    print("2/3 despesas"); upsert("despesas", ler("despesas.json"))

    print("3/3 documents + embeddings")
    docs = ler("documents.json")
    # mistura tipos para o RAG cobrir empenho, pagamento e contrato (e todas as fontes)
    docs.sort(key=lambda d: hashlib.md5(d["id"].encode()).hexdigest())  # ordem estável
    docs = docs[:args.max_docs]
    for i in range(0, len(docs), args.lote_embedding):
        parte = docs[i:i + args.lote_embedding]
        for d, v in zip(parte, embeddings([d["content"] for d in parte])):
            d["embedding"] = "[" + ",".join(f"{x:.6f}" for x in v) + "]"
        upsert("documents", parte, lote=args.lote_embedding)
        time.sleep(1.5)
    print("Pronto!")


if __name__ == "__main__":
    main()
