package com.davidespec.foto

import android.annotation.SuppressLint
import android.content.Context
import android.graphics.ImageFormat
import android.hardware.camera2.CameraCharacteristics
import android.hardware.camera2.CameraManager
import android.hardware.camera2.CameraMetadata
import android.util.Range
import android.util.Size
import androidx.camera.camera2.interop.Camera2CameraInfo
import androidx.camera.camera2.interop.ExperimentalCamera2Interop
import androidx.camera.core.CameraInfo
import kotlin.math.abs
import kotlin.math.atan

/**
 * O que a camera ligada realmente oferece, lido da Camera2 API. Nada aqui e
 * suposto a partir do modelo do aparelho: a interface mostra ou esconde cada
 * controle com base nestes valores.
 */
@SuppressLint("UnsafeOptInUsageError")
@androidx.annotation.OptIn(ExperimentalCamera2Interop::class)
class CameraCapabilities(val info: CameraInfo) {

    private val c2 = Camera2CameraInfo.from(info)

    private fun <T> get(key: CameraCharacteristics.Key<T>): T? =
        try {
            c2.getCameraCharacteristic(key)
        } catch (error: Exception) {
            null
        }

    val cameraId: String = c2.cameraId
    val facing: Int = get(CameraCharacteristics.LENS_FACING) ?: CameraMetadata.LENS_FACING_BACK
    val isFront get() = facing == CameraMetadata.LENS_FACING_FRONT

    val hasFlash: Boolean = info.hasFlashUnit()
    private val capabilities: IntArray = get(CameraCharacteristics.REQUEST_AVAILABLE_CAPABILITIES) ?: IntArray(0)
    val manualSensor = CameraMetadata.REQUEST_AVAILABLE_CAPABILITIES_MANUAL_SENSOR in capabilities
    val manualPostProcessing = CameraMetadata.REQUEST_AVAILABLE_CAPABILITIES_MANUAL_POST_PROCESSING in capabilities
    val raw = CameraMetadata.REQUEST_AVAILABLE_CAPABILITIES_RAW in capabilities
    val depthOutput = CameraMetadata.REQUEST_AVAILABLE_CAPABILITIES_DEPTH_OUTPUT in capabilities
    val logicalMultiCamera = CameraMetadata.REQUEST_AVAILABLE_CAPABILITIES_LOGICAL_MULTI_CAMERA in capabilities

    val isoRange: Range<Int>? = get(CameraCharacteristics.SENSOR_INFO_SENSITIVITY_RANGE)
    val exposureTimeRange: Range<Long>? = get(CameraCharacteristics.SENSOR_INFO_EXPOSURE_TIME_RANGE)
    val minFocusDistance: Float = get(CameraCharacteristics.LENS_INFO_MINIMUM_FOCUS_DISTANCE) ?: 0f
    val hyperfocalDistance: Float = get(CameraCharacteristics.LENS_INFO_HYPERFOCAL_DISTANCE) ?: 0f
    val afModes: IntArray = get(CameraCharacteristics.CONTROL_AF_AVAILABLE_MODES) ?: IntArray(0)
    val awbModes: IntArray = get(CameraCharacteristics.CONTROL_AWB_AVAILABLE_MODES) ?: IntArray(0)
    val aeLockAvailable: Boolean = get(CameraCharacteristics.CONTROL_AE_LOCK_AVAILABLE) == true
    val awbLockAvailable: Boolean = get(CameraCharacteristics.CONTROL_AWB_LOCK_AVAILABLE) == true
    val maxFaces: Int = get(CameraCharacteristics.STATISTICS_INFO_MAX_FACE_COUNT) ?: 0
    val focalLengths: FloatArray = get(CameraCharacteristics.LENS_INFO_AVAILABLE_FOCAL_LENGTHS) ?: FloatArray(0)
    val opticalStabilization: Boolean =
        (get(CameraCharacteristics.LENS_INFO_AVAILABLE_OPTICAL_STABILIZATION) ?: IntArray(0))
            .any { it == CameraMetadata.LENS_OPTICAL_STABILIZATION_MODE_ON }
    val videoStabilization: Boolean =
        (get(CameraCharacteristics.CONTROL_AVAILABLE_VIDEO_STABILIZATION_MODES) ?: IntArray(0))
            .any { it == CameraMetadata.CONTROL_VIDEO_STABILIZATION_MODE_ON }
    val hardwareLevel: Int = get(CameraCharacteristics.INFO_SUPPORTED_HARDWARE_LEVEL)
        ?: CameraMetadata.INFO_SUPPORTED_HARDWARE_LEVEL_LEGACY
    val sensorOrientation: Int = get(CameraCharacteristics.SENSOR_ORIENTATION) ?: 90
    private val physicalSize = get(CameraCharacteristics.SENSOR_INFO_PHYSICAL_SIZE)

