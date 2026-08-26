# Music Fly

**No ar em https://david-espec.github.io/Music-fly/**

Player de música que funciona no navegador e se instala como app no celular ou
no computador. **Sem anúncios, sem rastreamento, sem cadastro.**

Quatro abas, simples de usar:

- **Início** — busca no topo, suas músicas logo abaixo.
- **Biblioteca** — playlists, álbuns e artistas, montados a partir das tags dos
  seus arquivos.
- **Letra** — a letra da música que está tocando, acompanhando o áudio linha a
  linha. Clique numa linha para pular para aquele trecho.
- **Descobrir** — o acervo público de áudio do [Internet Archive](https://archive.org/details/audio),
  com gravações de domínio público e sob licenças Creative Commons. Dá para ouvir
  por streaming ou baixar para ouvir offline.

Os arquivos que você adiciona (MP3, FLAC, M4A, OGG, WAV…) ficam guardados no
próprio dispositivo e tocam sem internet.

## Como rodar

```bash
npm install
npm run dev        # ambiente de desenvolvimento em http://localhost:5173
```

Para gerar a versão de produção:

```bash
npm run build      # gera dist/
npm run preview    # serve dist/ para conferência
```

O conteúdo de `dist/` é estático: dá para publicar em qualquer hospedagem de
arquivos (GitHub Pages, Netlify, Vercel, um servidor próprio). O app usa caminhos
relativos (`base: './'`), então funciona também em subdiretórios.

> O service worker só é registrado na build de produção. Para testar o modo
> offline, use `npm run build && npm run preview`, não o `npm run dev`.

## Publicar no GitHub Pages

O workflow `.github/workflows/pages.yml` faz a build com o prefixo correto
(`/Music-fly/`) e publica a cada push no branch. Já está ativo.

Se for reconfigurar do zero (num fork, por exemplo), é preciso **ligar o Pages
uma vez, na mão** — o token do GitHub Actions não tem permissão para criar o
site sozinho, e a execução falha com
`Create Pages site failed: Resource not accessible by integration`:

1. **Settings → Pages** do repositório.
2. Em **Build and deployment → Source**, escolha **GitHub Actions**.
3. **Actions → Publicar no GitHub Pages → Run workflow**, ou dê um push.

## Instalar como app

Há um botão **Baixar app** na barra superior da aba Início. Ele abre um aviso
explicando o que a instalação faz, com **Cancelar** e **Confirmar**; confirmando,
o app vira um ícone na tela inicial do aparelho.

Onde o navegador não oferece instalação automática — iPhone sempre, e os demais
quando o app já foi instalado antes — o Confirmar mostra o passo a passo daquele
navegador em vez de falhar em silêncio.

O botão some sozinho depois de instalado. Instalado, o app abre em janela
própria e funciona sem internet.

## O que ele faz

| | |
|---|---|
| Biblioteca local | Importa arquivos avulsos ou uma pasta inteira, lê tags ID3/Vorbis/MP4 (título, artista, álbum, ano, faixa) e a capa embutida. |
| Busca | Resultados enquanto você digita, ordenados por relevância. Os termos podem vir em qualquer ordem, acentos não atrapalham, e o trecho que casou fica destacado. Artistas e álbuns aparecem como resultado próprio. |
| Reprodução | Fila, ordem aleatória, repetir uma/tudo, controle de posição e volume. |
| Controles do sistema | Media Session API: título, artista e capa na tela de bloqueio, e os botões de mídia do fone e do teclado funcionam. |
| Editar faixas | Corrigir título, artista, álbum, ano e número da faixa, e trocar ou remover a capa. Útil quando o arquivo vem com tags erradas ou vazias — a Biblioteca reagrupa sozinha depois. |
| Playlists | Criar, renomear, apagar, reordenar faixas. |
| Letras sincronizadas | Três fontes, nesta ordem: a letra gravada dentro do arquivo (ID3 SYLT), um arquivo `.lrc` que você adicione, ou uma busca no [LRCLIB](https://lrclib.net). O que for encontrado fica guardado e funciona offline depois. |
| Descobrir | Busca no acervo livre, streaming imediato e download para uso offline, com a licença de cada obra à vista. |
| Offline | O app inteiro e as músicas baixadas ficam disponíveis sem rede. |

### Atalhos de teclado

| Tecla | Ação |
|---|---|
| `Espaço` | Tocar / pausar |
| `←` / `→` | Voltar / avançar 5 s |
| `↑` / `↓` | Volume |
| `n` / `p` | Próxima / anterior |
| `m` | Silenciar |
| `s` | Ordem aleatória |
| `r` | Modo de repetição |

## Letras: como funciona a sincronia

A aba **Letra** destaca a linha atual e rola sozinha junto com a música. O
destaque é recalculado a cada quadro de animação lendo a posição real do áudio,
não pelo evento `timeupdate` do navegador — que dispara umas 4 vezes por segundo
e deixaria o destaque atrasado.

De onde vem a letra, em ordem de preferência:

1. **Gravada no arquivo.** MP3 com quadro ID3 `SYLT` já traz a letra com marcação
   de tempo; é lida na importação, sem rede nenhuma.
2. **Arquivo `.lrc`.** Adicione junto com as músicas (ou pelo botão *Arquivo .lrc*
   na aba Letra). O casamento é pelo nome do arquivo: `Musica.lrc` vai para
   `Musica.mp3`.
3. **LRCLIB.** Acervo aberto de letras sincronizadas, sem chave de API e sem
   cadastro. Use o botão *Procurar letra*.

A precisão é a dos carimbos de tempo da fonte — **por linha**, que é o padrão do
formato LRC e do LRCLIB, não por palavra. Se a letra estiver adiantada ou
atrasada em relação à sua gravação, o rodapé da aba tem um ajuste de ±0,5s que
fica salvo por música. Sem letra sincronizada disponível, o app mostra o texto
corrido, sem destaque.

## Como a busca funciona

Digitou, apareceu — não há botão de buscar em lugar nenhum.

Na **Início** a lista se estreita a cada tecla, porque o filtro roda na memória.
Na **Descobrir** cada busca é uma requisição ao acervo, então as teclas são
agrupadas: o app espera 0,4 s de pausa antes de perguntar, e cancela a busca
anterior se você continuar digitando. Digitar "bossa nova" gera uma requisição,
não dez. Enter busca na hora, sem esperar.

As regras de correspondência:

- **Todos os termos precisam casar**, em qualquer ordem e em qualquer campo.
  `viva chico` encontra *Roda Viva* de Chico Buarque; `chico marisa` não
  encontra nada, porque nenhuma faixa satisfaz os dois.
- **Acentos são ignorados nos dois sentidos.** `construção` acha `Construcao`
  e vice-versa.
- **Ordenado por relevância**: título exato primeiro, depois começo de título,
  depois começo de palavra, depois qualquer trecho. Título pesa mais que
  artista, que pesa mais que álbum.
- **O trecho que casou fica destacado** no título e na linha de artista/álbum.
- Além das músicas, artistas e álbuns cujo nome casa aparecem em seções
  próprias — dá para tocar o artista ou o álbum inteiro direto dali.

## Apagar é definitivo

Remover uma faixa apaga também o áudio guardado no aparelho, o download offline
e a letra — não há lixeira nem desfazer. Por isso as duas ações destrutivas
(apagar faixa e apagar playlist) pedem confirmação, com o foco começando em
*Cancelar*. Apagar uma playlist não mexe nas músicas.

## Privacidade

Não há anúncios, analytics, cookies de rastreamento nem contas de usuário.
As músicas, playlists e preferências ficam no `IndexedDB` do seu navegador e
nunca são enviadas a lugar nenhum.

O app só fala com dois servidores, e apenas quando você pede: `archive.org` ao
usar a aba _Descobrir_, e `lrclib.net` ao tocar em _Procurar letra_. Sem essas
duas ações, ele não faz nenhuma requisição depois de carregado.

Para evitar que o navegador descarte a biblioteca quando o espaço apertar, a aba
_Sobre_ oferece ativar o armazenamento persistente.

## Sobre as licenças do acervo

O Internet Archive reúne obras de domínio público e sob licenças Creative
Commons. O app mostra a licença informada por cada item junto das faixas e
mantém o link para a página de origem. Respeite os termos de cada obra —
principalmente se pretende redistribuir ou usar comercialmente.

## Estrutura

```
src/
  db/            IndexedDB: faixas, áudio, capas, playlists, letras, preferências
  lib/           tags, formato LRC, Internet Archive, LRCLIB, utilitários
  player/        motor de reprodução (contexto React + reducer da fila)
  library/       estado da biblioteca: importação, playlists, downloads
  components/    player, lista de faixas, menus, diálogos
  views/         Início, Biblioteca, Letra, Descobrir, Sobre
scripts/
  generate-icons.mjs   gera os ícones PWA (sem dependências externas)
```

## Stack

React 19 · TypeScript · Vite · vite-plugin-pwa (Workbox) · idb · music-metadata

Nenhuma dependência de UI, de estado global ou de rede além dessas.
