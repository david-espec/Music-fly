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
        base = na_foto.copy()
        H_inv = np.linalg.inv(leitura.homografia)
        # Espessura proporcional a escala da foto.
        escala = max(1.0, base.shape[1] / leitura.retificada.shape[1])
    else:
        base = leitura.retificada.copy()
        H_inv = None
        escala = 1.0
    esp = max(2, int(round(3 * escala)))
    camada = base.copy()
    resultados = correcao.por_numero() if correcao else {}

    for q in leitura.questoes:
        res = resultados.get(q.numero)
        for b in q.bolhas:
            if b.marcada:
                pts = _contorno(b.x, b.y, b.raio * 1.2, H_inv)
                cv2.fillPoly(camada, [pts], VERDE, cv2.LINE_AA)
                cv2.polylines(base, [pts], True, VERDE_ESCURO, esp, cv2.LINE_AA)
            elif res and b.opcao in res.esperado:
                cv2.polylines(base, [_contorno(b.x, b.y, b.raio * 1.25, H_inv)], True, LARANJA, esp, cv2.LINE_AA)

        if mostrar_questoes:
            x0, y0, x1, y1 = q.caixa
            canto = [_ponto(x, y, H_inv) for x, y in [(x0, y0), (x1, y0), (x1, y1), (x0, y1)]]
            cor_caixa = AZUL
            if len(q.marcadas) >= 2:
                cor_caixa = LARANJA  # destaca questao com duas (ou mais) respostas
            cv2.polylines(base, [np.array(canto, np.int32)], True, cor_caixa, max(1, esp // 2), cv2.LINE_AA)

            if res is None:
                cor = VERDE_ESCURO if q.marcadas else CINZA
            else:
                cor = {"certa": VERDE_ESCURO, "parcial": LARANJA, "errada": VERMELHO}.get(res.situacao, CINZA)
            rotulo = f"{q.numero}"
            if len(q.marcadas) >= 2:
                rotulo += f" ({len(q.marcadas)}x)"
            # Rotulo a direita da questao: a esquerda ja esta o numero impresso.
            org = _ponto(x1 + 6, (y0 + y1) / 2 + 6, H_inv)
            fonte = 0.45 * escala
            cv2.putText(base, rotulo, org, cv2.FONT_HERSHEY_SIMPLEX, fonte, (255, 255, 255), esp + 2, cv2.LINE_AA)
            cv2.putText(base, rotulo, org, cv2.FONT_HERSHEY_SIMPLEX, fonte, cor, max(1, esp - 1), cv2.LINE_AA)

    if H_inv is not None and leitura.cantos is not None:
        # Contorno da folha identificada, como no scanner.
        cv2.polylines(base, [np.round(leitura.cantos).astype(np.int32)], True, AZUL, esp + 1, cv2.LINE_AA)

    cv2.addWeighted(camada, 0.45, base, 0.55, 0, dst=base)
    # Os contornos por cima do preenchimento translucido ficam nitidos.
    for q in leitura.questoes:
        for b in q.bolhas:
            if b.marcada:
                cv2.polylines(base, [_contorno(b.x, b.y, b.raio * 1.2, H_inv)], True, VERDE_ESCURO, esp, cv2.LINE_AA)
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
