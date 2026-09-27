package com.davidespec.foto

import android.annotation.SuppressLint
import android.graphics.Bitmap
import android.graphics.Matrix
import android.graphics.Rect
import android.os.SystemClock
import androidx.camera.core.ImageAnalysis
import androidx.camera.core.ImageProxy
import androidx.camera.view.transform.ImageProxyTransformFactory
import androidx.camera.view.transform.OutputTransform
import com.google.android.gms.tasks.Task
import com.google.android.gms.tasks.Tasks
import com.google.mlkit.vision.barcode.BarcodeScannerOptions
import com.google.mlkit.vision.barcode.BarcodeScanning
import com.google.mlkit.vision.barcode.common.Barcode
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.face.FaceDetection
import com.google.mlkit.vision.face.FaceDetectorOptions

/**
 * Analisa quadros pequenos do visor (cerca de 640x480) em segundo plano.
 * Cada recurso so roda quando esta ligado, e com intervalo minimo, para nao
 * gastar bateria a toa.
 */
@SuppressLint("UnsafeOptInUsageError", "RestrictedApi")
class FrameAnalyzer(private val listener: Listener) : ImageAnalysis.Analyzer {

    interface Listener {
        fun onHistogram(bins: IntArray, clippedHigh: Float, clippedLow: Float)
        fun onQr(codes: List<Barcode>, transform: OutputTransform)
        fun onFaces(boxes: List<Rect>, transform: OutputTransform)
        fun onPanoramaFrame(frame: Bitmap)
    }

    @Volatile var histogram = false
    @Volatile var qr = false
    @Volatile var faces = false
    /** Quando ligado, entrega um quadro por pedido para o panorama. */
    @Volatile var panoramaRequest = false

    private var lastHistogram = 0L
    private var lastQr = 0L
    private var lastFaces = 0L

    private val scanner by lazy {
        BarcodeScanning.getClient(
            BarcodeScannerOptions.Builder().setBarcodeFormats(Barcode.FORMAT_QR_CODE).build(),
        )
    }

    private val faceDetector by lazy {
        FaceDetection.getClient(
            FaceDetectorOptions.Builder()
                .setPerformanceMode(FaceDetectorOptions.PERFORMANCE_MODE_FAST)
                .setMinFaceSize(0.15f)
                .build(),
        )
    }

    private val transformFactory = ImageProxyTransformFactory().apply { isUsingRotationDegrees = true }

    fun close() {
        try {
            scanner.close()
            faceDetector.close()
        } catch (error: Exception) {
            // Ja fechado.
        }
    }

    override fun analyze(image: ImageProxy) {
        val now = SystemClock.elapsedRealtime()

        if (panoramaRequest) {
            panoramaRequest = false
            try {
                val bitmap = image.toBitmap()
                val rotation = image.imageInfo.rotationDegrees
                val upright = if (rotation == 0) bitmap else {
                    Bitmap.createBitmap(bitmap, 0, 0, bitmap.width, bitmap.height, Matrix().apply { postRotate(rotation.toFloat()) }, true)
                }
                listener.onPanoramaFrame(upright)
            } catch (error: Exception) {
                // Quadro perdido; o panorama pede outro.
            }
        }

        if (histogram && now - lastHistogram > 150) {
            lastHistogram = now
            computeHistogram(image)
        }

        val tasks = mutableListOf<Task<*>>()
        val mediaImage = image.image
        if (mediaImage != null && (qr && now - lastQr > 300 || faces && now - lastFaces > 400)) {
            val input = InputImage.fromMediaImage(mediaImage, image.imageInfo.rotationDegrees)
            val transform = transformFactory.getOutputTransform(image)
            if (qr && now - lastQr > 300) {
                lastQr = now
                tasks += scanner.process(input).addOnSuccessListener { listener.onQr(it, transform) }
            }
            if (faces && now - lastFaces > 400) {
                lastFaces = now
                tasks += faceDetector.process(input).addOnSuccessListener { list ->
                    listener.onFaces(list.map { it.boundingBox }, transform)
                }
            }
        }
        if (tasks.isEmpty()) {
            image.close()
        } else {
            // O quadro so pode ser liberado depois que o ML Kit terminar.
            Tasks.whenAllComplete(tasks).addOnCompleteListener { image.close() }
        }
    }

    private fun computeHistogram(image: ImageProxy) {
        val plane = image.planes.firstOrNull() ?: return
        val buffer = plane.buffer
        val rowStride = plane.rowStride
        val pixelStride = plane.pixelStride
        val bins = IntArray(64)
        var total = 0
        var y = 0
        while (y < image.height) {
            var x = 0
            while (x < image.width) {
                val index = y * rowStride + x * pixelStride
                if (index < buffer.limit()) {
                    bins[(buffer.get(index).toInt() and 0xFF) shr 2]++
                    total++
                }
                x += 4
            }
            y += 4
        }
        if (total == 0) return
        val high = (bins[62] + bins[63]).toFloat() / total
        val low = (bins[0] + bins[1]).toFloat() / total
        listener.onHistogram(bins, high, low)
    }
}
