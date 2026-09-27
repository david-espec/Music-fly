"""Leitura de gabaritos de varios tipos, com fotos simuladas."""

import numpy as np
import pytest

from leitor_gabarito import carregar_gabarito, corrigir, desenhar, ler_gabarito
from leitor_gabarito.correcao import gabarito_da_leitura
from leitor_gabarito.gerador import Modelo, desenhar_folha, fotografar, marcar


def respostas_aleatorias(m: Modelo, semente: int, duplas: float = 0.15, brancas: float = 0.1):
    """Uma resposta por questao, algumas com duas, algumas em branco."""
    rng = np.random.default_rng(semente)
    out = {}
    for q in range(1, m.questoes + 1):
        sorte = rng.random()
        if sorte < brancas:
            continue
        k = 2 if sorte < brancas + duplas else 1
        out[q] = sorted(rng.choice(list(m.opcoes), size=k, replace=False).tolist())
    return out


TIPOS = {
    "ABCDE-2col-circulo-caneta": (Modelo(), "cheia", {}),
    "ABCD-3col-quadrado-lapis-sem-moldura": (
        Modelo(questoes=30, opcoes="ABCD", colunas=3, forma="quadrado", letra_dentro=False, moldura=False,
               marcadores_canto=True),
        "lapis",
        {},
    ),
    "VF-1col-X": (Modelo(questoes=15, opcoes="VF", colunas=1, raio=18), "x", {}),
    "ABCDE-5col-50q-bolha-pequena-rabisco": (
        Modelo(questoes=50, opcoes="ABCDE", colunas=5, raio=12, espacamento=2.4), "rabisco", {}
    ),
    "ABC-4col-foto-torta-escura": (
        Modelo(questoes=40, opcoes="ABC", colunas=4, raio=15),
        "cheia",
        dict(inclinacao=0.16, sombra=0.55, ruido=9, desfoque=5, fundo=(40, 45, 50)),
    ),
}


@pytest.mark.parametrize("nome", list(TIPOS))
@pytest.mark.parametrize("semente", [1, 2, 3])
def test_le_cada_tipo_de_gabarito(nome, semente):
    m, estilo, foto_kw = TIPOS[nome]
    folha = desenhar_folha(m)
    esperado = respostas_aleatorias(m, semente)
    foto = fotografar(marcar(folha, m, esperado, estilo, semente), semente=semente, **foto_kw)

    leitura = ler_gabarito(foto, opcoes=m.opcoes)

    assert leitura.folha_encontrada
    assert len(leitura.questoes) == m.questoes
    lido = {q.numero: set(q.marcadas) for q in leitura.questoes if q.marcadas}
    assert lido == {n: set(a) for n, a in esperado.items()}
    # Questoes com duas respostas sao identificadas como tal.
    duplas = {n for n, a in esperado.items() if len(a) == 2}
    assert {q.numero for q in leitura.questoes if q.situacao == "duas respostas"} == duplas


def test_deduz_numero_de_alternativas_sem_informar():
    m = Modelo(questoes=12, opcoes="ABCD", colunas=2)
    esperado = {1: ["A"], 4: ["B", "C"], 12: ["D"]}
    foto = fotografar(marcar(desenhar_folha(m), m, esperado), semente=5)
    leitura = ler_gabarito(foto)
    assert leitura.opcoes == list("ABCD")
    assert {q.numero: q.marcadas for q in leitura.questoes if q.marcadas} == esperado


def test_imagem_escaneada_sem_fundo():
    m = Modelo(questoes=10, colunas=1, moldura=False)
    esperado = {2: ["B"], 7: ["A", "E"]}
    scan = marcar(desenhar_folha(m), m, esperado)
    leitura = ler_gabarito(scan)
    assert len(leitura.questoes) == 10
    assert {q.numero: q.marcadas for q in leitura.questoes if q.marcadas} == esperado


def test_ordem_por_linhas():
    m = Modelo(questoes=6, opcoes="ABCD", colunas=2)
    # Por colunas: 1,2,3 na esquerda; 4,5,6 na direita. Por linhas, a 4 vira a 2.
    foto = fotografar(marcar(desenhar_folha(m), m, {4: ["C"]}), semente=2)
    leitura = ler_gabarito(foto, ordem="linhas")
    assert {q.numero: q.marcadas for q in leitura.questoes if q.marcadas} == {2: ["C"]}


def test_folha_em_branco_nao_inventa_marcacao():
    m = Modelo(questoes=20)
    leitura = ler_gabarito(fotografar(desenhar_folha(m).imagem, semente=3))
    assert len(leitura.questoes) == 20
    assert not any(q.marcadas for q in leitura.questoes)


def test_correcao_com_questoes_de_duas_respostas():
    m = Modelo(questoes=5, opcoes="ABCDE", colunas=1)
    marcado = {1: ["A"], 2: ["B", "D"], 3: ["C"], 4: ["B"]}
    leitura = ler_gabarito(fotografar(marcar(desenhar_folha(m), m, marcado), semente=4))
    gab = carregar_gabarito("1:A 2:B+D 3:E 4:BD 5:C")
    c = corrigir(leitura, gab)
    sit = {q.numero: q.situacao for q in c.questoes}
    assert sit == {1: "certa", 2: "certa", 3: "errada", 4: "errada", 5: "em branco"}
    assert c.acertos == 2
    parcial = corrigir(leitura, gab, parcial=True)
    assert parcial.por_numero()[4].pontos == 0.5
    img = desenhar(leitura, c)
    assert img.shape == leitura.retificada.shape


def test_gabarito_a_partir_da_folha_do_professor():
    m = Modelo(questoes=8, opcoes="ABCD", colunas=2)
    oficial = {i: [m.opcoes[i % 4]] for i in range(1, 9)}
    oficial[3] = ["A", "C"]
    leitura_prof = ler_gabarito(fotografar(marcar(desenhar_folha(m), m, oficial), semente=6))
    gab = gabarito_da_leitura(leitura_prof)
    assert gab == {k: set(v) for k, v in oficial.items()}


@pytest.mark.parametrize(
    "fonte,esperado",
    [
        ("ABCDE", {1: {"A"}, 2: {"B"}, 3: {"C"}, 4: {"D"}, 5: {"E"}}),
        ("1:A, 2:B+D, 3=c", {1: {"A"}, 2: {"B", "D"}, 3: {"C"}}),
        ({"1": "a", "2": ["b", "e"]}, {1: {"A"}, 2: {"B", "E"}}),
        (["V", "F", "VF"], {1: {"V"}, 2: {"F"}, 3: {"V", "F"}}),
    ],
)
def test_formatos_de_gabarito(fonte, esperado):
    assert carregar_gabarito(fonte) == esperado
