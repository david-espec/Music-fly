package com.davidespec.foto

import android.content.Context
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.LinearGradient
import android.graphics.Matrix
import android.graphics.Paint
import android.graphics.PorterDuff
import android.graphics.PorterDuffXfermode
import android.graphics.Shader
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import kotlin.math.abs
import kotlin.math.cos
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt
import kotlin.math.tan

/**
 * Panorama guiado pelo giroscopio: enquanto o usuario gira o celular, um
 * quadro e guardado a cada ~45% do campo de visao. No fim os quadros sao
 * projetados num cilindro (corrige a distorcao das bordas), alinhados pelo
 * conteudo e costurados com transicao suave.
 */
class PanoramaSession(
    context: Context,
    /** Campo de visao na direcao do movimento, em radianos. */
    private val fovHorizontal: Double,
    private val fovVertical: Double,
    private val listener: Listener,
) : SensorEventListener {

    interface Listener {
        /** Pede um quadro ao analisador. */
        fun requestFrame()
        fun onGuide(progress: Float, tooFast: Boolean, drift: Float, vertical: Boolean?)
        fun onAutoFinish()
    }

    enum class Axis { HORIZONTAL, VERTICAL }

    private val sensors = context.getSystemService(Context.SENSOR_SERVICE) as SensorManager
    private val gyro: Sensor? = sensors.getDefaultSensor(Sensor.TYPE_GYROSCOPE)
    val available get() = gyro != null

    private var yaw = 0.0
    private var pitch = 0.0
    private var lastTimestamp = 0L
    private var lastCaptureAngle = 0.0
    var axis: Axis? = null
        private set
    var direction = 0
        private set
    private val frames = mutableListOf<Bitmap>()
    private val frameAngles = mutableListOf<Double>()
    private var waitingFrame = false
    private var pendingAngle = 0.0
    var running = false
        private set

    val frameCount get() = frames.size
    private val maxFrames = 12

    fun start() {
        frames.clear()
        frameAngles.clear()
        yaw = 0.0
        pitch = 0.0
        lastTimestamp = 0L
        lastCaptureAngle = 0.0
        axis = null
        direction = 0
        running = true
        gyro?.let { sensors.registerListener(this, it, SensorManager.SENSOR_DELAY_GAME) }
        // Primeiro quadro na posicao inicial.
        waitingFrame = true
        pendingAngle = 0.0
        listener.requestFrame()
    }

    fun stop() {
        running = false
        sensors.unregisterListener(this)
    }

    /** Chamado pelo analisador com o quadro pedido (ja em pe). */
    fun addFrame(frame: Bitmap) {
        if (!running || !waitingFrame) return
        waitingFrame = false
        frames += frame
        frameAngles += pendingAngle
        if (frames.size >= maxFrames) listener.onAutoFinish()
    }

    override fun onSensorChanged(event: SensorEvent) {
        if (!running) return
        if (lastTimestamp != 0L) {
            val dt = (event.timestamp - lastTimestamp) / 1_000_000_000.0
            // Celular em pe: girar para os lados e em torno do eixo Y; para cima/baixo, do X.
            yaw += event.values[1] * dt
            pitch += event.values[0] * dt
        }
        lastTimestamp = event.timestamp

        if (axis == null && max(abs(yaw), abs(pitch)) > Math.toRadians(4.0)) {
            axis = if (abs(yaw) >= abs(pitch)) Axis.HORIZONTAL else Axis.VERTICAL
        }
        val current = axis ?: run {
            listener.onGuide(0f, false, 0f, null)
            return
        }
        val angle = if (current == Axis.HORIZONTAL) yaw else pitch
        val cross = if (current == Axis.HORIZONTAL) pitch else yaw
        if (direction == 0 && abs(angle) > Math.toRadians(4.0)) direction = if (angle > 0) 1 else -1
        val speed = abs(if (current == Axis.HORIZONTAL) event.values[1] else event.values[0])
        val tooFast = speed > 1.2f
        val fov = if (current == Axis.HORIZONTAL) fovHorizontal else fovVertical
        val step = fov * 0.45
        val total = step * (maxFrames - 1)
        listener.onGuide(
            (abs(angle) / total).toFloat().coerceIn(0f, 1f),
            tooFast,
            Math.toDegrees(cross).toFloat(),
            current == Axis.VERTICAL,
        )
        // Rapido demais borra o quadro: espera o usuario desacelerar.
        if (!waitingFrame && !tooFast && abs(angle - lastCaptureAngle) >= step) {
            lastCaptureAngle = angle
            pendingAngle = angle
            waitingFrame = true
            listener.requestFrame()
        }
    }

    override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) = Unit

    /** Costura os quadros. Rodar fora da thread da interface. */
    fun stitch(): Bitmap? {
        if (frames.size < 2) return null
        val vertical = axis == Axis.VERTICAL
        // Para o vertical, gira tudo 90 graus e reaproveita a costura horizontal.
        var list = if (vertical) frames.map { rotate(it, -90f) } else frames.toList()
        val angles = frameAngles.toList()
        // Giro positivo (para a esquerda, ou para cima no vertical ja girado)
        // poe os quadros novos antes dos anteriores.
        val reverse = direction > 0
        val ordered = if (reverse) list.zip(angles).reversed() else list.zip(angles)
        list = ordered.map { it.first }
        val fov = if (vertical) fovVertical else fovHorizontal
        val result = Stitcher.stitch(list, ordered.map { it.second }, fov) ?: return null
        return if (vertical) rotate(result, 90f) else result
    }

    fun release() {
        stop()
        frames.forEach { it.recycle() }
        frames.clear()
    }

    private fun rotate(bitmap: Bitmap, degrees: Float): Bitmap =
        Bitmap.createBitmap(bitmap, 0, 0, bitmap.width, bitmap.height, Matrix().apply { postRotate(degrees) }, true)
}

