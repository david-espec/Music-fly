"""Linha de comando.

    python -m leitor_gabarito ler fotos/*.jpg --gabarito "ABCDA..." --saida resultados
    python -m leitor_gabarito digitalizar fotos/*.jpg --filtro pb --pdf contrato.pdf
    python -m leitor_gabarito gerar --questoes 30 --opcoes ABCD --colunas 3 --saida folha.png
    python -m leitor_gabarito web
"""

from __future__ import annotations

import argparse
import csv
import sys
from pathlib import Path

from .processar import EXTENSOES_IMAGEM, abrir_imagem, obter_gabarito, processar, salvar_imagem, salvar_resultado


def _fotos(entradas: list[str]) -> list[Path]:
    fotos: list[Path] = []
    for e in entradas:
        p = Path(e)
        if p.is_dir():
            fotos += sorted(f for f in p.iterdir() if f.suffix.lower() in EXTENSOES_IMAGEM)
        else:
            fotos.append(p)
    return fotos


def cmd_ler(a) -> int:
    fotos = _fotos(a.fotos)
    if not fotos:
        print("Nenhuma imagem encontrada.", file=sys.stderr)
        return 2
    gabarito = obter_gabarito(a.gabarito, a.opcoes, a.ordem) if a.gabarito else None
    if gabarito:
        print(f"Gabarito com {len(gabarito)} questoes.")
    pasta = Path(a.saida)
    linhas = []
    falhas = 0
    for foto in fotos:
        try:
            res = processar(abrir_imagem(foto), gabarito, a.opcoes, a.ordem, a.limiar, a.parcial)
        except Exception as e:  # uma foto ruim nao para o lote
            print(f"\n{foto}: ERRO — {e}", file=sys.stderr)
            falhas += 1
            continue
        arquivos = salvar_resultado(res, foto.stem, pasta, a.recortes)
        L, C = res.leitura, res.correcao
        print(f"\n{foto}  —  {len(L.questoes)} questoes, alternativas {''.join(L.opcoes)}")
        for aviso in L.avisos:
            print(f"  aviso: {aviso}")
        por_num = C.por_numero() if C else {}
        for q in L.questoes:
            marc = ",".join(q.marcadas) or "-"
            extra = ""
            r = por_num.get(q.numero)
            if r and r.situacao != "sem gabarito":
                extra = f"  gabarito {','.join(r.esperado) or '?'}  {r.situacao.upper()}"
            dupla = "  <- duas respostas" if len(q.marcadas) == 2 else ("  <- " + q.situacao if len(q.marcadas) > 2 else "")
            print(f"  {q.numero:3d}: {marc:8s}{extra}{dupla}")
        if C:
            print(f"  Acertos: {C.acertos}/{C.total}   Nota: {C.nota:g}")
        print(f"  Imagem marcada: {arquivos['marcada']}")
        linha = {"arquivo": foto.name, "questoes": len(L.questoes)}
        if C:
            linha.update(acertos=C.acertos, total=C.total, nota=round(C.nota, 3))
        linha.update({f"q{q.numero}": "".join(q.marcadas) for q in L.questoes})
        linhas.append(linha)

    if linhas:
        campos: list[str] = []
        for l in linhas:
            campos += [c for c in l if c not in campos]
        csv_path = pasta / "resultados.csv"
        with open(csv_path, "w", newline="", encoding="utf-8-sig") as f:
            w = csv.DictWriter(f, fieldnames=campos, delimiter=";")
            w.writeheader()
            w.writerows(linhas)
        print(f"\nResumo: {csv_path}")
    return 1 if falhas else 0


def cmd_digitalizar(a) -> int:
    from .digitalizar import desenhar_deteccao, digitalizar, gerar_pdf

    fotos = _fotos(a.fotos)
    if not fotos:
        print("Nenhuma imagem encontrada.", file=sys.stderr)
        return 2
    pasta = Path(a.saida)
    pasta.mkdir(parents=True, exist_ok=True)
    paginas = []
    for foto in fotos:
        img = abrir_imagem(foto)
        pag = digitalizar(img, a.filtro, a.girar)
        situacao = "folha encontrada" if pag.folha_encontrada else "folha NAO encontrada, usada a foto inteira"
        h, w = pag.imagem.shape[:2]
        print(f"{foto}: {situacao} ({w}x{h})")
        if a.imagens:
            salvar_imagem(pasta / f"{foto.stem}_digitalizado.jpg", pag.imagem)
        if a.deteccao:
            salvar_imagem(pasta / f"{foto.stem}_deteccao.jpg", desenhar_deteccao(img, pag.cantos))
        paginas.append(pag.imagem)
    nome_pdf = Path(a.pdf) if a.pdf else pasta / "documento.pdf"
    nome_pdf.parent.mkdir(parents=True, exist_ok=True)
    nome_pdf.write_bytes(gerar_pdf(paginas, titulo=nome_pdf.stem, tamanho=a.pagina))
    print(f"PDF com {len(paginas)} pagina(s): {nome_pdf}")
    return 0


