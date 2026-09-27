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
Requer Android 8.0 ou mais novo.

## O que faz

Tela no estilo da câmera da Samsung:

- **Barra de cima**: configurações, flash, temporizador, formato da foto
  (3:4, 9:16, 1:1 ou Full, a tela inteira), resolução e linhas de grade.
- **Resolução**: toque no "12M"/"50M" para alternar entre a resolução padrão
  (12 MP) e a máxima do sensor (50 MP, 108 MP… quando o aparelho libera). A
  foto sai em JPEG qualidade 100, no modo "máxima qualidade" do CameraX.
- **Zoom**: botões 1× e 2× (e grande-angular, se houver), ou pinçando a tela.
- **Modos**: RETRATO, FOTO e VÍDEO (deslize na tela para trocar) e MAIS, com
  Noite, HDR e Auto-retoque. Retrato, Noite, HDR e Retoque usam o
  processamento do próprio fabricante e só aparecem onde o celular oferece.
- **Vídeo** em Full HD ou 4K (toque em FHD/UHD), com som; o flash vira lanterna.
- **Toque para focar** (foco, exposição e balanço de branco no ponto tocado).
- **Temporizador** de 3 ou 10 s (toque de novo no disparador para cancelar).
- Botões de **volume** também disparam.
- **Configurações**: som do obturador, espelhar selfies e disparo pelo volume.
- Fotos vão para a galeria no álbum `Pictures/Foto`, vídeos em `Movies/Foto`.
  A miniatura redonda abre o último arquivo.

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
