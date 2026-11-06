"""Coletor do Portal da Transparência do Governo Federal (estado = "BR").
A API exige uma chave GRATUITA (veja o README.md, seção 5). Sem chave este módulo é ignorado.
Docs: https://api.portaldatransparencia.gov.br/swagger-ui/index.html
ATENÇÃO: os nomes dos campos abaixo seguem o swagger; confira com uma chave real.
"""
import os
import time
from urllib.parse import urlencode

from .util import data_iso, get_json, limpar, parse_valor, so_digitos

API = "https://api.portaldatransparencia.gov.br/api-de-dados"
PORTAL = "https://portaldatransparencia.gov.br"
# Códigos SIAFI de alguns órgãos (a API de contratos exige um órgão por consulta)
ORGAOS_PADRAO = ["26000", "36000", "25000"]  # MEC, Saúde, Fazenda

FONTES = [
    {"id": "federal-contratos", "nome": "Portal da Transparência (União) — Contratos", "estado": "BR",
     "url_portal": f"{PORTAL}/contratos", "tipo": "api"},
    {"id": "federal-portal", "nome": "Portal da Transparência do Governo Federal", "estado": "BR",
     "url_portal": f"{PORTAL}/", "tipo": "portal"},
]


def chave_disponivel():
    return bool(os.environ.get("PORTAL_TRANSPARENCIA_API_KEY"))


def coletar_contratos(ano, limite, orgaos=None):
    headers = {"chave-api-dados": os.environ["PORTAL_TRANSPARENCIA_API_KEY"]}
    saida = []
    for orgao in orgaos or ORGAOS_PADRAO:
        pagina = 1
        while len([s for s in saida if s["_orgao_cod"] == orgao]) < limite // len(orgaos or ORGAOS_PADRAO):
            q = urlencode({"dataInicial": f"01/01/{ano}", "dataFinal": f"31/12/{ano}",
                           "codigoOrgao": orgao, "pagina": pagina})
            itens = get_json(f"{API}/contratos?{q}", headers)
            if not itens:
                break
            for r in itens:
                forn = r.get("fornecedor") or {}
                ug = r.get("unidadeGestora") or {}
                org = (ug.get("orgaoVinculado") or {}).get("nome") or ug.get("nome") or ""
                cnpj = so_digitos(forn.get("cnpjFormatado") or forn.get("codigoFormatado"))
                saida.append({
                    "id": f"federal-contrato-{r.get('id')}",
                    "estado": "BR",
                    "orgao": limpar(org),
                    "tipo": "contrato",
                    "cnpj_fornecedor": cnpj if len(cnpj) == 14 else None,
                    "fornecedor": limpar(forn.get("nome") or forn.get("razaoSocialReceita")),
                    "valor": parse_valor(r.get("valorInicialCompra") or r.get("valorFinalCompra")),
                    "data": data_iso(r.get("dataInicioVigencia") or r.get("dataAssinatura")),
                    "descricao": limpar(r.get("objeto")),
                    "fonte_url": f"{PORTAL}/contratos/{r.get('id')}",
                    "fonte_id": "federal-contratos",
                    "_extra": f"Número do contrato: {limpar(r.get('numero'))}.",
                    "_ref": limpar(r.get("numero")) or str(r.get("id")),
                    "_orgao_cod": orgao,
                })
            pagina += 1
            time.sleep(0.7)  # limite da API: ~90 requisições/min
    for s in saida:
        s.pop("_orgao_cod")
    return saida
