"""O PDF sai com a bolha marcada circulada de verde, onde o scanner leu."""

import base64
import io
import re

import cv2
import numpy as np
import pytest

from leitor_gabarito.cli import main
from leitor_gabarito.desenho import RAIO_CIRCULO
from leitor_gabarito.digitalizar import digitalizar, gerar_pdf
from leitor_gabarito.gerador import Modelo, desenhar_folha, fotografar, marcar
from leitor_gabarito.web import criar_app

MODELO = Modelo(questoes=20, opcoes="ABCDE", colunas=2)
RESPOSTAS = {1: ["A"], 3: ["B", "D"], 7: ["C"], 12: ["A", "E"], 18: ["D"], 20: ["B"]}
ESPERADO = {(q, a) for q, alts in RESPOSTAS.items() for a in alts}


def _foto(semente=1):
    return fotografar(marcar(desenhar_folha(MODELO), MODELO, RESPOSTAS), semente=semente)


def _mascara_verde(img: np.ndarray) -> np.ndarray:
    hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)
    return cv2.inRange(hsv, (45, 90, 40), (80, 255, 255))


def tracos_verdes(img: np.ndarray) -> np.ndarray:
    """Verde desenhado de verdade: uma abertura 3x3 apaga pixels soltos (ruido
    de JPEG em area escura pode puxar um ou outro para o verde)."""
    return cv2.morphologyEx(_mascara_verde(img), cv2.MORPH_OPEN, np.ones((3, 3), np.uint8)) > 0


def circuladas(img: np.ndarray, pag) -> set[tuple[int, str]]:
    """Alternativas com um circulo verde em volta, conferido no lugar exato de
    cada bolha lida (a `pag` diz onde fica cada bolha na imagem)."""
    verde = cv2.dilate(_mascara_verde(img), np.ones((3, 3), np.uint8)) > 0
    M = pag.transformacao
    h, w = verde.shape
    ang = np.linspace(0, 2 * np.pi, 72, endpoint=False)
    out = set()
    for q in pag.leitura.questoes:
        for b in q.bolhas:
            (cx, cy), = cv2.perspectiveTransform(np.float32([[[b.x, b.y]]]), M)[0]
            r = b.raio * RAIO_CIRCULO * M[0, 0]
            xs = np.clip(np.round(cx + r * np.cos(ang)).astype(int), 0, w - 1)
            ys = np.clip(np.round(cy + r * np.sin(ang)).astype(int), 0, h - 1)
            if verde[ys, xs].mean() > 0.8:
                out.add((q.numero, b.opcao))
    return out


def marcacao_do_aluno_visivel(img: np.ndarray, pag) -> bool:
    """O miolo das bolhas circuladas continua escuro (a tinta do aluno), nao verde."""
    cinza = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    verde = _mascara_verde(img)
    for q in pag.leitura.questoes:
        for b in q.bolhas:
            if b.marcada:
                (cx, cy), = cv2.perspectiveTransform(np.float32([[[b.x, b.y]]]), pag.transformacao)[0]
                r = max(2, int(b.raio * pag.transformacao[0, 0] * 0.4))
                x, y = int(cx), int(cy)
                if cinza[y - r : y + r, x - r : x + r].mean() > 90 or verde[y - r : y + r, x - r : x + r].any():
                    return False
    return True


def imagens_do_pdf(pdf: bytes) -> list[np.ndarray]:
    texto = pdf.decode("latin-1")
    out = []
    for m in re.finditer(r"/Subtype /Image .*?/Length (\d+) >>\nstream\n", texto):
        ini = m.end()
        out.append(cv2.imdecode(np.frombuffer(pdf[ini : ini + int(m.group(1))], np.uint8), cv2.IMREAD_COLOR))
    return out


@pytest.mark.parametrize("filtro", ["cor", "cinza", "pb", "original"])
def test_cada_bolha_marcada_sai_circulada_de_verde(filtro):
    pag = digitalizar(_foto(), filtro)
    assert pag.marcada
    assert circuladas(pag.imagem, pag) == ESPERADO


@pytest.mark.parametrize("filtro", ["cor", "pb"])
def test_marcacao_do_aluno_continua_visivel(filtro):
    pag = digitalizar(_foto(semente=3), filtro)
    assert marcacao_do_aluno_visivel(pag.imagem, pag)


