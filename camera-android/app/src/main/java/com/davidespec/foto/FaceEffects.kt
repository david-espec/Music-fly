package com.davidespec.foto

import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Path
import android.graphics.PointF
import android.graphics.Rect
import com.google.android.gms.tasks.Tasks
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.face.Face
import com.google.mlkit.vision.face.FaceContour
import com.google.mlkit.vision.face.FaceDetection
import com.google.mlkit.vision.face.FaceDetectorOptions
import com.google.mlkit.vision.segmentation.Segmentation
import com.google.mlkit.vision.segmentation.selfie.SelfieSegmenterOptions
import java.util.concurrent.TimeUnit
import kotlin.math.max
import kotlin.math.min
import kotlin.math.sqrt

/**
 * Efeitos que dependem de achar pessoas e rostos na foto, com os modelos
 * embutidos do ML Kit (rodam no aparelho, sem internet).
 *
 * O desfoque do Retrato aqui e feito por software (segmentacao de pessoa),
 * nao por sensor de profundidade.
 */
object FaceEffects {

    class Beauty(
        val smooth: Int,
        val bright: Int,
        val eyes: Int,
        val face: Int,
        val teeth: Int,
        val contour: Int,
    ) {
        val active get() = smooth + bright + eyes + face + teeth + contour > 0
    }

    private val accurateDetector by lazy {
        FaceDetection.getClient(
            FaceDetectorOptions.Builder()
                .setPerformanceMode(FaceDetectorOptions.PERFORMANCE_MODE_ACCURATE)
                .setContourMode(FaceDetectorOptions.CONTOUR_MODE_ALL)
                .setMinFaceSize(0.08f)
                .build(),
        )
    }

    private val segmenter by lazy {
        Segmentation.getClient(
            SelfieSegmenterOptions.Builder()
                .setDetectorMode(SelfieSegmenterOptions.SINGLE_IMAGE_MODE)
                .build(),
        )
    }

    // --- Retrato ----------------------------------------------------------------------

    /**
     * Desfoca o fundo atras das pessoas. [strength] 0..100.
     * Devolve null quando nao ha pessoa na foto (a foto sai sem desfoque).
     */
    fun portrait(bitmap: Bitmap, strength: Int): Bitmap? {
        val longSide = max(bitmap.width, bitmap.height)
        val scale = min(1f, 512f / longSide)
        val small = Bitmap.createScaledBitmap(
            bitmap,
            max(1, (bitmap.width * scale).toInt()),
            max(1, (bitmap.height * scale).toInt()),
            true,
        )
        val mask = (
            try {
                Tasks.await(segmenter.process(InputImage.fromBitmap(small, 0)), 10, TimeUnit.SECONDS)
            } catch (error: Exception) {
                null
            } finally {
                small.recycle()
            }
            ) ?: return null

        val mw = mask.width
        val mh = mask.height
        val buffer = mask.buffer
        buffer.rewind()
        val values = FloatArray(mw * mh) { buffer.float }
        val coverage = values.count { it > 0.5f }.toFloat() / values.size
        if (coverage < 0.02f) return null

        // Suaviza a borda da mascara para o recorte nao ficar serrilhado.
        val soft = softenMask(values, mw, mh, 2)
        val radius = min(bitmap.width, bitmap.height) * (0.005f + 0.035f * strength / 100f)
        val blurred = ImageEffects.blur(bitmap, radius)
        val out = ImageEffects.composite(bitmap, blurred, soft, mw, mh)
        blurred.recycle()
        return out
    }

    private fun softenMask(values: FloatArray, w: Int, h: Int, r: Int): FloatArray {
        val asInts = IntArray(values.size) { i ->
            val v = (values[i] * 255f).toInt().coerceIn(0, 255)
            (0xFF shl 24) or (v shl 16) or (v shl 8) or v
        }
        ImageEffects.boxBlur(asInts, w, h, r)
        return FloatArray(values.size) { i -> (asInts[i] and 255) / 255f }
    }

    // --- Beleza ---------------------------------------------------------------------------

