"""Scanner de documentos: o mesmo do Scan Fly, em Python.

Encontra a folha na foto, corrige a perspectiva, limpa a imagem com um filtro
(cor, cinza, preto e branco) e junta as paginas num PDF.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime

import cv2
import numpy as np

from .correcao import Correcao, Gabarito, corrigir
from .desenho import desenhar_em
from .folha import encontrar_folha, retificar
from .leitura import Leitura, ler_gabarito

FILTROS = ("cor", "cinza", "pb", "original")
TAMANHOS_PAGINA = ("auto", "a4", "carta")


@dataclass
class Pagina:
    imagem: np.ndarray  # BGR, ja recortada, filtrada, marcada e girada
    cantos: np.ndarray | None  # onde a folha foi achada na foto (None: foto inteira)
    leitura: Leitura | None = None  # respostas lidas, quando a pagina e um gabarito
    correcao: Correcao | None = None
    # 3x3: coordenadas da folha retificada da leitura -> pagina (antes do giro).
    transformacao: np.ndarray | None = None

    @property
    def marcada(self) -> bool:
        return bool(self.leitura and self.leitura.questoes)

    @property
    def folha_encontrada(self) -> bool:
        return self.cantos is not None


# ---------------------------------------------------------------------------
# Filtros


def _fundo(lum: np.ndarray) -> np.ndarray:
    """Brilho do papel em cada ponto: fechamento morfologico largo (o texto,
    escuro e fino, some) seguido de desfoque."""
    k = max(15, (min(lum.shape) // 28) | 1)
    fundo = cv2.morphologyEx(lum, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (k, k)))
    return np.maximum(cv2.GaussianBlur(fundo, (0, 0), k / 2).astype(np.float32), 40)


def _niveis(v: np.ndarray, preto: float, branco: float = 238) -> np.ndarray:
    return np.clip((v - preto) / (branco - preto) * 255, 0, 255)


def aplicar_filtro(img: np.ndarray, filtro: str) -> np.ndarray:
    """Todos (menos o original) dividem a imagem pela luz estimada do papel:
    sombra da mao, canto escuro e luz amarelada somem e o fundo fica branco."""
    if filtro == "original":
        return img
    if filtro not in FILTROS:
        raise ValueError(f"filtro desconhecido: {filtro} (use {', '.join(FILTROS)})")
    lum = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    fundo = _fundo(lum)
    if filtro == "cor":
        k = (245 / fundo)[..., None]
        v = _niveis(img.astype(np.float32) * k, 25)
        cinza = v.mean(axis=2, keepdims=True)
        # Um pouco mais de saturacao: carimbo e marca-texto continuam vivos.
        return np.clip(cinza + (v - cinza) * 1.25, 0, 255).astype(np.uint8)
    norm = np.clip(lum.astype(np.float32) * 245 / fundo, 0, 255)
    if filtro == "cinza":
        return cv2.cvtColor(_niveis(norm, 35).astype(np.uint8), cv2.COLOR_GRAY2BGR)
    # P&B: limiar adaptativo (Bradley) sobre a imagem sem sombra, com uma rampa
    # curta na borda da letra em vez de degrau seco.
    r = max(4, min(norm.shape) // 40)
    media = cv2.blur(norm, (2 * r + 1, 2 * r + 1))
    t = np.minimum(media * 0.86, 200)
    pb = np.clip((norm - (t - 14)) / 28 * 255, 0, 255).astype(np.uint8)
    return cv2.cvtColor(pb, cv2.COLOR_GRAY2BGR)


def girar(img: np.ndarray, graus: int) -> np.ndarray:
    graus %= 360
    codigos = {90: cv2.ROTATE_90_CLOCKWISE, 180: cv2.ROTATE_180, 270: cv2.ROTATE_90_COUNTERCLOCKWISE}
    if graus == 0:
        return img
    if graus not in codigos:
        raise ValueError("gire em multiplos de 90 graus")
    return cv2.rotate(img, codigos[graus])


# ---------------------------------------------------------------------------


def digitalizar(
    foto: np.ndarray,
    filtro: str = "cor",
    rotacao: int = 0,
    cantos: np.ndarray | None = None,
    largura_max: int = 2400,
    marcar: bool = True,
    opcoes: str | list[str] | None = None,
    ordem: str = "colunas",
    gabarito: Gabarito | None = None,
    limiar: float | None = None,
    leitura: Leitura | None = None,
    correcao: Correcao | None = None,
) -> Pagina:
    """Foto -> pagina limpa, pronta para o PDF.

    Com `marcar` (padrao), se a folha for um gabarito, as alternativas
    marcadas saem pintadas de verde na propria pagina — e portanto no PDF.
    Com `gabarito`, a pagina mostra tambem a correcao. Em documento comum
    nenhuma questao e achada e a pagina sai so limpa.
    `cantos` permite ajustar o recorte a mao; `leitura`, reaproveitar uma
    leitura ja feita desta mesma foto (e `correcao`, a correcao dela).
    """
    if leitura is not None and cantos is None:
        cantos = leitura.cantos
    if cantos is None:
        cantos = encontrar_folha(foto)
    # Mantem a resolucao da foto (limitada), em vez da largura fixa da leitura de gabarito.
    if cantos is not None:
        tl, tr, br, bl = cantos
        larg = max(np.linalg.norm(tr - tl), np.linalg.norm(br - bl))
    else:
        larg = foto.shape[1]
    ret, _ = retificar(foto, cantos, largura=int(min(largura_max, max(200, larg))))
    m = 0
    if cantos is not None:
        # Descarta uma franja minima da borda, para nao pegar a mesa junto.
        h, w = ret.shape[:2]
        m = max(1, int(round(min(h, w) * 0.006)))
        ret = ret[m : h - m, m : w - m]
    pagina = aplicar_filtro(ret, filtro)

    M = None
    if marcar:
        if leitura is None:
            # Mesmos cantos: a leitura e a pagina enxergam exatamente o mesmo recorte.
            leitura = ler_gabarito(foto, opcoes=opcoes, ordem=ordem, limiar=limiar,
                                   procurar_folha=cantos is not None, cantos=cantos)
        if leitura.questoes:
            if correcao is None and gabarito:
                correcao = corrigir(leitura, gabarito)
            M = _para_pagina(pagina, leitura, m)
            pagina = desenhar_em(leitura, pagina, M, correcao, escala=max(1.0, M[0, 0]))
    return Pagina(girar(pagina, rotacao), cantos, leitura if marcar else None, correcao if marcar else None, M)


def _para_pagina(pagina: np.ndarray, leitura: Leitura, margem: int) -> np.ndarray:
    """Leva coordenadas da folha retificada da leitura (largura fixa) para a
    pagina do scanner (outra escala, menos a franja cortada da borda)."""
    lh, lw = leitura.retificada.shape[:2]
    ph, pw = pagina.shape[:2]
    sx = (pw + 2 * margem) / lw
    sy = (ph + 2 * margem) / lh
    return np.array([[sx, 0, -margem], [0, sy, -margem], [0, 0, 1]], np.float64)


def desenhar_deteccao(foto: np.ndarray, cantos: np.ndarray | None) -> np.ndarray:
    """A foto com o contorno da folha identificada, para conferir o recorte."""
    out = foto.copy()
    if cantos is None:
        return out
    pts = np.round(cantos).astype(np.int32)
    camada = out.copy()
    cv2.fillPoly(camada, [pts], (235, 150, 60))
    cv2.addWeighted(camada, 0.25, out, 0.75, 0, dst=out)
    esp = max(2, foto.shape[1] // 300)
    cv2.polylines(out, [pts], True, (235, 120, 30), esp, cv2.LINE_AA)
    for p in pts:
        cv2.circle(out, tuple(int(v) for v in p), esp * 4, (255, 255, 255), -1, cv2.LINE_AA)
        cv2.circle(out, tuple(int(v) for v in p), esp * 4, (235, 120, 30), esp, cv2.LINE_AA)
    return out


# ---------------------------------------------------------------------------
# PDF


_TAMANHOS_PT = {"a4": (595.28, 841.89), "carta": (612.0, 792.0)}


def layout_pagina(largura: int, altura: int, tamanho: str):
    """(larg_pagina, alt_pagina, x, y, w, h) em pontos."""
    if tamanho == "auto":
        k = 841.89 / max(largura, altura)
        return largura * k, altura * k, 0.0, 0.0, largura * k, altura * k
    pw, ph = _TAMANHOS_PT[tamanho]
    if largura > altura:
        pw, ph = ph, pw
    k = min(pw / largura, ph / altura)
    w, h = largura * k, altura * k
    return pw, ph, (pw - w) / 2, (ph - h) / 2, w, h


def _texto_pdf(s: str) -> bytes:
    return ("<FEFF" + "".join(f"{ord(c):04X}" for c in s) + ">").encode("ascii")


def _num(v: float) -> str:
    return f"{round(v, 2):g}"


def gerar_pdf(paginas: list[np.ndarray], titulo: str = "Documento", tamanho: str = "auto",
              qualidade: int = 88) -> bytes:
    """PDF com uma imagem JPEG por pagina, embutida sem recompressao."""
    if tamanho not in TAMANHOS_PAGINA:
        raise ValueError(f"tamanho de pagina desconhecido: {tamanho}")
    if not paginas:
        raise ValueError("nenhuma pagina")
    partes: list[bytes] = []
    offsets: dict[int, int] = {}
    tam = 0

    def put(b: bytes | str):
        nonlocal tam
        b = b.encode("latin-1") if isinstance(b, str) else b
        partes.append(b)
        tam += len(b)

    def obj(n: int):
        offsets[n] = tam
        put(f"{n} 0 obj\n")

    put(b"%PDF-1.4\n%\xe2\xe3\xcf\xd3\n")
    ids = [4 + i * 3 for i in range(len(paginas))]
    obj(1)
    put("<< /Type /Catalog /Pages 2 0 R >>\nendobj\n")
    obj(2)
    put(f"<< /Type /Pages /Kids [{' '.join(f'{i} 0 R' for i in ids)}] /Count {len(paginas)} >>\nendobj\n")
    obj(3)
    put(b"<< /Title " + _texto_pdf(titulo) + b" /Producer " + _texto_pdf("Leitor de Gabarito") +
        f" /CreationDate (D:{datetime.now():%Y%m%d%H%M%S}) >>\nendobj\n".encode())
    for img, pid in zip(paginas, ids):
        ok, jpg = cv2.imencode(".jpg", img, [cv2.IMWRITE_JPEG_QUALITY, qualidade])
        if not ok:
            raise ValueError("falha ao gerar JPEG")
        jpg = jpg.tobytes()
        h, w = img.shape[:2]
        pw, ph, x, y, iw, ih = layout_pagina(w, h, tamanho)
        conteudo = f"q {_num(iw)} 0 0 {_num(ih)} {_num(x)} {_num(y)} cm /Im0 Do Q"
        obj(pid)
        put(f"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 {_num(pw)} {_num(ph)}] "
            f"/Resources << /XObject << /Im0 {pid + 2} 0 R >> >> /Contents {pid + 1} 0 R >>\nendobj\n")
        obj(pid + 1)
        put(f"<< /Length {len(conteudo)} >>\nstream\n{conteudo}\nendstream\nendobj\n")
        obj(pid + 2)
        put(f"<< /Type /XObject /Subtype /Image /Width {w} /Height {h} /ColorSpace /DeviceRGB "
            f"/BitsPerComponent 8 /Filter /DCTDecode /Length {len(jpg)} >>\nstream\n")
        put(jpg)
        put("\nendstream\nendobj\n")
    xref = tam
    n = max(offsets) + 1
    put(f"xref\n0 {n}\n0000000000 65535 f \n" + "".join(f"{offsets[i]:010d} 00000 n \n" for i in range(1, n)))
    put(f"trailer\n<< /Size {n} /Root 1 0 R /Info 3 0 R >>\nstartxref\n{xref}\n%%EOF\n")
    return b"".join(partes)