    /** Faixas de FPS que o sensor aceita, ex.: [15,30], [30,30]. */
    val fpsRanges: List<Range<Int>> =
        (get(CameraCharacteristics.CONTROL_AE_AVAILABLE_TARGET_FPS_RANGES) ?: emptyArray()).toList()

    /** FPS fixos oferecidos (so os que o sensor consegue manter). */
    fun fixedFps(): List<Int> =
        listOf(24, 30, 60).filter { fps -> fpsRanges.any { it.lower <= fps && it.upper == fps } }

    val hasAutofocus: Boolean = minFocusDistance > 0f &&
        afModes.any { it != CameraMetadata.CONTROL_AF_MODE_OFF }
    val manualFocus: Boolean = manualSensor && minFocusDistance > 0f
    val macroAf: Boolean = CameraMetadata.CONTROL_AF_MODE_MACRO in afModes

    val evSupported: Boolean = info.exposureState.isExposureCompensationSupported
    val evRange: Range<Int> = info.exposureState.exposureCompensationRange
    val evStep: Float = info.exposureState.exposureCompensationStep.toFloat()

    /** Campo de visao horizontal do sensor, em radianos (lado maior). */
    val fovLongSide: Double
        get() {
            val size = physicalSize ?: return Math.toRadians(65.0)
            val focal = focalLengths.firstOrNull() ?: return Math.toRadians(65.0)
            return 2 * atan(maxOf(size.width, size.height) / (2.0 * focal))
        }

    /** Campo de visao do lado menor do sensor (horizontal com o celular em pe). */
    val fovShortSide: Double
        get() {
            val size = physicalSize ?: return Math.toRadians(50.0)
            val focal = focalLengths.firstOrNull() ?: return Math.toRadians(50.0)
            return 2 * atan(minOf(size.width, size.height) / (2.0 * focal))
        }

    /** Fotos JPEG que a camera entrega, das maiores para as menores. */
    fun jpegSizes(): List<Size> {
        val map = get(CameraCharacteristics.SCALER_STREAM_CONFIGURATION_MAP) ?: return emptyList()
        val normal = map.getOutputSizes(ImageFormat.JPEG)?.toList() ?: emptyList()
        val high = map.getHighResolutionOutputSizes(ImageFormat.JPEG)?.toList() ?: emptyList()
        return (normal + high).distinct().sortedByDescending { it.width.toLong() * it.height }
    }

    /** Tamanhos no formato 4:3 ou 16:9, os unicos que o CameraX usa como origem. */
    fun jpegSizes(fourByThree: Boolean): List<Size> {
        val target = if (fourByThree) 4f / 3f else 16f / 9f
        return jpegSizes().filter {
            val ratio = maxOf(it.width, it.height).toFloat() / minOf(it.width, it.height)
            abs(ratio - target) < 0.03f && it.width * it.height >= 640 * 480
        }
    }

