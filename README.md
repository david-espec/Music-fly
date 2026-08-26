# Music Fly

Player de música que funciona no navegador e se instala como app no celular ou
no computador. **Sem anúncios, sem rastreamento, sem cadastro.**

Duas fontes de música, uma biblioteca só:

- **Sua biblioteca** — os arquivos que você mesmo adiciona (MP3, FLAC, M4A, OGG,
  WAV…). Ficam guardados no próprio dispositivo e tocam sem internet.
- **Descobrir** — o acervo público de áudio do [Internet Archive](https://archive.org/details/audio),
  com gravações de domínio público e sob licenças Creative Commons. Dá para ouvir
  por streaming ou baixar para ouvir offline.

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

## Privacidade

Não há anúncios, analytics, cookies de rastreamento nem contas de usuário.
As músicas, playlists e preferências ficam no `IndexedDB` do seu navegador e
nunca são enviadas a lugar nenhum.

A **única** comunicação de rede que o app faz é com `archive.org`, e somente
quando você usa a aba _Descobrir_. Se você nunca abrir essa aba, o app não fala
com servidor nenhum depois de carregado.

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
  db/            IndexedDB: faixas, áudio, capas, playlists, preferências
  lib/           metadados (tags), cliente do Internet Archive, utilitários
  player/        motor de reprodução (contexto React + reducer da fila)
  library/       estado da biblioteca: importação, playlists, downloads
  components/    player, lista de faixas, menus, diálogos
  views/         Biblioteca, Playlists, Descobrir, Sobre
scripts/
  generate-icons.mjs   gera os ícones PWA (sem dependências externas)
```

## Stack

React 19 · TypeScript · Vite · vite-plugin-pwa (Workbox) · idb · music-metadata

Nenhuma dependência de UI, de estado global ou de rede além dessas.