    /** Aplica os ajustes de beleza em todos os rostos. Intensidades 0..100. */
    fun beauty(source: Bitmap, settings: Beauty): Bitmap {
        if (!settings.active) return source
        val faces = detectFacesScaled(source)
        if (faces.isEmpty()) return source
        var out = ImageEffects.mutableCopy(source)
        faces.forEach { face ->
            if (settings.smooth > 0 || settings.bright > 0) out = skin(out, face, settings.smooth, settings.bright)
            if (settings.contour > 0) out = contour(out, face, settings.contour)
            if (settings.teeth > 0) out = teeth(out, face, settings.teeth)
            if (settings.eyes > 0) out = eyes(out, face, settings.eyes)
            if (settings.face > 0) out = slim(out, face, settings.face)
        }
        return out
    }

    /** Rosto detectado ja convertido para as coordenadas da foto grande. */
    class FaceShape(
        val bounds: Rect,
        val outline: List<PointF>,
        val leftEye: List<PointF>,
        val rightEye: List<PointF>,
        val leftBrow: List<PointF>,
        val rightBrow: List<PointF>,
        val lipsOuter: List<PointF>,
        val mouthInner: List<PointF>,
    )

    fun detectFacesScaled(bitmap: Bitmap): List<FaceShape> {
        val longSide = max(bitmap.width, bitmap.height)
        val scale = if (longSide > 1280) 1280f / longSide else 1f
        val small = if (scale < 1f) {
            Bitmap.createScaledBitmap(bitmap, (bitmap.width * scale).toInt(), (bitmap.height * scale).toInt(), true)
        } else {
            bitmap
        }
        val faces = try {
            Tasks.await(accurateDetector.process(InputImage.fromBitmap(small, 0)), 10, TimeUnit.SECONDS)
        } catch (error: Exception) {
            emptyList()
        } finally {
            if (small !== bitmap) small.recycle()
        }
        val k = 1f / scale
        fun pts(face: Face, type: Int) = face.getContour(type)?.points?.map { PointF(it.x * k, it.y * k) } ?: emptyList()
        return faces.mapNotNull { face ->
            val outline = pts(face, FaceContour.FACE)
            if (outline.size < 10) return@mapNotNull null
            val b = face.boundingBox
            FaceShape(
                bounds = Rect((b.left * k).toInt(), (b.top * k).toInt(), (b.right * k).toInt(), (b.bottom * k).toInt()),
                outline = outline,
                leftEye = pts(face, FaceContour.LEFT_EYE),
                rightEye = pts(face, FaceContour.RIGHT_EYE),
                leftBrow = pts(face, FaceContour.LEFT_EYEBROW_TOP) + pts(face, FaceContour.LEFT_EYEBROW_BOTTOM).reversed(),
                rightBrow = pts(face, FaceContour.RIGHT_EYEBROW_TOP) + pts(face, FaceContour.RIGHT_EYEBROW_BOTTOM).reversed(),
                lipsOuter = pts(face, FaceContour.UPPER_LIP_TOP) + pts(face, FaceContour.LOWER_LIP_BOTTOM).reversed(),
                mouthInner = pts(face, FaceContour.UPPER_LIP_BOTTOM) + pts(face, FaceContour.LOWER_LIP_TOP).reversed(),
            )
        }
    }

    private fun region(bitmap: Bitmap, bounds: Rect, grow: Float): Rect {
        val gw = (bounds.width() * grow).toInt()
        val gh = (bounds.height() * grow).toInt()
        return Rect(
            max(0, bounds.left - gw),
            max(0, bounds.top - gh),
            min(bitmap.width, bounds.right + gw),
            min(bitmap.height, bounds.bottom + gh),
        )
    }

    private fun path(points: List<PointF>, dx: Float, dy: Float, k: Float): Path {
        val p = Path()
        points.forEachIndexed { i, pt ->
            if (i == 0) p.moveTo((pt.x - dx) * k, (pt.y - dy) * k) else p.lineTo((pt.x - dx) * k, (pt.y - dy) * k)
        }
        p.close()
        return p
    }