    fun describe(name: String): String = buildString {
        appendLine("■ $name (id $cameraId)")
        appendLine("Nível de hardware: ${levelName(hardwareLevel)}")
        val sizes = jpegSizes()
        sizes.firstOrNull()?.let { appendLine("Maior foto: ${it.width}×${it.height} (${mp(it)} MP)") }
        appendLine("Flash: ${yes(hasFlash)}")
        appendLine("Autofoco: ${yes(hasAutofocus)}  ·  Foco manual: ${yes(manualFocus)}")
        if (minFocusDistance > 0) appendLine("Foco mínimo: ${"%.1f".format(100f / minFocusDistance)} cm")
        appendLine("Zoom: ${"%.1f".format(info.zoomState.value?.minZoomRatio ?: 1f)}× a ${"%.1f".format(info.zoomState.value?.maxZoomRatio ?: 1f)}×")
        appendLine("Exposição (EV): ${if (evSupported) "${evRange.lower * evStep} a ${evRange.upper * evStep}" else "não"}")
        appendLine("ISO manual: ${if (manualSensor && isoRange != null) "${isoRange.lower}–${isoRange.upper}" else "não"}")
        exposureTimeRange?.takeIf { manualSensor }?.let {
            appendLine("Obturador: ${shutterLabel(it.lower)} a ${shutterLabel(it.upper)}")
        }
        appendLine("Balanço de branco: ${awbModes.size} modos  ·  manual (K): ${yes(manualPostProcessing)}")
        appendLine("RAW: ${yes(raw)}  ·  Profundidade: ${yes(depthOutput)}")
        appendLine("Estabilização: óptica ${yes(opticalStabilization)}, vídeo ${yes(videoStabilization)}")
        appendLine("FPS: ${fpsRanges.joinToString { "[${it.lower},${it.upper}]" }}")
        appendLine("Detecção de rosto nativa: ${if (maxFaces > 0) "até $maxFaces" else "não"}")
    }

    companion object {
        fun mp(size: Size): String {
            val mp = size.width.toLong() * size.height / 1_000_000.0
            return if (mp >= 10) Math.round(mp).toString() else "%.1f".format(mp)
        }

        fun shutterLabel(nanos: Long): String {
            val seconds = nanos / 1_000_000_000.0
            return if (seconds >= 0.3) "%.1f s".format(seconds) else "1/${Math.round(1 / seconds)}"
        }

        private fun yes(value: Boolean) = if (value) "sim" else "não"

        private fun levelName(level: Int) = when (level) {
            CameraMetadata.INFO_SUPPORTED_HARDWARE_LEVEL_LEGACY -> "LEGACY"
            CameraMetadata.INFO_SUPPORTED_HARDWARE_LEVEL_LIMITED -> "LIMITED"
            CameraMetadata.INFO_SUPPORTED_HARDWARE_LEVEL_FULL -> "FULL"
            CameraMetadata.INFO_SUPPORTED_HARDWARE_LEVEL_3 -> "LEVEL_3"
            CameraMetadata.INFO_SUPPORTED_HARDWARE_LEVEL_EXTERNAL -> "EXTERNAL"
            else -> level.toString()
        }

        /**
         * Procura uma camera macro fisica liberada para apps: traseira, que nao
         * seja a principal, utilizavel para fotos e com foco muito proximo
         * (fixo e curto, ou minimo abaixo de 10 cm). Muitos fabricantes nao
         * expoem a macro para apps de terceiros; ai o resultado e null.
         */
        fun findMacroCameraId(context: Context, mainId: String?): String? {
            val manager = context.getSystemService(Context.CAMERA_SERVICE) as CameraManager
            return try {
                manager.cameraIdList.firstOrNull { id ->
                    if (id == mainId) return@firstOrNull false
                    val chars = manager.getCameraCharacteristics(id)
                    val facing = chars.get(CameraCharacteristics.LENS_FACING)
                    val caps = chars.get(CameraCharacteristics.REQUEST_AVAILABLE_CAPABILITIES) ?: IntArray(0)
                    val usable = CameraMetadata.REQUEST_AVAILABLE_CAPABILITIES_BACKWARD_COMPATIBLE in caps &&
                        CameraMetadata.REQUEST_AVAILABLE_CAPABILITIES_DEPTH_OUTPUT !in caps
                    val minFocus = chars.get(CameraCharacteristics.LENS_INFO_MINIMUM_FOCUS_DISTANCE) ?: 0f
                    val hyperfocal = chars.get(CameraCharacteristics.LENS_INFO_HYPERFOCAL_DISTANCE) ?: 0f
                    facing == CameraMetadata.LENS_FACING_BACK && usable && (minFocus >= 10f || hyperfocal >= 10f)
                }
            } catch (error: Exception) {
                null
            }
        }
    }
}
