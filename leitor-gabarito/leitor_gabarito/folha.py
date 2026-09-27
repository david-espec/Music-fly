"""Encontrar a folha na foto e endireita-la."""

from __future__ import annotations

import cv2
import numpy as np

# Largura fixa da folha retificada. Com a escala sempre igual, os limites de
# tamanho das bolhas podem ser proporcionais a ela, qualquer que seja a camera.
LARGURA_PADRAO = 1240


def ordenar_cantos(pts: np.ndarray) -> np.ndarray:
    """Sup-esq, sup-dir, inf-dir, inf-esq."""
    pts = pts.reshape(4, 2).astype(np.float32)
    s = pts.sum(axis=1)
    d = np.diff(pts, axis=1).ravel()
    return np.float32([pts[np.argmin(s)], pts[np.argmin(d)], pts[np.argmax(s)], pts[np.argmax(d)]])


def _quadrilateros(binaria: np.ndarray, area_min: float):
    contornos, _ = cv2.findContours(binaria, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    for c in sorted(contornos, key=cv2.contourArea, reverse=True)[:5]:
        if cv2.contourArea(c) < area_min:
            break
        peri = cv2.arcLength(c, True)
        for eps in (0.02, 0.03, 0.05):
            aprox = cv2.approxPolyDP(c, eps * peri, True)
            if len(aprox) == 4 and cv2.isContourConvex(aprox):
                yield aprox.reshape(4, 2)
                break


def encontrar_folha(img: np.ndarray) -> np.ndarray | None:
    """Os quatro cantos da folha (em pixels da imagem), ou None se nao achar."""
    h, w = img.shape[:2]
    k = 900 / max(h, w)
    peq = cv2.resize(img, None, fx=k, fy=k, interpolation=cv2.INTER_AREA) if k < 1 else img
    k = min(k, 1.0)
    cinza = cv2.cvtColor(peq, cv2.COLOR_BGR2GRAY) if peq.ndim == 3 else peq
    cinza = cv2.GaussianBlur(cinza, (5, 5), 0)
    area_min = 0.25 * cinza.shape[0] * cinza.shape[1]

    # 1) Papel claro sobre fundo mais escuro: limiar de Otsu.
    _, claro = cv2.threshold(cinza, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    claro = cv2.morphologyEx(claro, cv2.MORPH_CLOSE, np.ones((9, 9), np.uint8))
    # 2) Contorno por bordas, para fundos claros.
    bordas = cv2.dilate(cv2.Canny(cinza, 40, 120), np.ones((3, 3), np.uint8), iterations=2)

    area_total = cinza.shape[0] * cinza.shape[1]
    for binaria in (claro, bordas):
        for quad in _quadrilateros(binaria, area_min):
            # Um quadrilatero do tamanho da foto inteira e a propria moldura da imagem.
            if cv2.contourArea(quad.astype(np.float32)) > 0.97 * area_total:
                continue
            return ordenar_cantos(quad / k)
    return None


def retificar(img: np.ndarray, cantos: np.ndarray | None, largura: int = LARGURA_PADRAO):
    """Corrige a perspectiva. Devolve (imagem retificada, homografia foto->retificada)."""
    h, w = img.shape[:2]
    if cantos is None:
        cantos = np.float32([[0, 0], [w, 0], [w, h], [0, h]])
    tl, tr, br, bl = cantos
    larg = max(np.linalg.norm(tr - tl), np.linalg.norm(br - bl))
    alt = max(np.linalg.norm(bl - tl), np.linalg.norm(br - tr))
    altura = int(round(largura * alt / larg))
    destino = np.float32([[0, 0], [largura, 0], [largura, altura], [0, altura]])
    H = cv2.getPerspectiveTransform(cantos.astype(np.float32), destino)
    return cv2.warpPerspective(img, H, (largura, altura), flags=cv2.INTER_CUBIC, borderValue=(255, 255, 255)), H


def normalizar_iluminacao(cinza: np.ndarray) -> np.ndarray:
    """Divide pela luz estimada do papel: sombra e degrade somem, o papel fica ~255."""
    k = max(15, (min(cinza.shape) // 20) | 1)
    fundo = cv2.morphologyEx(cinza, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (k, k)))
    fundo = cv2.GaussianBlur(fundo, (0, 0), k / 2)
    norm = cv2.divide(cinza, np.maximum(fundo, 1), scale=255)
    return norm
