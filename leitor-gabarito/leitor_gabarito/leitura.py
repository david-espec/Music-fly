"""Leitura das marcacoes: bolhas -> questoes -> alternativas marcadas.

Nada aqui depende de um modelo de folha fixo. O layout e deduzido da propria
imagem:

1. Candidatas a bolha: contornos fechados, quase quadrados na caixa, cheios
   (circulo ou quadrado) e do tamanho que mais se repete na folha.
2. Colunas de alternativas: candidatas alinhadas na vertical ao longo de
   varias linhas. Numero de questao, letra solta e sujeira nao se alinham assim
   e ficam de fora.
3. Blocos: colunas proximas formam o bloco de uma coluna de questoes; um vao
   maior separa um bloco do seguinte. O tamanho do bloco e o numero de
   alternativas (A-E, A-D, V/F...).
4. Questoes: dentro de cada bloco, cada linha e uma questao. Bolha que nao foi
   achada (apagada demais, borrada) tem a posicao deduzida pela grade.
5. Preenchimento: fracao de tinta no miolo de cada bolha. O corte entre
   "marcada" e "vazia" e calculado por folha (Otsu), entao caneta, lapis e
   impressao clara ou escura funcionam sem ajuste.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from string import ascii_uppercase

import cv2
import numpy as np

from .folha import encontrar_folha, normalizar_iluminacao, retificar


@dataclass
class Bolha:
    opcao: str
    x: float
    y: float
    raio: float
    preenchimento: float = 0.0
    marcada: bool = False
    detectada: bool = True  # False quando a posicao veio da grade

    def to_dict(self):
        return {
            "opcao": self.opcao,
            "x": round(self.x, 1),
            "y": round(self.y, 1),
            "raio": round(self.raio, 1),
            "preenchimento": round(self.preenchimento, 3),
            "marcada": self.marcada,
        }


@dataclass
class Questao:
    numero: int
    bolhas: list[Bolha]

    @property
    def marcadas(self) -> list[str]:
        return [b.opcao for b in self.bolhas if b.marcada]

    @property
    def situacao(self) -> str:
        n = len(self.marcadas)
        return {0: "em branco", 1: "uma resposta", 2: "duas respostas"}.get(n, f"{n} respostas")

    @property
    def caixa(self) -> tuple[int, int, int, int]:
        r = max(b.raio for b in self.bolhas)
        xs = [b.x for b in self.bolhas]
        ys = [b.y for b in self.bolhas]
        return int(min(xs) - r * 1.4), int(min(ys) - r * 1.3), int(max(xs) + r * 1.4), int(max(ys) + r * 1.3)

    def to_dict(self):
        return {
            "numero": self.numero,
            "marcadas": self.marcadas,
            "situacao": self.situacao,
            "bolhas": [b.to_dict() for b in self.bolhas],
        }


@dataclass
class Leitura:
    questoes: list[Questao]
    retificada: np.ndarray
    # Homografia foto original -> imagem retificada.
    homografia: np.ndarray
    folha_encontrada: bool
    limiar: float
    opcoes: list[str]
    avisos: list[str] = field(default_factory=list)
    # Cantos da folha na foto original (sup-esq, sup-dir, inf-dir, inf-esq), se achada.
    cantos: np.ndarray | None = None

    def respostas(self) -> dict[int, list[str]]:
        return {q.numero: q.marcadas for q in self.questoes}

    def to_dict(self):
        return {
            "folha_encontrada": self.folha_encontrada,
            "limiar": round(self.limiar, 3),
            "opcoes": self.opcoes,
            "total_questoes": len(self.questoes),
            "avisos": self.avisos,
            "cantos_folha": None if self.cantos is None else [[round(float(v), 1) for v in p] for p in self.cantos],
            "questoes": [q.to_dict() for q in self.questoes],
        }


# ---------------------------------------------------------------------------
# 1. Candidatas


@dataclass
class _Cand:
    x: float
    y: float
    w: float
    h: float
    area: float

    @property
    def tam(self) -> float:
        return (self.w + self.h) / 2


def _binarizar(norm: np.ndarray) -> np.ndarray:
    binaria = cv2.adaptiveThreshold(norm, 255, cv2.ADAPTIVE_THRESH_MEAN_C, cv2.THRESH_BINARY_INV, 31, 12)
    # Fecha falhas finas no traco da bolha (impressao clara, foto borrada).
    return cv2.morphologyEx(binaria, cv2.MORPH_CLOSE, np.ones((3, 3), np.uint8))


def _sem_repetidas(cands: list[_Cand]) -> list[_Cand]:
    """Anel da bolha gera dois contornos (fora e dentro) e a letra impressa um
    terceiro, todos com o mesmo centro: fica so o maior."""
    cands = sorted(cands, key=lambda c: c.area, reverse=True)
    unicas: list[_Cand] = []
    for c in cands:
        if all(abs(c.x - u.x) > u.tam * 0.5 or abs(c.y - u.y) > u.tam * 0.5 for u in unicas):
            unicas.append(c)
    return unicas


def _por_contorno(binaria: np.ndarray) -> list[_Cand]:
    """Passada 1: contornos fechados com cara de bolha (circulo ou quadrado)."""
    W = binaria.shape[1]
    contornos, _ = cv2.findContours(binaria, cv2.RETR_LIST, cv2.CHAIN_APPROX_SIMPLE)
    tam_min, tam_max = W / 110, W / 14
    cands: list[_Cand] = []
    for c in contornos:
        x, y, w, h = cv2.boundingRect(c)
        if not (tam_min <= w <= tam_max and tam_min <= h <= tam_max):
            continue
        if not 0.7 <= w / h <= 1.4:
            continue
        area = cv2.contourArea(c)
        if area / (w * h) < 0.55:
            continue
        casco = cv2.contourArea(cv2.convexHull(c))
        if casco <= 0 or area / casco < 0.88:
            continue
        peri = cv2.arcLength(c, True)
        if 4 * np.pi * area / (peri * peri) < 0.6:
            continue
        cands.append(_Cand(x + w / 2, y + h / 2, w, h, area))
    return _sem_repetidas(cands)


def _tamanho_tipico(cands: list[_Cand]) -> float:
    """Tamanho das bolhas: o MAIOR tamanho que se repete bastante.

    Nao o mais frequente: uma bolha marcada com X vira quatro furinhos iguais,
    e letras e numeros impressos podem ser muitos. As bolhas sao as maiores
    formas fechadas que aparecem em quantidade.
    """
    tams = np.sort(np.array([c.tam for c in cands]))
    grupos, atual = [], [tams[0]]
    for a, b in zip(tams, tams[1:]):
        if b / a > 1.12:
            grupos.append(atual)
            atual = []
        atual.append(b)
    grupos.append(atual)
    maior = max(len(g) for g in grupos)
    minimo = min(maior, max(6, 0.2 * maior))
    validos = [g for g in grupos if len(g) >= minimo]
    return float(np.median(max(validos, key=np.median)))


def _por_erosao(binaria: np.ndarray, tam: float) -> list[_Cand]:
    """Passada 2, para bolhas que a primeira perdeu.

    Bolhas muito juntas encostam umas nas outras, e a letra impressa pode
    tocar o anel: o contorno deixa de ser um circulo. Aqui os furos do tamanho
    de uma bolha sao preenchidos (anel vira disco) e a imagem e erodida: texto,
    linhas e a moldura, que sao finos, somem; discos encolhem e se separam.
    """
    cheia = binaria.copy()
    contornos, hier = cv2.findContours(binaria, cv2.RETR_CCOMP, cv2.CHAIN_APPROX_SIMPLE)
    if hier is not None:
        limite = (1.5 * tam) ** 2
        for c, h in zip(contornos, hier[0]):
            if h[3] != -1 and cv2.contourArea(c) < limite:
                cv2.drawContours(cheia, [c], -1, 255, -1)
    k = max(1, int(round(0.3 * tam)))
    erodida = cv2.erode(cheia, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2 * k + 1, 2 * k + 1)))
    contornos, _ = cv2.findContours(erodida, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    cands = []
    for c in contornos:
        x, y, w, h = cv2.boundingRect(c)
        w2, h2 = w + 2 * k, h + 2 * k
        # Faixa larga: se a passada 1 so viu o furo das bolhas, `tam` e o do
        # furo, e aqui aparece o tamanho de fora, maior.
        if 0.7 * tam <= w2 <= 1.9 * tam and 0.7 * tam <= h2 <= 1.9 * tam and 0.7 <= w2 / h2 <= 1.4:
            cands.append(_Cand(x + w / 2, y + h / 2, w2, h2, float(w2 * h2)))
    if not cands:
        return []
    tam2 = _tamanho_tipico(cands)
    return [c for c in cands if 0.8 * tam2 <= c.tam <= 1.25 * tam2]


def _candidatas(norm: np.ndarray) -> list[_Cand]:
    binaria = _binarizar(norm)
    p1 = _por_contorno(binaria)
    if not p1:
        return []
    tam = _tamanho_tipico(p1)
    p1 = [c for c in p1 if 0.75 * tam <= c.tam <= 1.3 * tam]
    p2 = _por_erosao(binaria, tam)
    # Junta as duas passadas. Onde as duas acharam a mesma bolha, vale o centro
    # da passada 1 (contorno, mais preciso) e o tamanho da passada 2 (bolha
    # inteira, mesmo quando a passada 1 so viu o furo do anel).
    juntas: list[_Cand] = []
    usadas: set[int] = set()
    for c in p1:
        perto = [i for i, d in enumerate(p2) if i not in usadas and abs(d.x - c.x) < 0.35 * d.tam and abs(d.y - c.y) < 0.35 * d.tam]
        if perto:
            d = p2[perto[0]]
            usadas.add(perto[0])
            juntas.append(_Cand(c.x, c.y, d.w, d.h, d.area))
        else:
            juntas.append(c)
    juntas += [d for i, d in enumerate(p2) if i not in usadas]
    juntas = _sem_repetidas(juntas)
    ref = _tamanho_tipico(juntas)
    return [c for c in juntas if 0.6 * ref <= c.tam <= 1.35 * ref]


# ---------------------------------------------------------------------------
# 2-4. Grade


def _agrupar_1d(valores: np.ndarray, tol: float) -> list[np.ndarray]:
    """Indices agrupados por proximidade num eixo (encadeado: vao > tol separa)."""
    if len(valores) == 0:
        return []
    ordem = np.argsort(valores)
    grupos, atual = [], [ordem[0]]
    for a, b in zip(ordem, ordem[1:]):
        if valores[b] - valores[a] > tol:
            grupos.append(np.array(atual))
            atual = []
        atual.append(b)
    grupos.append(np.array(atual))
    return grupos


def _blocos(colunas: list[tuple[float, int]], n_opcoes: int | None) -> list[list[float]]:
    """Separa as colunas de alternativas em blocos (uma coluna de questoes cada).

    `colunas`: (x, quantidade de bolhas) de cada coluna de alternativas.
    """
    colunas = sorted(colunas)
    xs = [x for x, _ in colunas]
    conta = dict(colunas)
    if len(xs) < 2:
        return [xs] if xs and n_opcoes == 1 else []
    difs = np.diff(xs)
    # Passo entre alternativas: o menor vao que se repete (metade inferior).
    passo = float(np.median(np.sort(difs)[: max(1, len(difs) // 2 + 1)]))
    blocos, atual = [], [xs[0]]
    for x, d in zip(xs[1:], difs):
        if d > 1.6 * passo:
            blocos.append(atual)
            atual = []
        atual.append(x)
    blocos.append(atual)

    if n_opcoes is None:
        tamanhos = [len(b) for b in blocos if len(b) >= 2]
        if not tamanhos:
            return []
        n_opcoes = max(set(tamanhos), key=lambda t: (tamanhos.count(t), t))
    saida = []
    for b in blocos:
        if len(b) == n_opcoes:
            saida.append(b)
        elif len(b) > n_opcoes and len(b) % n_opcoes == 0:
            # Dois blocos colados com o mesmo passo parecem um so: divide.
            saida.extend(b[i : i + n_opcoes] for i in range(0, len(b), n_opcoes))
        elif len(b) > n_opcoes:
            # Uma coluna a mais (numero da questao alinhado, por exemplo): fica
            # a janela de n colunas com mais bolhas e passo mais regular.
            def nota(i):
                janela = b[i : i + n_opcoes]
                regular = np.std(np.diff(janela)) / passo if n_opcoes > 1 else 0
                return sum(conta[x] for x in janela) * (1 - min(0.9, regular))

            i = max(range(len(b) - n_opcoes + 1), key=nota)
            saida.append(b[i : i + n_opcoes])
    return saida


def _completar_linhas(linhas, bloco, tam):
    """Questao inteira sem nenhuma bolha achada (todas riscadas demais, por
    exemplo) deixa um buraco no espacamento regular das linhas. O buraco vira
    uma questao com posicoes deduzidas, para a numeracao nao escorregar."""
    if len(linhas) < 3:
        return linhas
    ys = np.array([y for y, _ in linhas])
    difs = np.diff(ys)
    passo = float(np.median(difs))
    # So vale com espacamento regular: a maioria dos vaos perto do passo.
    if passo < tam or np.mean(np.abs(difs - passo) < 0.15 * passo) < 0.6:
        return linhas
    saida = [linhas[0]]
    for (y_ant, _), (y, pos) in zip(linhas, linhas[1:]):
        faltam = int(round((y - y_ant) / passo)) - 1
        if faltam >= 1 and abs((y - y_ant) - (faltam + 1) * passo) < 0.25 * passo:
            for k in range(1, faltam + 1):
                yk = y_ant + k * passo
                saida.append((yk, [(cx, yk, False) for cx in bloco]))
        saida.append((y, pos))
    return saida


def _montar_questoes(cands: list[_Cand], n_opcoes: int | None, ordem: str):
    if not cands:
        return [], 0.0
    tam = float(np.median([c.tam for c in cands]))
    xs = np.array([c.x for c in cands])
    ys = np.array([c.y for c in cands])

    # Colunas de alternativas: alinhadas na vertical em pelo menos duas linhas.
    grupos_x = _agrupar_1d(xs, 0.4 * tam)
    maior = max(len(g) for g in grupos_x)
    colunas = [g for g in grupos_x if len(g) >= 2 and len(g) >= 0.2 * maior]
    blocos = _blocos([(float(np.mean(xs[g])), len(g)) for g in colunas], n_opcoes)

    brutas: list[tuple[float, float, list[tuple[float, float, bool]]]] = []
    for bloco in blocos:
        x0, x1 = bloco[0] - 0.6 * tam, bloco[-1] + 0.6 * tam
        dentro = np.where((xs >= x0) & (xs <= x1))[0]
        linhas: list[tuple[float, list[tuple[float, float, bool]]]] = []
        for linha in _agrupar_1d(ys[dentro], 0.45 * tam):
            idx = dentro[linha]
            y_linha = float(np.median(ys[idx]))
            posicoes, achadas = [], 0
            for cx in bloco:
                perto = idx[np.abs(xs[idx] - cx) < 0.5 * tam]
                if len(perto):
                    j = perto[np.argmin(np.abs(xs[perto] - cx))]
                    posicoes.append((float(xs[j]), float(ys[j]), True))
                    achadas += 1
                else:
                    posicoes.append((cx, y_linha, False))
            # Linha com menos da metade das bolhas nao e questao (texto alinhado por acaso).
            if achadas * 2 >= len(bloco) + (1 if len(bloco) % 2 else 0):
                linhas.append((y_linha, posicoes))
        brutas.extend((bloco[0], y, pos) for y, pos in _completar_linhas(linhas, bloco, tam))

    if ordem == "linhas":
        brutas.sort(key=lambda q: (round(q[1] / tam), q[0]))
    else:
        # Numeracao por coluna: bloco da esquerda de cima a baixo, depois o seguinte.
        brutas.sort(key=lambda q: (q[0], q[1]))
    return brutas, tam


# ---------------------------------------------------------------------------
# 5. Preenchimento


def _preenchimento(tinta: np.ndarray, x: float, y: float, raio: float) -> float:
    """Fracao de tinta num disco central (70% do raio: o contorno impresso fica de fora)."""
    r = max(2, int(round(raio * 0.7)))
    x0, y0 = int(round(x)) - r, int(round(y)) - r
    h, w = tinta.shape
    if x0 < 0 or y0 < 0 or x0 + 2 * r + 1 > w or y0 + 2 * r + 1 > h:
        return 0.0
    recorte = tinta[y0 : y0 + 2 * r + 1, x0 : x0 + 2 * r + 1]
    disco = np.zeros_like(recorte)
    cv2.circle(disco, (r, r), r, 1, -1)
    return float((recorte * disco).sum() / disco.sum())


def _limiar(valores: np.ndarray) -> float:
    """Corte entre vazias e marcadas: Otsu em 1D, com salvaguardas."""
    if len(valores) < 2 or valores.max() < 0.3:
        return 0.5
    melhor, corte = -1.0, 0.5
    for t in np.linspace(0.2, 0.75, 56):
        a, b = valores[valores < t], valores[valores >= t]
        if len(a) == 0 or len(b) == 0:
            continue
        entre = len(a) * len(b) * (a.mean() - b.mean()) ** 2
        if entre > melhor:
            melhor, corte = entre, float(t)
    a, b = valores[valores < corte], valores[valores >= corte]
    # Sem dois grupos bem separados, nao ha marcacao nenhuma (ou todas estao):
    # vale o corte padrao.
    if len(a) == 0 or len(b) == 0 or b.mean() - a.mean() < 0.25:
        return 0.5
    # Otsu empata ao longo de todo o vao entre os grupos; o meio do vao e o
    # corte mais tolerante para os dois lados.
    return float(np.clip((a.max() + b.min()) / 2, 0.3, 0.65))


# ---------------------------------------------------------------------------


def ler_gabarito(
    imagem: np.ndarray,
    opcoes: str | list[str] | None = None,
    ordem: str = "colunas",
    limiar: float | None = None,
    procurar_folha: bool = True,
) -> Leitura:
    """Le uma foto (BGR) de folha de respostas.

    `opcoes`: rotulos das alternativas ("ABCDE", "VF", ["Certo", "Errado"]...).
    Sem ele, o numero de alternativas e deduzido da folha e os rotulos sao A, B, C...
    `ordem`: "colunas" numera de cima para baixo e depois a coluna seguinte;
    "linhas" numera da esquerda para a direita, linha por linha.
    """
    if imagem is None or imagem.size == 0:
        raise ValueError("imagem vazia")
    if imagem.ndim == 2:
        imagem = cv2.cvtColor(imagem, cv2.COLOR_GRAY2BGR)
    rotulos = list(opcoes) if opcoes else None
    avisos: list[str] = []

    cantos = encontrar_folha(imagem) if procurar_folha else None
    if procurar_folha and cantos is None:
        avisos.append("Bordas da folha nao encontradas; usada a imagem inteira.")
    ret, H = retificar(imagem, cantos)
    cinza = cv2.cvtColor(ret, cv2.COLOR_BGR2GRAY)
    norm = normalizar_iluminacao(cinza)

    cands = _candidatas(norm)
    brutas, tam = _montar_questoes(cands, len(rotulos) if rotulos else None, ordem)
    if not brutas:
        avisos.append("Nenhuma questao encontrada. Confira se a folha inteira aparece na foto.")
        return Leitura([], ret, H, cantos is not None, 0.5, rotulos or [], avisos, cantos)

    n = len(brutas[0][2])
    if rotulos is None:
        rotulos = list(ascii_uppercase[:n])

    _, tinta = cv2.threshold(norm, 0, 1, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)
    # Otsu numa folha quase toda branca pode cortar alto demais; o lapis claro
    # (cinza medio) precisa contar como tinta, o papel nao.
    tinta = ((norm < 170) | (tinta > 0)).astype(np.uint8) & (norm < 200).astype(np.uint8)

    questoes: list[Questao] = []
    for i, (_, _, posicoes) in enumerate(brutas):
        bolhas = [
            Bolha(rotulos[k], x, y, tam / 2, _preenchimento(tinta, x, y, tam / 2), detectada=achada)
            for k, (x, y, achada) in enumerate(posicoes)
        ]
        questoes.append(Questao(i + 1, bolhas))

    corte = limiar if limiar is not None else _limiar(np.array([b.preenchimento for q in questoes for b in q.bolhas]))
    duvidosas = []
    for q in questoes:
        for b in q.bolhas:
            b.marcada = b.preenchimento >= corte
            if abs(b.preenchimento - corte) < 0.07:
                duvidosas.append(f"{q.numero}{b.opcao}")
    if duvidosas:
        avisos.append("Marcacoes duvidosas (preenchimento perto do limite): " + ", ".join(duvidosas))
    faltando = sum(not b.detectada for q in questoes for b in q.bolhas)
    if faltando:
        avisos.append(f"{faltando} bolha(s) com posicao deduzida pela grade.")
    return Leitura(questoes, ret, H, cantos is not None, corte, rotulos, avisos, cantos)
