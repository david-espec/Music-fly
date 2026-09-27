# Foto — câmera para Android

App de câmera nativo para Android (Kotlin + CameraX), feito para tirar fotos
na maior qualidade que o celular oferece.

## Baixar e instalar

1. No celular, abra:
   **https://github.com/david-espec/Music-fly/releases/download/foto-camera/Foto.apk**
2. Toque no arquivo baixado. Se o Android pedir, permita **instalar apps desta
   fonte** (é o aviso padrão para apps de fora da Play Store).
3. Abra o **Foto** e permita o acesso à câmera.

O app se atualiza sozinho: ao abrir, ele confere se saiu versão nova e já
baixa em segundo plano. Na primeira atualização o Android pede uma confirmação
(e, uma única vez, a permissão "Permitir desta fonte"). A partir daí, no
Android 12 ou mais novo, as atualizações são instaladas sem perguntar, quando
você sai do app. Dá para desligar em Configurações.
Requer Android 8.0 ou mais novo, processador ARM 64 bits.

## O que faz

Tudo é consultado na câmera real (Camera2/CameraX): o que o aparelho não
oferece fica escondido ou desativado, nunca simulado.

- **Modos**: Retrato, Foto, Vídeo e, em MAIS, Pro, Panorama, Macro, Comida,
  Noite e Documentos. Deslize para os lados para trocar; para cima/baixo
  para trocar de câmera.
- **Controles**: flash (ou flash de tela na frontal), HDR, temporizador
  3/5/10 s, formato (3:4, 9:16, 1:1, Full), resolução entre as que o sensor
  oferece, zoom por pinça, botões (0,5× só com grande-angular real) e
  controle deslizante, toque para focar, toque longo para travar AE/AF,
  arrastar para ajustar a exposição (EV).
- **Filtros** (15, no visor e na foto) e **Beleza** (pele, brilho, olhos,
  rosto, dentes, contorno) aplicada na foto com detecção de rosto do ML Kit.
- **Retrato**: extensão do fabricante quando existe; senão, desfoque por
  software separando a pessoa do fundo (não usa sensor de profundidade).
- **Pro**: ISO, obturador, EV, balanço de branco (e Kelvin) e foco manual,
  cada um só se o sensor aceitar.
- **Noite** e **HDR**: do fabricante quando existem; senão, várias fotos
  alinhadas e combinadas no aparelho.
- **Panorama** guiado pelo giroscópio, com projeção cilíndrica e costura.
- **Macro**: câmera macro se o fabricante liberar; senão, foco próximo da
  principal (e o app diz isso).
- **Vídeo**: qualidades e FPS reais do aparelho, microfone, pausar/continuar,
  foto durante o vídeo e troca de câmera gravando.
- **QR Code** com confirmação antes de abrir, **scanner de documentos**
  (bordas, perspectiva, PDF), **grade**, **guia central**, **nivelador** e
  **histograma**.
- **Visualizador** (compartilhar, excluir, informações EXIF) e **editor**
  (cortar, girar, espelhar, ajustes, filtros, P&B, desfazer/refazer; salva
  como nova foto).
- **Configurações** no estilo da câmera Samsung, marca d'água, localização
  (só se autorizada), pastas, diagnóstico da câmera.
- Atualização automática pelo próprio app.

## Como é gerado

O APK é compilado pelo GitHub Actions (`.github/workflows/camera-apk.yml`) a
cada push que mexe nesta pasta, e publicado na Release `foto-camera`.

Para compilar no computador (precisa do Android SDK):

```bash
cd camera-android
./gradlew assembleRelease
# APK em app/build/outputs/apk/release/app-release.apk
```

A chave de assinatura (`app/foto.keystore`) fica no repositório de propósito:
assim toda build sai com a mesma assinatura e atualiza por cima da anterior.
Não serve para publicar na Play Store.
