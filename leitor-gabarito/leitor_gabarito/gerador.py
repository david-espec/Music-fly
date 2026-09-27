"""Gera folhas de resposta sinteticas — para testes e para imprimir.

Cada `Modelo` descreve um tipo de gabarito: quantas questoes, quais
alternativas, em quantas colunas, bolha redonda ou quadrada, letra dentro ou
nao, moldura, marcadores de canto. `fotografar` simula uma foto de celular:
folha sobre a mesa, em perspectiva, com sombra, ruido e desfoque.
"""

from __future__ import annotations

from dataclasses import dataclass, field

import cv2
import numpy as np

LARGURA = 1240  # A4 a 150 dpi
ALTURA = 1754


@dataclass
class Modelo:
    questoes: int = 20
    opcoes: str = "ABCDE"
    colunas: int = 2
    forma: str = "circulo"  # "circulo" | "quadrado"
    letra_dentro: bool = True
    moldura: bool = True
    marcadores_canto: bool = False
    raio: int = 16
    espacamento: float = 2.6  # distancia entre centros, em raios
    titulo: str = "PROVA — FOLHA DE RESPOSTAS"


@dataclass
class Folha:
    imagem: np.ndarray
    # Centro (x, y) de cada bolha, por questao (1..n) e alternativa.
    centros: dict[int, dict[str, tuple[int, int]]] = field(default_factory=dict)


def _bolha(img, c, r, forma, cor=(40, 40, 40), espessura=2):
    x, y = c
    if forma == "circulo":
        cv2.circle(img, c, r, cor, espessura, cv2.LINE_AA)
    else:
        cv2.rectangle(img, (x - r, y - r), (x + r, y + r), cor, espessura, cv2.LINE_AA)


def _texto(img, s, org, escala=0.6, cor=(30, 30, 30), esp=1):
    cv2.putText(img, s, org, cv2.FONT_HERSHEY_SIMPLEX, escala, cor, esp, cv2.LINE_AA)


