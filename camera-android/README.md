# Foto — câmera para Android

App de câmera nativo para Android (Kotlin + CameraX), feito para tirar fotos
na maior qualidade que o celular oferece.

## Baixar e instalar

1. No celular, abra:
   **https://github.com/david-espec/Music-fly/releases/download/foto-camera/Foto.apk**
2. Toque no arquivo baixado. Se o Android pedir, permita **instalar apps desta
   fonte** (é o aviso padrão para apps de fora da Play Store).
3. Abra o **Foto** e permita o acesso à câmera.

Versões novas usam o mesmo link e instalam por cima, sem perder nada.
Requer Android 8.0 ou mais novo.

## O que faz

- **Qualidade máxima**: usa a maior resolução do sensor, inclusive os modos de
  alta resolução (50 MP, 108 MP…) quando o aparelho libera, com o modo de
  captura "máxima qualidade" do CameraX e JPEG em qualidade 100.
- Visor em 3:4, o mesmo formato da foto.
- **Toque para focar** (foco, exposição e balanço de branco no ponto tocado).
- **Zoom** pinçando a tela; toque no indicador para voltar a 1x.
- **Flash**: desligado / automático / ligado.
- **Temporizador** de 3 ou 10 s (toque de novo no disparador para cancelar).
- **Grade** de regra dos terços.
- Câmera traseira e frontal.
- Botões de **volume** também tiram a foto.
- Som do obturador e vibração ao fotografar; foto sai na orientação certa
  mesmo com o celular deitado.
- As fotos vão direto para a **galeria**, no álbum `Pictures/Foto`. A
  miniatura no canto abre a última foto.

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
