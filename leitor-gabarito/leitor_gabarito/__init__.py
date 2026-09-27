"""Leitor de gabaritos por visao computacional.

Encontra a folha na foto, corrige a perspectiva, localiza as bolhas de
qualquer layout, agrupa-as em questoes e diz quais alternativas foram
marcadas — inclusive questoes com duas (ou mais) marcacoes.
"""

from .leitura import Bolha, Leitura, Questao, ler_gabarito
from .correcao import Correcao, carregar_gabarito, corrigir
from .desenho import desenhar

__all__ = [
    "Bolha",
    "Correcao",
    "Leitura",
    "Questao",
    "carregar_gabarito",
    "corrigir",
    "desenhar",
    "ler_gabarito",
]
