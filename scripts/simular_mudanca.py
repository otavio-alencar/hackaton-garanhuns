"""SOMENTE PARA TESTAR O HISTÓRICO DE COLETAS.

Altera o arquivo LOCAL data/despesas.json (não mexe no banco) aumentando em 50% o valor de 3 registros.
Ao rodar `python -m coletor.carregar --max-docs 0` em seguida, o carregador compara o arquivo com o que já está no
Supabase e registra essas 3 mudanças no histórico, com o valor anterior.

Uso (na raiz do projeto):
    python scripts/simular_mudanca.py
Para voltar aos dados reais depois:
    python -m coletor.main --ano 2025 --limite 1500
"""
import json
import os

raiz = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
caminho = os.path.join(raiz, "data", "despesas.json")

if not os.path.exists(caminho):
    raise SystemExit("data/despesas.json não existe. Rode antes: python -m coletor.main")

with open(caminho, encoding="utf-8") as f:
    dados = json.load(f)

alvos = [d for d in dados if (d.get("valor") or 0) > 0][:3]
for d in alvos:
    antes = d["valor"]
    d["valor"] = round(antes * 1.5, 2)
    print(f"{d['id']}: R$ {antes:,.2f} -> R$ {d['valor']:,.2f}")

with open(caminho, "w", encoding="utf-8") as f:
    json.dump(dados, f, ensure_ascii=False, indent=1)
print("\nPronto. Agora rode: python -m coletor.carregar --max-docs 0")
