package com.davidespec.foto

import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.ColorMatrix
import android.graphics.ColorMatrixColorFilter
import android.graphics.Paint
import android.graphics.Typeface
import kotlin.math.abs
import kotlin.math.exp
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt
import kotlin.math.sqrt

/**
 * Processamento de imagem no proprio aparelho. Tudo roda fora da thread da
 * interface. As operacoes por pixel trabalham em IntArray (ARGB) e os
 * desfoques grandes sao feitos numa copia reduzida e depois ampliados, o que
 * mantem o custo baixo num aparelho de entrada como o Galaxy A04s.
 */
object ImageEffects {

    fun mutableCopy(source: Bitmap): Bitmap =
        if (source.isMutable && source.config == Bitmap.Config.ARGB_8888) source
        else source.copy(Bitmap.Config.ARGB_8888, true)

    /** Aplica uma ColorMatrix (filtros, brilho, contraste, saturacao...). */
    fun applyMatrix(source: Bitmap, matrix: ColorMatrix): Bitmap {
        if (Filters.isIdentity(matrix)) return source
        val out = Bitmap.createBitmap(source.width, source.height, Bitmap.Config.ARGB_8888)
        val paint = Paint(Paint.FILTER_BITMAP_FLAG).apply { colorFilter = ColorMatrixColorFilter(matrix) }
        Canvas(out).drawBitmap(source, 0f, 0f, paint)
        return out
    }

    fun pixels(bitmap: Bitmap): IntArray {
        val data = IntArray(bitmap.width * bitmap.height)
        bitmap.getPixels(data, 0, bitmap.width, 0, 0, bitmap.width, bitmap.height)
        return data
    }

    fun fromPixels(data: IntArray, width: Int, height: Int): Bitmap {
        val out = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
        out.setPixels(data, 0, width, 0, 0, width, height)
        return out
    }

    // --- Desfoque ------------------------------------------------------------------

    /**
     * Desfoque com raio em pixels da imagem original. Reduz a imagem, aplica
     * tres passadas de caixa (aproxima uma gaussiana) e amplia de volta.
     */
    fun blur(source: Bitmap, radius: Float): Bitmap {
        if (radius < 0.5f) return source
        val factor = max(1, (radius / 3f).toInt())
        val w = max(1, source.width / factor)
        val h = max(1, source.height / factor)
        val small = Bitmap.createScaledBitmap(source, w, h, true)
        val data = pixels(small)
        val r = max(1, (radius / factor).roundToInt())
        repeat(3) { boxBlur(data, w, h, r) }
        val blurredSmall = fromPixels(data, w, h)
        if (small !== source) small.recycle()
        val out = Bitmap.createScaledBitmap(blurredSmall, source.width, source.height, true)
        if (out !== blurredSmall) blurredSmall.recycle()
        return out
    }

    /** Caixa separavel horizontal + vertical, in place. */
    fun boxBlur(data: IntArray, w: Int, h: Int, r: Int) {
        val tmp = IntArray(max(w, h))
        val window = 2 * r + 1
        for (y in 0 until h) {
            val row = y * w
            var sr = 0; var sg = 0; var sb = 0
            for (i in -r..r) {
                val c = data[row + i.coerceIn(0, w - 1)]
                sr += (c shr 16) and 255; sg += (c shr 8) and 255; sb += c and 255
            }
            for (x in 0 until w) {
                tmp[x] = (0xFF shl 24) or ((sr / window) shl 16) or ((sg / window) shl 8) or (sb / window)
                val outC = data[row + (x - r).coerceIn(0, w - 1)]
                val inC = data[row + (x + r + 1).coerceIn(0, w - 1)]
                sr += ((inC shr 16) and 255) - ((outC shr 16) and 255)
                sg += ((inC shr 8) and 255) - ((outC shr 8) and 255)
                sb += (inC and 255) - (outC and 255)
            }
            System.arraycopy(tmp, 0, data, row, w)
        }
        for (x in 0 until w) {
            var sr = 0; var sg = 0; var sb = 0
            for (i in -r..r) {
                val c = data[i.coerceIn(0, h - 1) * w + x]
                sr += (c shr 16) and 255; sg += (c shr 8) and 255; sb += c and 255
            }
            for (y in 0 until h) {
                tmp[y] = (0xFF shl 24) or ((sr / window) shl 16) or ((sg / window) shl 8) or (sb / window)
                val outC = data[(y - r).coerceIn(0, h - 1) * w + x]
                val inC = data[(y + r + 1).coerceIn(0, h - 1) * w + x]
                sr += ((inC shr 16) and 255) - ((outC shr 16) and 255)
                sg += ((inC shr 8) and 255) - ((outC shr 8) and 255)
                sb += (inC and 255) - (outC and 255)
            }
            for (y in 0 until h) data[y * w + x] = tmp[y]
        }
    }

