package com.davidespec.foto

import android.content.Context
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.DashPathEffect
import android.graphics.Paint
import android.graphics.Path
import android.graphics.RectF
import android.util.AttributeSet
import android.view.View
import kotlin.math.abs
import kotlin.math.min

/**
 * Tudo que e desenhado por cima do visor: grade, guia central, nivelador,
 * contornos de QR Code e rostos, e o circulo do modo Comida.
 */
class CameraOverlay @JvmOverloads constructor(
    context: Context,
    attrs: AttributeSet? = null,
) : View(context, attrs) {

    private val density = resources.displayMetrics.density

    var gridType: String? = null
        set(value) { field = value; invalidate() }
    var centerGuide = false
        set(value) { field = value; invalidate() }

    /** Giro do celular em graus (0 = em pe); null = nivelador desligado. */
    var levelAngle: Float? = null
        set(value) { field = value; invalidate() }

    /** Retangulos em coordenadas desta view. */
    var qrBoxes: List<RectF> = emptyList()
        set(value) { field = value; invalidate() }

    /** Circulo do modo Comida: raio como fracao do menor lado; null = desligado. */
    var foodRadius: Float? = null
        set(value) { field = value; invalidate() }

    private val gridPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = 0x66FFFFFF
        strokeWidth = density
    }
    private val levelPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        strokeWidth = 2 * density
        style = Paint.Style.STROKE
    }
    private val qrPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = 0xFFFFD60A.toInt()
        style = Paint.Style.STROKE
        strokeWidth = 3 * density
    }
    private val foodShade = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = 0x66000000 }
    private val foodRing = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = 0xCCFFFFFF.toInt()
        style = Paint.Style.STROKE
        strokeWidth = 1.5f * density
        pathEffect = DashPathEffect(floatArrayOf(8 * density, 6 * density), 0f)
    }

    override fun onDraw(canvas: Canvas) {
        super.onDraw(canvas)
        val w = width.toFloat()
        val h = height.toFloat()

        foodRadius?.let { k ->
            val r = k * min(w, h)
            val path = Path().apply {
                fillType = Path.FillType.EVEN_ODD
                addRect(0f, 0f, w, h, Path.Direction.CW)
                addCircle(w / 2, h / 2, r, Path.Direction.CW)
            }
            canvas.drawPath(path, foodShade)
            canvas.drawCircle(w / 2, h / 2, r, foodRing)
        }

        when (gridType) {
            "3x3" -> lines(canvas, 3, w, h)
            "4x4" -> lines(canvas, 4, w, h)
        }
        if (centerGuide) {
            val s = 14 * density
            canvas.drawLine(w / 2 - s, h / 2, w / 2 + s, h / 2, gridPaint)
            canvas.drawLine(w / 2, h / 2 - s, w / 2, h / 2 + s, gridPaint)
        }

        levelAngle?.let { angle ->
            // angle: giro do celular (0 = em pe). A referencia fica no eixo mais
            // proximo (0, 90, 180...) e a linha viva acompanha o horizonte real.
            val base = Math.round(angle / 90f) * 90f
            val level = abs(angle - base) < 1f
            levelPaint.color = if (level) 0xFFFFD60A.toInt() else Color.WHITE
            val len = min(w, h) * 0.18f
            canvas.save()
            canvas.translate(w / 2, h / 2)
            canvas.rotate(base)
            canvas.drawLine(-len * 1.4f, 0f, -len * 1.1f, 0f, levelPaint)
            canvas.drawLine(len * 1.1f, 0f, len * 1.4f, 0f, levelPaint)
            canvas.rotate(if (level) 0f else angle - base)
            canvas.drawLine(-len, 0f, len, 0f, levelPaint)
            canvas.restore()
        }

        qrBoxes.forEach { canvas.drawRoundRect(it, 6 * density, 6 * density, qrPaint) }
    }

    private fun lines(canvas: Canvas, n: Int, w: Float, h: Float) {
        for (i in 1 until n) {
            canvas.drawLine(w * i / n, 0f, w * i / n, h, gridPaint)
            canvas.drawLine(0f, h * i / n, w, h * i / n, gridPaint)
        }
    }
}

/** Histograma de luminancia do visor. */
class HistogramView @JvmOverloads constructor(
    context: Context,
    attrs: AttributeSet? = null,
) : View(context, attrs) {

    private val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = 0xCCFFFFFF.toInt() }
    private val background = Paint().apply { color = 0x66000000 }
    private var bins = IntArray(0)
    private val path = Path()

    fun update(values: IntArray) {
        bins = values
        invalidate()
    }

    override fun onDraw(canvas: Canvas) {
        super.onDraw(canvas)
        canvas.drawRoundRect(0f, 0f, width.toFloat(), height.toFloat(), 8f, 8f, background)
        if (bins.isEmpty()) return
        val max = (bins.maxOrNull() ?: 1).coerceAtLeast(1).toFloat()
        path.reset()
        path.moveTo(0f, height.toFloat())
        val step = width.toFloat() / (bins.size - 1)
        bins.forEachIndexed { i, v ->
            path.lineTo(i * step, height - (v / max) * (height - 4))
        }
        path.lineTo(width.toFloat(), height.toFloat())
        path.close()
        canvas.drawPath(path, paint)
    }
}
