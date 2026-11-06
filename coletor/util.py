"""Funções pequenas de apoio (só biblioteca padrão do Python)."""
import codecs
import json
import os
import re
import time
import urllib.error
import urllib.request

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
USER_AGENT = "hackaton-garanhuns-coletor/1.0 (projeto academico)"


def carregar_env():
    """Lê o arquivo .env da raiz (formato CHAVE=valor) para os.environ."""
    caminho = os.path.join(RAIZ, ".env")
    if not os.path.exists(caminho):
        return
    with open(caminho, encoding="utf-8") as f:
        for linha in f:
            linha = linha.strip()
            if not linha or linha.startswith("#") or "=" not in linha:
                continue
            chave, valor = linha.split("=", 1)
            os.environ.setdefault(chave.strip(), valor.strip().strip('"').strip("'"))


def so_digitos(texto):
    return re.sub(r"\D", "", texto or "")


def parse_valor(texto):
    try:
        return round(float(str(texto).strip()), 2)
    except (ValueError, TypeError):
        return 0.0


def brl(valor):
    s = f"{valor:,.2f}"
    return "R$ " + s.replace(",", "X").replace(".", ",").replace("X", ".")


def data_iso(texto):
    """Aceita '2025-01-01 00:00:00.0' ou '23/09/2010 a ...' e devolve AAAA-MM-DD."""
    texto = (texto or "").strip()
    m = re.match(r"(\d{4})-(\d{2})-(\d{2})", texto)
    if m:
        return f"{m.group(1)}-{m.group(2)}-{m.group(3)}"
    m = re.search(r"(\d{2})/(\d{2})/(\d{4})", texto)
    if m:
        return f"{m.group(3)}-{m.group(2)}-{m.group(1)}"
    return None


def data_br(iso):
    if not iso:
        return "data não informada"
    a, m, d = iso.split("-")
    return f"{d}/{m}/{a}"


def limpar(texto):
    return re.sub(r"\s+", " ", texto or "").strip()


def get_json(url, headers=None, tentativas=3):
    req_headers = {"User-Agent": USER_AGENT, "Accept": "application/json"}
    req_headers.update(headers or {})
    for i in range(tentativas):
        try:
            req = urllib.request.Request(url, headers=req_headers)
            with urllib.request.urlopen(req, timeout=60) as r:
                return json.loads(r.read().decode("utf-8", "replace"))
        except (urllib.error.URLError, TimeoutError) as e:
            if i == tentativas - 1:
                raise
            time.sleep(2 * (i + 1))


def stream_objetos(url, limite):
    """Baixa um JSON gigante em streaming e devolve só os primeiros `limite` itens
    da lista "conteudo", parando o download assim que tiver o suficiente.
    (As APIs do TCE-PE devolvem até 100 mil registros / 200 MB por chamada.)"""
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    decoder = json.JSONDecoder()
    buf, achou, n = "", False, 0
    with urllib.request.urlopen(req, timeout=120) as r:
        # O TCE-PE envia ISO-8859-1 (Latin-1). Ler como UTF-8 trocava cada acento por "�".
        charset = r.headers.get_content_charset() or "iso-8859-1"
        try:
            dec = codecs.getincrementaldecoder(charset)("replace")
        except LookupError:
            dec = codecs.getincrementaldecoder("iso-8859-1")("replace")
        while n < limite:
            pedaco = r.read(1 << 16)
            if not pedaco:
                break
            buf += dec.decode(pedaco)
            if not achou:
                i = buf.find('"conteudo":[')
                if i < 0:
                    continue
                buf, achou = buf[i + len('"conteudo":['):], True
            while n < limite:
                buf = buf.lstrip(" \r\n\t,")
                if not buf or buf[0] == "]":
                    break
                try:
                    obj, fim = decoder.raw_decode(buf)
                except json.JSONDecodeError:
                    break  # objeto incompleto: lê mais um pedaço
                buf = buf[fim:]
                n += 1
                yield obj