    /**
     * Mascara da pele do rosto numa grade pequena: dentro do contorno, fora de
     * olhos, sobrancelhas e boca, e so onde a cor parece pele.
     */
    private fun skinMask(bitmap: Bitmap, area: Rect, face: FaceShape): Triple<FloatArray, Int, Int> {
        val mw = 160
        val mh = max(1, 160 * area.height() / max(1, area.width()))
        val k = mw.toFloat() / area.width()
        val maskBmp = Bitmap.createBitmap(mw, mh, Bitmap.Config.ARGB_8888)
        val canvas = Canvas(maskBmp)
        val paint = Paint(Paint.ANTI_ALIAS_FLAG)
        paint.color = Color.WHITE
        canvas.drawPath(path(face.outline, area.left.toFloat(), area.top.toFloat(), k), paint)
        paint.color = Color.BLACK
        listOf(face.leftEye, face.rightEye, face.leftBrow, face.rightBrow, face.lipsOuter)
            .filter { it.size > 2 }
            .forEach { canvas.drawPath(path(it, area.left.toFloat(), area.top.toFloat(), k), paint) }
        val shape = ImageEffects.pixels(maskBmp)
        maskBmp.recycle()
        ImageEffects.boxBlur(shape, mw, mh, 2)

        val crop = Bitmap.createBitmap(bitmap, area.left, area.top, area.width(), area.height())
        val colors = ImageEffects.pixels(Bitmap.createScaledBitmap(crop, mw, mh, true))
        crop.recycle()
        val mask = FloatArray(mw * mh) { i ->
            val c = colors[i]
            val r = (c shr 16) and 255
            val g = (c shr 8) and 255
            val b = c and 255
            val cr = 128 + (0.5f * r - 0.4187f * g - 0.0813f * b)
            val cb = 128 + (-0.1687f * r - 0.3313f * g + 0.5f * b)
            val skin = if (cr in 128f..180f && cb in 72f..132f) 1f else 0.25f
            (shape[i] and 255) / 255f * skin
        }
        return Triple(mask, mw, mh)
    }

    private fun skin(bitmap: Bitmap, face: FaceShape, smooth: Int, bright: Int): Bitmap {
        val area = region(bitmap, face.bounds, 0.15f)
        if (area.width() < 16 || area.height() < 16) return bitmap
        val (mask, mw, mh) = skinMask(bitmap, area, face)
        val crop = Bitmap.createBitmap(bitmap, area.left, area.top, area.width(), area.height())
        var processed = crop
        if (smooth > 0) {
            val blurred = ImageEffects.blur(crop, face.bounds.width() / 55f * (0.4f + smooth / 100f))
            val k = FloatArray(mask.size) { mask[it] * 0.85f * smooth / 100f }
            processed = ImageEffects.composite(blurred, crop, k, mw, mh)
            blurred.recycle()
        }
        if (bright > 0) {
            val t = bright / 100f
            val lifted = ImageEffects.applyMatrix(processed, Filters.chain(Filters.scale(1f + 0.12f * t, 1f + 0.12f * t, 1f + 0.12f * t), Filters.brightness(10f * t)))
            val k = FloatArray(mask.size) { mask[it] * t }
            processed = ImageEffects.composite(lifted, processed, k, mw, mh)
        }
        Canvas(bitmap).drawBitmap(processed, area.left.toFloat(), area.top.toFloat(), null)
        return bitmap
    }

