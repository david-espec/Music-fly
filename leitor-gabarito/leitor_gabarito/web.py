"""Interface web: envia a foto, ve as respostas marcadas em verde.

    python -m leitor_gabarito web          # http://127.0.0.1:5000

Nada e gravado em disco: a foto e processada na memoria e devolvida na pagina.
"""

from __future__ import annotations

import base64
from html import escape

import cv2
import numpy as np
from flask import Flask, request, send_file

from .processar import obter_gabarito, processar

PAGINA = """<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Leitor de Gabarito</title>
<style>
:root{{--bg:#f5f6f8;--fg:#15171c;--muted:#5f6675;--card:#fff;--line:#dde0e6;--ok:#1f9d3a;--err:#d23b3b;--warn:#e08a00;--acc:#2563eb}}
@media (prefers-color-scheme:dark){{:root{{--bg:#0f1115;--fg:#eceef2;--muted:#9aa1ae;--card:#191c22;--line:#2b2f38}}}}
*{{box-sizing:border-box}} body{{margin:0;font:16px/1.5 system-ui,sans-serif;background:var(--bg);color:var(--fg)}}
main{{max-width:1100px;margin:0 auto;padding:20px 16px 60px}} h1{{font-size:1.5rem;margin:0 0 4px}}
.muted{{color:var(--muted)}} form,.card{{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:18px;margin:16px 0}}
label{{display:block;font-weight:600;margin:12px 0 4px}} input[type=text],select{{width:100%;padding:10px;border:1px solid var(--line);border-radius:10px;background:var(--bg);color:var(--fg);font:inherit}}
.row{{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px}}
button{{margin-top:16px;padding:12px 22px;border:0;border-radius:10px;background:var(--acc);color:#fff;font:inherit;font-weight:700;cursor:pointer}}
.res{{display:grid;grid-template-columns:minmax(0,3fr) minmax(260px,2fr);gap:16px}} @media (max-width:760px){{.res{{grid-template-columns:1fr}}}}
img{{max-width:100%;border-radius:10px;display:block}} table{{width:100%;border-collapse:collapse;font-variant-numeric:tabular-nums}}
td,th{{padding:5px 8px;border-bottom:1px solid var(--line);text-align:left}} .certa{{color:var(--ok);font-weight:700}} .errada{{color:var(--err);font-weight:700}}
.dupla{{color:var(--warn);font-weight:700}} .big{{font-size:2rem;font-weight:800}} .aviso{{color:var(--warn)}}
.tabs a{{margin-right:14px}} a.botao{{display:inline-block;padding:10px 18px;border-radius:10px;background:var(--ok);color:#fff;font-weight:700;text-decoration:none}}
label.check{{display:flex;gap:8px;align-items:center;font-weight:600}}
</style></head><body><main>
<nav class="tabs"><b>Corrigir gabarito</b> · <a href="/digitalizar">Digitalizar documento</a></nav>
<h1>Leitor de Gabarito</h1>
<p class="muted">Envie a foto da folha de respostas. As alternativas marcadas aparecem em <b style="color:var(--ok)">verde</b>;
questões com duas respostas ficam destacadas em laranja.</p>
<form method="post" enctype="multipart/form-data">
  <label>Foto da folha</label><input type="file" name="foto" accept="image/*" capture="environment" required>
  <div class="row">
    <div><label>Gabarito (opcional)</label><input type="text" name="gabarito" value="{gabarito}" placeholder="ABCDA… ou 1:A 2:B+D"></div>
    <div><label>Alternativas (opcional)</label><input type="text" name="opcoes" value="{opcoes}" placeholder="deduz da folha: ABCDE, VF…"></div>
    <div><label>Numeração</label><select name="ordem">
      <option value="colunas"{sel_col}>por coluna (de cima para baixo)</option>
      <option value="linhas"{sel_lin}>por linha (da esquerda para a direita)</option></select></div>
  </div>
  <label>Foto do gabarito do professor (opcional, em vez do texto)</label><input type="file" name="foto_gabarito" accept="image/*">
  <button>Ler folha</button>
</form>
{resultado}
</main></body></html>"""


def _b64(img: np.ndarray) -> str:
    ok, buf = cv2.imencode(".jpg", img, [cv2.IMWRITE_JPEG_QUALITY, 85])
    return base64.b64encode(buf.tobytes()).decode()


def _ler_upload(arquivo) -> np.ndarray | None:
    if not arquivo or not arquivo.filename:
        return None
    dados = np.frombuffer(arquivo.read(), np.uint8)
    img = cv2.imdecode(dados, cv2.IMREAD_COLOR)
    if img is None:
        raise ValueError("Arquivo enviado não é uma imagem.")
    # Fotos enormes nao melhoram a leitura e deixam tudo lento.
    k = 2400 / max(img.shape[:2])
    return cv2.resize(img, None, fx=k, fy=k, interpolation=cv2.INTER_AREA) if k < 1 else img


