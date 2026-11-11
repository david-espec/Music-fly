# D Libery — biblioteca digital pessoal

Pesquise livros, fotografe capas, organize sua estante e acompanhe suas leituras.
Funciona no navegador e se instala como app no celular (PWA). Sem cadastro, sem
servidor: seus livros ficam guardados no próprio aparelho.

## Como rodar

```bash
cd d-libery
npm install
npm run dev        # http://localhost:5173
npm run build      # gera dist/ (site estático)
npm run preview    # serve dist/ em http://localhost:4173
```

> A câmera do navegador só funciona em **https** (ou em `localhost`). Para usar
> no celular, publique o `dist/` numa hospedagem com https (GitHub Pages,
> Netlify, Vercel…) e use "Adicionar à tela inicial".

## Arquitetura

```
┌──────────────────────────── navegador / celular ────────────────────────────┐
│  React (telas)                                                               │
│    │                                                                         │
│    ├─ store/AppStore ── estado da estante + regras de status ── IndexedDB    │
│    │                    (livros, capas em Blob, configurações)               │
│    ├─ lib/search ────── Google Books API ┐ em paralelo, intercala e junta    │
│    │                    Open Library API ┘ duplicatas por ISBN/título+autor  │
│    ├─ lib/barcode ───── BarcodeDetector nativo ou ZXing (WebAssembly)        │
│    └─ lib/ocr ───────── Tesseract (WebAssembly, roda no aparelho)            │
│                                                                              │
│  Service worker (Workbox): app offline + cache de capas e do motor de OCR    │
└──────────────────────────────────────────────────────────────────────────────┘
```

**Por que um PWA, sem back-end?** O objetivo é uma coleção pessoal. Um PWA dá
câmera, instalação na tela inicial e funcionamento offline em Android, iPhone e
computador com um único código, e o IndexedDB guarda livros e imagens sem
precisar de conta nem servidor. As APIs de livros são públicas e chamadas
direto do aparelho. O backup em arquivo `.json` (com as capas) leva a estante
para outro aparelho.

### Tecnologias

| Parte | Escolha |
| --- | --- |
| Interface | React 19 + TypeScript, CSS próprio (tema claro/escuro por variáveis) |
| Build / PWA | Vite + vite-plugin-pwa (Workbox) |
| Armazenamento | IndexedDB via `idb` (livros, capas como Blob, configurações) |
| Pesquisa | Google Books API + Open Library (Search e Works API) |
| Código de barras | `BarcodeDetector` nativo; `barcode-detector` (ZXing/wasm) onde não existe |
| Leitura da capa | `tesseract.js` (OCR em português e inglês, no próprio aparelho) |
| Rotas | Hash router próprio (`#/livro/123`): funciona em qualquer hospedagem estática |

## Como funciona o "fotografar a capa"

1. A câmera abre ao vivo. Enquanto ela está aberta, cada quadro é verificado
   em busca de um **código de barras ISBN** (EAN-13 978/979). Se achar, o livro é
   buscado pelo ISBN na hora — é o caminho mais preciso.
2. Ao tocar no botão, a foto é recortada na moldura da capa e:
   - procura-se de novo um código de barras na foto;
   - se não houver, o **OCR** lê o texto da capa duas vezes (luminância e
     canal de cor mais forte, para títulos coloridos);
   - as linhas com letras maiores (geralmente título e autor) viram consultas
     no Google Books e no Open Library;
   - os resultados são ordenados pela semelhança com o texto lido (tolerando
     pequenos erros do OCR).
3. Você confirma o livro ("Sim, é este"), revisa os dados e salva. Pode escolher
   entre a capa da internet ou a sua foto.
4. Se nada for encontrado: dá para pesquisar com outras palavras ou cadastrar
   manualmente usando a foto como capa (título e autor já sugeridos pelo OCR).

Também dá para escolher uma foto da galeria pelo botão **+**.

## Funcionalidades

- **Pesquisa** por tudo, título, autor, ISBN, editora ou categoria, nas duas
  fontes ao mesmo tempo. ISBN digitado é detectado automaticamente.
- **Detalhes**: capa, título, autor, editora, ano, sinopse, categoria, páginas,
  ISBN, idioma, nota pública e links:
  - *ler grátis* só quando há versão legal (domínio público no Google Books,
    Internet Archive, empréstimo no Open Library);
  - prévia, ficha, compra (Google Play, Amazon) e sebos (Estante Virtual).
- **Estante** em prateleiras, com filtros: Todos, Favoritos, Quero ler, Lendo,
  Lidos, Abandonados e Adicionados manualmente; ordenação e filtro por gênero.
- **Leitura**: status (Quero ler, Lendo, Concluído, Abandonado), datas de início
  e fim, páginas lidas (com histórico), avaliação de 0 a 5 com meia estrela,
  anotações.
- **Estatísticas**: meta anual, livros e páginas por mês, gêneros e autores.
- **Perfil**: nome e foto, meta anual, tema (automático/claro/escuro), chave
  opcional do Google Books, backup e restauração, apagar dados.
- Edição e exclusão (com "desfazer") de qualquer livro.

## Limites conhecidos

- O Google Books limita consultas anônimas por rede. Se aparecer o aviso de
  limite, crie uma chave gratuita (Google Cloud Console → API "Books") e cole em
  **Perfil → Chave do Google Books**. O Open Library continua respondendo.
- O OCR acerta bem capas com título legível; capas muito artísticas podem não
  ser reconhecidas — por isso o código de barras e a pesquisa manual existem.
- Na primeira leitura de capa, o app baixa o motor de OCR e os dados de idioma
  (alguns MB). Depois ficam em cache.
- O "tempo de leitura" é uma estimativa (1,5 min por página lida).

## Estrutura

```
src/
  App.tsx              rotas, tema e menu "Adicionar"
  types.ts             modelos (Book, SearchResult, Settings)
  store/               estado global (AppStore) e imagens guardadas (useImage)
  lib/                 APIs, OCR, código de barras, ISBN, IndexedDB, backup, estatísticas
  components/          capa, estante, estrelas, folhas, barra inferior…
  views/               telas: início, estante, pesquisa, resultado, livro,
                       formulário, câmera, estatísticas, perfil, boas-vindas
```