    /** Sombra suave nas laterais do rosto, que afina visualmente o contorno. */
    private fun contour(bitmap: Bitmap, face: FaceShape, amount: Int): Bitmap {
        val area = region(bitmap, face.bounds, 0.1f)
        val mw = 160
        val mh = max(1, 160 * area.height() / max(1, area.width()))
        val k = mw.toFloat() / area.width()
        val maskBmp = Bitmap.createBitmap(mw, mh, Bitmap.Config.ARGB_8888)
        val canvas = Canvas(maskBmp)
        val outline = path(face.outline, area.left.toFloat(), area.top.toFloat(), k)
        canvas.save()
        canvas.clipPath(outline)
        canvas.drawPath(
            outline,
            Paint(Paint.ANTI_ALIAS_FLAG).apply {
                color = Color.WHITE
                style = Paint.Style.STROKE
                strokeWidth = face.bounds.width() * k * 0.22f
            },
        )
        canvas.restore()
        val px = ImageEffects.pixels(maskBmp)
        maskBmp.recycle()
        ImageEffects.boxBlur(px, mw, mh, 4)
        // So as laterais: some com a parte de cima (testa).
        val mask = FloatArray(mw * mh) { i -> (px[i] and 255) / 255f * ((i / mw).toFloat() / mh).coerceIn(0.3f, 1f) * amount / 100f * 0.8f }
        val crop = Bitmap.createBitmap(bitmap, area.left, area.top, area.width(), area.height())
        val dark = ImageEffects.applyMatrix(crop, Filters.scale(0.82f, 0.8f, 0.8f))
        val out = ImageEffects.composite(dark, crop, mask, mw, mh)
        Canvas(bitmap).drawBitmap(out, area.left.toFloat(), area.top.toFloat(), null)
        return bitmap
    }

    /** Clareia e tira o amarelado dos dentes, so dentro da boca aberta. */
    private fun teeth(bitmap: Bitmap, face: FaceShape, amount: Int): Bitmap {
        if (face.mouthInner.size < 4) return bitmap
        val xs = face.mouthInner.map { it.x }
        val ys = face.mouthInner.map { it.y }
        val area = Rect(
            max(0, xs.min().toInt() - 2), max(0, ys.min().toInt() - 2),
            min(bitmap.width, xs.max().toInt() + 2), min(bitmap.height, ys.max().toInt() + 2),
        )
        if (area.width() < 4 || area.height() < 3) return bitmap
        val maskBmp = Bitmap.createBitmap(area.width(), area.height(), Bitmap.Config.ARGB_8888)
        Canvas(maskBmp).drawPath(
            path(face.mouthInner, area.left.toFloat(), area.top.toFloat(), 1f),
            Paint(Paint.ANTI_ALIAS_FLAG).apply { color = Color.WHITE },
        )
        val mask = ImageEffects.pixels(maskBmp)
        maskBmp.recycle()
        val px = IntArray(area.width() * area.height())
        bitmap.getPixels(px, 0, area.width(), area.left, area.top, area.width(), area.height())
        val t = amount / 100f
        for (i in px.indices) {
            val m = (mask[i] and 255) / 255f
            if (m <= 0f) continue
            val c = px[i]
            val r = (c shr 16) and 255
            val g = (c shr 8) and 255
            val b = c and 255
            val lum = (r * 77 + g * 150 + b * 29) shr 8
            if (lum < 80) continue // interior escuro da boca
            val gray = (r + g + b) / 3f
            val k = m * t
            val nr = r + (gray - r) * 0.6f * k + 18 * k
            val ng = g + (gray - g) * 0.6f * k + 18 * k
            val nb = b + (gray - b) * 0.6f * k + 26 * k
            px[i] = (0xFF shl 24) or (ImageEffects.clamp(nr) shl 16) or (ImageEffects.clamp(ng) shl 8) or ImageEffects.clamp(nb)
        }
        bitmap.setPixels(px, 0, area.width(), area.left, area.top, area.width(), area.height())
        return bitmap
    }

    /** Aumenta levemente os olhos com uma lente local. */
    private fun eyes(bitmap: Bitmap, face: FaceShape, amount: Int): Bitmap {
        var out = bitmap
        listOf(face.leftEye, face.rightEye).filter { it.size >= 4 }.forEach { eye ->
            val cx = eye.map { it.x }.average().toFloat()
            val cy = eye.map { it.y }.average().toFloat()
            val width = eye.maxOf { it.x } - eye.minOf { it.x }
            out = lens(out, cx, cy, width * 1.1f, 0.22f * amount / 100f)
        }
        return out
    }