def desenhar_folha(m: Modelo) -> Folha:
    img = np.full((ALTURA, LARGURA, 3), 255, np.uint8)
    folha = Folha(img)
    _texto(img, m.titulo, (90, 110), 1.0, esp=2)
    _texto(img, "Nome: ____________________________________   Turma: ______", (90, 170), 0.7)
    _texto(img, "Preencha completamente a alternativa escolhida com caneta preta.", (90, 215), 0.55, (90, 90, 90))

    if m.marcadores_canto:
        for x, y in [(40, 40), (LARGURA - 90, 40), (40, ALTURA - 90), (LARGURA - 90, ALTURA - 90)]:
            cv2.rectangle(img, (x, y), (x + 50, y + 50), (0, 0, 0), -1)

    topo, base = 290, ALTURA - 140
    esq, dir_ = 90, LARGURA - 90
    if m.moldura:
        cv2.rectangle(img, (esq - 20, topo - 60), (dir_ + 20, base + 30), (0, 0, 0), 3)

    por_coluna = -(-m.questoes // m.colunas)
    passo_y = min(int(m.raio * 3.2), (base - topo) // max(1, por_coluna))
    largura_col = (dir_ - esq) // m.colunas
    passo_x = int(m.raio * m.espacamento)
    for q in range(m.questoes):
        col, lin = divmod(q, por_coluna)
        x0 = esq + col * largura_col + 70
        y = topo + lin * passo_y
        _texto(img, f"{q + 1:02d}", (x0 - 62, y + 8), 0.65, esp=2)
        folha.centros[q + 1] = {}
        for k, letra in enumerate(m.opcoes):
            c = (x0 + k * passo_x, y)
            _bolha(img, c, m.raio, m.forma)
            if m.letra_dentro:
                (tw, th), _ = cv2.getTextSize(letra, cv2.FONT_HERSHEY_SIMPLEX, 0.5, 1)
                _texto(img, letra, (c[0] - tw // 2, c[1] + th // 2), 0.5, (110, 110, 110))
            elif q % por_coluna == 0:
                _texto(img, letra, (c[0] - 6, y - m.raio - 12), 0.55)
            folha.centros[q + 1][letra] = c
    return folha


def marcar(folha: Folha, m: Modelo, respostas: dict[int, str | list[str]], estilo: str = "cheia",
           semente: int = 0) -> np.ndarray:
    """Pinta as bolhas como uma pessoa faria: caneta, lapis, X ou rabisco parcial."""
    rng = np.random.default_rng(semente)
    img = folha.imagem.copy()
    for q, alts in respostas.items():
        for a in [alts] if isinstance(alts, str) else alts:
            x, y = folha.centros[q][a]
            r = m.raio
            jx, jy = rng.integers(-2, 3, size=2)
            c = (int(x + jx), int(y + jy))
            if estilo == "cheia":
                if m.forma == "circulo":
                    cv2.circle(img, c, r - 1, (25, 25, 35), -1, cv2.LINE_AA)
                else:
                    cv2.rectangle(img, (c[0] - r + 2, c[1] - r + 2), (c[0] + r - 2, c[1] + r - 2), (25, 25, 35), -1)
            elif estilo == "lapis":
                cv2.circle(img, c, r - 2, (95, 95, 100), -1, cv2.LINE_AA)
            elif estilo == "x":
                cv2.line(img, (c[0] - r, c[1] - r), (c[0] + r, c[1] + r), (20, 20, 90), 5, cv2.LINE_AA)
                cv2.line(img, (c[0] - r, c[1] + r), (c[0] + r, c[1] - r), (20, 20, 90), 5, cv2.LINE_AA)
            elif estilo == "rabisco":
                # Preenchimento incompleto: ~75% da area, em traços.
                for k in range(-r + 4, r - 3, 4):
                    cv2.line(img, (c[0] - r + 5, c[1] + k), (c[0] + r - 5, c[1] + k + 2), (30, 30, 60), 4)
            else:
                raise ValueError(f"estilo desconhecido: {estilo}")
    return img


def fotografar(img: np.ndarray, semente: int = 0, inclinacao: float = 0.08, fundo=(70, 90, 110),
               ruido: float = 6.0, desfoque: int = 3, sombra: float = 0.35) -> np.ndarray:
    """Simula a foto de celular da folha sobre uma mesa."""
    rng = np.random.default_rng(semente)
    h, w = img.shape[:2]
    W, H = int(w * 1.35), int(h * 1.25)
    src = np.float32([[0, 0], [w, 0], [w, h], [0, h]])
    base = np.float32([[W * 0.13, H * 0.09], [W * 0.87, H * 0.1], [W * 0.88, H * 0.92], [W * 0.12, H * 0.9]])
    dst = (base + rng.uniform(-inclinacao, inclinacao, (4, 2)) * [W * 0.5, H * 0.3]).astype(np.float32)
    M = cv2.getPerspectiveTransform(src, dst)
    foto = np.empty((H, W, 3), np.uint8)
    foto[:] = fundo
    textura = rng.normal(0, 10, (H, W, 1))
    foto = np.clip(foto + textura, 0, 255).astype(np.uint8)
    papel = cv2.warpPerspective(img, M, (W, H), flags=cv2.INTER_LINEAR, borderValue=(0, 0, 0))
    mascara = cv2.warpPerspective(np.full((h, w), 255, np.uint8), M, (W, H))
    foto[mascara > 0] = papel[mascara > 0]
    # Iluminacao desigual: um degrade diagonal escurece um canto.
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    luz = 1 - sombra * ((xx / W) * 0.6 + (yy / H) * 0.4)
    foto = foto.astype(np.float32) * luz[..., None]
    foto += rng.normal(0, ruido, foto.shape)
    foto = np.clip(foto, 0, 255).astype(np.uint8)
    if desfoque:
        foto = cv2.GaussianBlur(foto, (desfoque | 1, desfoque | 1), 0)
    return foto
