"""Coleta os portais, normaliza e grava arquivos em data/ e o resumo do dashboard.

Uso (na raiz do projeto):
    python -m coletor.main                       # TCE-PE, ano atual - 1, 2000 registros de cada tipo
    python -m coletor.main --ano 2025 --limite 5000
    python -m coletor.main --federal             # inclui União (precisa PORTAL_TRANSPARENCIA_API_KEY)
"""
import argparse
import collections
import datetime
import json
import os
import sys

from . import federal, tcepe
from .util import RAIZ, carregar_env

DATA = os.path.join(RAIZ, "data")
SITE_DATA = os.path.join(RAIZ, "site", "data")
CAMPOS_DESPESA = ["id", "estado", "orgao", "tipo", "cnpj_fornecedor", "fornecedor",
                  "valor", "data", "descricao", "fonte_url", "fonte_id"]


def salvar(caminho, obj):
    os.makedirs(os.path.dirname(caminho), exist_ok=True)
    with open(caminho, "w", encoding="utf-8") as f:
        json.dump(obj, f, ensure_ascii=False, indent=1)
    print(f"  gravado {os.path.relpath(caminho, RAIZ)}")


def montar_documento(d):
    """Formato da tabela documents. O embedding é preenchido depois (carregar.py)."""
    return {
        "id": d["id"],
        "content": tcepe.texto_documento(d),
        "embedding": None,
        "metadata": {
            "estado": d["estado"], "orgao": d["orgao"], "tipo": d["tipo"],
            "fonte_url": d["fonte_url"], "data": d["data"],
            "cnpj": d["cnpj_fornecedor"], "fonte_id": d["fonte_id"],
        },
    }


def resumo_dashboard(despesas, fontes):
    por_tipo = collections.defaultdict(lambda: {"qtd": 0, "valor": 0.0})
    por_orgao = collections.defaultdict(float)
    por_forn = collections.defaultdict(float)
    por_mes = collections.defaultdict(lambda: collections.defaultdict(float))
    for d in despesas:
        t = por_tipo[d["tipo"]]
        t["qtd"] += 1
        t["valor"] += d["valor"]
        # barras de "top" usam só empenho+contrato para não contar o mesmo gasto 2x
        if d["tipo"] != "pagamento":
            por_orgao[(d["estado"], d["orgao"])] += d["valor"]
            if d["fornecedor"]:
                por_forn[d["fornecedor"]] += d["valor"]
        if d["data"]:
            por_mes[d["data"][:7]][d["tipo"]] += d["valor"]

    def top(dic, n=10):
        return sorted(dic.items(), key=lambda kv: -kv[1])[:n]

    maiores = sorted(despesas, key=lambda d: -d["valor"])[:25]
    return {
        "gerado_em": datetime.datetime.now().isoformat(timespec="seconds"),
        "total_registros": len(despesas),
        "estados": sorted({d["estado"] for d in despesas}),
        "por_tipo": {k: {"qtd": v["qtd"], "valor": round(v["valor"], 2)} for k, v in por_tipo.items()},
        "top_orgaos": [{"estado": k[0], "orgao": k[1], "valor": round(v, 2)} for k, v in top(por_orgao)],
        "top_fornecedores": [{"fornecedor": k, "valor": round(v, 2)} for k, v in top(por_forn)],
        "por_mes": [{"mes": m, **{t: round(v, 2) for t, v in tipos.items()}} for m, tipos in sorted(por_mes.items())],
        "maiores": [{k: d[k] for k in CAMPOS_DESPESA if k not in ("descricao",)} | {"descricao": d["descricao"][:200]}
                    for d in maiores],
        "fontes": fontes,
    }


def main():
    carregar_env()
    ap = argparse.ArgumentParser()
    ap.add_argument("--ano", type=int, default=datetime.date.today().year - 1)
    ap.add_argument("--limite", type=int, default=2000, help="máx. de registros por endpoint")
    ap.add_argument("--federal", action="store_true", help="inclui o Portal da Transparência federal")
    args = ap.parse_args()

    despesas, fontes = [], list(tcepe.FONTES)
    print(f"TCE-PE: despesas estaduais {args.ano} ...")
    despesas += tcepe.coletar_despesas(args.ano, args.limite)
    print(f"TCE-PE: contratos estaduais {args.ano} ...")
    despesas += tcepe.coletar_contratos(args.ano, args.limite)

    if args.federal:
        if federal.chave_disponivel():
            print("Portal da Transparência (União): contratos ...")
            despesas += federal.coletar_contratos(args.ano, args.limite)
            fontes += federal.FONTES
        else:
            print("AVISO: --federal ignorado, falta PORTAL_TRANSPARENCIA_API_KEY no .env", file=sys.stderr)

    unicos = {d["id"]: d for d in despesas}  # remove duplicados
    despesas = list(unicos.values())
    print(f"{len(despesas)} registros normalizados")

    salvar(os.path.join(DATA, "fontes.json"), fontes)
    salvar(os.path.join(DATA, "despesas.json"), [{k: d[k] for k in CAMPOS_DESPESA} for d in despesas])
    salvar(os.path.join(DATA, "documents.json"), [montar_documento(d) for d in despesas])
    salvar(os.path.join(SITE_DATA, "dashboard.json"), resumo_dashboard(despesas, fontes))


if __name__ == "__main__":
    main()
