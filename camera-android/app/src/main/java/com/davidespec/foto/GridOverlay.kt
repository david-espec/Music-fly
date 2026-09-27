package com.davidespec.foto

import android.content.Context
import android.graphics.Canvas
import android.graphics.Paint
import android.util.AttributeSet
import android.view.View

/** Grade da regra dos tercos, desenhada por cima do visor. */
class GridOverlay @JvmOverloads constructor(
    context: Context,
    attrs: AttributeSet? = null,
) : View(context, attrs) {

    private val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = 0x59FFFFFF
        strokeWidth = resources.displayMetrics.density
    }

    override fun onDraw(canvas: Canvas) {
        super.onDraw(canvas)
        val w = width.toFloat()
        val h = height.toFloat()
        for (i in 1..2) {
            val x = w * i / 3f
            val y = h * i / 3f
            canvas.drawLine(x, 0f, x, h, paint)
            canvas.drawLine(0f, y, w, y, paint)
        }
    }
}
