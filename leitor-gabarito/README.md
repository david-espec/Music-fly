# Leitor de Gabarito

Lê fotos de folhas de resposta (cartão-resposta / gabarito) com visão
computacional (OpenCV), identifica cada questão e as alternativas marcadas e
devolve a imagem com as respostas pintadas de **verde**.

- Funciona com **diferentes tipos de gabarito** sem configurar o layout:
  quantidade de questões, de alternativas (A–E, A–D, A–C, V/F…) e de colunas,
  bolha redonda ou quadrada, com ou sem letra dentro, com ou sem moldura.
- Identifica **cada questão individualmente** e diz se ela está em branco,
  com uma resposta ou com **duas respostas** (ou mais). As de duas respostas
  ficam destacadas com uma caixa laranja e o rótulo `2x`.
- Corrige contra um gabarito oficial, inclusive com questões que têm **duas
  alternativas corretas**. O gabarito pode ser texto, arquivo ou a **foto da
  folha preenchida pelo professor**.
- Aceita foto de celular torta, com sombra e fundo de mesa, e também imagem
  escaneada.

## Instalação

Python 3.10 ou mais novo.

```bash
cd leitor-gabarito
python -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate
pip install -r requirements.txt
```

## Uso

### Linha de comando

```bash
# Só ler (sem corrigir)
python -m leitor_gabarito ler foto.jpg

# Ler e corrigir; aceita várias fotos ou uma pasta inteira
python -m leitor_gabarito ler fotos/ --gabarito "ABCDA BCDEA ..." --saida resultados

# Gabarito com questões de duas respostas
python -m leitor_gabarito ler foto.jpg --gabarito "1:A 2:B+D 3:C 4:A+E"

# Gabarito a partir da folha do professor
python -m leitor_gabarito ler alunos/ --gabarito professor.jpg

# Folha de Verdadeiro/Falso
python -m leitor_gabarito ler vf.jpg --opcoes VF
```

Para cada foto, na pasta de saída:

| Arquivo | Conteúdo |
|---|---|
| `<foto>_marcado.jpg` | a foto original com as alternativas marcadas em verde |
| `<foto>_retificado.jpg` | a folha endireitada, com as mesmas marcações |
| `<foto>.json` | questões, alternativas marcadas, situação e preenchimento de cada bolha |
| `<foto>_questoes/` | uma imagem por questão (com `--recortes`) |
| `resultados.csv` | uma linha por foto: acertos, nota e resposta de cada questão |

Opções úteis:

| Opção | Para quê |
|---|---|
| `--opcoes ABCD` | rótulos das alternativas. Sem ela, o número é deduzido da folha e os rótulos são A, B, C… |
| `--ordem linhas` | numeração da esquerda para a direita, linha a linha. O padrão (`colunas`) é de cima para baixo, coluna por coluna |
| `--parcial` | questão de duas respostas vale meio ponto por alternativa certa (sem nenhuma errada marcada) |
| `--limiar 0.5` | fixa o preenchimento mínimo para contar como marcada. O padrão é calculado por folha |

### Interface web

```bash
python -m leitor_gabarito web       # abre em http://127.0.0.1:5000
```

Envie a foto (no celular, o botão abre a câmera), opcionalmente o gabarito em
texto ou a foto da folha do professor, e veja a imagem marcada e a tabela de
resultados. Nada é gravado em disco. Para acessar do celular na mesma rede,
use `--host 0.0.0.0`.

### Como biblioteca

```python
import cv2
from leitor_gabarito import ler_gabarito, carregar_gabarito, corrigir, desenhar

foto = cv2.imread("foto.jpg")
leitura = ler_gabarito(foto)                      # ou opcoes="VF", ordem="linhas"
for q in leitura.questoes:
    print(q.numero, q.marcadas, q.situacao)       # 3 ['B', 'D'] duas respostas

correcao = corrigir(leitura, carregar_gabarito("1:A 2:C 3:B+D"))
cv2.imwrite("marcada.jpg", desenhar(leitura, correcao, na_foto=foto))
```

### Gerar folhas

```bash
# Folha em branco para imprimir
python -m leitor_gabarito gerar --questoes 40 --opcoes ABCD --colunas 4 --saida folha.png
# Exemplo preenchido e "fotografado", para testar
python -m leitor_gabarito gerar --questoes 20 --exemplo 7 --saida exemplo.jpg
```

