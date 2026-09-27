# Foto — câmera para o celular

App de câmera feito do zero, que roda no navegador do celular e se instala como
app na tela inicial. Sem dependências e sem etapa de build: são arquivos
estáticos (HTML, CSS e JavaScript).

## O que faz

- **Alta qualidade.** No Chrome/Android a foto sai direto do sensor pela
  ImageCapture API (`takePhoto`), na resolução máxima da câmera — não é um
  print do vídeo. No iPhone (Safari) e no Firefox, o vídeo é aberto na maior
  resolução disponível e o quadro é salvo inteiro, em JPEG qualidade 0,95.
  A resolução em megapixels aparece no canto superior.
- **Câmera traseira e frontal**, com botão para alternar (a frontal aparece
  espelhada no visor, como um espelho).
- **Zoom** por pinça na tela ou pela barra, quando a câmera permite.
- **Toque para focar**: foca e ajusta a exposição no ponto tocado, onde o
  aparelho suporta.
- **Flash**: desligado / automático / ligado (flash de verdade no Android;
  onde só há lanterna, ela acende no momento da foto).
- **Temporizador** de 3 ou 10 segundos e **grade** de regra dos terços.
- **Galeria**: as fotos ficam guardadas no próprio aparelho (IndexedDB). Dá
  para ver em tela cheia, **compartilhar**, **salvar no aparelho** ou apagar.
- **Funciona offline** depois da primeira visita, e a câmera é desligada quando
  o app vai para segundo plano, para poupar bateria.
- Sem acesso à câmera pelo navegador, o botão **Usar a câmera do sistema** abre
  a câmera nativa do celular e guarda a foto na galeria do app.

As preferências (câmera, flash, temporizador, grade) ficam lembradas.

## Como rodar

O navegador só libera a câmera em endereço seguro (`https://`) ou em
`localhost`. Para testar no computador:

```bash
cd camera
python3 -m http.server 8080
# abra http://localhost:8080
```

Para usar no celular, publique a pasta `camera/` em qualquer hospedagem com
HTTPS (GitHub Pages, Netlify, Vercel…). Aberto no celular, use
**Adicionar à tela inicial** (Safari) ou **Instalar app** (Chrome).

## Arquivos

```
index.html            estrutura das telas: câmera, galeria e visualizador
styles.css            visual (tela cheia, respeita o notch)
app.js                câmera, captura, zoom, foco, flash, galeria
sw.js                 cache para abrir sem internet
manifest.webmanifest  instalação como app
icon.svg              ícone
```

Ao mudar algum arquivo, aumente a versão `CACHE` em `sw.js` para os aparelhos
pegarem a atualização.

## Privacidade

As fotos nunca saem do aparelho, a não ser que você compartilhe ou salve.
Nenhuma requisição é feita a servidores externos.