def test_sem_caixas_nem_verde_fora_dos_circulos():
    pag = digitalizar(_foto(), "pb")
    verde = tracos_verdes(pag.imagem)
    # Apaga os circulos esperados; nao pode sobrar verde (retangulo de questao etc.).
    borracha = np.zeros(verde.shape, np.uint8)
    for q in pag.leitura.questoes:
        for b in q.bolhas:
            if b.marcada:
                (cx, cy), = cv2.perspectiveTransform(np.float32([[[b.x, b.y]]]), pag.transformacao)[0]
                r = b.raio * RAIO_CIRCULO * pag.transformacao[0, 0]
                cv2.circle(borracha, (int(cx), int(cy)), int(r + 8), 1, -1)
    assert not (verde & (borracha == 0)).any()


def test_sem_marcacoes_quando_desligado():
    pag = digitalizar(_foto(), "cor", marcar=False)
    assert not pag.marcada
    assert not tracos_verdes(pag.imagem).any()


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
    assert not pag.marcada
    assert not tracos_verdes(pag.imagem).any()


def test_pdf_do_scanner_leva_os_circulos():
    pags = [digitalizar(_foto(s), "pb") for s in (1, 2)]
    imagens = imagens_do_pdf(gerar_pdf([p.imagem for p in pags]))
    assert len(imagens) == 2
    for img, pag in zip(imagens, pags):
        assert circuladas(img, pag) == ESPERADO
        assert marcacao_do_aluno_visivel(img, pag)


def test_comando_ler_gera_pdf_marcado(tmp_path):
    for s in (1, 2):
        cv2.imwrite(str(tmp_path / f"aluno{s}.jpg"), _foto(s))
    saida = tmp_path / "saida"
    assert main(["ler", str(tmp_path), "--gabarito", "1:A 3:B+D 7:E", "--saida", str(saida)]) == 0
    imagens = imagens_do_pdf((saida / "gabaritos_marcados.pdf").read_bytes())
    assert len(imagens) == 2
    for img, s in zip(imagens, (1, 2)):
        # Mesma foto e mesmo filtro: a pagina de referencia diz onde fica cada bolha.
        ref = digitalizar(cv2.imread(str(tmp_path / f"aluno{s}.jpg")), "cor")
        assert circuladas(img, ref) == ESPERADO


def test_comando_digitalizar_gera_pdf_marcado(tmp_path):
    cv2.imwrite(str(tmp_path / "prova.jpg"), _foto())
    pdf = tmp_path / "prova.pdf"
    assert main(["digitalizar", str(tmp_path / "prova.jpg"), "--filtro", "pb", "--pdf", str(pdf)]) == 0
    (img,) = imagens_do_pdf(pdf.read_bytes())
    ref = digitalizar(cv2.imread(str(tmp_path / "prova.jpg")), "pb")
    assert circuladas(img, ref) == ESPERADO


def test_web_digitalizar_pdf_marcado():
    foto = _foto()
    ok, buf = cv2.imencode(".jpg", foto)
    r = criar_app().test_client().post(
        "/digitalizar",
        data={"fotos": (io.BytesIO(buf.tobytes()), "prova.jpg"), "filtro": "pb", "pagina": "a4",
              "girar": "0", "marcar": "1", "acao": "pdf"},
        content_type="multipart/form-data",
    )
    (img,) = imagens_do_pdf(r.data)
    ref = digitalizar(cv2.imdecode(buf, cv2.IMREAD_COLOR), "pb")
    assert circuladas(img, ref) == ESPERADO


def test_web_correcao_oferece_pdf_marcado():
    ok, buf = cv2.imencode(".jpg", _foto())
    r = criar_app().test_client().post(
        "/", data={"foto": (io.BytesIO(buf.tobytes()), "prova.jpg"), "gabarito": "", "opcoes": "", "ordem": "colunas"},
        content_type="multipart/form-data",
    )
    html = r.get_data(as_text=True)
    m = re.search(r'href="data:application/pdf;base64,([^"]+)"', html)
    assert m, "sem link do PDF"
    (img,) = imagens_do_pdf(base64.b64decode(m.group(1)))
    ref = digitalizar(cv2.imdecode(buf, cv2.IMREAD_COLOR), "cor")
    assert circuladas(img, ref) == ESPERADO
