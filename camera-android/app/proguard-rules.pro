# CameraX e AndroidX ja trazem as proprias regras; nada extra por enquanto.

# TensorFlow Lite (IA de melhoria de imagem): classes usadas via JNI.
-keep class org.tensorflow.lite.** { *; }
-dontwarn org.tensorflow.lite.**