## Formatos de gabarito

| Formato | Exemplo |
|---|---|
| Letras em sequência | `ABCDEABCDE` (espaços são ignorados) |
| Número e resposta | `1:A 2:B+D 3=C` — `+` ou `/` separam duas respostas; `BD` também vale |
| JSON | `{"1": "A", "2": ["B", "D"]}` ou `["A", "BD", "C"]` |
| CSV / TXT | linhas `1;A`, `2;BD` |
| Imagem | foto da folha preenchida pelo professor |

Uma questão está **certa** quando as alternativas marcadas são exatamente as
do gabarito. Se o aluno marcou duas numa questão de uma resposta, está errada.

## Como funciona

Tudo em `leitor_gabarito/`:

1. **Folha** (`folha.py`): acha o contorno da folha (papel claro sobre a mesa,
   ou pelas bordas), corrige a perspectiva para uma largura fixa e remove
   sombra e degradê dividindo a imagem pela iluminação estimada do papel.
2. **Bolhas** (`leitura.py`), em duas passadas:
   - contornos fechados, quase quadrados e cheios (círculo ou quadrado);
   - para as que escaparam — bolhas encostadas umas nas outras, letra tocando
     o anel, marcação em X —, os furos do tamanho de uma bolha são
     preenchidos e a imagem é erodida: texto, linhas e moldura somem, e as
     bolhas se separam.

   O tamanho das bolhas é o **maior tamanho que se repete bastante** na folha
   (não o mais frequente: um X dentro da bolha cria quatro furinhos iguais).
3. **Grade**: bolhas alinhadas na vertical ao longo de várias linhas formam as
   colunas de alternativas; colunas próximas formam um bloco; um vão maior
   separa um bloco do seguinte. O tamanho do bloco é o número de alternativas,
   e cada linha de um bloco é uma questão. Uma bolha não achada tem a posição
   deduzida pela grade, e uma questão inteira sem nenhuma bolha achada é
   deduzida pelo espaçamento regular das linhas, para a numeração não
   escorregar.
4. **Marcação**: fração de tinta no miolo de cada bolha (o contorno impresso
   fica de fora). O corte entre marcada e vazia é calculado por folha, no meio
   do vão entre os dois grupos, então caneta, lápis, X e rabisco funcionam sem
   ajuste. Bolhas perto do corte aparecem como "duvidosas" nos avisos.
5. **Desenho** (`desenho.py`): as marcadas ganham um círculo verde, desenhado
   na folha endireitada e também levado de volta para a foto original, no
   lugar certo apesar da perspectiva. Com gabarito, o número da questão fica
   verde (certa), vermelho (errada) ou cinza (em branco), e a alternativa
   correta que faltou é contornada em laranja.

## Testes

```bash
pip install pytest
python -m pytest
```

Os testes geram folhas sintéticas de vários tipos, preenchem com respostas
aleatórias (inclusive questões com duas respostas e em branco), simulam a foto
de celular (perspectiva, sombra, ruído, desfoque, fundo) e conferem a leitura
questão por questão:

| Tipo | Detalhes |
|---|---|
| A–E, 20 questões, 2 colunas | círculo com letra dentro, caneta |
| A–D, 30 questões, 3 colunas | quadrado sem letra, sem moldura, marcadores de canto, lápis |
| V/F, 15 questões, 1 coluna | marcação em X |
| A–E, 50 questões, 5 colunas | bolhas pequenas e encostadas, preenchimento em rabisco |
| A–C, 40 questões, 4 colunas | foto bem torta, escura, ruidosa e desfocada |

Também: folha escaneada sem fundo, folha em branco (não pode inventar
marcação), dedução do número de alternativas, numeração por linha, correção
com questões de duas respostas, gabarito a partir da folha do professor e a
interface web.

## Limites conhecidos

- A folha precisa estar de pé (não de cabeça para baixo nem deitada).
- As alternativas de cada questão precisam estar lado a lado, na horizontal.
- As bolhas precisam ser formas fechadas (círculo ou quadrado). Uma
  alternativa marcada só com um traço fora da bolha não é lida.
- Os testes usam imagens sintéticas. Vale conferir com algumas fotos reais
  do seu modelo de folha antes de corrigir uma turma inteira; os avisos de
  "marcação duvidosa" apontam onde olhar.
