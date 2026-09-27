# Scan Fly

Scanner de documentos no navegador, no estilo do Genius Scan: aponte a câmera
para uma folha, o app encontra as bordas, corrige a perspectiva, tira a sombra
e entrega um PDF limpo. Instala como app no celular e funciona sem internet.

**Tudo acontece no aparelho.** As fotos não saem dele: não há servidor, conta,
anúncio nem rastreamento.

## O que ele faz

| | |
|---|---|
| Câmera com mira | A folha é detectada ao vivo e contornada na tela. |
| Captura automática | Com a folha parada na mira por ~1,3 s, a foto sai sozinha (anel verde no botão). Liga/desliga no topo da câmera. |
| Várias páginas | A câmera continua aberta depois de cada foto; *Concluir* junta tudo num documento. |
| Recorte manual | Arraste os cantos (ou o meio de um lado, que move dois cantos). Uma lupa mostra o que está sob o dedo. *Detectar* refaz a detecção; *Página toda* usa a foto inteira. Setas do teclado ajustam o canto em foco. |
| Filtros | **Cor** (papel branco, cores vivas), **Cinza**, **P&B** (limiar adaptativo, ótimo para texto) e **Original**. Trocáveis por página, com prévia. |
| Editar páginas | Girar, recortar de novo (a foto original fica guardada), excluir, reordenar. |
| Importar | Imagens da galeria viram páginas, com a mesma detecção de bordas. |
| Exportar | PDF (tamanho automático, A4 ou Carta) ou JPEG, pela folha de compartilhar do sistema ou baixando o arquivo. |
| Organizar | Busca por nome (sem ligar para acentos), renomear, juntar vários documentos em um, excluir. |
| Configurações | Filtro padrão, qualidade da imagem, captura automática, tamanho da página, tema claro/escuro e armazenamento persistente. |

Sem câmera disponível (permissão negada, computador sem webcam), a tela oferece
tirar a foto pelo app de câmera do sistema ou escolher imagens.

## Como rodar

```bash
cd scan-fly
npm install
npm run dev        # http://localhost:5173
npm test           # testes do processamento de imagem e do PDF
npm run build      # gera dist/, estático
npm run preview    # serve dist/
```

A câmera só abre em `https://` ou em `localhost`. Para testar no celular pela
rede local, use um túnel HTTPS ou publique o `dist/`.

O `dist/` pode ir para qualquer hospedagem estática. Os caminhos são relativos
(`base: './'`) e as rotas usam `#`, então funciona em subpastas, como no GitHub
Pages.

## Como o processamento funciona

Nada de OpenCV nem bibliotecas de imagem: é TypeScript puro em `src/scan/`,
rodando num Web Worker para a interface não travar.

1. **Detecção** (`detect.ts`), numa cópia de 320 px da foto. Duas hipóteses
   concorrem:
   - *limiar*: Otsu separa claro de escuro e a maior mancha clara é a folha —
     o caso comum de papel sobre mesa;
   - *contorno*: o gradiente (Sobel) marca bordas; inundando a imagem a partir
     das margens, o que fica cercado por borda é a folha. Resolve papel branco
     sobre mesa clara.

   De cada mancha sai a envoltória convexa e, dela, o quadrilátero de maior
   área. Vence o que tiver mais borda real sob os quatro lados.
2. **Perspectiva** (`warp.ts`): homografia dos quatro cantos para um retângulo
   com a proporção real da folha, com interpolação bilinear.
3. **Filtros** (`filters.ts`): estima a iluminação do papel por blocos e divide
   a imagem por ela — some a sombra da mão e o amarelado da lâmpada. O P&B
   aplica depois um limiar adaptativo (Bradley) com borda suave.
4. **PDF** (`pdf.ts`): gerador próprio que embute os JPEGs sem recompressão.

## Estrutura

```
src/
  scan/        detecção, perspectiva, filtros, PDF, worker
  lib/         rotas, exportação, criação de páginas, utilitários
  components/  editor de recorte, diálogos, ícones
  views/       Biblioteca, Câmera, Documento, Página, Configurações
  db.ts        IndexedDB: documentos e páginas (foto original + processada)
  prefs.ts     preferências
tests/         testes com imagens sintéticas (node --test)
scripts/       gerador dos ícones PNG
```

## Limites conhecidos

- Não há OCR (texto pesquisável dentro do PDF).
- A detecção precisa de algum contraste entre a folha e o fundo; quando falha,
  o recorte abre com uma margem padrão para ajuste manual.
- Os dados ficam no IndexedDB do navegador. Limpar os dados do site apaga os
  documentos; ligar o armazenamento persistente evita que o navegador faça isso
  sozinho quando falta espaço.
