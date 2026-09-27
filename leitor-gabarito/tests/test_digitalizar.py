"""Scanner de documentos: folha, perspectiva, filtros e PDF."""

import io
import re

import cv2
import numpy as np
import pytest

from leitor_gabarito.digitalizar import aplicar_filtro, digitalizar, gerar_pdf, layout_pagina
from leitor_gabarito.gerador import Modelo, desenhar_folha, fotografar
from leitor_gabarito.web import criar_app


def _pagina():
    return desenhar_folha(Modelo(questoes=10, colunas=1)).imagem


def test_acha_a_folha_e_recupera_a_proporcao():
    pag = digitalizar(fotografar(_pagina(), semente=4), filtro="original")
    assert pag.folha_encontrada
    h, w = pag.imagem.shape[:2]
    # A folha sintetica e A4 (1240x1754). A proporcao sai do comprimento dos
    # lados, sem conhecer a camera, entao e aproximada; e a foto simulada ja
    # estica a folha ~1,3% na vertical.
    assert abs(h / w - 1754 / 1240) / (1754 / 1240) < 0.06


def test_recorte_nao_traz_a_mesa():
    pag = digitalizar(fotografar(_pagina(), semente=2, fundo=(20, 25, 30)), filtro="cor")
    borda = np.concatenate([pag.imagem[:3].reshape(-1, 3), pag.imagem[-3:].reshape(-1, 3),
                            pag.imagem[:, :3].reshape(-1, 3), pag.imagem[:, -3:].reshape(-1, 3)])
    # Quase toda a borda da pagina e papel branco, nao a mesa escura.
    assert (borda.mean(axis=1) > 200).mean() > 0.97


@pytest.mark.parametrize("filtro", ["cor", "cinza", "pb"])
def test_filtros_tiram_a_sombra(filtro):
    h, w = 300, 300
    img = np.zeros((h, w, 3), np.uint8)
    papel = np.linspace(110, 230, w)[None, :, None]  # sombra forte a esquerda
    img[:] = papel.astype(np.uint8)
    img[::20, :, :] = (papel[0] * 0.25).astype(np.uint8)  # linhas de texto
    img[1::20, :, :] = (papel[0] * 0.25).astype(np.uint8)
    out = cv2.cvtColor(aplicar_filtro(img, filtro), cv2.COLOR_BGR2GRAY)
    assert out[10, 10] > 235 and out[10, 290] > 235  # papel branco dos dois lados
    assert out[0, 10] < 60 and out[0, 290] < 60  # texto escuro dos dois lados


def test_pdf_valido_com_uma_pagina_por_imagem():
    pags = [np.full((140, 100, 3), 255, np.uint8), np.full((100, 140, 3), 200, np.uint8)]
    pdf = gerar_pdf(pags, titulo="Contrato — São Paulo", tamanho="a4")
    texto = pdf.decode("latin-1")
    assert texto.startswith("%PDF-1.4") and texto.rstrip().endswith("%%EOF")
    assert "/Count 2" in texto
    xref = int(re.search(r"startxref\n(\d+)", texto).group(1))
    assert texto[xref:].startswith("xref")
    offsets = [int(m) for m in re.findall(r"^(\d{10}) 00000 n $", texto[xref:], re.M)]
    for i, off in enumerate(offsets, start=1):
        assert texto[off:].startswith(f"{i} 0 obj")
    # A imagem embutida decodifica de volta.
    ini = texto.index("stream\n", texto.index("/Subtype /Image")) + 7
    fim = texto.index("\nendstream", ini)
    assert cv2.imdecode(np.frombuffer(pdf[ini:fim], np.uint8), cv2.IMREAD_COLOR).shape == (140, 100, 3)


def test_layout_a4_deitado_para_imagem_deitada():
    pw, ph, *_ = layout_pagina(200, 100, "a4")
    assert pw > ph


def test_web_gera_pdf():
    ok, buf = cv2.imencode(".jpg", fotografar(_pagina(), semente=1))
    r = criar_app().test_client().post(
        "/digitalizar",
        data={"fotos": [(io.BytesIO(buf.tobytes()), "a.jpg"), (io.BytesIO(buf.tobytes()), "b.jpg")],
              "filtro": "pb", "pagina": "a4", "girar": "0", "nome": "prova", "acao": "pdf"},
        content_type="multipart/form-data",
    )
    assert r.status_code == 200
    assert r.mimetype == "application/pdf"
    assert b"/Count 2" in r.data


def test_web_previa_mostra_folha_identificada():
    ok, buf = cv2.imencode(".jpg", fotografar(_pagina(), semente=1))
    r = criar_app().test_client().post(
        "/digitalizar",
        data={"fotos": (io.BytesIO(buf.tobytes()), "a.jpg"), "filtro": "cor", "pagina": "auto", "girar": "0", "acao": "previa"},
        content_type="multipart/form-data",
    )
    html = r.get_data(as_text=True)
    assert "folha encontrada" in html
    assert html.count("data:image/jpeg;base64,") == 2