    // --- Nitidez e tons -------------------------------------------------------------

    /** Mascara de nitidez: realca a diferenca entre a imagem e ela desfocada. amount 0..2 */
    fun sharpen(source: Bitmap, amount: Float): Bitmap {
        if (amount <= 0.01f) return source
        val w = source.width
        val h = source.height
        val orig = pixels(source)
        val soft = orig.copyOf()
        boxBlur(soft, w, h, max(1, min(w, h) / 900))
        for (i in orig.indices) {
            val a = orig[i]
            val b = soft[i]
            val r = clamp(((a shr 16) and 255) + amount * (((a shr 16) and 255) - ((b shr 16) and 255)))
            val g = clamp(((a shr 8) and 255) + amount * (((a shr 8) and 255) - ((b shr 8) and 255)))
            val bl = clamp((a and 255) + amount * ((a and 255) - (b and 255)))
            orig[i] = (0xFF shl 24) or (r shl 16) or (g shl 8) or bl
        }
        return fromPixels(orig, w, h)
    }

    /** Sombras e realces, -1..1 cada: curva que mexe so nas pontas do histograma. */
    fun shadowsHighlights(source: Bitmap, shadows: Float, highlights: Float): Bitmap {
        if (abs(shadows) < 0.01f && abs(highlights) < 0.01f) return source
        val lut = IntArray(256) { v ->
            val x = v / 255f
            val y = x + shadows * 1.7f * x * (1 - x) * (1 - x) + highlights * 1.7f * x * x * (1 - x)
            clamp(y * 255f)
        }
        return applyLut(source, lut)
    }

    fun applyLut(source: Bitmap, lut: IntArray): Bitmap {
        val data = pixels(source)
        for (i in data.indices) {
            val c = data[i]
            data[i] = (0xFF shl 24) or (lut[(c shr 16) and 255] shl 16) or (lut[(c shr 8) and 255] shl 8) or lut[c and 255]
        }
        return fromPixels(data, source.width, source.height)
    }

    // --- Composicao -----------------------------------------------------------------

    /**
     * Mistura a imagem nitida com a desfocada usando uma mascara (0..1) de
     * tamanho menor, ampliada com interpolacao bilinear. 1 = nitido.
     */
    fun composite(sharp: Bitmap, blurred: Bitmap, mask: FloatArray, maskW: Int, maskH: Int): Bitmap {
        val w = sharp.width
        val h = sharp.height
        val a = pixels(sharp)
        val b = pixels(blurred)
        val sx = (maskW - 1).toFloat() / max(1, w - 1)
        val sy = (maskH - 1).toFloat() / max(1, h - 1)
        for (y in 0 until h) {
            val my = y * sy
            val y0 = my.toInt()
            val y1 = min(y0 + 1, maskH - 1)
            val fy = my - y0
            for (x in 0 until w) {
                val mx = x * sx
                val x0 = mx.toInt()
                val x1 = min(x0 + 1, maskW - 1)
                val fx = mx - x0
                val top = mask[y0 * maskW + x0] * (1 - fx) + mask[y0 * maskW + x1] * fx
                val bottom = mask[y1 * maskW + x0] * (1 - fx) + mask[y1 * maskW + x1] * fx
                val k = (top * (1 - fy) + bottom * fy).coerceIn(0f, 1f)
                val i = y * w + x
                a[i] = lerpColor(b[i], a[i], k)
            }
        }
        return fromPixels(a, w, h)
    }

    /** Desfoque fora de um circulo (modo Comida). centro/raio em fracoes da imagem. */
    fun radialFocus(source: Bitmap, cx: Float, cy: Float, radius: Float, blurRadius: Float): Bitmap {
        val w = source.width
        val h = source.height
        val blurred = blur(source, blurRadius)
        val mw = 128
        val mh = max(1, 128 * h / w)
        val r = radius * min(w, h)
        val feather = r * 0.45f
        val mask = FloatArray(mw * mh) { i ->
            val px = (i % mw + 0.5f) / mw * w
            val py = (i / mw + 0.5f) / mh * h
            val d = sqrt((px - cx * w) * (px - cx * w) + (py - cy * h) * (py - cy * h))
            (1f - (d - r) / feather).coerceIn(0f, 1f)
        }
        val out = composite(source, blurred, mask, mw, mh)
        blurred.recycle()
        return out
    }

