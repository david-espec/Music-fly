"""O PDF sai com as bolhas preenchidas marcadas em verde."""

import io
import re

import cv2
import numpy as np
import pytest

from leitor_gabarito.cli import main
from leitor_gabarito.desenho import caixas_questoes
from leitor_gabarito.digitalizar import digitalizar, gerar_pdf
from leitor_gabarito.gerador import Modelo, desenhar_folha, fotografar, marcar
from leitor_gabarito.web import criar_app

MODELO = Modelo(questoes=20, opcoes="ABCDE", colunas=2)
RESPOSTAS = {1: ["A"], 3: ["B", "D"], 7: ["C"], 12: ["A", "E"], 18: ["D"], 20: ["B"]}
N_MARCAS = sum(len(v) for v in RESPOSTAS.values())


def _foto(semente=1):
    return fotografar(marcar(desenhar_folha(MODELO), MODELO, RESPOSTAS), semente=semente)


def _mascara_verde(img: np.ndarray) -> np.ndarray:
    hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)
    return cv2.inRange(hsv, (45, 90, 40), (80, 255, 255))


def _discos(verde: np.ndarray) -> np.ndarray:
    """So as marcas cheias: uma abertura com disco apaga as linhas finas (contornos)."""
    return cv2.morphologyEx(verde, cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (11, 11)))


def manchas_verdes(img: np.ndarray) -> list[tuple[float, float]]:
    """Centros das manchas verdes cheias (as bolhas marcadas)."""
    n, _, stats, centros = cv2.connectedComponentsWithStats(_discos(_mascara_verde(img)))
    area_min = img.shape[0] * img.shape[1] * 0.00005
    return [tuple(centros[i]) for i in range(1, n) if stats[i, cv2.CC_STAT_AREA] > area_min]


def contornos_verdes(img: np.ndarray, pag) -> int:
    """Quantas questoes tem o contorno verde desenhado no lugar em que foram
    lidas: o perimetro do retangulo esperado precisa estar quase todo verde."""
    verde = cv2.dilate(_mascara_verde(img), np.ones((3, 3), np.uint8)) > 0
    ok = 0
    for x0, y0, x1, y1 in caixas_questoes(pag.leitura).values():
        (a0, b0), (a1, b1) = cv2.perspectiveTransform(
            np.float32([[[x0, y0], [x1, y1]]]), pag.transformacao)[0].round().astype(int)
        borda = np.concatenate([verde[b0, a0:a1], verde[b1, a0:a1], verde[b0:b1, a0], verde[b0:b1, a1]])
        ok += borda.mean() > 0.8
    return ok


def imagens_do_pdf(pdf: bytes) -> list[np.ndarray]:
    texto = pdf.decode("latin-1")
    out = []
    for m in re.finditer(r"/Subtype /Image .*?/Length (\d+) >>\nstream\n", texto):
        ini = m.end()
        out.append(cv2.imdecode(np.frombuffer(pdf[ini : ini + int(m.group(1))], np.uint8), cv2.IMREAD_COLOR))
    return out


@pytest.mark.parametrize("filtro", ["cor", "cinza", "pb", "original"])
def test_pagina_digitalizada_tem_uma_marca_verde_por_bolha(filtro):
    pag = digitalizar(_foto(), filtro)
    assert pag.marcada
    assert len(manchas_verdes(pag.imagem)) == N_MARCAS


def test_cada_questao_lida_ganha_contorno_verde():
    pag = digitalizar(_foto(), "pb")
    assert contornos_verdes(pag.imagem, pag) == MODELO.questoes


def test_marcas_caem_em_cima_das_bolhas_certas():
    foto = _foto(semente=3)
    pag = digitalizar(foto, "cor")
    L = pag.leitura
    h, w = pag.imagem.shape[:2]
    lh, lw = L.retificada.shape[:2]
    esperadas = [(b.x * w / lw, b.y * h / lh) for q in L.questoes for b in q.bolhas if b.marcada]
    raio = L.questoes[0].bolhas[0].raio * w / lw
    for cx, cy in manchas_verdes(pag.imagem):
        assert min(np.hypot(cx - x, cy - y) for x, y in esperadas) < raio * 0.5