    /** Afina o rosto empurrando a linha do maxilar para dentro. */
    private fun slim(bitmap: Bitmap, face: FaceShape, amount: Int): Bitmap {
        val outline = face.outline
        val cx = outline.map { it.x }.average().toFloat()
        val cy = outline.map { it.y }.average().toFloat()
        val radius = face.bounds.width() * 0.28f
        val strength = face.bounds.width() * 0.05f * amount / 100f
        var out = bitmap
        // Pontos da metade de baixo do contorno, nas laterais.
        outline.filter { it.y > cy && kotlin.math.abs(it.x - cx) > face.bounds.width() * 0.2f }
            .filterIndexed { i, _ -> i % 2 == 0 }
            .forEach { p ->
                val dx = cx - p.x
                val dy = cy - p.y
                val len = sqrt(dx * dx + dy * dy).coerceAtLeast(1f)
                out = push(out, p.x, p.y, radius, dx / len * strength, dy / len * strength)
            }
        return out
    }

    /** Lente de aumento local: amostra mais perto do centro dentro do raio. */
    private fun lens(bitmap: Bitmap, cx: Float, cy: Float, radius: Float, strength: Float): Bitmap {
        val area = Rect(
            max(0, (cx - radius).toInt()), max(0, (cy - radius).toInt()),
            min(bitmap.width, (cx + radius).toInt() + 1), min(bitmap.height, (cy + radius).toInt() + 1),
        )
        if (area.width() < 3 || area.height() < 3) return bitmap
        val w = area.width()
        val h = area.height()
        val src = IntArray(w * h)
        bitmap.getPixels(src, 0, w, area.left, area.top, w, h)
        val dst = src.copyOf()
        for (y in 0 until h) {
            for (x in 0 until w) {
                val px = x + area.left - cx
                val py = y + area.top - cy
                val d = sqrt(px * px + py * py) / radius
                if (d >= 1f) continue
                val f = 1f - strength * (1f - d * d)
                dst[y * w + x] = sample(src, w, h, cx + px * f - area.left, cy + py * f - area.top)
            }
        }
        bitmap.setPixels(dst, 0, w, area.left, area.top, w, h)
        return bitmap
    }

    /** Empurra o conteudo em volta de (cx, cy) na direcao (vx, vy), com queda suave. */
    private fun push(bitmap: Bitmap, cx: Float, cy: Float, radius: Float, vx: Float, vy: Float): Bitmap {
        val area = Rect(
            max(0, (cx - radius).toInt()), max(0, (cy - radius).toInt()),
            min(bitmap.width, (cx + radius).toInt() + 1), min(bitmap.height, (cy + radius).toInt() + 1),
        )
        if (area.width() < 3 || area.height() < 3) return bitmap
        val w = area.width()
        val h = area.height()
        val src = IntArray(w * h)
        bitmap.getPixels(src, 0, w, area.left, area.top, w, h)
        val dst = src.copyOf()
        for (y in 0 until h) {
            for (x in 0 until w) {
                val px = x + area.left - cx
                val py = y + area.top - cy
                val d = sqrt(px * px + py * py) / radius
                if (d >= 1f) continue
                val fall = (1f - d * d) * (1f - d * d)
                dst[y * w + x] = sample(src, w, h, x - vx * fall, y - vy * fall)
            }
        }
        bitmap.setPixels(dst, 0, w, area.left, area.top, w, h)
        return bitmap
    }

    /** Amostragem bilinear. */
    private fun sample(src: IntArray, w: Int, h: Int, x: Float, y: Float): Int {
        val x0 = x.toInt().coerceIn(0, w - 1)
        val y0 = y.toInt().coerceIn(0, h - 1)
        val x1 = min(x0 + 1, w - 1)
        val y1 = min(y0 + 1, h - 1)
        val fx = (x - x0).coerceIn(0f, 1f)
        val fy = (y - y0).coerceIn(0f, 1f)
        val top = ImageEffects.lerpColor(src[y0 * w + x0], src[y0 * w + x1], fx)
        val bottom = ImageEffects.lerpColor(src[y1 * w + x0], src[y1 * w + x1], fx)
        return ImageEffects.lerpColor(top, bottom, fy)
    }
}