    /** Marca d'agua no canto inferior esquerdo, com sombra para ler em qualquer fundo. */
    fun watermark(source: Bitmap, lines: List<String>): Bitmap {
        if (lines.isEmpty()) return source
        val out = mutableCopy(source)
        val canvas = Canvas(out)
        val size = min(out.width, out.height) * 0.028f
        val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = Color.WHITE
            textSize = size
            typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
            setShadowLayer(size * 0.15f, 0f, size * 0.06f, 0x99000000.toInt())
        }
        val margin = size * 1.2f
        var y = out.height - margin - (lines.size - 1) * size * 1.3f
        lines.forEach {
            canvas.drawText(it, margin, y, paint)
            y += size * 1.3f
        }
        return out
    }

    // --- Varias fotos: noite e HDR ------------------------------------------------------

    /** Luminancia reduzida para alinhar quadros (1 byte por pixel). */
    class Luma(val data: IntArray, val w: Int, val h: Int)

    fun luma(source: Bitmap, targetWidth: Int = 320): Luma {
        val w = min(targetWidth, source.width)
        val h = max(1, source.height * w / source.width)
        val small = Bitmap.createScaledBitmap(source, w, h, true)
        val px = pixels(small)
        if (small !== source) small.recycle()
        val y = IntArray(px.size) { i ->
            val c = px[i]
            (((c shr 16) and 255) * 77 + ((c shr 8) and 255) * 150 + (c and 255) * 29) shr 8
        }
        return Luma(y, w, h)
    }

    /**
     * Deslocamento (dx, dy) que melhor alinha [moving] sobre [reference],
     * procurado por soma de diferencas absolutas. Os valores voltam na escala
     * da imagem reduzida.
     */
    fun alignOffset(reference: Luma, moving: Luma, maxShift: Int = 10): Pair<Int, Int> {
        var best = Long.MAX_VALUE
        var bestDx = 0
        var bestDy = 0
        val w = reference.w
        val h = reference.h
        for (dy in -maxShift..maxShift) {
            for (dx in -maxShift..maxShift) {
                var sum = 0L
                var count = 0
                var y = maxShift
                while (y < h - maxShift) {
                    var x = maxShift
                    val rowR = y * w
                    val rowM = (y + dy) * w
                    while (x < w - maxShift) {
                        sum += abs(reference.data[rowR + x] - moving.data[rowM + x + dx])
                        count++
                        x += 2
                    }
                    y += 2
                }
                val score = if (count == 0) Long.MAX_VALUE else sum * 1000 / count
                if (score < best) {
                    best = score
                    bestDx = dx
                    bestDy = dy
                }
            }
        }
        return bestDx to bestDy
    }

    /**
     * Modo noturno computacional: alinha varios quadros, tira a media (o ruido
     * cai com a raiz do numero de quadros) e so entao levanta as sombras com uma
     * curva. Nao e um simples aumento de brilho de uma foto.
     */
    fun nightMerge(frames: List<Bitmap>, lift: Float = 0.55f): Bitmap {
        val base = frames.first()
        val w = base.width
        val h = base.height
        val refLuma = luma(base)
        val scale = w.toFloat() / refLuma.w
        // Somas em Short (ate 128 quadros de 255 cabem) para poupar memoria.
        val sumR = ShortArray(w * h)
        val sumG = ShortArray(w * h)
        val sumB = ShortArray(w * h)
        val weight = ByteArray(w * h)
        frames.forEach { frame ->
            val (sdx, sdy) = if (frame === base) 0 to 0 else alignOffset(refLuma, luma(frame))
            val dx = (sdx * scale).roundToInt()
            val dy = (sdy * scale).roundToInt()
            val px = pixels(frame)
            for (y in 0 until h) {
                val sy = y + dy
                if (sy < 0 || sy >= h) continue
                for (x in 0 until w) {
                    val sx = x + dx
                    if (sx < 0 || sx >= w) continue
                    val c = px[sy * w + sx]
                    val i = y * w + x
                    sumR[i] = (sumR[i] + ((c shr 16) and 255)).toShort()
                    sumG[i] = (sumG[i] + ((c shr 8) and 255)).toShort()
                    sumB[i] = (sumB[i] + (c and 255)).toShort()
                    weight[i] = (weight[i] + 1).toByte()
                }
            }
        }
        // Curva que levanta sombras e meios-tons e preserva as luzes.
        val gamma = 1f / (1f + lift)
        val lut = IntArray(256) { v -> clamp(Math.pow(v / 255.0, gamma.toDouble()).toFloat() * 255f) }
        val out = IntArray(w * h)
        for (i in out.indices) {
            val n = max(1, weight[i].toInt())
            out[i] = (0xFF shl 24) or (lut[min(255, sumR[i] / n)] shl 16) or
                (lut[min(255, sumG[i] / n)] shl 8) or lut[min(255, sumB[i] / n)]
        }
        return fromPixels(out, w, h)
    }

    /**
     * HDR computacional por fusao de exposicoes: cada pixel pesa mais onde
     * esta bem exposto (longe do preto e do branco). Os pesos sao calculados
     * numa grade reduzida e interpolados, para nao gerar granulado.
     */
    fun hdrFuse(frames: List<Bitmap>): Bitmap {
        val base = frames[frames.size / 2]
        val w = base.width
        val h = base.height
        val refLuma = luma(base)
        val scale = w.toFloat() / refLuma.w
        val aligned = frames.map { frame ->
            if (frame === base) pixels(frame) else {
                val (sdx, sdy) = alignOffset(refLuma, luma(frame))
                shift(pixels(frame), w, h, (sdx * scale).roundToInt(), (sdy * scale).roundToInt())
            }
        }
        val gw = 96
        val gh = max(1, 96 * h / w)
        val weights = aligned.map { px ->
            FloatArray(gw * gh) { i ->
                val x = ((i % gw + 0.5f) / gw * w).toInt().coerceIn(0, w - 1)
                val y = ((i / gw + 0.5f) / gh * h).toInt().coerceIn(0, h - 1)
                val c = px[y * w + x]
                val l = ((((c shr 16) and 255) * 77 + ((c shr 8) and 255) * 150 + (c and 255) * 29) shr 8) / 255f
                exp(-((l - 0.5f) * (l - 0.5f)) / (2 * 0.2f * 0.2f)) + 1e-3f
            }
        }
        val out = IntArray(w * h)
        val sx = (gw - 1).toFloat() / max(1, w - 1)
        val sy = (gh - 1).toFloat() / max(1, h - 1)
        val k = FloatArray(aligned.size)
        for (y in 0 until h) {
            val gy = y * sy
            val y0 = gy.toInt()
            val y1 = min(y0 + 1, gh - 1)
            val fy = gy - y0
            for (x in 0 until w) {
                val gx = x * sx
                val x0 = gx.toInt()
                val x1 = min(x0 + 1, gw - 1)
                val fx = gx - x0
                var total = 0f
                for (f in aligned.indices) {
                    val wt = weights[f]
                    val v = (wt[y0 * gw + x0] * (1 - fx) + wt[y0 * gw + x1] * fx) * (1 - fy) +
                        (wt[y1 * gw + x0] * (1 - fx) + wt[y1 * gw + x1] * fx) * fy
                    k[f] = v
                    total += v
                }
                var r = 0f
                var g = 0f
                var b = 0f
                val i = y * w + x
                for (f in aligned.indices) {
                    val c = aligned[f][i]
                    val kw = k[f] / total
                    r += ((c shr 16) and 255) * kw
                    g += ((c shr 8) and 255) * kw
                    b += (c and 255) * kw
                }
                out[i] = (0xFF shl 24) or (clamp(r) shl 16) or (clamp(g) shl 8) or clamp(b)
            }
        }
        return fromPixels(out, w, h)
    }

    private fun shift(px: IntArray, w: Int, h: Int, dx: Int, dy: Int): IntArray {
        if (dx == 0 && dy == 0) return px
        val out = IntArray(px.size)
        for (y in 0 until h) {
            val sy = (y + dy).coerceIn(0, h - 1)
            for (x in 0 until w) {
                out[y * w + x] = px[sy * w + (x + dx).coerceIn(0, w - 1)]
            }
        }
        return out
    }

    // --- Utilitarios ------------------------------------------------------------------

    fun clamp(v: Float): Int = v.roundToInt().coerceIn(0, 255)
    fun clamp(v: Int): Int = v.coerceIn(0, 255)

    /** Mistura de cor: t=0 -> a, t=1 -> b. */
    fun lerpColor(a: Int, b: Int, t: Float): Int {
        val r = ((a shr 16) and 255) + (((b shr 16) and 255) - ((a shr 16) and 255)) * t
        val g = ((a shr 8) and 255) + (((b shr 8) and 255) - ((a shr 8) and 255)) * t
        val bl = (a and 255) + ((b and 255) - (a and 255)) * t
        return (0xFF shl 24) or (r.toInt() shl 16) or (g.toInt() shl 8) or bl.toInt()
    }
}
