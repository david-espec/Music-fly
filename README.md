# Music Fly

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

O repositório já tem o workflow `.github/workflows/pages.yml`, que faz a build
com o prefixo correto (`/Music-fly/`) e publica.

Antes da primeira publicação é preciso **ligar o Pages uma vez, na mão** — o
token do GitHub Actions não tem permissão para criar o site sozinho:

1. Vá em **Settings → Pages** do repositório.
2. Em **Build and deployment → Source**, escolha **GitHub Actions**.
3. Volte em **Actions → Publicar no GitHub Pages → Run workflow** (ou espere o
   próximo push).

O site fica em `https://david-espec.github.io/Music-fly/`. A partir daí, todo
push no branch publica de novo sozinho.

## Instalar como app

Depois de abrir o site:

- **Android / Chrome / Edge:** menu do navegador → "Instalar app". A aba _Sobre_
  também mostra um botão de instalação quando o navegador oferece.
- **iPhone / Safari:** Compartilhar → "Adicionar à Tela de Início".
- **Desktop:** ícone de instalação na barra de endereços.

Instalado, ele abre em janela própria e funciona sem internet.

## O que ele faz

| | |
|---|---|
| Biblioteca local | Importa arquivos avulsos ou uma pasta inteira, lê tags ID3/Vorbis/MP4 (título, artista, álbum, ano, faixa) e a capa embutida. Busca, filtros e ordenação. |
| Reprodução | Fila, ordem aleatória, repetir uma/tudo, controle de posição e volume. |
| Controles do sistema | Media Session API: título, artista e capa na tela de bloqueio, e os botões de mídia do fone e do teclado funcionam. |
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