object Stitcher {

    fun stitch(frames: List<Bitmap>, angles: List<Double>, fov: Double): Bitmap? {
        val w = frames[0].width
        val h = frames[0].height
        val focal = (w / 2.0) / tan(fov / 2)
        val warped = frames.map { cylindrical(it, focal) }

        // Posicao de cada quadro: previsao pelo giroscopio refinada pelo conteudo.
        val xs = IntArray(warped.size)
        val ys = IntArray(warped.size)
        for (i in 1 until warped.size) {
            val expected = abs(angles[i] - angles[i - 1]) * focal
            val (dx, dy) = offset(warped[i - 1], warped[i], expected.roundToInt())
            xs[i] = xs[i - 1] + dx
            ys[i] = ys[i - 1] + dy
        }
        val minY = ys.min()
        val maxY = ys.max()
        val width = xs.last() + w
        val height = h + (maxY - minY)
        if (width <= 0 || height <= 0) return null

        val canvasBitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
        val canvas = Canvas(canvasBitmap)
        warped.forEachIndexed { i, frame ->
            val overlap = if (i == 0) 0 else (xs[i - 1] + w - xs[i]).coerceIn(0, w)
            val piece = if (overlap > 8) feather(frame, overlap) else frame
            canvas.drawBitmap(piece, xs[i].toFloat(), (ys[i] - minY).toFloat(), null)
        }
        // So a faixa que todos os quadros cobrem, para nao sobrar borda vazia.
        val cropTop = maxY - minY
        val cropHeight = (h - cropTop).coerceAtLeast(h / 2).coerceAtMost(height - cropTop)
        if (cropHeight <= 0) return canvasBitmap
        return Bitmap.createBitmap(canvasBitmap, 0, cropTop, width, cropHeight)
    }

    /** Projecao cilindrica: deixa retas as linhas verticais ao juntar os quadros. */
    private fun cylindrical(src: Bitmap, focal: Double): Bitmap {
        val w = src.width
        val h = src.height
        val px = ImageEffects.pixels(src)
        val out = IntArray(w * h)
        val cx = w / 2.0
        val cy = h / 2.0
        for (x in 0 until w) {
            val theta = (x - cx) / focal
            val sx = focal * tan(theta) + cx
            val scale = 1.0 / cos(theta)
            if (sx < 0 || sx >= w - 1) continue
            val ix = sx.toInt()
            val fx = (sx - ix).toFloat()
            for (y in 0 until h) {
                val sy = (y - cy) * scale + cy
                if (sy < 0 || sy >= h - 1) continue
                val iy = sy.toInt()
                val fy = (sy - iy).toFloat()
                val a = ImageEffects.lerpColor(px[iy * w + ix], px[iy * w + ix + 1], fx)
                val b = ImageEffects.lerpColor(px[(iy + 1) * w + ix], px[(iy + 1) * w + ix + 1], fx)
                out[y * w + x] = ImageEffects.lerpColor(a, b, fy)
            }
        }
        return ImageEffects.fromPixels(out, w, h)
    }

    /** Melhor deslocamento de [next] em relacao a [prev], perto do previsto. */
    private fun offset(prev: Bitmap, next: Bitmap, expected: Int): Pair<Int, Int> {
        val scale = 4
        val a = ImageEffects.luma(prev, prev.width / scale)
        val b = ImageEffects.luma(next, next.width / scale)
        val e = (expected / scale).coerceIn(a.w / 8, a.w - a.w / 8)
        val minDx = max(1, (e * 0.6).toInt())
        val maxDx = min(a.w - a.w / 10, (e * 1.4).toInt())
        val maxDy = max(2, a.h / 12)
        var best = Long.MAX_VALUE
        var bestDx = e
        var bestDy = 0
        for (dy in -maxDy..maxDy) {
            for (dx in minDx..maxDx) {
                var sum = 0L
                var count = 0
                var y = max(0, -dy) + 2
                val yEnd = min(a.h, b.h - dy) - 2
                while (y < yEnd) {
                    var x = dx
                    while (x < a.w) {
                        sum += abs(a.data[y * a.w + x] - b.data[(y + dy) * b.w + (x - dx)])
                        count++
                        x += 2
                    }
                    y += 2
                }
                // Sobreposicao pequena demais nao e confiavel.
                if (count < 200) continue
                val score = sum * 1000 / count
                if (score < best) {
                    best = score
                    bestDx = dx
                    bestDy = dy
                }
            }
        }
        return bestDx * scale to bestDy * scale
    }

    /** Transicao suave: a borda de entrada do quadro vai de transparente a opaco. */
    private fun feather(frame: Bitmap, overlap: Int): Bitmap {
        val out = frame.copy(Bitmap.Config.ARGB_8888, true)
        val paint = Paint().apply {
            shader = LinearGradient(0f, 0f, overlap.toFloat(), 0f, 0x00000000, 0xFF000000.toInt(), Shader.TileMode.CLAMP)
            xfermode = PorterDuffXfermode(PorterDuff.Mode.DST_IN)
        }
        Canvas(out).drawRect(0f, 0f, overlap.toFloat(), out.height.toFloat(), paint)
        return out
    }
}
