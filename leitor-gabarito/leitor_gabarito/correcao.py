"""Comparacao com o gabarito oficial.

O gabarito aceita uma ou mais alternativas certas por questao, entao cobre
tanto prova comum quanto questao com duas respostas corretas.
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass
from pathlib import Path

from .leitura import Leitura

Gabarito = dict[int, set[str]]


def _alternativas(valor) -> set[str]:
    if isinstance(valor, str):
        valor = [p for p in re.split(r"[\s,;/+|]+", valor.strip().upper()) if p]
        # "BD" vira {"B", "D"}; "Certo" continua inteiro.
        if len(valor) == 1 and len(valor[0]) > 1 and valor[0].isalpha() and len(valor[0]) <= 5 and valor[0].isupper():
            valor = list(valor[0]) if all(len(c) == 1 for c in valor[0]) and not valor[0] in ("CERTO", "ERRADO") else valor
        return set(valor)
    return {str(v).strip().upper() for v in valor}


def carregar_gabarito(fonte) -> Gabarito:
    """Aceita:
    - dict {1: "A", 2: ["B", "D"]}
    - texto corrido "ABDCE..." (uma letra por questao)
    - texto "1:A 2:BD 3:C" ou "1=A, 2=B+D"
    - caminho de arquivo .json (dict ou lista) ou .txt/.csv (linhas "1;A" ou "1,BD")
    """
    if isinstance(fonte, dict):
        return {int(k): _alternativas(v) for k, v in fonte.items()}
    if isinstance(fonte, (list, tuple)):
        return {i + 1: _alternativas(v) for i, v in enumerate(fonte)}
    texto = str(fonte)
    caminho = Path(texto)
    if len(texto) < 260 and caminho.suffix.lower() in {".json", ".txt", ".csv"} and caminho.exists():
        conteudo = caminho.read_text(encoding="utf-8")
        if caminho.suffix.lower() == ".json":
            return carregar_gabarito(json.loads(conteudo))
        gab: Gabarito = {}
        for linha in conteudo.splitlines():
            partes = [p for p in re.split(r"[;,\t=:]+", linha.strip(), maxsplit=1) if p]
            if len(partes) == 2 and partes[0].strip().isdigit():
                gab[int(partes[0])] = _alternativas(partes[1])
        if gab:
            return gab
        texto = conteudo
    pares = re.findall(r"(\d+)\s*[:=\-\)]\s*([A-Za-z]+(?:\s*[+/]\s*[A-Za-z]+)*)", texto)
    if pares:
        return {int(n): _alternativas(a.replace("+", " ").replace("/", " ")) for n, a in pares}
    letras = re.sub(r"[^A-Za-z]", "", texto).upper()
    if not letras:
        raise ValueError("Gabarito vazio ou em formato desconhecido.")
    return {i + 1: {c} for i, c in enumerate(letras)}


def gabarito_da_leitura(leitura: Leitura) -> Gabarito:
    """Usa uma folha preenchida pelo professor como gabarito."""
    return {q.numero: set(q.marcadas) for q in leitura.questoes if q.marcadas}


@dataclass
class ResultadoQuestao:
    numero: int
    esperado: list[str]
    marcado: list[str]
    situacao: str  # "certa" | "errada" | "em branco" | "parcial" | "sem gabarito"
    pontos: float

    def to_dict(self):
        return self.__dict__.copy()


@dataclass
class Correcao:
    questoes: list[ResultadoQuestao]

    @property
    def acertos(self) -> int:
        return sum(q.situacao == "certa" for q in self.questoes)

    @property
    def nota(self) -> float:
        return sum(q.pontos for q in self.questoes)

    @property
    def total(self) -> int:
        return sum(q.situacao != "sem gabarito" for q in self.questoes)

    def por_numero(self) -> dict[int, ResultadoQuestao]:
        return {q.numero: q for q in self.questoes}

    def to_dict(self):
        return {
            "acertos": self.acertos,
            "total": self.total,
            "nota": round(self.nota, 3),
            "questoes": [q.to_dict() for q in self.questoes],
        }


def corrigir(leitura: Leitura, gabarito: Gabarito, parcial: bool = False) -> Correcao:
    """Questao certa = marcou exatamente as alternativas do gabarito.

    Com `parcial`, questao de duas respostas vale meio ponto por alternativa
    certa, desde que nao haja nenhuma marcacao errada.
    """
    out = []
    for q in leitura.questoes:
        marc = set(q.marcadas)
        esp = gabarito.get(q.numero)
        if esp is None:
            out.append(ResultadoQuestao(q.numero, [], sorted(marc), "sem gabarito", 0.0))
            continue
        if not marc:
            sit, pts = "em branco", 0.0
        elif marc == esp:
            sit, pts = "certa", 1.0
        elif parcial and len(esp) > 1 and marc < esp:
            sit, pts = "parcial", len(marc) / len(esp)
        else:
            sit, pts = "errada", 0.0
        out.append(ResultadoQuestao(q.numero, sorted(esp), sorted(marc), sit, pts))
    return Correcao(out)
