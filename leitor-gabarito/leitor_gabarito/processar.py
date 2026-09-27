"""Fluxo completo para uma foto: ler, corrigir, desenhar, salvar."""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path

import cv2
import numpy as np

from .correcao import Correcao, Gabarito, carregar_gabarito, corrigir, gabarito_da_leitura
from .desenho import desenhar, recortes_questoes
from .leitura import Leitura, ler_gabarito

EXTENSOES_IMAGEM = {".jpg", ".jpeg", ".png", ".bmp", ".tif", ".tiff", ".webp"}


def abrir_imagem(caminho: str | Path) -> np.ndarray:
    # imdecode aceita caminho com acento no Windows; imread nao.
    dados = np.fromfile(str(caminho), dtype=np.uint8)
    img = cv2.imdecode(dados, cv2.IMREAD_COLOR)
    if img is None:
        raise ValueError(f"Nao consegui abrir a imagem: {caminho}")
    return img


def salvar_imagem(caminho: str | Path, img: np.ndarray) -> None:
    ext = Path(caminho).suffix or ".jpg"
    ok, dados = cv2.imencode(ext, img, [cv2.IMWRITE_JPEG_QUALITY, 90] if ext.lower() in (".jpg", ".jpeg") else [])
    if not ok:
        raise ValueError(f"Nao consegui salvar {caminho}")
    dados.tofile(str(caminho))


def obter_gabarito(fonte, opcoes=None, ordem="colunas") -> Gabarito:
    """Texto, arquivo .json/.txt/.csv ou FOTO da folha preenchida pelo professor."""
    if isinstance(fonte, (str, Path)) and Path(str(fonte)).suffix.lower() in EXTENSOES_IMAGEM and Path(str(fonte)).exists():
        leitura = ler_gabarito(abrir_imagem(fonte), opcoes=opcoes, ordem=ordem)
        return gabarito_da_leitura(leitura)
    return carregar_gabarito(fonte)


@dataclass
class Resultado:
    leitura: Leitura
    correcao: Correcao | None
    marcada: np.ndarray  # foto original com as marcacoes
    retificada: np.ndarray  # folha endireitada com as marcacoes

    def to_dict(self):
        d = self.leitura.to_dict()
        if self.correcao:
            d["correcao"] = self.correcao.to_dict()
        return d


def processar(img: np.ndarray, gabarito: Gabarito | None = None, opcoes=None, ordem="colunas",
              limiar=None, parcial=False) -> Resultado:
    leitura = ler_gabarito(img, opcoes=opcoes, ordem=ordem, limiar=limiar)
    correcao = corrigir(leitura, gabarito, parcial=parcial) if gabarito else None
    return Resultado(
        leitura,
        correcao,
        desenhar(leitura, correcao, na_foto=img),
        desenhar(leitura, correcao),
    )


def salvar_resultado(res: Resultado, nome: str, pasta: Path, recortes: bool = False) -> dict[str, Path]:
    pasta.mkdir(parents=True, exist_ok=True)
    arquivos = {
        "marcada": pasta / f"{nome}_marcado.jpg",
        "retificada": pasta / f"{nome}_retificado.jpg",
        "json": pasta / f"{nome}.json",
    }
    salvar_imagem(arquivos["marcada"], res.marcada)
    salvar_imagem(arquivos["retificada"], res.retificada)
    arquivos["json"].write_text(json.dumps(res.to_dict(), ensure_ascii=False, indent=2), encoding="utf-8")
    if recortes:
        pasta_q = pasta / f"{nome}_questoes"
        pasta_q.mkdir(exist_ok=True)
        for n, img in recortes_questoes(res.leitura, res.retificada).items():
            salvar_imagem(pasta_q / f"questao_{n:03d}.png", img)
        arquivos["recortes"] = pasta_q
    return arquivos
