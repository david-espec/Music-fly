"""Marcacao visual do resultado: as respostas identificadas ficam em verde."""

from __future__ import annotations

import cv2
import numpy as np

from .correcao import Correcao
from .leitura import Leitura

VERDE = (60, 200, 60)
VERDE_ESCURO = (30, 140, 30)
AZUL = (220, 140, 40)
VERMELHO = (50, 50, 230)
LARANJA = (0, 150, 255)
CINZA = (150, 150, 150)


def _contorno(x, y, r, H_inv, n=40):
    """Circulo na imagem retificada levado para a foto original (vira elipse torta)."""
    ang = np.linspace(0, 2 * np.pi, n, endpoint=False)
    pts = np.stack([x + r * np.cos(ang), y + r * np.sin(ang)], axis=1).astype(np.float32)
    if H_inv is not None:
        pts = cv2.perspectiveTransform(pts[None], H_inv)[0]
    return np.round(pts).astype(np.int32)


def _ponto(x, y, H_inv):
    if H_inv is None:
        return int(x), int(y)
    p = cv2.perspectiveTransform(np.float32([[[x, y]]]), H_inv)[0, 0]
    return int(p[0]), int(p[1])


def caixas_questoes(leitura: Leitura) -> dict[int, tuple[int, int, int, int]]:
    """Retangulo de cada questao (x0, y0, x1, y1) sem encostar nas vizinhas:
    a folga alem da borda das bolhas e limitada pelo vao ate a questao de
    cima e a de baixo, para cada questao ter o seu contorno separado."""
    info = []
    for q in leitura.questoes:
        r = max(b.raio for b in q.bolhas)
        xs = [b.x for b in q.bolhas]
        ys = [b.y for b in q.bolhas]
        info.append((q.numero, min(xs) - r, max(xs) + r, min(ys) - r, max(ys) + r, r))
    out = {}
    for n, x0, x1, y0, y1, r in info:
        # Vao ate a questao mais proxima na mesma coluna.
        vao = min(
            (max(b0 - y1, y0 - b1) for m, a0, a1, b0, b1, _ in info if m != n and a0 < x1 and a1 > x0),
            default=float("inf"),
        )
        folga_y = max(1.0, min(0.5 * r, vao * 0.3))
        folga_x = 0.6 * r
        out[n] = (int(x0 - folga_x), int(y0 - folga_y), int(x1 + folga_x), int(y1 + folga_y))
    return out


def desenhar(
    leitura: Leitura,
    correcao: Correcao | None = None,
    na_foto: np.ndarray | None = None,
    mostrar_questoes: bool = True,
) -> np.ndarray:
    """Imagem com as marcacoes identificadas pintadas de verde.

    Sem `na_foto`, desenha sobre a folha retificada; com ela, desenha na foto
    original, no lugar certo mesmo com a perspectiva.
    Com `correcao`: numero da questao em verde (certa), vermelho (errada) ou
    cinza (em branco), e a alternativa correta que faltou contornada em laranja.
    """
    if na_foto is not None:
        return desenhar_em(
            leitura,
            na_foto,
            np.linalg.inv(leitura.homografia),
            correcao,
            mostrar_questoes,
            # Espessura proporcional a escala da foto.
            escala=max(1.0, na_foto.shape[1] / leitura.retificada.shape[1]),
            contorno_folha=True,
        )
    return desenhar_em(leitura, leitura.retificada, None, correcao, mostrar_questoes)


def desenhar_em(
    leitura: Leitura,
    imagem: np.ndarray,
    transformacao: np.ndarray | None,
    correcao: Correcao | None = None,
    mostrar_questoes: bool = True,
    escala: float = 1.0,
    contorno_folha: bool = False,
) -> np.ndarray:
    """Desenha as marcacoes numa imagem qualquer.

    `transformacao` (3x3) leva coordenadas da folha retificada da leitura para
    as de `imagem`; None quando a imagem e a propria folha retificada. Serve
    para a foto original, a folha retificada e a pagina do scanner/PDF.
    """
    base = imagem.copy()
    H_inv = transformacao
    esp = max(2, int(round(3 * escala)))
    resultados = correcao.por_numero() if correcao else {}
    caixas = caixas_questoes(leitura)

    # 1) Preenchimento verde translucido nas bolhas marcadas. Forte, para
    #    aparecer ate sobre a bolha pintada de preto.
    camada = base.copy()
    for q in leitura.questoes:
        for b in q.bolhas:
            if b.marcada:
                cv2.fillPoly(camada, [_contorno(b.x, b.y, b.raio * 0.95, H_inv)], VERDE, cv2.LINE_AA)
    cv2.addWeighted(camada, 0.65, base, 0.35, 0, dst=base)

    # 2) Linhas e rotulos por cima, nitidos.
    for q in leitura.questoes:
        res = resultados.get(q.numero)
        for b in q.bolhas:
            if b.marcada:
                cv2.polylines(base, [_contorno(b.x, b.y, b.raio * 0.95, H_inv)], True, VERDE_ESCURO, esp, cv2.LINE_AA)
            elif res and b.opcao in res.esperado:
                cv2.polylines(base, [_contorno(b.x, b.y, b.raio * 1.25, H_inv)], True, LARANJA, esp, cv2.LINE_AA)

        if mostrar_questoes:
            x0, y0, x1, y1 = caixas[q.numero]
            canto = [_ponto(x, y, H_inv) for x, y in [(x0, y0), (x1, y0), (x1, y1), (x0, y1)]]
            # Contorno verde em cada questao: mostra onde o sistema leu.
            cv2.polylines(base, [np.array(canto, np.int32)], True, VERDE_ESCURO, max(2, esp - 1), cv2.LINE_AA)

            if res is None:
                cor = VERDE_ESCURO if q.marcadas else CINZA
            else:
                cor = {"certa": VERDE_ESCURO, "parcial": LARANJA, "errada": VERMELHO}.get(res.situacao, CINZA)
            rotulo = f"{q.numero}"
            if len(q.marcadas) >= 2:
                rotulo += f" ({len(q.marcadas)}x)"
                if res is None:
                    cor = LARANJA  # destaca questao com duas (ou mais) respostas
            # Rotulo a direita da questao: a esquerda ja esta o numero impresso.
            org = _ponto(x1 + 6, (y0 + y1) / 2 + 6, H_inv)
            fonte = 0.45 * escala
            cv2.putText(base, rotulo, org, cv2.FONT_HERSHEY_SIMPLEX, fonte, (255, 255, 255), esp + 2, cv2.LINE_AA)
            cv2.putText(base, rotulo, org, cv2.FONT_HERSHEY_SIMPLEX, fonte, cor, max(1, esp - 1), cv2.LINE_AA)

    if contorno_folha and leitura.cantos is not None:
        # Contorno da folha identificada, como no scanner.
        cv2.polylines(base, [np.round(leitura.cantos).astype(np.int32)], True, AZUL, esp + 1, cv2.LINE_AA)
    return base


def recortes_questoes(leitura: Leitura, anotada: np.ndarray | None = None) -> dict[int, np.ndarray]:
    """Uma imagem por questao, recortada da folha retificada (ou da versao anotada)."""
    img = anotada if anotada is not None else leitura.retificada
    h, w = img.shape[:2]
    out = {}
    for q in leitura.questoes:
        x0, y0, x1, y1 = q.caixa
        x0, y0 = max(0, x0 - 50), max(0, y0 - 4)
        x1, y1 = min(w, x1 + 4), min(h, y1 + 4)
        out[q.numero] = img[y0:y1, x0:x1].copy()
    return out