def _html_resultado(res) -> str:
    L, C = res.leitura, res.correcao
    if not L.questoes:
        return '<div class="card"><b>Nenhuma questão encontrada.</b> ' + "".join(
            f'<p class="aviso">{escape(a)}</p>' for a in L.avisos) + "</div>"
    por_num = C.por_numero() if C else {}
    linhas = []
    for q in L.questoes:
        r = por_num.get(q.numero)
        classe = "dupla" if len(q.marcadas) >= 2 else ""
        cel_gab = ""
        if C:
            sit = r.situacao if r else "sem gabarito"
            cls = {"certa": "certa", "errada": "errada", "parcial": "dupla"}.get(sit, "muted")
            cel_gab = f"<td>{escape(','.join(r.esperado) if r else '')}</td><td class='{cls}'>{sit}</td>"
        linhas.append(f"<tr><td>{q.numero}</td><td class='{classe}'>{escape(','.join(q.marcadas) or '—')}</td>"
                      f"<td class='{classe or 'muted'}'>{q.situacao}</td>{cel_gab}</tr>")
    cab = "<th>Q</th><th>Marcada</th><th>Situação</th>" + ("<th>Gabarito</th><th>Resultado</th>" if C else "")
    from .digitalizar import gerar_pdf

    pdf = base64.b64encode(gerar_pdf([res.pagina], titulo="gabarito_marcado")).decode()
    botao_pdf = (f'<p><a class="botao" download="gabarito_marcado.pdf" '
                 f'href="data:application/pdf;base64,{pdf}">Baixar PDF com as marcações</a></p>')
    placar = ""
    if C:
        placar = f'<p><span class="big">{C.acertos}/{C.total}</span> acertos · nota {C.nota:g}</p>'
    duplas = sum(len(q.marcadas) == 2 for q in L.questoes)
    avisos = "".join(f'<p class="aviso">{escape(a)}</p>' for a in L.avisos)
    return f"""<div class="card res">
<div><p class="tabs"><a href="#foto">Foto original</a><a href="#ret">Folha endireitada</a></p>
<img id="foto" src="data:image/jpeg;base64,{_b64(res.marcada)}" alt="Foto com as respostas marcadas em verde">
<h3 id="ret">Folha endireitada</h3><img src="data:image/jpeg;base64,{_b64(res.retificada)}" alt="Folha endireitada com as marcações"></div>
<div>{placar}{botao_pdf}<p>{len(L.questoes)} questões · alternativas {escape(''.join(L.opcoes))} · {duplas} com duas respostas</p>{avisos}
<table><thead><tr>{cab}</tr></thead><tbody>{''.join(linhas)}</tbody></table></div></div>"""


