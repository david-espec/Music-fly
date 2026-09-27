import io

import cv2

from leitor_gabarito.gerador import Modelo, desenhar_folha, fotografar, marcar
from leitor_gabarito.web import criar_app


def test_pagina_le_foto_enviada():
    m = Modelo(questoes=10, opcoes="ABCD", colunas=2)
    foto = fotografar(marcar(desenhar_folha(m), m, {1: ["A"], 2: ["B", "D"]}), semente=1)
    ok, buf = cv2.imencode(".jpg", foto)
    cliente = criar_app().test_client()
    r = cliente.post(
        "/",
        data={"foto": (io.BytesIO(buf.tobytes()), "folha.jpg"), "gabarito": "1:A 2:B+D", "opcoes": "", "ordem": "colunas"},
        content_type="multipart/form-data",
    )
    html = r.get_data(as_text=True)
    assert r.status_code == 200
    assert "2/2" in html
    assert "duas respostas" in html
    assert "data:image/jpeg;base64," in html
