package com.davidespec.foto

import android.annotation.SuppressLint
import android.hardware.camera2.CameraCaptureSession
import android.hardware.camera2.CameraMetadata
import android.hardware.camera2.CaptureRequest
import android.hardware.camera2.TotalCaptureResult
import android.hardware.camera2.params.ColorSpaceTransform
import android.hardware.camera2.params.RggbChannelVector
import androidx.camera.camera2.interop.Camera2CameraControl
import androidx.camera.camera2.interop.CaptureRequestOptions
import androidx.camera.camera2.interop.ExperimentalCamera2Interop
import androidx.camera.core.Camera
import kotlin.math.ln
import kotlin.math.max
import kotlin.math.pow

/**
 * Controles manuais do modo Pro e travas de AE/AWB, aplicados direto na
 * sessao Camera2 por baixo do CameraX. Cada valor so e oferecido na interface
 * quando [CameraCapabilities] diz que o sensor aceita.
 */
@SuppressLint("UnsafeOptInUsageError")
@androidx.annotation.OptIn(ExperimentalCamera2Interop::class)
class ManualControls {

    /** null = automatico. */
    var iso: Int? = null
    var shutterNs: Long? = null
    /** CONTROL_AWB_MODE_*; AUTO = automatico. */
    var awbMode: Int = CameraMetadata.CONTROL_AWB_MODE_AUTO
    /** Temperatura manual em Kelvin (so com MANUAL_POST_PROCESSING). */
    var kelvin: Int? = null
    /** Foco manual em dioptrias (0 = infinito). */
    var focusDiopters: Float? = null
    var macroAf = false
    var aeLock = false
    var awbLock = false

    // Valores que a camera esta usando agora, lidos de cada quadro.
    @Volatile var liveIso: Int? = null
        private set
    @Volatile var liveExposureNs: Long? = null
        private set
    @Volatile var liveFocus: Float? = null
        private set
    @Volatile private var liveTransform: ColorSpaceTransform? = null

    val captureCallback = object : CameraCaptureSession.CaptureCallback() {
        override fun onCaptureCompleted(
            session: CameraCaptureSession,
            request: CaptureRequest,
            result: TotalCaptureResult,
        ) {
            result.get(android.hardware.camera2.CaptureResult.SENSOR_SENSITIVITY)?.let { liveIso = it }
            result.get(android.hardware.camera2.CaptureResult.SENSOR_EXPOSURE_TIME)?.let { liveExposureNs = it }
            result.get(android.hardware.camera2.CaptureResult.LENS_FOCUS_DISTANCE)?.let { liveFocus = it }
            result.get(android.hardware.camera2.CaptureResult.COLOR_CORRECTION_TRANSFORM)?.let { liveTransform = it }
        }
    }

    val isManualExposure get() = iso != null || shutterNs != null
    val isManual get() = isManualExposure || awbMode != CameraMetadata.CONTROL_AWB_MODE_AUTO ||
        kelvin != null || focusDiopters != null

    fun resetManual() {
        iso = null
        shutterNs = null
        awbMode = CameraMetadata.CONTROL_AWB_MODE_AUTO
        kelvin = null
        focusDiopters = null
    }

    fun resetAll() {
        resetManual()
        macroAf = false
        aeLock = false
        awbLock = false
    }