def cmd_gerar(a) -> int:
    from .gerador import Modelo, desenhar_folha, fotografar, marcar

    m = Modelo(questoes=a.questoes, opcoes=a.opcoes or "ABCDE", colunas=a.colunas, forma=a.forma,
               letra_dentro=not a.sem_letras)
    folha = desenhar_folha(m)
    img = folha.imagem
    if a.exemplo:
        import numpy as np

        rng = np.random.default_rng(a.exemplo)
        resp = {}
        for q in range(1, m.questoes + 1):
            k = rng.choice([0, 1, 1, 1, 1, 2])
            if k:
                resp[q] = rng.choice(list(m.opcoes), size=k, replace=False).tolist()
        img = fotografar(marcar(folha, m, resp, semente=a.exemplo), semente=a.exemplo)
    salvar_imagem(a.saida, img)
    print(f"Folha salva em {a.saida}")
    return 0


def cmd_web(a) -> int:
    from .web import criar_app

    criar_app().run(host=a.host, port=a.porta, debug=False)
    return 0


def main(argv=None) -> int:
    p = argparse.ArgumentParser(prog="leitor_gabarito", description="Leitura de gabaritos por visao computacional.")
    sub = p.add_subparsers(dest="cmd", required=True)

    l = sub.add_parser("ler", help="le fotos de folhas de resposta")
    l.add_argument("fotos", nargs="+", help="imagens ou pastas")
    l.add_argument("--gabarito", "-g", help='respostas certas: "ABCD...", "1:A 2:B+D", arquivo .json/.csv ou foto da folha do professor')
    l.add_argument("--opcoes", "-o", help='rotulos das alternativas, ex.: ABCDE, VF (padrao: deduz da folha)')
    l.add_argument("--ordem", choices=["colunas", "linhas"], default="colunas", help="numeracao das questoes")
    l.add_argument("--limiar", type=float, help="preenchimento minimo (0-1) para contar como marcada; padrao: automatico")
    l.add_argument("--parcial", action="store_true", help="questao de duas respostas vale meio ponto por alternativa certa")
    l.add_argument("--recortes", action="store_true", help="salva uma imagem por questao")
    l.add_argument("--saida", "-s", default="saida", help="pasta de saida (padrao: saida)")
    l.set_defaults(func=cmd_ler)

    d = sub.add_parser("digitalizar", help="scanner: acha a folha, endireita, limpa e gera PDF")
    d.add_argument("fotos", nargs="+", help="imagens ou pastas; cada foto vira uma pagina, na ordem dada")
    d.add_argument("--filtro", "-f", choices=["cor", "cinza", "pb", "original"], default="cor")
    d.add_argument("--girar", type=int, default=0, choices=[0, 90, 180, 270], help="graus, sentido horario")
    d.add_argument("--pagina", choices=["auto", "a4", "carta"], default="auto", help="tamanho da pagina do PDF")
    d.add_argument("--pdf", help="arquivo PDF de saida (padrao: <saida>/documento.pdf)")
    d.add_argument("--imagens", action="store_true", help="salva tambem cada pagina como JPEG")
    d.add_argument("--deteccao", action="store_true", help="salva a foto com o contorno da folha encontrada")
    d.add_argument("--saida", "-s", default="saida")
    d.set_defaults(func=cmd_digitalizar)

    g = sub.add_parser("gerar", help="gera uma folha de respostas para imprimir (ou um exemplo preenchido)")
    g.add_argument("--questoes", type=int, default=20)
    g.add_argument("--opcoes", default="ABCDE")
    g.add_argument("--colunas", type=int, default=2)
    g.add_argument("--forma", choices=["circulo", "quadrado"], default="circulo")
    g.add_argument("--sem-letras", action="store_true", help="nao imprime a letra dentro da bolha")
    g.add_argument("--exemplo", type=int, metavar="SEMENTE", help="preenche aleatoriamente e simula uma foto")
    g.add_argument("--saida", default="folha.png")
    g.set_defaults(func=cmd_gerar)

    w = sub.add_parser("web", help="interface no navegador")
    w.add_argument("--host", default="127.0.0.1")
    w.add_argument("--porta", type=int, default=5000)
    w.set_defaults(func=cmd_web)

    a = p.parse_args(argv)
    return a.func(a)


if __name__ == "__main__":
    raise SystemExit(main())