def test_sem_marcacoes_quando_desligado():
    pag = digitalizar(_foto(), "cor", marcar=False)
    assert not pag.marcada
    assert manchas_verdes(pag.imagem) == []


def test_documento_comum_nao_ganha_marcas():
    frases = ["Contrato de prestacao de servicos, clausula primeira.",
              "O contratante pagara o valor mensal ate o dia 10.",
              "Fica eleito o foro da comarca de Sao Paulo.",
              "As partes assinam em duas vias de igual teor.",
              "Paragrafo unico: o atraso gera multa de 2%."]
    doc = np.full((1754, 1240, 3), 255, np.uint8)
    for i, y in enumerate(range(200, 1500, 40)):
        # Linhas repetidas e variadas: letras alinhadas por acaso nao viram questao.
        texto = frases[0] if i < 8 else frases[i % 5] + " " * (i % 3) + str(i)
        cv2.putText(doc, texto, (100 + (i * 7) % 40, y), cv2.FONT_HERSHEY_SIMPLEX, 0.9, (20, 20, 20), 2)
    pag = digitalizar(fotografar(doc, semente=2), "pb")
    assert pag.folha_encontrada
    assert manchas_verdes(pag.imagem) == []
    assert not pag.marcada  # nenhuma questao lida, nenhum contorno desenhado
    assert not _mascara_verde(pag.imagem).any()


def test_pdf_do_scanner_leva_as_marcas():
    pags = [digitalizar(_foto(s), "pb") for s in (1, 2)]
    imagens = imagens_do_pdf(gerar_pdf([p.imagem for p in pags]))
    assert len(imagens) == 2
    for img, pag in zip(imagens, pags):
        assert len(manchas_verdes(img)) == N_MARCAS
        assert contornos_verdes(img, pag) == MODELO.questoes


def test_comando_ler_gera_pdf_marcado(tmp_path):
    for s in (1, 2):
        cv2.imwrite(str(tmp_path / f"aluno{s}.jpg"), _foto(s))
    saida = tmp_path / "saida"
    assert main(["ler", str(tmp_path), "--gabarito", "1:A 3:B+D 7:E", "--saida", str(saida)]) == 0
    imagens = imagens_do_pdf((saida / "gabaritos_marcados.pdf").read_bytes())
    assert len(imagens) == 2
    assert all(len(manchas_verdes(img)) == N_MARCAS for img in imagens)


def test_comando_digitalizar_gera_pdf_marcado(tmp_path):
    cv2.imwrite(str(tmp_path / "prova.jpg"), _foto())
    pdf = tmp_path / "prova.pdf"
    assert main(["digitalizar", str(tmp_path / "prova.jpg"), "--filtro", "pb", "--pdf", str(pdf)]) == 0
    (img,) = imagens_do_pdf(pdf.read_bytes())
    assert len(manchas_verdes(img)) == N_MARCAS


def test_web_digitalizar_pdf_marcado():
    ok, buf = cv2.imencode(".jpg", _foto())
    r = criar_app().test_client().post(
        "/digitalizar",
        data={"fotos": (io.BytesIO(buf.tobytes()), "prova.jpg"), "filtro": "pb", "pagina": "a4",
              "girar": "0", "marcar": "1", "acao": "pdf"},
        content_type="multipart/form-data",
    )
    (img,) = imagens_do_pdf(r.data)
    assert len(manchas_verdes(img)) == N_MARCAS


def test_web_correcao_oferece_pdf_marcado():
    ok, buf = cv2.imencode(".jpg", _foto())
    r = criar_app().test_client().post(
        "/", data={"foto": (io.BytesIO(buf.tobytes()), "prova.jpg"), "gabarito": "", "opcoes": "", "ordem": "colunas"},
        content_type="multipart/form-data",
    )
    html = r.get_data(as_text=True)
    m = re.search(r'href="data:application/pdf;base64,([^"]+)"', html)
    assert m, "sem link do PDF"
    import base64

    (img,) = imagens_do_pdf(base64.b64decode(m.group(1)))
    assert len(manchas_verdes(img)) == N_MARCAS