    /** Envia o estado atual para a camera. Chamar de novo depois de cada religacao. */
    fun apply(camera: Camera?, caps: CameraCapabilities?) {
        val cam = camera ?: return
        val control = Camera2CameraControl.from(cam.cameraControl)
        val b = CaptureRequestOptions.Builder()

        if (isManualExposure && caps?.manualSensor == true) {
            val isoRange = caps.isoRange
            val expRange = caps.exposureTimeRange
            var isoValue = iso ?: liveIso ?: 400
            var exposure = shutterNs ?: liveExposureNs ?: 33_333_333L
            if (isoRange != null) isoValue = isoValue.coerceIn(isoRange.lower, isoRange.upper)
            if (expRange != null) exposure = exposure.coerceIn(expRange.lower, expRange.upper)
            b.setCaptureRequestOption(CaptureRequest.CONTROL_AE_MODE, CameraMetadata.CONTROL_AE_MODE_OFF)
            b.setCaptureRequestOption(CaptureRequest.SENSOR_SENSITIVITY, isoValue)
            b.setCaptureRequestOption(CaptureRequest.SENSOR_EXPOSURE_TIME, exposure)
            b.setCaptureRequestOption(CaptureRequest.SENSOR_FRAME_DURATION, max(exposure, 33_333_333L))
        } else if (aeLock && caps?.aeLockAvailable == true) {
            b.setCaptureRequestOption(CaptureRequest.CONTROL_AE_LOCK, true)
        }

        val transform = liveTransform
        val k = kelvin
        if (k != null && caps?.manualPostProcessing == true && transform != null) {
            b.setCaptureRequestOption(CaptureRequest.CONTROL_AWB_MODE, CameraMetadata.CONTROL_AWB_MODE_OFF)
            b.setCaptureRequestOption(CaptureRequest.COLOR_CORRECTION_MODE, CameraMetadata.COLOR_CORRECTION_MODE_TRANSFORM_MATRIX)
            b.setCaptureRequestOption(CaptureRequest.COLOR_CORRECTION_GAINS, gainsFor(k))
            b.setCaptureRequestOption(CaptureRequest.COLOR_CORRECTION_TRANSFORM, transform)
        } else if (awbMode != CameraMetadata.CONTROL_AWB_MODE_AUTO) {
            b.setCaptureRequestOption(CaptureRequest.CONTROL_AWB_MODE, awbMode)
        } else if (awbLock && caps?.awbLockAvailable == true) {
            b.setCaptureRequestOption(CaptureRequest.CONTROL_AWB_LOCK, true)
        }

        val focus = focusDiopters
        if (focus != null && caps?.manualFocus == true) {
            b.setCaptureRequestOption(CaptureRequest.CONTROL_AF_MODE, CameraMetadata.CONTROL_AF_MODE_OFF)
            b.setCaptureRequestOption(CaptureRequest.LENS_FOCUS_DISTANCE, focus.coerceIn(0f, caps.minFocusDistance))
        } else if (macroAf && caps?.macroAf == true) {
            b.setCaptureRequestOption(CaptureRequest.CONTROL_AF_MODE, CameraMetadata.CONTROL_AF_MODE_MACRO)
        }

        try {
            control.setCaptureRequestOptions(b.build())
        } catch (error: Exception) {
            // Camera fechando; sera reaplicado na proxima ligacao.
        }
    }

    /**
     * Ganhos RGGB que neutralizam uma luz na temperatura dada (aproximacao de
     * corpo negro de Tanner Helland).
     */
    private fun gainsFor(kelvin: Int): RggbChannelVector {
        val t = kelvin / 100.0
        val r = if (t <= 66) 255.0 else (329.698727446 * (t - 60).pow(-0.1332047592)).coerceIn(0.0, 255.0)
        val g = if (t <= 66) (99.4708025861 * ln(t) - 161.1195681661).coerceIn(1.0, 255.0)
        else (288.1221695283 * (t - 60).pow(-0.0755148492)).coerceIn(1.0, 255.0)
        val b = when {
            t >= 66 -> 255.0
            t <= 19 -> 1.0
            else -> (138.5177312231 * ln(t - 10) - 305.0447927307).coerceIn(1.0, 255.0)
        }
        val rg = (g / r).toFloat()
        val bg = (g / b).toFloat()
        return RggbChannelVector(rg, 1f, 1f, bg)
    }

    companion object {
        /** Valores padrao de ISO, filtrados pela faixa do sensor. */
        fun isoSteps(caps: CameraCapabilities): List<Int> {
            val range = caps.isoRange ?: return emptyList()
            return listOf(50, 64, 80, 100, 125, 160, 200, 250, 320, 400, 500, 640, 800, 1000, 1250, 1600, 2000, 2500, 3200, 4000, 5000, 6400)
                .filter { it in range.lower..range.upper }
        }

        /** Velocidades de obturador em nanossegundos, filtradas pela faixa do sensor. */
        fun shutterSteps(caps: CameraCapabilities): List<Long> {
            val range = caps.exposureTimeRange ?: return emptyList()
            val seconds = listOf(
                1 / 8000.0, 1 / 4000.0, 1 / 2000.0, 1 / 1000.0, 1 / 500.0, 1 / 250.0, 1 / 125.0, 1 / 60.0,
                1 / 30.0, 1 / 15.0, 1 / 8.0, 1 / 4.0, 1 / 2.0, 1.0, 2.0, 4.0, 8.0, 15.0, 30.0,
            )
            return seconds.map { (it * 1_000_000_000L).toLong() }.filter { it in range.lower..range.upper }
        }

        fun awbName(mode: Int) = when (mode) {
            CameraMetadata.CONTROL_AWB_MODE_AUTO -> "Automático"
            CameraMetadata.CONTROL_AWB_MODE_DAYLIGHT -> "Luz do dia"
            CameraMetadata.CONTROL_AWB_MODE_CLOUDY_DAYLIGHT -> "Nublado"
            CameraMetadata.CONTROL_AWB_MODE_INCANDESCENT -> "Incandescente"
            CameraMetadata.CONTROL_AWB_MODE_FLUORESCENT -> "Fluorescente"
            CameraMetadata.CONTROL_AWB_MODE_WARM_FLUORESCENT -> "Fluorescente quente"
            CameraMetadata.CONTROL_AWB_MODE_TWILIGHT -> "Crepúsculo"
            CameraMetadata.CONTROL_AWB_MODE_SHADE -> "Sombra"
            else -> null
        }
    }
}