def criar_app() -> Flask:
    app = Flask(__name__)
    app.config["MAX_CONTENT_LENGTH"] = 25 * 1024 * 1024

    @app.route("/", methods=["GET", "POST"])
    def index():
        form = request.form
        ctx = dict(
            gabarito=escape(form.get("gabarito", "")),
            opcoes=escape(form.get("opcoes", "")),
            sel_col="" if form.get("ordem") == "linhas" else " selected",
            sel_lin=" selected" if form.get("ordem") == "linhas" else "",
            resultado="",
        )
        if request.method == "POST":
            try:
                img = _ler_upload(request.files.get("foto"))
                if img is None:
                    raise ValueError("Envie a foto da folha.")
                opcoes = form.get("opcoes", "").strip().upper() or None
                ordem = form.get("ordem", "colunas")
                gabarito = None
                foto_gab = _ler_upload(request.files.get("foto_gabarito"))
                if foto_gab is not None:
                    from .correcao import gabarito_da_leitura
                    from .leitura import ler_gabarito

                    gabarito = gabarito_da_leitura(ler_gabarito(foto_gab, opcoes=opcoes, ordem=ordem))
                elif form.get("gabarito", "").strip():
                    gabarito = obter_gabarito(form["gabarito"].strip())
                ctx["resultado"] = _html_resultado(processar(img, gabarito, opcoes, ordem))
            except Exception as e:
                ctx["resultado"] = f'<div class="card"><b>Erro:</b> {escape(str(e))}</div>'
        return PAGINA.format(**ctx)

    @app.route("/digitalizar", methods=["GET", "POST"])
    def pagina_digitalizar():
        from io import BytesIO

        from .digitalizar import desenhar_deteccao, digitalizar, gerar_pdf

        erro = ""
        previa = ""
        if request.method == "POST":
            try:
                filtro = request.form.get("filtro", "cor")
                tamanho = request.form.get("pagina", "auto")
                fotos = [f for f in request.files.getlist("fotos") if f and f.filename]
                if not fotos:
                    raise ValueError("Envie ao menos uma foto.")
                gabarito = obter_gabarito(request.form["gabarito"].strip()) if request.form.get("gabarito", "").strip() else None
                paginas, deteccoes = [], []
                for f in fotos:
                    img = _ler_upload(f)
                    pag = digitalizar(img, filtro, int(request.form.get("girar", 0)),
                                      marcar=request.form.get("marcar") == "1", gabarito=gabarito)
                    paginas.append(pag.imagem)
                    deteccoes.append((f.filename, pag, desenhar_deteccao(img, pag.cantos)))
                nome = (request.form.get("nome") or "documento").strip() or "documento"
                pdf = gerar_pdf(paginas, titulo=nome, tamanho=tamanho)
                if request.form.get("acao") == "pdf":
                    return send_file(BytesIO(pdf), mimetype="application/pdf", as_attachment=True,
                                     download_name=f"{nome}.pdf")
                previa = "".join(
                    f'<div class="card res"><div><h3>{escape(n)} — '
                    f'{"folha encontrada" if p.folha_encontrada else "folha não encontrada (foto inteira)"}'
                    f'{f" · {len(p.leitura.questoes)} questões marcadas em verde" if p.marcada else ""}</h3>'
                    f'<img src="data:image/jpeg;base64,{_b64(d)}" alt="Folha identificada na foto"></div>'
                    f'<div><h3>Página</h3><img src="data:image/jpeg;base64,{_b64(p.imagem)}" alt="Página digitalizada"></div></div>'
                    for n, p, d in deteccoes)
            except Exception as e:
                erro = f'<div class="card"><b>Erro:</b> {escape(str(e))}</div>'
        f = request.form
        sel = lambda campo, v, padrao: " selected" if f.get(campo, padrao) == v else ""  # noqa: E731
        # Marcacao ligada por padrao; no POST vale o que veio no formulario.
        marcar_checked = " checked" if request.method == "GET" or f.get("marcar") == "1" else ""
        form = f"""<form method="post" enctype="multipart/form-data">
  <label>Fotos (cada uma vira uma página, na ordem escolhida)</label>
  <input type="file" name="fotos" accept="image/*" multiple required>
  <div class="row">
    <div><label>Nome do documento</label><input type="text" name="nome" value="{escape(f.get('nome', 'documento'))}"></div>
    <div><label>Filtro</label><select name="filtro">
      <option value="cor"{sel('filtro', 'cor', 'cor')}>Cor (papel branco)</option>
      <option value="cinza"{sel('filtro', 'cinza', 'cor')}>Cinza</option>
      <option value="pb"{sel('filtro', 'pb', 'cor')}>Preto e branco</option>
      <option value="original"{sel('filtro', 'original', 'cor')}>Original</option></select></div>
    <div><label>Página do PDF</label><select name="pagina">
      <option value="auto"{sel('pagina', 'auto', 'auto')}>Automático</option>
      <option value="a4"{sel('pagina', 'a4', 'auto')}>A4</option>
      <option value="carta"{sel('pagina', 'carta', 'auto')}>Carta</option></select></div>
    <div><label>Girar</label><select name="girar">
      <option value="0">Não</option><option value="90">90° horário</option>
      <option value="180">180°</option><option value="270">90° anti-horário</option></select></div>
  </div>
  <div class="row">
    <div><label>Gabarito (opcional, para corrigir na página)</label>
      <input type="text" name="gabarito" value="{escape(f.get('gabarito', ''))}" placeholder="ABCDA… ou 1:A 2:B+D"></div>
    <div><label>&nbsp;</label><label class="check"><input type="checkbox" name="marcar" value="1"{marcar_checked}>
      Marcar em verde as bolhas preenchidas</label></div>
  </div>
  <button name="acao" value="previa">Ver prévia</button> <button name="acao" value="pdf">Baixar PDF</button>
</form>"""
        corpo = f"""<nav class="tabs"><a href="/">Corrigir gabarito</a> · <b>Digitalizar documento</b></nav>
<h1>Digitalizar documento</h1>
<p class="muted">A folha é encontrada na foto, a perspectiva é corrigida, a sombra some e as páginas viram um PDF.</p>
{form}{erro}{previa}"""
        cabeca = PAGINA.split("<main>")[0]
        return f"{cabeca}<main>{corpo}</main></body></html>".replace("{{", "{").replace("}}", "}")

    return app
