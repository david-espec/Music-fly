package com.davidespec.foto

import android.content.Context
import android.graphics.Bitmap
import android.graphics.Matrix
import android.util.Log
import org.tensorflow.lite.Interpreter
import java.io.FileInputStream
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.nio.MappedByteBuffer
import java.nio.channels.FileChannel
import kotlin.math.roundToInt

/**
 * Melhoria de imagem por IA, no proprio aparelho (sem internet).
 *
 * Usa o Zero-DCE-Lite (licenca MIT, ver assets/zero_dce_LICENSE.txt): uma
 * rede neural pequena que olha a foto reduzida (300x200) e estima, para
 * cada regiao, uma curva de brilho. As curvas sao ampliadas e aplicadas na
 * foto em resolucao total, o que recupera sombras e areas escuras sem
 * estourar o que ja esta claro.
 *
 * A forca depende de quanto a foto esta escura: em foto bem iluminada a IA
 * quase nao mexe; em ambiente escuro ela atua por inteiro.
 */
object AiEnhancer {

    private const val TAG = "FotoIA"
    private const val MODEL = "zero_dce.tflite"
    private const val IN_W = 300
    private const val IN_H = 200
    private const val ITERATIONS = 6
    /** Niveis de alfa pre-calculados para aplicar as curvas rapido. */
    private const val ALPHA_LEVELS = 64

    @Volatile private var interpreter: Interpreter? = null
    private var failed = false

    private fun load(context: Context): Interpreter? {
        interpreter?.let { return it }
        if (failed) return null
        return synchronized(this) {
            interpreter ?: try {
                val fd = context.assets.openFd(MODEL)
                val model: MappedByteBuffer = FileInputStream(fd.fileDescriptor).channel
                    .map(FileChannel.MapMode.READ_ONLY, fd.startOffset, fd.declaredLength)
                Interpreter(model, Interpreter.Options().setNumThreads(4)).also { interpreter = it }
            } catch (error: Throwable) {
                Log.e(TAG, "Nao foi possivel carregar o modelo de IA", error)
                failed = true
                null
            }
        }
    }

    /** Devolve a foto melhorada, ou a propria foto se a IA nao estiver disponivel. */
    fun enhance(context: Context, source: Bitmap): Bitmap {
        val model = load(context) ?: return source
        val w = source.width
        val h = source.height
        // O modelo espera paisagem (300x200): foto em pe e girada para a analise.
        val portrait = h > w
        val oriented = if (portrait) {
            Bitmap.createBitmap(source, 0, 0, w, h, Matrix().apply { postRotate(90f) }, true)
        } else {
            source
        }
        val small = Bitmap.createScaledBitmap(oriented, IN_W, IN_H, true)
        if (oriented !== source) oriented.recycle()

        val pixels = IntArray(IN_W * IN_H)
        small.getPixels(pixels, 0, IN_W, 0, 0, IN_W, IN_H)
        small.recycle()
        val input = ByteBuffer.allocateDirect(IN_W * IN_H * 3 * 4).order(ByteOrder.nativeOrder())
        var lumaSum = 0f
        for (c in pixels) {
            val r = ((c shr 16) and 255) / 255f
            val g = ((c shr 8) and 255) / 255f
            val b = (c and 255) / 255f
            input.putFloat(r)
            input.putFloat(g)
            input.putFloat(b)
            lumaSum += 0.299f * r + 0.587f * g + 0.114f * b
        }
        input.rewind()

        // Quanto mais escura a foto, mais a IA atua.
        val mean = lumaSum / pixels.size
        val strength = ((0.5f - mean) / 0.3f).coerceIn(0f, 1f)
        if (strength < 0.05f) return source

        val out0 = ByteBuffer.allocateDirect(IN_W * IN_H * 3 * 4).order(ByteOrder.nativeOrder())
        val out1 = ByteBuffer.allocateDirect(IN_W * IN_H * 3 * 4).order(ByteOrder.nativeOrder())
        try {
            model.runForMultipleInputsOutputs(arrayOf<Any>(input), mapOf(0 to out0, 1 to out1))
        } catch (error: Throwable) {
            Log.e(TAG, "Falha na IA", error)
            return source
        }
        // Uma saida e a imagem melhorada, a outra os mapas de curva (valores negativos).
        val maps = listOf(out0, out1).minByOrNull { minValue(it) } ?: return source
        maps.rewind()

        // Mapas de curva -> bitmap pequeno (alfa em 0..255 por canal), ampliado
        // de forma nativa e suave para o tamanho da foto.
        val mapPixels = IntArray(IN_W * IN_H)
        for (i in mapPixels.indices) {
            val ar = encode(maps.float * strength)
            val ag = encode(maps.float * strength)
            val ab = encode(maps.float * strength)
            mapPixels[i] = (0xFF shl 24) or (ar shl 16) or (ag shl 8) or ab
        }
        var mapBitmap = Bitmap.createBitmap(mapPixels, IN_W, IN_H, Bitmap.Config.ARGB_8888)
        if (portrait) {
            // Desfaz o giro: o mapa volta para a orientacao da foto.
            mapBitmap = Bitmap.createBitmap(mapBitmap, 0, 0, IN_W, IN_H, Matrix().apply { postRotate(-90f) }, true)
        }
        val fullMap = Bitmap.createScaledBitmap(mapBitmap, w, h, true)
        mapBitmap.recycle()

        // Curva iterada pre-calculada: lut[nivel de alfa][valor do pixel].
        val lut = Array(ALPHA_LEVELS) { level ->
            val alpha = decode(level * 255 / (ALPHA_LEVELS - 1))
            IntArray(256) { v ->
                var x = v / 255f
                repeat(ITERATIONS) { x += alpha * (x * x - x) }
                (x.coerceIn(0f, 1f) * 255f).roundToInt()
            }
        }

        val out = ImageEffects.mutableCopy(source)
        val row = IntArray(w)
        val mapRow = IntArray(w)
        for (y in 0 until h) {
            out.getPixels(row, 0, w, 0, y, w, 1)
            fullMap.getPixels(mapRow, 0, w, 0, y, w, 1)
            for (x in 0 until w) {
                val c = row[x]
                val m = mapRow[x]
                val lr = lut[((m shr 16) and 255) * (ALPHA_LEVELS - 1) / 255]
                val lg = lut[((m shr 8) and 255) * (ALPHA_LEVELS - 1) / 255]
                val lb = lut[(m and 255) * (ALPHA_LEVELS - 1) / 255]
                row[x] = (0xFF shl 24) or (lr[(c shr 16) and 255] shl 16) or (lg[(c shr 8) and 255] shl 8) or lb[c and 255]
            }
            out.setPixels(row, 0, w, 0, y, w, 1)
        }
        fullMap.recycle()
        return out
    }

    private fun minValue(buffer: ByteBuffer): Float {
        buffer.rewind()
        var min = Float.MAX_VALUE
        while (buffer.remaining() >= 4) min = minOf(min, buffer.float)
        buffer.rewind()
        return min
    }

    // Alfa util fica entre ALPHA_MIN e 0 (clareia); guardado como 0..255.
    private const val ALPHA_MIN = -0.6f
    private fun encode(alpha: Float): Int =
        ((alpha.coerceIn(ALPHA_MIN, 0f) - ALPHA_MIN) / -ALPHA_MIN * 255f).roundToInt().coerceIn(0, 255)
    private fun decode(value: Int): Float = value / 255f * -ALPHA_MIN + ALPHA_MIN
}
