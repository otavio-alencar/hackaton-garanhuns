"""Coleta os portais, normaliza e grava arquivos em data/ (fontes, despesas, documents).
Os dashboards leem direto do Supabase (função painel()), não de arquivos.

Uso (na raiz do projeto):
    python -m coletor.main                       # TCE-PE, ano atual - 1, 2000 registros de cada tipo
    python -m coletor.main --ano 2025 --limite 5000
    python -m coletor.main --federal             # inclui União (precisa PORTAL_TRANSPARENCIA_API_KEY)
"""
import argparse
import datetime
import json
import os
import sys

from . import federal, tcepe
from .util import RAIZ, carregar_env

DATA = os.path.join(RAIZ, "data")
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


if __name__ == "__main__":
    main()
