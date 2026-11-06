"""Coletor do TCE-PE (Pernambuco) — API pública "Dados Abertos", sem chave.
Documentação: https://sistemas.tce.pe.gov.br/DadosAbertos/
Portal: https://tcepe.tc.br/internet/
"""
from urllib.parse import urlencode

from .util import brl, data_br, data_iso, limpar, parse_valor, so_digitos, stream_objetos

BASE = "https://sistemas.tce.pe.gov.br/DadosAbertos"
ESTADO = "PE"

FONTES = [
    {"id": "tcepe-despesas", "nome": "TCE-PE Dados Abertos — Despesas Estaduais", "estado": "PE",
     "url_portal": f"{BASE}/DespesasEstaduais!json", "tipo": "api"},
    {"id": "tcepe-contratos", "nome": "TCE-PE Dados Abertos — Contratos", "estado": "PE",
     "url_portal": f"{BASE}/Contratos!json", "tipo": "api"},
    {"id": "tcepe-portal", "nome": "Portal do TCE-PE", "estado": "PE",
     "url_portal": "https://tcepe.tc.br/internet/", "tipo": "portal"},
]


def _url(entidade, **params):
    q = urlencode(params)
    return f"{BASE}/{entidade}!json" + (f"?{q}" if q else "")


def _cnpj(cpf_cnpj):
    """Só guarda CNPJ (14 dígitos). CPF de pessoa física NÃO é guardado (LGPD)."""
    d = so_digitos(cpf_cnpj)
    return d if len(d) == 14 else None


def coletar_despesas(ano, limite):
    """Devolve registros normalizados: um 'empenho' e, se houver, um 'pagamento'."""
    url = _url("DespesasEstaduais", ANOREFERENCIA=ano)
    saida = []
    for r in stream_objetos(url, limite):
        num = limpar(r.get("NUMEROEMPENHO"))
        ug = limpar(r.get("ID_UNIDADE_GESTORA"))
        if not num:
            continue
        link = _url("DespesasEstaduais", ANOREFERENCIA=r.get("ANOREFERENCIA", ano),
                    NUMEROEMPENHO=num, ID_UNIDADE_GESTORA=ug)
        base = {
            "estado": ESTADO,
            "orgao": limpar(r.get("UNIDADEORCAMENTARIA")) or limpar(r.get("NOMEUNIDADEGESTORA")),
            "cnpj_fornecedor": _cnpj(r.get("CPF_CNPJ")),
            "fornecedor": limpar(r.get("NOME_FORNECEDOR")),
            "data": data_iso(r.get("DATAEMPENHO")),
            "descricao": limpar(r.get("HISTORICO")),
            "fonte_url": link,
            "fonte_id": "tcepe-despesas",
            "_extra": f"Função: {limpar(r.get('FUNCAO'))}. Elemento de despesa: {limpar(r.get('ELEMENTODESPESA'))}.",
            "_ref": f"{num}",
        }
        chave = f"tcepe-{r.get('ANOREFERENCIA', ano)}-{ug}-{num}"
        saida.append({**base, "id": f"{chave}-emp", "tipo": "empenho",
                      "valor": parse_valor(r.get("VALOREMPENHADO"))})
        pago = parse_valor(r.get("VALORPAGO"))
        if pago > 0:
            saida.append({**base, "id": f"{chave}-pag", "tipo": "pagamento", "valor": pago})
    return saida


def coletar_contratos(ano, limite):
    url = _url("Contratos", Esfera="E", AnoContrato=ano)
    saida = []
    for r in stream_objetos(url, limite):
        cod = limpar(r.get("CodigoContrato"))
        if not cod:
            continue
        cnpj = _cnpj(r.get("CPF_CNPJ")) if limpar(r.get("TipoDocumento")).upper() == "CNPJ" else None
        arquivo = limpar(r.get("LinkArquivo"))
        saida.append({
            "id": f"tcepe-contrato-{cod}",
            "estado": ESTADO,
            "orgao": limpar(r.get("UnidadeOrcamentaria")) or limpar(r.get("UnidadeGestora")),
            "tipo": "contrato",
            "cnpj_fornecedor": cnpj,
            "fornecedor": limpar(r.get("RazaoSocial")),
            "valor": parse_valor(r.get("Valor")),
            "data": data_iso(r.get("Vigencia")) or (f"{r['AnoContrato']}-01-01" if r.get("AnoContrato") else None),
            "descricao": limpar(r.get("Objeto")),
            "fonte_url": arquivo or _url("Contratos", CodigoContrato=cod),
            "fonte_id": "tcepe-contratos",
            "_extra": f"Modalidade: {limpar(r.get('TipoProcesso'))}. Situação: {limpar(r.get('Situacao'))}. "
                      f"Vigência: {limpar(r.get('Vigencia'))}.",
            "_ref": f"{limpar(r.get('NumeroContrato'))}/{limpar(r.get('AnoContrato'))}",
        })
    return saida


VERBO = {"empenho": "empenhou", "pagamento": "pagou", "contrato": "contratou"}


def texto_documento(d):
    """Frase em português simples que será indexada para o RAG."""
    forn = d["fornecedor"] or "fornecedor não informado"
    if d["cnpj_fornecedor"]:
        forn += f" (CNPJ {d['cnpj_fornecedor']})"
    return (f"{d['tipo'].capitalize()} {d['_ref']} em {d['estado']}: o órgão {d['orgao']} "
            f"{VERBO[d['tipo']]} {brl(d['valor'])} com {forn} em {data_br(d['data'])}. "
            f"Descrição: {d['descricao']}. {d['_extra']}")
