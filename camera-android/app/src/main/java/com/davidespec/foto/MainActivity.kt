package com.davidespec.foto

import android.Manifest
import android.animation.ValueAnimator
import android.annotation.SuppressLint
import android.content.ClipData
import android.content.ClipboardManager
import android.content.ContentUris
import android.content.ContentValues
import android.content.Intent
import android.content.pm.PackageManager
import android.content.res.ColorStateList
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.ColorMatrix
import android.graphics.ColorMatrixColorFilter
import android.graphics.Paint
import android.graphics.Rect
import android.graphics.RectF
import android.graphics.Typeface
import android.hardware.Sensor
import android.hardware.camera2.CaptureRequest
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import android.media.MediaActionSound
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.provider.MediaStore
import android.provider.Settings
import android.util.Log
import android.util.Range
import android.util.Size
import android.util.TypedValue
import android.view.GestureDetector
import android.view.Gravity
import android.view.HapticFeedbackConstants
import android.view.KeyEvent
import android.view.MotionEvent
import android.view.OrientationEventListener
import android.view.ScaleGestureDetector
import android.view.Surface
import android.view.View
import android.view.WindowManager
import android.widget.Button
import android.widget.FrameLayout
import android.widget.HorizontalScrollView
import android.widget.ImageButton
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.PopupWindow
import android.widget.ProgressBar
import android.widget.SeekBar
import android.widget.TextView
import android.widget.Toast
import androidx.activity.result.IntentSenderRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import androidx.camera.camera2.interop.Camera2CameraInfo
import androidx.camera.camera2.interop.Camera2Interop
import androidx.camera.camera2.interop.ExperimentalCamera2Interop
import androidx.camera.core.AspectRatio
import androidx.camera.core.Camera
import androidx.camera.core.CameraSelector
import androidx.camera.core.CameraState
import androidx.camera.core.DynamicRange
import androidx.camera.core.FocusMeteringAction
import androidx.camera.core.ImageAnalysis
import androidx.camera.core.ImageCapture
import androidx.camera.core.ImageCaptureException
import androidx.camera.core.ImageProxy
import androidx.camera.core.Preview
import androidx.camera.core.UseCase
import androidx.camera.core.UseCaseGroup
import androidx.camera.core.resolutionselector.AspectRatioStrategy
import androidx.camera.core.resolutionselector.ResolutionSelector
import androidx.camera.core.resolutionselector.ResolutionStrategy
import androidx.camera.extensions.ExtensionMode
import androidx.camera.extensions.ExtensionsManager
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.video.FallbackStrategy
import androidx.camera.video.MediaStoreOutputOptions
import androidx.camera.video.Quality
import androidx.camera.video.QualitySelector
import androidx.camera.video.Recorder
import androidx.camera.video.Recording
import androidx.camera.video.VideoCapture
import androidx.camera.video.VideoRecordEvent
import androidx.camera.view.PreviewView
import androidx.camera.view.transform.CoordinateTransform
import androidx.camera.view.transform.OutputTransform
import androidx.constraintlayout.widget.ConstraintLayout
import androidx.core.content.ContextCompat
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.doOnNextLayout
import androidx.core.view.updatePadding
import com.google.mlkit.vision.barcode.common.Barcode
import com.google.mlkit.vision.documentscanner.GmsDocumentScannerOptions
import com.google.mlkit.vision.documentscanner.GmsDocumentScanning
import com.google.mlkit.vision.documentscanner.GmsDocumentScanningResult
import java.util.Locale
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import kotlin.math.abs
import kotlin.math.atan2
import kotlin.math.ln
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt

@SuppressLint("UnsafeOptInUsageError", "RestrictedApi")
@androidx.annotation.OptIn(ExperimentalCamera2Interop::class)
class MainActivity : AppCompatActivity(), FrameAnalyzer.Listener, SensorEventListener {

    /** Modos da camera. Os que tem [extension] usam o processamento do fabricante quando existe. */
    private enum class Mode(val label: String, val extension: Int?) {
        PORTRAIT("RETRATO", ExtensionMode.BOKEH),
        PHOTO("FOTO", null),
        VIDEO("VÍDEO", null),
        PRO("PRO", null),
        PANORAMA("PANORAMA", null),
        MACRO("MACRO", null),
        FOOD("COMIDA", null),
        NIGHT("NOITE", ExtensionMode.NIGHT),
    }

    /** Formatos da foto. [source] e o formato do sensor de onde a foto e recortada. */
    private enum class Aspect(val label: String, val ratio: String?, val source: Int) {
        R3_4("3:4", "H,3:4", AspectRatio.RATIO_4_3),
        R9_16("9:16", "H,9:16", AspectRatio.RATIO_16_9),
        R1_1("1:1", "H,1:1", AspectRatio.RATIO_4_3),
        FULL("Full", null, AspectRatio.RATIO_16_9),
    }

    // --- Views -------------------------------------------------------------------------
    private lateinit var root: ConstraintLayout
    private lateinit var previewBox: FrameLayout
    private lateinit var preview: PreviewView
    private lateinit var overlay: CameraOverlay
    private lateinit var flashOverlay: View
    private lateinit var screenFlash: View
    private lateinit var focusRing: View
    private lateinit var countdown: TextView
    private lateinit var topBar: View
    private lateinit var settingsButton: ImageButton
    private lateinit var flashButton: ImageButton
    private lateinit var hdrButton: TextView
    private lateinit var timerButton: ImageButton
    private lateinit var micButton: ImageButton
    private lateinit var fpsButton: TextView
    private lateinit var aspectButton: TextView
    private lateinit var resolutionButton: TextView
    private lateinit var effectsButton: ImageButton
    private lateinit var recBox: View
    private lateinit var recDot: View
    private lateinit var recTime: TextView
    private lateinit var infoLabel: TextView
    private lateinit var histogramView: HistogramView
    private lateinit var qrChip: TextView
    private lateinit var panel: LinearLayout
    private lateinit var evBar: View
    private lateinit var evSeek: SeekBar
    private lateinit var evValue: TextView
    private lateinit var zoomSliderBox: View
    private lateinit var zoomSeek: SeekBar
    private lateinit var zoomValue: TextView
    private lateinit var zoomBar: LinearLayout
    private lateinit var modeBar: View
    private lateinit var modeViews: Map<Mode, TextView>
    private lateinit var modeMore: TextView
    private lateinit var thumbnail: ImageView
    private lateinit var pauseButton: ImageButton
    private lateinit var shutter: ImageButton
    private lateinit var shutterLabel: TextView
    private lateinit var busySpinner: ProgressBar
    private lateinit var switchButton: ImageButton
    private lateinit var snapshotButton: ImageButton
    private lateinit var panoramaGuide: View
    private lateinit var panoramaText: TextView
    private lateinit var panoramaProgress: ProgressBar
    private lateinit var permissionPanel: LinearLayout

    // --- Camera ----------------------------------------------------------------------
    private var cameraProvider: ProcessCameraProvider? = null
    private var extensions: ExtensionsManager? = null
    private var camera: Camera? = null
    private var caps: CameraCapabilities? = null
    private var imageCapture: ImageCapture? = null
    private var videoCapture: VideoCapture<Recorder>? = null
    private var analysis: ImageAnalysis? = null
    private var recording: Recording? = null
    private var recordingPaused = false
    /** Extensao do fabricante em uso agora (null = processamento proprio ou nenhum). */
    private var nativeExtension: Int? = null
    private var macroCameraId: String? = null
    private var macroSearched = false

    private val manual = ManualControls()
    /** Filtro de video em tempo real (OpenGL). Criado uma vez e reaproveitado. */
    private val videoFilter by lazy { VideoFilterProcessor() }
    private var videoFilterBound = false
    private var videoFilterCreated = false
    private lateinit var settings: CameraSettings
    private lateinit var analyzer: FrameAnalyzer
    private lateinit var analysisExecutor: ExecutorService
    private lateinit var io: ExecutorService
    private lateinit var updater: Updater
    private lateinit var location: LocationTracker
    private lateinit var sensorManager: SensorManager
    private var panorama: PanoramaSession? = null

    private var mode = Mode.PHOTO
    private var aspect = Aspect.R3_4
    private var lensFacing = CameraSelector.LENS_FACING_BACK
    private var flashMode = ImageCapture.FLASH_MODE_OFF
    private var timerSeconds = 0

    private var busy = false
    private var bursting = false
    private var burstCount = 0
    private var lastMedia: Uri? = null
    private var zoomPresets = listOf(1f, 2f)
    private var zoomAnimator: ValueAnimator? = null
    private var locked = false
    private var lastManualFocus = 0L
    private var lastFaceFocus = 0L
    private var lastFaceCenter: Pair<Float, Float>? = null
    private var lastQrValue: Barcode? = null
    private var bindingSignature = ""
    private var levelFiltered = FloatArray(2)
    private var panelTab = ""
    private var proTab = ""

    private val main = Handler(Looper.getMainLooper())
    private var countdownTask: Runnable? = null
    private val sound = MediaActionSound()

    private val hideEv = Runnable { evBar.visibility = View.GONE }
    private val hideZoomSlider = Runnable { zoomSliderBox.visibility = View.GONE }
    private val hideQr = Runnable {
        qrChip.visibility = View.GONE
        overlay.qrBoxes = emptyList()
        lastQrValue = null
    }
    private val hideInfo = Runnable { if (!locked) infoLabel.visibility = View.GONE }

    private val permissions = buildList {
        add(Manifest.permission.CAMERA)
        if (Build.VERSION.SDK_INT <= Build.VERSION_CODES.P) {
            add(Manifest.permission.WRITE_EXTERNAL_STORAGE)
        }
    }.toTypedArray()

    private val permissionLauncher =
        registerForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) { result ->
            if (result[Manifest.permission.CAMERA] == true) {
                permissionPanel.visibility = View.GONE
                startCamera()
            } else {
                permissionPanel.visibility = View.VISIBLE
            }
        }

    private val audioLauncher =
        registerForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
            renderMic()
        }

    private val scanLauncher =
        registerForActivityResult(ActivityResultContracts.StartIntentSenderForResult()) { result ->
            if (result.resultCode == RESULT_OK) saveScan(result.data)
        }

    private val viewerLauncher =
        registerForActivityResult(ActivityResultContracts.StartActivityForResult()) {
            // A ultima foto pode ter sido apagada ou editada.
            lastMedia = null
            thumbnail.setImageDrawable(null)
            loadLastPhoto()
        }

    /** Gira os icones e a orientacao da foto junto com o celular. */
    private val orientationListener by lazy {
        object : OrientationEventListener(this) {
            override fun onOrientationChanged(orientation: Int) {
                if (orientation == ORIENTATION_UNKNOWN) return
                val rotation = when (orientation) {
                    in 45 until 135 -> Surface.ROTATION_270
                    in 135 until 225 -> Surface.ROTATION_180
                    in 225 until 315 -> Surface.ROTATION_90
                    else -> Surface.ROTATION_0
                }
                imageCapture?.targetRotation = rotation
                if (recording == null) videoCapture?.targetRotation = rotation
                val degrees = when (rotation) {
                    Surface.ROTATION_90 -> 90f
                    Surface.ROTATION_180 -> 180f
                    Surface.ROTATION_270 -> -90f
                    else -> 0f
                }
                listOf<View>(
                    settingsButton, flashButton, hdrButton, timerButton, micButton, fpsButton, aspectButton,
                    resolutionButton, effectsButton, thumbnail, switchButton,
                ).forEach { if (it.rotation != degrees) it.animate().rotation(degrees).setDuration(200).start() }
            }
        }
    }

    // --- Ciclo de vida ------------------------------------------------------------------

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        // Primeiro de tudo: mesmo que algo abaixo falhe, a atualizacao chega.
        updater = Updater(this)
        updater.check()

        WindowCompat.setDecorFitsSystemWindows(window, false)
        setContentView(R.layout.activity_main)
        settings = CameraSettings(this)
        bindViews()

        io = Executors.newSingleThreadExecutor()
        analysisExecutor = Executors.newSingleThreadExecutor()
        analyzer = FrameAnalyzer(this)
        location = LocationTracker(this)
        sensorManager = getSystemService(SENSOR_SERVICE) as SensorManager
        thumbnail.clipToOutline = true
        sound.load(MediaActionSound.SHUTTER_CLICK)
        // Modo compativel (TextureView): permite pintar o visor com os filtros.
        preview.implementationMode = PreviewView.ImplementationMode.COMPATIBLE

        applyInsets()
        restorePrefs()
        setupControls()
        setupGestures()
        applySettingsToUi()
        applyLayout()
        loadLastPhoto()

        if (hasCameraPermission()) startCamera() else permissionLauncher.launch(permissions)
    }

    private fun bindViews() {
        root = findViewById(R.id.root)
        previewBox = findViewById(R.id.previewBox)
        preview = findViewById(R.id.preview)
        overlay = findViewById(R.id.overlay)
        flashOverlay = findViewById(R.id.flashOverlay)
        screenFlash = findViewById(R.id.screenFlash)
        focusRing = findViewById(R.id.focusRing)
        countdown = findViewById(R.id.countdown)
        topBar = findViewById(R.id.topBar)
        settingsButton = findViewById(R.id.settingsButton)
        flashButton = findViewById(R.id.flashButton)
        hdrButton = findViewById(R.id.hdrButton)
        timerButton = findViewById(R.id.timerButton)
        micButton = findViewById(R.id.micButton)
        fpsButton = findViewById(R.id.fpsButton)
        aspectButton = findViewById(R.id.aspectButton)
        resolutionButton = findViewById(R.id.resolutionButton)
        effectsButton = findViewById(R.id.effectsButton)
        recBox = findViewById(R.id.recBox)
        recDot = findViewById(R.id.recDot)
        recTime = findViewById(R.id.recTime)
        infoLabel = findViewById(R.id.infoLabel)
        histogramView = findViewById(R.id.histogram)
        qrChip = findViewById(R.id.qrChip)
        panel = findViewById(R.id.panel)
        evBar = findViewById(R.id.evBar)
        evSeek = findViewById(R.id.evSeek)
        evValue = findViewById(R.id.evValue)
        zoomSliderBox = findViewById(R.id.zoomSliderBox)
        zoomSeek = findViewById(R.id.zoomSeek)
        zoomValue = findViewById(R.id.zoomValue)
        zoomBar = findViewById(R.id.zoomBar)
        modeBar = findViewById(R.id.modeBar)
        modeMore = findViewById(R.id.modeMore)
        modeViews = mapOf(
            Mode.PORTRAIT to findViewById(R.id.modePortrait),
            Mode.PHOTO to findViewById(R.id.modePhoto),
            Mode.VIDEO to findViewById(R.id.modeVideo),
        )
        thumbnail = findViewById(R.id.thumbnail)
        pauseButton = findViewById(R.id.pauseButton)
        shutter = findViewById(R.id.shutter)
        shutterLabel = findViewById(R.id.shutterLabel)
        busySpinner = findViewById(R.id.busySpinner)
        switchButton = findViewById(R.id.switchButton)
        snapshotButton = findViewById(R.id.snapshotButton)
        panoramaGuide = findViewById(R.id.panoramaGuide)
        panoramaText = findViewById(R.id.panoramaText)
        panoramaProgress = findViewById(R.id.panoramaProgress)
        permissionPanel = findViewById(R.id.permissionPanel)
    }

    override fun onStart() {
        super.onStart()
        orientationListener.enable()
    }

    override fun onStop() {
        super.onStop()
        orientationListener.disable()
        cancelCountdown()
        stopBurst()
        recording?.stop()
        if (panorama?.running == true) {
            panorama?.release()
            panorama = null
            renderPanoramaIdle()
        }
        updater.onStop()
    }

    override fun onResume() {
        super.onResume()
        if (permissionPanel.visibility == View.VISIBLE && hasCameraPermission()) {
            permissionPanel.visibility = View.GONE
            startCamera()
        }
        // Voltando das configuracoes: aplica o que mudou.
        applySettingsToUi()
        if (settings.level) {
            sensorManager.getDefaultSensor(Sensor.TYPE_ACCELEROMETER)?.let {
                sensorManager.registerListener(this, it, SensorManager.SENSOR_DELAY_UI)
            }
        }
        if (settings.location && hasLocationPermission()) location.start()
        val signature = bindingKey()
        if (signature != bindingSignature && cameraProvider != null) bindCamera()
        updater.onResume()
    }

    override fun onPause() {
        super.onPause()
        sensorManager.unregisterListener(this)
        location.stop()
    }

    override fun onDestroy() {
        super.onDestroy()
        if (videoFilterBound || videoFilterCreated) videoFilter.release()
        io.shutdown()
        analysisExecutor.shutdown()
        analyzer.close()
        sound.release()
        panorama?.release()
    }

    override fun onKeyDown(keyCode: Int, event: KeyEvent): Boolean {
        val volume = keyCode == KeyEvent.KEYCODE_VOLUME_UP || keyCode == KeyEvent.KEYCODE_VOLUME_DOWN
        if (keyCode == KeyEvent.KEYCODE_CAMERA) {
            if (event.repeatCount == 0) onShutter()
            return true
        }
        if (volume) {
            when (settings.volumeAction) {
                "photo" -> {
                    if (event.repeatCount == 0) onShutter()
                    return true
                }
                "zoom" -> {
                    val cam = camera ?: return true
                    val current = cam.cameraInfo.zoomState.value?.zoomRatio ?: 1f
                    val factor = if (keyCode == KeyEvent.KEYCODE_VOLUME_UP) 1.15f else 1 / 1.15f
                    cam.cameraControl.setZoomRatio(current * factor)
                    showZoomSlider()
                    return true
                }
            }
        }
        return super.onKeyDown(keyCode, event)
    }

    private fun hasCameraPermission() =
        ContextCompat.checkSelfPermission(this, Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED

    private fun hasAudioPermission() =
        ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED

    private fun hasLocationPermission() =
        ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED

    private fun dp(value: Int) = (value * resources.displayMetrics.density).toInt()

    private fun applyInsets() {
        val bottomPanel = findViewById<View>(R.id.bottomPanel)
        ViewCompat.setOnApplyWindowInsetsListener(root) { _, insets ->
            val bars = insets.getInsets(WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout())
            topBar.updatePadding(top = bars.top + dp(12))
            bottomPanel.updatePadding(bottom = bars.bottom + dp(36))
            insets
        }
    }

    // --- Preferencias ------------------------------------------------------------------

    private fun restorePrefs() {
        lensFacing = settings.lens
        flashMode = settings.flash
        timerSeconds = settings.timer.takeIf { it in listOf(0, 3, 5, 10) } ?: 0
        aspect = Aspect.entries.firstOrNull { it.name == settings.aspect } ?: Aspect.R3_4
        if (settings.keepMode) {
            mode = Mode.entries.firstOrNull { it.name == settings.lastMode && it != Mode.PANORAMA } ?: Mode.PHOTO
        }
        if (!settings.keepFilter) settings.filter = "original"
        renderFlash()
        renderTimer()
        renderModes()
    }

    private fun savePrefs() {
        settings.lens = lensFacing
        settings.flash = flashMode
        settings.timer = timerSeconds
        settings.aspect = aspect.name
        settings.lastMode = mode.name
    }

    /** Liga no visor o que foi escolhido nas configuracoes. */
    private fun applySettingsToUi() {
        overlay.gridType = if (settings.grid) settings.gridType else null
        overlay.centerGuide = settings.centerGuide
        if (!settings.level) overlay.levelAngle = null
        histogramView.visibility = if (settings.histogram && mode != Mode.VIDEO) View.VISIBLE else View.GONE
        analyzer.histogram = settings.histogram && mode != Mode.VIDEO
        analyzer.qr = settings.qrCodes && mode == Mode.PHOTO
        applyPreviewFilter()
        renderMic()
    }

    /** O que, se mudar nas configuracoes, exige religar a camera. */
    private fun bindingKey() = listOf(
        settings.qrCodes, settings.histogram, settings.videoQuality, settings.videoFps, settings.jpegQuality,
        settings.photoSize(true), settings.photoSize(false),
    ).joinToString()

    // --- Controles ------------------------------------------------------------------

    @SuppressLint("ClickableViewAccessibility")
    private fun setupControls() {
        shutter.setOnClickListener { if (!bursting) onShutter() }
        shutter.setOnLongClickListener {
            if (canBurst()) {
                startBurst()
                true
            } else {
                false
            }
        }
        shutter.setOnTouchListener { _, event ->
            if (event.actionMasked == MotionEvent.ACTION_UP || event.actionMasked == MotionEvent.ACTION_CANCEL) stopBurst()
            false
        }

        switchButton.setOnClickListener { switchCamera() }

        flashButton.setOnClickListener {
            val screen = usesScreenFlash()
            flashMode = if (mode == Mode.VIDEO || screen) {
                if (flashMode == ImageCapture.FLASH_MODE_OFF) ImageCapture.FLASH_MODE_ON else ImageCapture.FLASH_MODE_OFF
            } else {
                when (flashMode) {
                    ImageCapture.FLASH_MODE_OFF -> ImageCapture.FLASH_MODE_AUTO
                    ImageCapture.FLASH_MODE_AUTO -> ImageCapture.FLASH_MODE_ON
                    else -> ImageCapture.FLASH_MODE_OFF
                }
            }
            if (!screen) imageCapture?.flashMode = flashMode
            if (mode == Mode.VIDEO) camera?.cameraControl?.enableTorch(flashMode == ImageCapture.FLASH_MODE_ON)
            savePrefs()
            renderFlash()
        }

        hdrButton.setOnClickListener {
            settings.hdr = !settings.hdr
            renderHdr()
            bindCamera()
        }

        timerButton.setOnClickListener { showTimerMenu() }

        micButton.setOnClickListener {
            if (recording != null) return@setOnClickListener
            if (!settings.microphone && !hasAudioPermission()) {
                settings.microphone = true
                requestMicrophone()
            } else {
                settings.microphone = !settings.microphone
            }
            renderMic()
        }

        fpsButton.setOnClickListener { showFpsMenu() }

        aspectButton.setOnClickListener { showAspectMenu() }

        resolutionButton.setOnClickListener {
            if (mode == Mode.VIDEO) chooseVideoQuality() else choosePhotoSize()
        }

        effectsButton.setOnClickListener {
            if (panel.visibility == View.VISIBLE && panelTab != "pro") {
                panel.visibility = View.GONE
                renderEffectsButton()
            } else {
                showEffectsPanel("filters")
            }
        }

        settingsButton.setOnClickListener {
            startActivity(Intent(this, SettingsActivity::class.java))
        }

        modeViews.forEach { (target, view) -> view.setOnClickListener { setMode(target) } }
        modeMore.setOnClickListener { showMoreModes() }

        thumbnail.setOnClickListener { openLastMedia() }
        thumbnail.setOnLongClickListener {
            openInAppViewer()
            true
        }

        pauseButton.setOnClickListener {
            val rec = recording ?: return@setOnClickListener
            if (recordingPaused) rec.resume() else rec.pause()
        }

        snapshotButton.setOnClickListener {
            if (imageCapture == null) toast("Esta câmera não permite foto durante o vídeo.") else captureDirect()
        }

        evSeek.setOnSeekBarChangeListener(object : SeekBar.OnSeekBarChangeListener {
            override fun onProgressChanged(seekBar: SeekBar, progress: Int, fromUser: Boolean) {
                val c = caps ?: return
                val index = progress + c.evRange.lower
                evValue.text = formatEv(index * c.evStep)
                if (fromUser) camera?.cameraControl?.setExposureCompensationIndex(index)
            }
            override fun onStartTrackingTouch(seekBar: SeekBar) = main.removeCallbacks(hideEv)
            override fun onStopTrackingTouch(seekBar: SeekBar) {
                main.postDelayed(hideEv, 4000)
            }
        })
        evValue.setOnClickListener {
            camera?.cameraControl?.setExposureCompensationIndex(0)
            caps?.let { evSeek.progress = -it.evRange.lower }
        }

        zoomSeek.setOnSeekBarChangeListener(object : SeekBar.OnSeekBarChangeListener {
            override fun onProgressChanged(seekBar: SeekBar, progress: Int, fromUser: Boolean) {
                if (!fromUser) return
                val state = camera?.cameraInfo?.zoomState?.value ?: return
                // Escala logaritmica: o controle anda igual de 1x a 2x e de 4x a 8x.
                val ratio = (state.minZoomRatio * Math.pow((state.maxZoomRatio / state.minZoomRatio).toDouble(), progress / 1000.0)).toFloat()
                camera?.cameraControl?.setZoomRatio(ratio)
            }
            override fun onStartTrackingTouch(seekBar: SeekBar) = main.removeCallbacks(hideZoomSlider)
            override fun onStopTrackingTouch(seekBar: SeekBar) {
                main.postDelayed(hideZoomSlider, 2500)
            }
        })

        qrChip.setOnClickListener { lastQrValue?.let { showQrDialog(it) } }

        findViewById<Button>(R.id.permissionButton).setOnClickListener {
            if (shouldShowRequestPermissionRationale(Manifest.permission.CAMERA) ||
                !settings.prefs.getBoolean("askedPermission", false)
            ) {
                settings.prefs.edit().putBoolean("askedPermission", true).apply()
                permissionLauncher.launch(permissions)
            } else {
                startActivity(Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.fromParts("package", packageName, null)))
            }
        }
    }

    private fun requestMicrophone() {
        AlertDialog.Builder(this)
            .setTitle("Microfone")
            .setMessage("Para gravar o som dos vídeos, o Foto precisa usar o microfone. Ele só é usado durante a gravação.")
            .setPositiveButton("Continuar") { _, _ -> audioLauncher.launch(Manifest.permission.RECORD_AUDIO) }
            .setNegativeButton("Agora não") { _, _ ->
                settings.microphone = false
                renderMic()
            }
            .show()
    }

    private fun switchCamera() {
        if (mode == Mode.MACRO || mode == Mode.PANORAMA) return
        lensFacing = if (lensFacing == CameraSelector.LENS_FACING_BACK) CameraSelector.LENS_FACING_FRONT else CameraSelector.LENS_FACING_BACK
        savePrefs()
        switchButton.animate().rotationBy(180f).setDuration(250).start()
        // Animacao de troca: o visor escurece e volta com a outra camera.
        preview.animate().alpha(0f).setDuration(120).withEndAction {
            unlock()
            manual.resetManual()
            bindCamera()
            preview.animate().alpha(1f).setDuration(220).start()
        }.start()
    }

    private fun tint(view: ImageView, active: Boolean) {
        view.imageTintList = ColorStateList.valueOf(if (active) ACCENT else WHITE)
    }

    private fun usesScreenFlash(): Boolean {
        val c = caps ?: return false
        return c.isFront && !c.hasFlash && settings.screenFlash && mode != Mode.VIDEO
    }

    private fun renderFlash() {
        flashButton.setImageResource(
            when (flashMode) {
                ImageCapture.FLASH_MODE_AUTO -> R.drawable.ic_flash_auto
                ImageCapture.FLASH_MODE_ON -> R.drawable.ic_flash_on
                else -> R.drawable.ic_flash_off
            },
        )
        tint(flashButton, flashMode != ImageCapture.FLASH_MODE_OFF)
    }

    private class MenuOption(
        val label: String,
        val detail: String? = null,
        val selected: Boolean = false,
        val enabled: Boolean = true,
        val onPick: () -> Unit,
    )

    /**
     * Menu suspenso no estilo dos controles da camera: abre logo abaixo do
     * botao (ou acima, para os botoes de baixo), marca a opcao atual em
     * amarelo e fecha ao escolher ou ao tocar fora.
     */
    private fun showDropdown(anchor: View, title: String, options: List<MenuOption>, upward: Boolean = false, width: Int = 220) {
        val list = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(0, dp(6), 0, dp(6))
            background = android.graphics.drawable.GradientDrawable().apply {
                setColor(0xF2202022.toInt())
                cornerRadius = dp(18).toFloat()
            }
        }
        val scroll = android.widget.ScrollView(this).apply {
            addView(list)
            isVerticalScrollBarEnabled = false
        }
        val popupWidth = dp(width)
        val popup = PopupWindow(scroll, popupWidth, LinearLayout.LayoutParams.WRAP_CONTENT, true).apply {
            setBackgroundDrawable(android.graphics.drawable.ColorDrawable(android.graphics.Color.TRANSPARENT))
            elevation = dp(8).toFloat()
            animationStyle = android.R.style.Animation_Dialog
        }
        list.addView(TextView(this).apply {
            text = title
            setTextColor(0xFF9A9A9E.toInt())
            textSize = 13f
            typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
            setPadding(dp(20), dp(8), dp(20), dp(6))
        })
        options.forEach { option ->
            val row = LinearLayout(this).apply {
                orientation = LinearLayout.VERTICAL
                setPadding(dp(20), dp(10), dp(20), dp(10))
                alpha = if (option.enabled) 1f else 0.45f
                val attrs = obtainStyledAttributes(intArrayOf(android.R.attr.selectableItemBackground))
                background = attrs.getDrawable(0)
                attrs.recycle()
                setOnClickListener {
                    popup.dismiss()
                    option.onPick()
                }
            }
            row.addView(TextView(this).apply {
                text = if (option.selected) "✓  ${option.label}" else option.label
                setTextColor(if (option.selected) ACCENT else WHITE)
                textSize = 16f
                typeface = Typeface.create(Typeface.DEFAULT, if (option.selected) Typeface.BOLD else Typeface.NORMAL)
            })
            option.detail?.let { detail ->
                row.addView(TextView(this).apply {
                    text = detail
                    setTextColor(0xFF9A9A9E.toInt())
                    textSize = 12f
                    setPadding(0, dp(2), 0, 0)
                })
            }
            list.addView(row)
        }
        // Nao passa de 60% da altura da tela; o resto rola.
        val maxHeight = (resources.displayMetrics.heightPixels * 0.6f).toInt()
        scroll.measure(
            View.MeasureSpec.makeMeasureSpec(popupWidth, View.MeasureSpec.EXACTLY),
            View.MeasureSpec.makeMeasureSpec(0, View.MeasureSpec.UNSPECIFIED),
        )
        val height = min(scroll.measuredHeight, maxHeight)
        popup.height = height
        val location = IntArray(2)
        anchor.getLocationInWindow(location)
        val x = (location[0] + anchor.width / 2 - popupWidth / 2)
            .coerceIn(dp(8), resources.displayMetrics.widthPixels - popupWidth - dp(8))
        val y = if (upward) location[1] - height - dp(8) else location[1] + anchor.height + dp(4)
        popup.showAtLocation(root, Gravity.TOP or Gravity.START, x, y)
    }

    private fun showTimerMenu() {
        val options = listOf(0 to "Desligado", 3 to "3 segundos", 5 to "5 segundos", 10 to "10 segundos")
        showDropdown(timerButton, "Temporizador", options.map { (seconds, label) ->
            MenuOption(label, selected = seconds == timerSeconds) {
                timerSeconds = seconds
                savePrefs()
                renderTimer()
            }
        }, width = 200)
    }

    private fun showAspectMenu() {
        val details = mapOf(
            Aspect.R3_4 to "Padrão, usa o sensor inteiro",
            Aspect.R9_16 to "Widescreen",
            Aspect.R1_1 to "Quadrado",
            Aspect.FULL to "Ocupa a tela toda",
        )
        showDropdown(aspectButton, "Proporção", Aspect.entries.map { a ->
            MenuOption(a.label, details[a], selected = a == aspect) {
                if (a != aspect) {
                    aspect = a
                    savePrefs()
                    applyLayout()
                }
            }
        })
    }

    private fun showFpsMenu() {
        val options = caps?.fixedFps().orEmpty()
        if (recording != null) return
        if (options.isEmpty()) {
            toast("Esta câmera não informa taxas de quadros fixas.")
            return
        }
        val current = if (settings.videoFps in options) settings.videoFps else options.last()
        showDropdown(fpsButton, "Quadros por segundo", options.map { fps ->
            MenuOption("$fps fps", if (fps == 24) "Visual de cinema" else if (fps == 60) "Movimento mais suave" else null, selected = fps == current) {
                if (fps != settings.videoFps) {
                    settings.videoFps = fps
                    bindCamera()
                }
            }
        }, width = 200)
    }

    private fun renderTimer() {
        tint(timerButton, timerSeconds > 0)
        timerButton.contentDescription = if (timerSeconds == 0) "Temporizador desligado" else "Temporizador de $timerSeconds segundos"
    }

    private fun renderHdr() {
        val c = caps
        val native = extensions?.let { m -> baseSelector()?.let { m.isExtensionAvailable(it, ExtensionMode.HDR) } } == true
        val available = mode == Mode.PHOTO && (native || c?.evSupported == true)
        hdrButton.visibility = if (available) View.VISIBLE else View.GONE
        hdrButton.setTextColor(if (settings.hdr) ACCENT else WHITE)
        hdrButton.paintFlags = if (settings.hdr) hdrButton.paintFlags and Paint.STRIKE_THRU_TEXT_FLAG.inv()
        else hdrButton.paintFlags or Paint.STRIKE_THRU_TEXT_FLAG
    }

    private fun renderMic() {
        val on = settings.microphone && hasAudioPermission()
        micButton.setImageResource(if (on) R.drawable.ic_mic else R.drawable.ic_mic_off)
        tint(micButton, false)
    }

    private fun renderEffectsButton() {
        val active = settings.filter != "original" || settings.beautyActive || settings.enhance
        tint(effectsButton, active || (panel.visibility == View.VISIBLE && panelTab != "pro"))
    }

    private fun renderModes() {
        modeViews.forEach { (target, view) -> styleMode(view, target == mode) }
        val extra = mode !in modeViews.keys
        modeMore.text = if (extra) mode.label else "MAIS"
        styleMode(modeMore, extra)

        val video = mode == Mode.VIDEO
        shutter.setBackgroundResource(if (video) R.drawable.shutter_video else R.drawable.shutter)
        aspectButton.visibility = if (video || mode == Mode.PANORAMA) View.GONE else View.VISIBLE
        timerButton.visibility = if (video || mode == Mode.PANORAMA) View.GONE else View.VISIBLE
        micButton.visibility = if (video) View.VISIBLE else View.GONE
        fpsButton.visibility = if (video) View.VISIBLE else View.GONE
        effectsButton.visibility = if (mode == Mode.PANORAMA) View.GONE else View.VISIBLE
        switchButton.visibility = if (mode == Mode.MACRO || mode == Mode.PANORAMA) View.INVISIBLE else View.VISIBLE
        panoramaGuide.visibility = if (mode == Mode.PANORAMA) View.VISIBLE else View.GONE
        if (mode == Mode.PANORAMA) renderPanoramaIdle()
        overlay.foodRadius = if (mode == Mode.FOOD) FOOD_RADIUS else null
        renderHdr()
        renderEffectsButton()
    }

    private fun styleMode(view: TextView, selected: Boolean) {
        view.setTextColor(if (selected) WHITE else 0xD9FFFFFF.toInt())
        view.setTextSize(TypedValue.COMPLEX_UNIT_SP, if (selected) 16f else 14f)
        view.typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
    }

    private fun setMode(target: Mode) {
        if (target == mode || recording != null || busy || panorama?.running == true) return
        cancelCountdown()
        if (target == Mode.VIDEO && settings.microphone && !hasAudioPermission()) requestMicrophone()
        if (mode == Mode.VIDEO) camera?.cameraControl?.enableTorch(false)
        unlock()
        manual.resetAll()
        mode = target
        if (mode == Mode.VIDEO && flashMode == ImageCapture.FLASH_MODE_AUTO) flashMode = ImageCapture.FLASH_MODE_OFF
        if (mode == Mode.MACRO || mode == Mode.PANORAMA) lensFacing = CameraSelector.LENS_FACING_BACK
        savePrefs()
        panel.visibility = View.GONE
        renderFlash()
        renderModes()
        applySettingsToUi()
        applyLayout()
        when (mode) {
            Mode.PORTRAIT -> showEffectsPanel("blur")
            Mode.FOOD -> showEffectsPanel("food")
            else -> Unit
        }
    }

    private fun showMoreModes() {
        if (recording != null || busy) return
        val base = baseSelector()
        val c = caps
        val gyro = sensorManager.getDefaultSensor(Sensor.TYPE_GYROSCOPE) != null
        if (!macroSearched) {
            macroSearched = true
            macroCameraId = CameraCapabilities.findMacroCameraId(this, backMainId())
        }
        val nightNative = extensions?.let { m -> base?.let { m.isExtensionAvailable(it, ExtensionMode.NIGHT) } } == true
        val proAvailable = c != null && (c.manualSensor || c.evSupported || c.awbModes.size > 1 || c.manualFocus)
        val macroAvailable = macroCameraId != null || (backCaps()?.let { it.macroAf || it.manualFocus } ?: (c?.macroAf == true))

        data class Item(val name: String, val detail: String, val enabled: Boolean, val action: () -> Unit)
        val items = listOf(
            Item("Pro", if (proAvailable) "ISO, obturador, balanço de branco e foco manuais" else "sem controles manuais nesta câmera", proAvailable) { setMode(Mode.PRO) },
            Item("Panorama", if (gyro) "gire o celular devagar" else "precisa de giroscópio", gyro) { setMode(Mode.PANORAMA) },
            Item(
                "Macro",
                when {
                    macroCameraId != null -> "câmera macro"
                    macroAvailable -> "foco próximo da câmera principal (a macro não é liberada para apps)"
                    else -> "indisponível neste celular"
                },
                macroAvailable,
            ) { setMode(Mode.MACRO) },
            Item("Comida", "cores vivas e desfoque em volta", true) { setMode(Mode.FOOD) },
            Item("Noite", if (nightNative) "processamento do fabricante" else "várias fotos combinadas no aparelho", true) { setMode(Mode.NIGHT) },
            Item("Documentos", "detecta bordas, corrige perspectiva, exporta PDF", true) { startDocumentScan() },
        )
        val active = mapOf("Pro" to Mode.PRO, "Panorama" to Mode.PANORAMA, "Macro" to Mode.MACRO, "Comida" to Mode.FOOD, "Noite" to Mode.NIGHT)
        showDropdown(modeMore, "Mais modos", items.map { item ->
            MenuOption(item.name, item.detail, selected = active[item.name] == mode, enabled = item.enabled) {
                if (item.enabled) item.action() else toast("${item.name}: ${item.detail}.")
            }
        }, upward = true, width = 280)
    }

    private fun backMainId(): String? = cameraProvider?.availableCameraInfos
        ?.firstOrNull { CameraCapabilities(it).facing == android.hardware.camera2.CameraMetadata.LENS_FACING_BACK }
        ?.let { Camera2CameraInfo.from(it).cameraId }

    private fun backCaps(): CameraCapabilities? = cameraProvider?.availableCameraInfos
        ?.map { CameraCapabilities(it) }
        ?.firstOrNull { !it.isFront }

    // --- Formato do visor ------------------------------------------------------------

    private fun applyLayout() {
        val params = previewBox.layoutParams as ConstraintLayout.LayoutParams
        val ratio = when (mode) {
            Mode.VIDEO -> "H,9:16"
            Mode.PANORAMA -> "H,3:4"
            else -> aspect.ratio
        }
        if (ratio == null) {
            params.dimensionRatio = null
            params.topToTop = ConstraintLayout.LayoutParams.PARENT_ID
            params.topToBottom = ConstraintLayout.LayoutParams.UNSET
            params.bottomToBottom = ConstraintLayout.LayoutParams.PARENT_ID
        } else {
            params.dimensionRatio = ratio
            params.topToTop = ConstraintLayout.LayoutParams.UNSET
            params.topToBottom = R.id.topBar
            params.bottomToBottom = ConstraintLayout.LayoutParams.UNSET
        }
        previewBox.layoutParams = params
        aspectButton.text = aspect.label
        previewBox.doOnNextLayout { bindCamera() }
    }

    // --- Camera ------------------------------------------------------------------------

    private fun startCamera() {
        val future = ProcessCameraProvider.getInstance(this)
        future.addListener({
            val provider = try {
                future.get()
            } catch (error: Exception) {
                showMessage("Não foi possível iniciar a câmera.")
                return@addListener
            }
            cameraProvider = provider
            val extFuture = ExtensionsManager.getInstanceAsync(this, provider)
            extFuture.addListener({
                extensions = try {
                    extFuture.get()
                } catch (error: Exception) {
                    null
                }
                bindCamera()
            }, ContextCompat.getMainExecutor(this))
        }, ContextCompat.getMainExecutor(this))
    }

    private fun baseSelector(): CameraSelector? {
        val provider = cameraProvider ?: return null
        val wanted = CameraSelector.Builder().requireLensFacing(lensFacing).build()
        return try {
            if (provider.hasCamera(wanted)) return wanted
            lensFacing = if (lensFacing == CameraSelector.LENS_FACING_BACK) CameraSelector.LENS_FACING_FRONT else CameraSelector.LENS_FACING_BACK
            CameraSelector.Builder().requireLensFacing(lensFacing).build()
        } catch (error: Exception) {
            null
        }
    }

    /** Precisa do fluxo de analise (quadros pequenos) neste modo? */
    private fun wantsAnalysis(): Boolean = when (mode) {
        Mode.VIDEO -> false
        Mode.PANORAMA -> true
        else -> settings.histogram || (settings.qrCodes && mode == Mode.PHOTO) || tracksFaces()
    }

    private fun tracksFaces() = mode == Mode.PORTRAIT || (lensFacing == CameraSelector.LENS_FACING_FRONT && mode == Mode.PHOTO)

    private fun computationalNight() = mode == Mode.NIGHT && nativeExtension == null
    private fun computationalHdr() = mode == Mode.PHOTO && settings.hdr && nativeExtension == null && caps?.evSupported == true

    /**
     * Liga a camera com os usos que o modo precisa. Se o aparelho recusar a
     * combinacao, tenta de novo com menos recursos em vez de deixar a tela
     * preta: [level] 1 tira a alta resolucao e a extensao, 2 tira a analise
     * de quadros e a foto durante o video, 3 usa o minimo.
     */
    private fun bindCamera(level: Int = 0) {
        val provider = cameraProvider ?: return
        if (permissionPanel.visibility == View.VISIBLE) return
        bindingSignature = bindingKey()
        val keepRecording = recording != null && mode == Mode.VIDEO
        val base = baseSelector() ?: return

        var selector = base
        nativeExtension = null
        val wantedExtension = when {
            mode == Mode.PORTRAIT -> ExtensionMode.BOKEH
            mode == Mode.NIGHT -> ExtensionMode.NIGHT
            mode == Mode.PHOTO && settings.hdr -> ExtensionMode.HDR
            else -> null
        }
        val manager = extensions
        if (wantedExtension != null && level == 0 && manager != null) {
            try {
                if (manager.isExtensionAvailable(base, wantedExtension)) {
                    selector = manager.getExtensionEnabledCameraSelector(base, wantedExtension)
                    nativeExtension = wantedExtension
                }
            } catch (error: Exception) {
                nativeExtension = null
            }
        }
        if (mode == Mode.MACRO) {
            if (!macroSearched) {
                macroSearched = true
                macroCameraId = CameraCapabilities.findMacroCameraId(this, backMainId())
            }
            val id = macroCameraId
            if (id != null) {
                selector = CameraSelector.Builder()
                    .addCameraFilter { infos -> infos.filter { Camera2CameraInfo.from(it).cameraId == id } }
                    .build()
            }
        }

        val source = when (mode) {
            Mode.VIDEO -> AspectRatio.RATIO_16_9
            Mode.PANORAMA -> AspectRatio.RATIO_4_3
            else -> aspect.source
        }
        val ratioStrategy = AspectRatioStrategy(source, AspectRatioStrategy.FALLBACK_RULE_AUTO)

        val previewBuilder = Preview.Builder()
            .setResolutionSelector(ResolutionSelector.Builder().setAspectRatioStrategy(ratioStrategy).build())
        if (nativeExtension == null) {
            Camera2Interop.Extender(previewBuilder).setSessionCaptureCallback(manual.captureCallback)
        }
        val previewUseCase = previewBuilder.build().also { it.setSurfaceProvider(preview.surfaceProvider) }
        val useCases = mutableListOf<UseCase>(previewUseCase)

        imageCapture = null
        analysis = null
        if (!keepRecording) videoCapture = null

        when (mode) {
            Mode.VIDEO -> {
                val video = videoCapture ?: buildVideoCapture(base).also { videoCapture = it }
                useCases += video
                if (level <= 1) {
                    // Foto durante o video, no tamanho do video.
                    imageCapture = ImageCapture.Builder()
                        .setCaptureMode(ImageCapture.CAPTURE_MODE_MINIMIZE_LATENCY)
                        .setResolutionSelector(
                            ResolutionSelector.Builder()
                                .setAspectRatioStrategy(ratioStrategy)
                                .setResolutionStrategy(ResolutionStrategy(Size(1920, 1080), ResolutionStrategy.FALLBACK_RULE_CLOSEST_LOWER_THEN_HIGHER))
                                .build(),
                        )
                        .build()
                        .also { useCases += it }
                }
            }
            Mode.PANORAMA -> {
                analysis = buildAnalysis(Size(1280, 960)).also { useCases += it }
            }
            else -> {
                val info = try {
                    provider.getCameraInfo(base)
                } catch (error: Exception) {
                    null
                }
                imageCapture = buildImageCapture(source, ratioStrategy, level, info?.let { CameraCapabilities(it) })
                    .also { useCases += it }
                if (level <= 1 && nativeExtension == null && wantsAnalysis()) {
                    analysis = buildAnalysis(Size(640, 480)).also { useCases += it }
                }
            }
        }

        try {
            provider.unbindAll()
            val viewPort = if (mode != Mode.VIDEO && mode != Mode.PANORAMA) preview.viewPort else null
            // Filtro gravado no video: so quando ha filtro escolhido; some no ultimo recuo.
            val effect = if (mode == Mode.VIDEO && videoFilterWanted() && level <= 2) {
                videoFilterCreated = true
                videoFilter.setMatrix(filterMatrix())
                VideoFilterEffect(videoFilter)
            } else {
                null
            }
            videoFilterBound = false
            val bound = if (viewPort != null || effect != null) {
                val group = UseCaseGroup.Builder()
                viewPort?.let { group.setViewPort(it) }
                useCases.forEach { group.addUseCase(it) }
                effect?.let { group.addEffect(it) }
                provider.bindToLifecycle(this, selector, group.build()).also { videoFilterBound = effect != null }
            } else {
                provider.bindToLifecycle(this, selector, *useCases.toTypedArray())
            }
            camera = bound
            onCameraBound(bound)
        } catch (error: Exception) {
            Log.e(TAG, "Falha ao ligar a camera (nivel $level)", error)
            if (level < 3) {
                bindCamera(level + 1)
            } else {
                if (keepRecording) recording?.stop()
                if (mode != Mode.PHOTO) {
                    mode = Mode.PHOTO
                    renderModes()
                    applyLayout()
                }
            }
        }
    }

    private fun buildImageCapture(source: Int, ratio: AspectRatioStrategy, level: Int, c: CameraCapabilities?): ImageCapture {
        val resolution = ResolutionSelector.Builder().setAspectRatioStrategy(ratio)
        val fourByThree = source == AspectRatio.RATIO_4_3
        val chosen = settings.photoSize(fourByThree)
        when {
            computationalNight() || computationalHdr() -> {
                // Varias fotos processadas juntas: ~8 MP para caber na memoria.
                val target = if (fourByThree) Size(3264, 2448) else Size(3840, 2160)
                resolution.setResolutionStrategy(ResolutionStrategy(target, ResolutionStrategy.FALLBACK_RULE_CLOSEST_LOWER_THEN_HIGHER))
            }
            level >= 1 || nativeExtension != null -> resolution.setResolutionStrategy(ResolutionStrategy.HIGHEST_AVAILABLE_STRATEGY)
            // Recomendada: o maior tamanho normal do sensor (pixels agrupados),
            // que tem menos ruido e mais alcance dinamico que o modo de 50 MP.
            chosen == "max" -> resolution.setResolutionStrategy(ResolutionStrategy.HIGHEST_AVAILABLE_STRATEGY)
            else -> {
                val parts = chosen.split("x").mapNotNull { it.toIntOrNull() }
                val size = if (parts.size == 2) Size(parts[0], parts[1]) else Size(4000, 3000)
                resolution
                    .setResolutionStrategy(ResolutionStrategy(size, ResolutionStrategy.FALLBACK_RULE_CLOSEST_LOWER_THEN_HIGHER))
                    .setAllowedResolutionMode(ResolutionSelector.PREFER_HIGHER_RESOLUTION_OVER_CAPTURE_RATE)
            }
        }
        val builder = ImageCapture.Builder()
            .setCaptureMode(ImageCapture.CAPTURE_MODE_MAXIMIZE_QUALITY)
            .setJpegQuality(settings.jpegQuality.coerceIn(50, 100))
            .setFlashMode(if (usesScreenFlash()) ImageCapture.FLASH_MODE_OFF else flashMode)
            .setResolutionSelector(resolution.build())
        if (c != null && nativeExtension == null) applyHighQualityProcessing(builder, c)
        return builder.build()
    }

    /**
     * Pede ao processador de imagem do celular o processamento mais caprichado
     * na foto (reducao de ruido, nitidez, aberracao cromatica, pixels quentes e
     * curva de tons em alta qualidade). So os modos que o sensor declara.
     */
    private fun applyHighQualityProcessing(builder: ImageCapture.Builder, c: CameraCapabilities) {
        val ext = Camera2Interop.Extender(builder)
        if (android.hardware.camera2.CameraMetadata.NOISE_REDUCTION_MODE_HIGH_QUALITY in c.noiseReductionModes) {
            ext.setCaptureRequestOption(CaptureRequest.NOISE_REDUCTION_MODE, android.hardware.camera2.CameraMetadata.NOISE_REDUCTION_MODE_HIGH_QUALITY)
        }
        if (android.hardware.camera2.CameraMetadata.EDGE_MODE_HIGH_QUALITY in c.edgeModes) {
            ext.setCaptureRequestOption(CaptureRequest.EDGE_MODE, android.hardware.camera2.CameraMetadata.EDGE_MODE_HIGH_QUALITY)
        }
        if (android.hardware.camera2.CameraMetadata.COLOR_CORRECTION_ABERRATION_MODE_HIGH_QUALITY in c.aberrationModes) {
            ext.setCaptureRequestOption(CaptureRequest.COLOR_CORRECTION_ABERRATION_MODE, android.hardware.camera2.CameraMetadata.COLOR_CORRECTION_ABERRATION_MODE_HIGH_QUALITY)
        }
        if (android.hardware.camera2.CameraMetadata.HOT_PIXEL_MODE_HIGH_QUALITY in c.hotPixelModes) {
            ext.setCaptureRequestOption(CaptureRequest.HOT_PIXEL_MODE, android.hardware.camera2.CameraMetadata.HOT_PIXEL_MODE_HIGH_QUALITY)
        }
        if (android.hardware.camera2.CameraMetadata.TONEMAP_MODE_HIGH_QUALITY in c.tonemapModes) {
            ext.setCaptureRequestOption(CaptureRequest.TONEMAP_MODE, android.hardware.camera2.CameraMetadata.TONEMAP_MODE_HIGH_QUALITY)
        }
    }

    private fun buildAnalysis(size: Size): ImageAnalysis =
        ImageAnalysis.Builder()
            .setResolutionSelector(
                ResolutionSelector.Builder()
                    .setAspectRatioStrategy(AspectRatioStrategy.RATIO_4_3_FALLBACK_AUTO_STRATEGY)
                    .setResolutionStrategy(ResolutionStrategy(size, ResolutionStrategy.FALLBACK_RULE_CLOSEST_LOWER_THEN_HIGHER))
                    .build(),
            )
            .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST)
            .build()
            .also { it.setAnalyzer(analysisExecutor, analyzer) }

    private fun supportedQualities(info: androidx.camera.core.CameraInfo): List<Quality> = try {
        Recorder.getVideoCapabilities(info).getSupportedQualities(DynamicRange.SDR)
    } catch (error: Exception) {
        emptyList()
    }

    private fun qualityName(q: Quality) = when (q) {
        Quality.UHD -> "UHD"
        Quality.FHD -> "FHD"
        Quality.HD -> "HD"
        Quality.SD -> "SD"
        else -> "?"
    }

    private fun qualityLabel(q: Quality) = when (q) {
        Quality.UHD -> "4K UHD (2160p)"
        Quality.FHD -> "Full HD (1080p)"
        Quality.HD -> "HD (720p)"
        Quality.SD -> "SD (480p)"
        else -> "?"
    }

    private fun buildVideoCapture(selector: CameraSelector): VideoCapture<Recorder> {
        val info = try {
            cameraProvider?.getCameraInfo(selector)
        } catch (error: Exception) {
            null
        }
        val supported = info?.let { supportedQualities(it) }.orEmpty()
        val wanted = supported.firstOrNull { qualityName(it) == settings.videoQuality }
            ?: supported.firstOrNull { it == Quality.FHD }
            ?: supported.firstOrNull()
            ?: Quality.FHD
        val recorder = Recorder.Builder()
            .setQualitySelector(QualitySelector.from(wanted, FallbackStrategy.lowerQualityOrHigherThan(wanted)))
            .build()
        val builder = VideoCapture.Builder(recorder)
        val fpsOptions = info?.let { CameraCapabilities(it).fixedFps() }.orEmpty()
        if (settings.videoFps in fpsOptions) builder.setTargetFrameRate(Range(settings.videoFps, settings.videoFps))
        return builder.build()
    }

    private fun onCameraBound(bound: Camera) {
        val c = CameraCapabilities(bound.cameraInfo)
        caps = c
        shutter.isEnabled = true
        if (nativeExtension == null) manual.apply(bound, c)

        // So mostra o flash que existe nesta camera.
        flashButton.visibility = when {
            mode == Mode.PANORAMA -> View.GONE
            c.hasFlash -> View.VISIBLE
            c.isFront && settings.screenFlash && mode != Mode.VIDEO -> View.VISIBLE
            else -> View.GONE
        }
        if (usesScreenFlash() && flashMode == ImageCapture.FLASH_MODE_AUTO) flashMode = ImageCapture.FLASH_MODE_ON
        renderFlash()
        if (mode == Mode.VIDEO) bound.cameraControl.enableTorch(flashMode == ImageCapture.FLASH_MODE_ON && c.hasFlash)

        analyzer.faces = tracksFaces()
        applySettingsToUi()
        renderHdr()
        renderModes()

        bound.cameraInfo.zoomState.removeObservers(this)
        bound.cameraInfo.zoomState.observe(this) { state ->
            buildZoomPresets(state.minZoomRatio, state.maxZoomRatio)
            renderZoom(state.zoomRatio)
        }
        bound.cameraInfo.cameraState.removeObservers(this)
        bound.cameraInfo.cameraState.observe(this) { state ->
            state.error?.let { showCameraError(it.code) }
            showResolution()
        }
        setupEv(c)
        showResolution()

        if (mode == Mode.PRO) showProPanel()
        if (mode == Mode.FOOD || mode == Mode.MACRO) centerFocus()
        if (mode == Mode.MACRO) {
            manual.macroAf = macroCameraId == null && c.macroAf
            manual.apply(bound, c)
        }
    }

    private fun showInfo(text: String, duration: Long = 2500) {
        infoLabel.text = text
        infoLabel.visibility = View.VISIBLE
        main.removeCallbacks(hideInfo)
        if (duration > 0) main.postDelayed(hideInfo, duration)
    }

    private fun showCameraError(code: Int) {
        val text = when (code) {
            CameraState.ERROR_CAMERA_IN_USE -> "A câmera está sendo usada por outro app."
            CameraState.ERROR_MAX_CAMERAS_IN_USE -> "Muitas câmeras abertas. Feche outros apps de câmera."
            CameraState.ERROR_CAMERA_DISABLED -> "A câmera foi desativada pelo sistema."
            CameraState.ERROR_DO_NOT_DISTURB_MODE_ENABLED -> "Desative o modo Não perturbe para usar a câmera."
            CameraState.ERROR_CAMERA_FATAL_ERROR -> "A câmera parou de responder. Feche e abra o app."
            else -> return
        }
        showMessage(text)
    }

    private fun showResolution() {
        when (mode) {
            Mode.VIDEO -> {
                val info = camera?.cameraInfo
                val supported = info?.let { supportedQualities(it) }.orEmpty()
                val current = supported.firstOrNull { qualityName(it) == settings.videoQuality }
                    ?: supported.firstOrNull { it == Quality.FHD } ?: supported.firstOrNull()
                resolutionButton.text = current?.let { qualityName(it) } ?: "FHD"
                val fps = caps?.fixedFps().orEmpty()
                fpsButton.text = if (settings.videoFps in fps) "${settings.videoFps}" else (fps.lastOrNull()?.toString() ?: "30")
                fpsButton.alpha = if (fps.size > 1) 1f else 0.5f
            }
            Mode.PANORAMA -> resolutionButton.text = ""
            else -> {
                val info = imageCapture?.resolutionInfo ?: return
                val crop = info.cropRect
                val mp = crop.width().toLong() * crop.height() / 1_000_000.0
                resolutionButton.text = if (mp >= 1) "${Math.round(mp)}M" else String.format(Locale.US, "%.1fM", mp)
            }
        }
    }

    private fun choosePhotoSize() {
        val c = caps ?: return
        if (computationalNight() || computationalHdr() || nativeExtension != null) {
            toast("Neste modo a resolução é definida pelo processamento.")
            return
        }
        val fourByThree = aspect.source == AspectRatio.RATIO_4_3
        val sizes = c.jpegSizes(fourByThree)
        if (sizes.isEmpty()) return
        val high = c.highResSizes()
        val recommended = sizes.firstOrNull { it !in high } ?: sizes.first()
        val current = settings.photoSize(fourByThree)
        fun pick(value: String) {
            if (value != settings.photoSize(fourByThree)) {
                settings.setPhotoSize(fourByThree, value)
                bindCamera()
            }
        }
        val options = listOf(
            MenuOption("Recomendada · ${CameraCapabilities.mp(recommended)}M", "Melhor equilíbrio de nitidez e ruído", selected = current == "max") { pick("max") },
        ) + sizes.map { size ->
            val key = "${size.width}x${size.height}"
            MenuOption(
                "${CameraCapabilities.mp(size)}M",
                "${size.width}×${size.height}" + if (size in high) " · alta resolução, mais lenta" else "",
                selected = current == key,
            ) { pick(key) }
        }
        showDropdown(resolutionButton, "Qualidade da foto (${if (fourByThree) "4:3" else "16:9"})", options)
    }

    private fun chooseVideoQuality() {
        if (recording != null) return
        val info = camera?.cameraInfo ?: return
        val supported = supportedQualities(info)
        if (supported.isEmpty()) {
            toast("Não foi possível ler as qualidades de vídeo desta câmera.")
            return
        }
        val current = supported.firstOrNull { qualityName(it) == settings.videoQuality }
            ?: supported.firstOrNull { it == Quality.FHD } ?: supported.first()
        showDropdown(resolutionButton, "Qualidade do vídeo", supported.map { q ->
            MenuOption(qualityName(q), qualityLabel(q), selected = q == current) {
                if (q != current) {
                    settings.videoQuality = qualityName(q)
                    bindCamera()
                }
            }
        })
    }

    // --- Exposicao ------------------------------------------------------------------------

    private fun setupEv(c: CameraCapabilities) {
        if (!c.evSupported || nativeExtension != null) {
            evBar.visibility = View.GONE
            return
        }
        evSeek.max = c.evRange.upper - c.evRange.lower
        val index = camera?.cameraInfo?.exposureState?.exposureCompensationIndex ?: 0
        evSeek.progress = index - c.evRange.lower
        evValue.text = formatEv(index * c.evStep)
    }

    private fun showEvBar() {
        val c = caps ?: return
        if (!c.evSupported || nativeExtension != null || manual.isManualExposure || mode == Mode.PANORAMA) return
        evBar.visibility = View.VISIBLE
        main.removeCallbacks(hideEv)
        main.postDelayed(hideEv, 4000)
    }

    private fun adjustEv(steps: Int) {
        val c = caps ?: return
        if (!c.evSupported) return
        val current = camera?.cameraInfo?.exposureState?.exposureCompensationIndex ?: 0
        val next = (current + steps).coerceIn(c.evRange.lower, c.evRange.upper)
        if (next == current) return
        camera?.cameraControl?.setExposureCompensationIndex(next)
        evSeek.progress = next - c.evRange.lower
        evValue.text = formatEv(next * c.evStep)
        showEvBar()
    }

    private fun formatEv(value: Float): String =
        if (abs(value) < 0.05f) "0.0" else String.format(Locale.US, "%+.1f", value)

    // --- Zoom --------------------------------------------------------------------------------

    private fun buildZoomPresets(min: Float, max: Float) {
        val presets = buildList {
            // 0.5x so quando existe grande-angular de verdade (zoom minimo < 1).
            if (min < 0.95f) add(min)
            add(1f)
            listOf(2f, 4f, 10f).filter { it <= max + 0.01f }.forEach { add(it) }
        }
        if (presets == zoomPresets && zoomBar.childCount == presets.size) return
        zoomPresets = presets
        zoomBar.removeAllViews()
        presets.forEach { value ->
            val chip = TextView(this).apply {
                layoutParams = LinearLayout.LayoutParams(dp(44), dp(44)).apply {
                    marginStart = dp(4)
                    marginEnd = dp(4)
                }
                gravity = Gravity.CENTER
                setTextColor(WHITE)
                typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
                setOnClickListener {
                    val current = camera?.cameraInfo?.zoomState?.value?.zoomRatio ?: 1f
                    if (abs(current - value) < 0.05f) showZoomSlider() else smoothZoom(value)
                }
            }
            zoomBar.addView(chip)
        }
        zoomBar.visibility = if (presets.size > 1 && mode != Mode.PANORAMA) View.VISIBLE else View.INVISIBLE
    }

    /** Zoom suave ate o valor, em vez de pular. */
    private fun smoothZoom(target: Float) {
        val cam = camera ?: return
        val from = cam.cameraInfo.zoomState.value?.zoomRatio ?: 1f
        zoomAnimator?.cancel()
        zoomAnimator = ValueAnimator.ofFloat(from, target).apply {
            duration = 260
            addUpdateListener { cam.cameraControl.setZoomRatio(it.animatedValue as Float) }
            start()
        }
    }

    private fun showZoomSlider() {
        zoomSliderBox.visibility = View.VISIBLE
        main.removeCallbacks(hideZoomSlider)
        main.postDelayed(hideZoomSlider, 2500)
    }

    private fun formatZoom(value: Float): String {
        val rounded = Math.round(value * 10) / 10f
        return if (rounded % 1f == 0f) rounded.toInt().toString() else String.format(Locale.US, "%.1f", rounded)
    }

    private fun renderZoom(current: Float) {
        val active = zoomPresets.indices.lastOrNull { zoomPresets[it] <= current + 0.05f } ?: 0
        for (i in 0 until zoomBar.childCount) {
            val chip = zoomBar.getChildAt(i) as TextView
            chip.setTextSize(TypedValue.COMPLEX_UNIT_SP, 13f)
            if (i == active) {
                chip.text = "${formatZoom(current)}×"
                chip.setBackgroundResource(R.drawable.zoom_chip)
            } else {
                chip.text = formatZoom(zoomPresets[i])
                chip.background = null
            }
        }
        val state = camera?.cameraInfo?.zoomState?.value
        if (state != null && state.maxZoomRatio > state.minZoomRatio) {
            val progress = ln(current / state.minZoomRatio) / ln(state.maxZoomRatio / state.minZoomRatio) * 1000
            zoomSeek.progress = progress.roundToInt()
        }
        // Acima de 1x nesta camera o zoom e digital (recorte), nao outra lente.
        val digital = current > 1.05f && caps?.logicalMultiCamera != true
        zoomValue.text = "${formatZoom(current)}×" + if (digital) " digital" else ""
    }

    // --- Gestos -------------------------------------------------------------------------------

    @SuppressLint("ClickableViewAccessibility")
    private fun setupGestures() {
        var scaled = false
        var scrolledEv = 0f
        val scaleDetector = ScaleGestureDetector(
            this,
            object : ScaleGestureDetector.SimpleOnScaleGestureListener() {
                override fun onScale(detector: ScaleGestureDetector): Boolean {
                    val cam = camera ?: return false
                    val current = cam.cameraInfo.zoomState.value?.zoomRatio ?: 1f
                    zoomAnimator?.cancel()
                    cam.cameraControl.setZoomRatio(current * detector.scaleFactor)
                    showZoomSlider()
                    scaled = true
                    return true
                }
            },
        )
        val swipeModes = listOf(Mode.PORTRAIT, Mode.PHOTO, Mode.VIDEO)
        val gestures = GestureDetector(
            this,
            object : GestureDetector.SimpleOnGestureListener() {
                override fun onDown(e: MotionEvent): Boolean {
                    scrolledEv = 0f
                    return true
                }

                override fun onSingleTapUp(e: MotionEvent): Boolean {
                    if (scaled) return true
                    if (locked) {
                        unlock()
                        return true
                    }
                    focusAt(e.x, e.y, lock = false)
                    return true
                }

                override fun onLongPress(e: MotionEvent) {
                    if (!scaled) focusAt(e.x, e.y, lock = true)
                }

                /** Arrastar na vertical logo depois de focar ajusta a exposicao. */
                override fun onScroll(e1: MotionEvent?, e2: MotionEvent, distanceX: Float, distanceY: Float): Boolean {
                    if (scaled || evBar.visibility != View.VISIBLE) return false
                    if (abs(distanceY) <= abs(distanceX)) return false
                    scrolledEv += distanceY
                    val step = dp(24).toFloat()
                    while (abs(scrolledEv) >= step) {
                        adjustEv(if (scrolledEv > 0) 1 else -1)
                        scrolledEv -= if (scrolledEv > 0) step else -step
                    }
                    return true
                }

                override fun onFling(e1: MotionEvent?, e2: MotionEvent, velocityX: Float, velocityY: Float): Boolean {
                    if (scaled || e1 == null || e1.pointerCount > 1 || evBar.visibility == View.VISIBLE) return false
                    val dx = e2.x - e1.x
                    val dy = e2.y - e1.y
                    if (abs(dy) > dp(80) && abs(dy) > abs(dx) * 1.5f && settings.swipeToSwitch && recording == null) {
                        switchCamera()
                        return true
                    }
                    if (abs(dx) < dp(80) || abs(dx) < abs(dy) * 1.5f) return false
                    val index = swipeModes.indexOf(mode).takeIf { it >= 0 } ?: 1
                    val next = (index + if (dx < 0) 1 else -1).coerceIn(0, swipeModes.lastIndex)
                    setMode(swipeModes[next])
                    return true
                }
            },
        )

        preview.setOnTouchListener { view, event ->
            if (event.actionMasked == MotionEvent.ACTION_DOWN) scaled = false
            scaleDetector.onTouchEvent(event)
            gestures.onTouchEvent(event)
            if (event.actionMasked == MotionEvent.ACTION_UP) view.performClick()
            true
        }
    }

    /**
     * Toque: foca e mede a luz no ponto. Toque longo: faz o mesmo e trava
     * foco e exposicao (AE/AF) ate o proximo toque.
     */
    private fun focusAt(x: Float, y: Float, lock: Boolean) {
        val cam = camera ?: return
        val c = caps
        lastManualFocus = System.currentTimeMillis()
        val point = preview.meteringPointFactory.createPoint(x, y)
        var flags = FocusMeteringAction.FLAG_AE or FocusMeteringAction.FLAG_AWB
        if (c?.hasAutofocus == true && manual.focusDiopters == null) flags = flags or FocusMeteringAction.FLAG_AF
        val builder = FocusMeteringAction.Builder(point, flags)
        if (lock) builder.disableAutoCancel() else builder.setAutoCancelDuration(5, TimeUnit.SECONDS)
        try {
            val future = cam.cameraControl.startFocusAndMetering(builder.build())
            if (lock) {
                future.addListener({
                    manual.aeLock = true
                    manual.awbLock = true
                    manual.apply(camera, caps)
                }, ContextCompat.getMainExecutor(this))
            }
        } catch (error: Exception) {
            // Camera sem regioes de medicao: sem foco por toque.
        }
        if (lock) {
            locked = true
            showInfo(if (c?.hasAutofocus == true) "Bloqueio AE/AF" else "Bloqueio AE", 0)
            focusRing.performHapticFeedback(HapticFeedbackConstants.LONG_PRESS)
        }

        focusRing.animate().cancel()
        focusRing.translationX = previewBox.left + x - focusRing.width / 2f
        focusRing.translationY = previewBox.top + y - focusRing.height / 2f
        focusRing.alpha = 1f
        focusRing.scaleX = 1.4f
        focusRing.scaleY = 1.4f
        focusRing.animate().scaleX(1f).scaleY(1f).setDuration(200).withEndAction {
            if (!locked) focusRing.animate().alpha(0f).setStartDelay(1500).setDuration(300).start()
        }.start()
        showEvBar()
    }

    private fun unlock() {
        if (!locked) return
        locked = false
        manual.aeLock = false
        manual.awbLock = false
        camera?.cameraControl?.cancelFocusAndMetering()
        manual.apply(camera, caps)
        infoLabel.visibility = View.GONE
        focusRing.animate().alpha(0f).setDuration(200).start()
    }

    private fun centerFocus() {
        preview.post { if (preview.width > 0) focusAt(preview.width / 2f, preview.height / 2f, lock = false) }
    }

    // --- Analise de quadros (chamadas vindas do FrameAnalyzer) ---------------------------------

    override fun onHistogram(bins: IntArray, clippedHigh: Float, clippedLow: Float) {
        main.post { if (histogramView.visibility == View.VISIBLE) histogramView.update(bins) }
    }

    override fun onQr(codes: List<Barcode>, transform: OutputTransform) {
        if (!settings.qrCodes || mode != Mode.PHOTO) return
        val code = codes.firstOrNull { it.rawValue != null } ?: return
        val target = preview.outputTransform ?: return
        val mapper = try {
            CoordinateTransform(transform, target)
        } catch (error: Exception) {
            return
        }
        overlay.qrBoxes = codes.mapNotNull { c -> c.boundingBox?.let { RectF(it).also { r -> mapper.mapRect(r) } } }
        lastQrValue = code
        qrChip.text = qrTitle(code)
        qrChip.visibility = View.VISIBLE
        main.removeCallbacks(hideQr)
        main.postDelayed(hideQr, 2500)
    }

    override fun onFaces(boxes: List<Rect>, transform: OutputTransform) {
        if (!tracksFaces()) {
            return
        }
        val target = preview.outputTransform ?: return
        val mapper = try {
            CoordinateTransform(transform, target)
        } catch (error: Exception) {
            return
        }
        val mapped = boxes.map { RectF(it).also { r -> mapper.mapRect(r) } }
        // Sem desenhar nada: o rosto so guia o foco automatico.
        // Foco automatico no maior rosto, sem brigar com o toque do usuario.
        val face = mapped.maxByOrNull { it.width() * it.height() } ?: return
        val now = System.currentTimeMillis()
        if (locked || manual.focusDiopters != null || now - lastManualFocus < 5000 || now - lastFaceFocus < 2000) return
        val center = face.centerX() to face.centerY()
        val previous = lastFaceCenter
        if (previous != null && abs(previous.first - center.first) < dp(30) && abs(previous.second - center.second) < dp(30)) return
        lastFaceCenter = center
        lastFaceFocus = now
        val cam = camera ?: return
        try {
            val point = preview.meteringPointFactory.createPoint(center.first, center.second, face.width() / max(1, preview.width))
            cam.cameraControl.startFocusAndMetering(
                FocusMeteringAction.Builder(point).setAutoCancelDuration(3, TimeUnit.SECONDS).build(),
            )
        } catch (error: Exception) {
            // Sem suporte a regioes.
        }
    }

    override fun onPanoramaFrame(frame: Bitmap) {
        main.post { panorama?.addFrame(frame) ?: frame.recycle() }
    }

    private fun qrTitle(code: Barcode): String = when (code.valueType) {
        Barcode.TYPE_URL -> "🔗 ${code.url?.url ?: code.rawValue}"
        Barcode.TYPE_WIFI -> "📶 Wi-Fi: ${code.wifi?.ssid ?: ""}"
        Barcode.TYPE_PHONE -> "📞 ${code.phone?.number ?: code.rawValue}"
        Barcode.TYPE_EMAIL -> "✉️ ${code.email?.address ?: code.rawValue}"
        else -> "QR: ${code.displayValue ?: code.rawValue}"
    }

    /** Nada e aberto sem o usuario ver o conteudo e confirmar. */
    private fun showQrDialog(code: Barcode) {
        val raw = code.rawValue ?: return
        val openable = when (code.valueType) {
            Barcode.TYPE_URL -> code.url?.url?.let { u ->
                val uri = Uri.parse(u)
                if (uri.scheme.equals("http", true) || uri.scheme.equals("https", true)) uri else null
            }
            Barcode.TYPE_PHONE -> code.phone?.number?.let { Uri.parse("tel:$it") }
            Barcode.TYPE_EMAIL -> code.email?.address?.let { Uri.parse("mailto:$it") }
            Barcode.TYPE_GEO -> code.geoPoint?.let { Uri.parse("geo:${it.lat},${it.lng}") }
            else -> null
        }
        val builder = AlertDialog.Builder(this)
            .setTitle("QR Code")
            .setMessage(raw)
            .setNeutralButton("Copiar") { _, _ ->
                (getSystemService(CLIPBOARD_SERVICE) as ClipboardManager).setPrimaryClip(ClipData.newPlainText("QR Code", raw))
            }
            .setNegativeButton("Compartilhar") { _, _ ->
                startActivity(Intent.createChooser(Intent(Intent.ACTION_SEND).apply {
                    type = "text/plain"
                    putExtra(Intent.EXTRA_TEXT, raw)
                }, "Compartilhar"))
            }
        if (openable != null) {
            builder.setPositiveButton("Abrir") { _, _ ->
                AlertDialog.Builder(this)
                    .setTitle("Abrir este conteúdo?")
                    .setMessage("Confira o endereço antes de abrir:\n\n$openable")
                    .setPositiveButton("Abrir") { _, _ ->
                        try {
                            startActivity(Intent(Intent.ACTION_VIEW, openable))
                        } catch (error: Exception) {
                            toast("Nenhum app para abrir isto.")
                        }
                    }
                    .setNegativeButton("Cancelar", null)
                    .show()
            }
        }
        builder.show()
    }

    // --- Nivelador (acelerometro) -------------------------------------------------------------

    override fun onSensorChanged(event: SensorEvent) {
        if (!settings.level || event.sensor.type != Sensor.TYPE_ACCELEROMETER) return
        // Filtro passa-baixa para a linha nao tremer.
        levelFiltered[0] = levelFiltered[0] * 0.85f + event.values[0] * 0.15f
        levelFiltered[1] = levelFiltered[1] * 0.85f + event.values[1] * 0.15f
        val tilt = abs(event.values[2]) / SensorManager.GRAVITY_EARTH
        // Celular deitado (apontando para o chao/ceu): o nivelador nao faz sentido.
        overlay.levelAngle = if (tilt > 0.9f) null else Math.toDegrees(atan2(levelFiltered[0].toDouble(), levelFiltered[1].toDouble())).toFloat()
    }

    override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) = Unit

    // --- Filtros e efeitos no visor --------------------------------------------------------------

    private fun filterApplies() = mode in listOf(Mode.PHOTO, Mode.PORTRAIT, Mode.PRO, Mode.MACRO, Mode.NIGHT, Mode.FOOD, Mode.VIDEO)
    private fun enhanceApplies() = settings.enhance && mode in listOf(Mode.PHOTO, Mode.PORTRAIT, Mode.PRO, Mode.MACRO, Mode.FOOD)
    private fun videoFilterWanted() = settings.filter != "original"
    private fun beautyApplies() = mode == Mode.PHOTO || mode == Mode.PORTRAIT

    private fun filterMatrix(): ColorMatrix {
        val m = ColorMatrix()
        if (enhanceApplies()) m.postConcat(Filters.enhancePreview())
        if (filterApplies()) m.postConcat(Filters.byId(settings.filter).matrix(settings.filterIntensity / 100f))
        if (mode == Mode.FOOD) m.postConcat(foodMatrix())
        return m
    }

    private fun foodMatrix(): ColorMatrix {
        val t = settings.foodIntensity / 100f
        return Filters.chain(
            Filters.saturation(1f + 0.45f * t),
            Filters.contrast(1f + 0.12f * t),
            Filters.temperature(settings.foodTone * 0.25f * t),
        )
    }

    /** Pinta o visor com o filtro (GPU, camada do PreviewView). */
    private fun applyPreviewFilter() {
        val matrix = filterMatrix()
        if (mode == Mode.VIDEO) {
            preview.setLayerType(View.LAYER_TYPE_NONE, null)
            if (videoFilterBound) videoFilter.setMatrix(matrix)
            renderEffectsButton()
            return
        }
        if (Filters.isIdentity(matrix)) {
            preview.setLayerType(View.LAYER_TYPE_NONE, null)
        } else {
            preview.setLayerType(View.LAYER_TYPE_HARDWARE, Paint().apply { colorFilter = ColorMatrixColorFilter(matrix) })
        }
        renderEffectsButton()
    }

    private fun defaultTab() = when (mode) {
        Mode.PORTRAIT -> "blur"
        Mode.FOOD -> "food"
        else -> "filters"
    }

    private fun chip(text: String, selected: Boolean, onClick: () -> Unit) = TextView(this).apply {
        this.text = text
        setTextColor(if (selected) 0xFF111111.toInt() else WHITE)
        textSize = 13f
        typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
        setBackgroundResource(R.drawable.chip_bg)
        isSelected = selected
        setPadding(dp(14), dp(8), dp(14), dp(8))
        layoutParams = LinearLayout.LayoutParams(LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT).apply {
            marginEnd = dp(8)
        }
        setOnClickListener { onClick() }
    }

    private fun row(vararg children: View): HorizontalScrollView {
        val line = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL }
        children.forEach { line.addView(it) }
        return HorizontalScrollView(this).apply {
            isHorizontalScrollBarEnabled = false
            addView(line)
            layoutParams = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT).apply {
                bottomMargin = dp(8)
            }
        }
    }

    private fun slider(label: String, value: Int, max: Int, format: (Int) -> String, onChange: (Int) -> Unit): View {
        val box = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
        }
        val name = TextView(this).apply {
            text = label
            setTextColor(WHITE)
            textSize = 13f
            minWidth = dp(76)
        }
        val valueText = TextView(this).apply {
            text = format(value)
            setTextColor(ACCENT)
            textSize = 13f
            typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
            minWidth = dp(64)
            gravity = Gravity.END
        }
        val seek = SeekBar(this).apply {
            this.max = max
            progress = value
            progressTintList = ColorStateList.valueOf(ACCENT)
            thumbTintList = ColorStateList.valueOf(ACCENT)
            layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
            setOnSeekBarChangeListener(object : SeekBar.OnSeekBarChangeListener {
                override fun onProgressChanged(seekBar: SeekBar, progress: Int, fromUser: Boolean) {
                    valueText.text = format(progress)
                    if (fromUser) onChange(progress)
                }
                override fun onStartTrackingTouch(seekBar: SeekBar) = Unit
                override fun onStopTrackingTouch(seekBar: SeekBar) = Unit
            })
        }
        box.addView(name)
        box.addView(seek)
        box.addView(valueText)
        return box
    }

    private fun note(text: String) = TextView(this).apply {
        this.text = text
        setTextColor(0xB3FFFFFF.toInt())
        textSize = 12f
        setPadding(dp(4), dp(2), dp(4), dp(2))
    }

    /** Painel de efeitos: Filtros, Rosto (beleza), Desfoque (retrato), Comida. */
    private fun showEffectsPanel(tab: String) {
        panelTab = tab
        panel.removeAllViews()
        // Filtros: so a faixa de miniaturas, sem fundo nem outros controles.
        if (tab == "filters") {
            panel.background = null
            panel.addView(FilterStrip.create(this, null, settings.filter) { f ->
                settings.filter = f.id
                settings.filterIntensity = 100
                applyPreviewFilter()
                // Primeiro filtro no video: religa a camera com o filtro OpenGL.
                if (mode == Mode.VIDEO && !videoFilterBound && videoFilterWanted() && recording == null) bindCamera()
                showEffectsPanel("filters")
            })
            panel.visibility = View.VISIBLE
            renderEffectsButton()
            return
        }
        panel.setBackgroundResource(R.drawable.panel_bg)
        val tabs = buildList {
            add("filters" to "FILTROS")
            if (mode == Mode.PORTRAIT && nativeExtension == null) add("blur" to "DESFOQUE")
            if (mode == Mode.FOOD) add("food" to "COMIDA")
        }
        if (tabs.none { it.first == tab }) {
            showEffectsPanel("filters")
            return
        }
        val current = tab
        panelTab = current
        panel.addView(row(*tabs.map { (id, name) -> chip(name, id == current) { showEffectsPanel(id) } }.toTypedArray()))

        when (current) {
            "face" -> {
                panel.addView(slider("Pele lisa", settings.beautySmooth, 100, { "$it" }) { settings.beautySmooth = it; renderEffectsButton() })
                panel.addView(slider("Brilho pele", settings.beautyBright, 100, { "$it" }) { settings.beautyBright = it; renderEffectsButton() })
                panel.addView(slider("Olhos", settings.beautyEyes, 100, { "$it" }) { settings.beautyEyes = it; renderEffectsButton() })
                panel.addView(slider("Rosto fino", settings.beautyFace, 100, { "$it" }) { settings.beautyFace = it; renderEffectsButton() })
                panel.addView(slider("Dentes", settings.beautyTeeth, 100, { "$it" }) { settings.beautyTeeth = it; renderEffectsButton() })
                panel.addView(slider("Contorno", settings.beautyContour, 100, { "$it" }) { settings.beautyContour = it; renderEffectsButton() })
                panel.addView(note("Aplicado na foto salva (detecção de rosto no aparelho)."))
            }
            "blur" -> {
                panel.addView(slider("Desfoque", settings.portraitBlur, 100, { "$it" }) { settings.portraitBlur = it })
                panel.addView(note("Desfoque por software: separa a pessoa do fundo. Não usa sensor de profundidade."))
            }
            "food" -> {
                panel.addView(slider("Intensidade", settings.foodIntensity, 100, { "$it%" }) {
                    settings.foodIntensity = it
                    applyPreviewFilter()
                })
                panel.addView(row(
                    chip("Frio", settings.foodTone == -1) { settings.foodTone = -1; applyPreviewFilter(); showEffectsPanel("food") },
                    chip("Neutro", settings.foodTone == 0) { settings.foodTone = 0; applyPreviewFilter(); showEffectsPanel("food") },
                    chip("Quente", settings.foodTone == 1) { settings.foodTone = 1; applyPreviewFilter(); showEffectsPanel("food") },
                ))
                panel.addView(note("O círculo fica nítido; em volta, desfoque aplicado na foto."))
            }
        }
        panel.visibility = View.VISIBLE
        renderEffectsButton()
    }

    // --- Modo Pro ------------------------------------------------------------------------------

    private fun showProPanel(tab: String = proTab) {
        val c = caps ?: return
        val tabs = buildList {
            if (c.manualSensor && ManualControls.isoSteps(c).isNotEmpty()) add("iso" to "ISO")
            if (c.manualSensor && ManualControls.shutterSteps(c).isNotEmpty()) add("shutter" to "VELOC.")
            if (c.evSupported) add("ev" to "EV")
            if (c.awbModes.size > 1 || c.manualPostProcessing) add("wb" to "WB")
            if (c.manualFocus) add("focus" to "FOCO")
        }
        panel.removeAllViews()
        panelTab = "pro"
        panel.setBackgroundResource(R.drawable.panel_bg)
        if (tabs.isEmpty()) {
            panel.addView(note("Esta câmera não oferece controles manuais."))
            panel.visibility = View.VISIBLE
            return
        }
        val current = if (tabs.any { it.first == tab }) tab else tabs.first().first
        proTab = current
        panel.addView(row(*tabs.map { (id, name) -> chip(name, id == current) { showProPanel(id) } }.toTypedArray()))

        when (current) {
            "iso" -> {
                val steps = ManualControls.isoSteps(c)
                val index = manual.iso?.let { steps.indexOf(it) + 1 } ?: 0
                panel.addView(slider("ISO", index, steps.size, { if (it == 0) "AUTO" else "${steps[it - 1]}" }) {
                    manual.iso = if (it == 0) null else steps[it - 1]
                    manual.apply(camera, caps)
                })
                panel.addView(note("Atual: ISO ${manual.liveIso ?: "-"}"))
            }
            "shutter" -> {
                val steps = ManualControls.shutterSteps(c)
                val index = manual.shutterNs?.let { steps.indexOf(it) + 1 } ?: 0
                panel.addView(slider("Obturador", index, steps.size, { if (it == 0) "AUTO" else CameraCapabilities.shutterLabel(steps[it - 1]) }) {
                    manual.shutterNs = if (it == 0) null else steps[it - 1]
                    manual.apply(camera, caps)
                })
                panel.addView(note("Atual: ${manual.liveExposureNs?.let { CameraCapabilities.shutterLabel(it) } ?: "-"}"))
            }
            "ev" -> {
                val index = camera?.cameraInfo?.exposureState?.exposureCompensationIndex ?: 0
                panel.addView(slider("EV", index - c.evRange.lower, c.evRange.upper - c.evRange.lower, { formatEv((it + c.evRange.lower) * c.evStep) }) {
                    camera?.cameraControl?.setExposureCompensationIndex(it + c.evRange.lower)
                })
                if (manual.isManualExposure) panel.addView(note("Com ISO/obturador manuais o EV não atua."))
            }
            "wb" -> {
                val modes = c.awbModes.filter { ManualControls.awbName(it) != null }
                panel.addView(row(*modes.map { m ->
                    chip(ManualControls.awbName(m)!!, manual.kelvin == null && manual.awbMode == m) {
                        manual.kelvin = null
                        manual.awbMode = m
                        manual.apply(camera, caps)
                        showProPanel("wb")
                    }
                }.toTypedArray()))
                if (c.manualPostProcessing) {
                    val k = manual.kelvin ?: 5500
                    panel.addView(slider("Temperatura", (k - 3000) / 100, 40, { "${3000 + it * 100}K" }) {
                        manual.kelvin = 3000 + it * 100
                        manual.apply(camera, caps)
                    })
                }
            }
            "focus" -> {
                val steps = 100
                val value = manual.focusDiopters?.let { (it / c.minFocusDistance * steps).roundToInt() + 1 } ?: 0
                panel.addView(slider("Foco", value, steps + 1, {
                    when (it) {
                        0 -> "AUTO"
                        1 -> "∞"
                        else -> {
                            val d = (it - 1f) / steps * c.minFocusDistance
                            if (d <= 0f) "∞" else "${(100f / d).roundToInt()} cm"
                        }
                    }
                }) {
                    manual.focusDiopters = if (it == 0) null else (it - 1f) / steps * c.minFocusDistance
                    manual.apply(camera, caps)
                })
            }
        }
        panel.visibility = View.VISIBLE
    }

    // --- Disparo -------------------------------------------------------------------------------

    private fun onShutter() {
        when (mode) {
            Mode.VIDEO -> toggleRecording()
            Mode.PANORAMA -> togglePanorama()
            else -> {
                if (countdownTask != null) {
                    cancelCountdown()
                    return
                }
                if (busy || imageCapture == null) return
                if (timerSeconds > 0) startCountdown(timerSeconds) else capture()
            }
        }
    }

    private fun startCountdown(seconds: Int) {
        var left = seconds
        countdown.visibility = View.VISIBLE
        val task = object : Runnable {
            override fun run() {
                if (left == 0) {
                    cancelCountdown()
                    capture()
                    return
                }
                countdown.text = left.toString()
                countdown.scaleX = 1.3f
                countdown.scaleY = 1.3f
                countdown.animate().scaleX(1f).scaleY(1f).setDuration(300).start()
                left -= 1
                main.postDelayed(this, 1000)
            }
        }
        countdownTask = task
        task.run()
    }

    private fun cancelCountdown() {
        countdownTask?.let { main.removeCallbacks(it) }
        countdownTask = null
        countdown.visibility = View.GONE
    }

    private fun hasSpace(): Boolean {
        if (MediaSaver.freeBytes() < 60L * 1024 * 1024) {
            showMessage("Armazenamento cheio. Libere espaço para salvar fotos e vídeos.")
            return false
        }
        return true
    }

    private fun needsProcessing(): Boolean =
        computationalNight() || computationalHdr() || enhanceApplies() ||
            (filterApplies() && settings.filter != "original") ||
            (beautyApplies() && settings.beautyActive) ||
            (mode == Mode.PORTRAIT && nativeExtension == null) ||
            mode == Mode.FOOD || settings.watermark

    private fun capture() {
        if (!hasSpace()) return
        withScreenFlash {
            if (needsProcessing()) captureProcessed() else captureDirect()
        }
    }

    /** Camera frontal sem flash: a tela vira a luz (branco quente, brilho maximo). */
    private fun withScreenFlash(action: () -> Unit) {
        if (!usesScreenFlash() || flashMode == ImageCapture.FLASH_MODE_OFF) {
            action()
            return
        }
        screenFlash.visibility = View.VISIBLE
        window.attributes = window.attributes.apply { screenBrightness = WindowManager.LayoutParams.BRIGHTNESS_OVERRIDE_FULL }
        main.postDelayed({ action() }, 650)
    }

    private fun endScreenFlash() {
        if (screenFlash.visibility != View.VISIBLE) return
        screenFlash.visibility = View.GONE
        window.attributes = window.attributes.apply { screenBrightness = WindowManager.LayoutParams.BRIGHTNESS_OVERRIDE_NONE }
    }

    private fun feedback() {
        if (settings.shutterSound) sound.play(MediaActionSound.SHUTTER_CLICK)
        if (settings.vibration) shutter.performHapticFeedback(HapticFeedbackConstants.VIRTUAL_KEY)
        flashOverlay.animate().cancel()
        flashOverlay.alpha = 0.85f
        flashOverlay.animate().alpha(0f).setDuration(300).start()
    }

    private fun setBusy(value: Boolean) {
        busy = value
        shutter.isEnabled = !value
        busySpinner.visibility = if (value) View.VISIBLE else View.GONE
    }

    /** Foto sem processamento: vai direto do sensor para a galeria, na resolucao total. */
    private fun captureDirect(onDone: (() -> Unit)? = null) {
        val capture = imageCapture ?: return
        val isVideoSnapshot = mode == Mode.VIDEO
        if (!isVideoSnapshot && !bursting) setBusy(true)

        val metadata = ImageCapture.Metadata().apply {
            isReversedHorizontal = settings.mirrorSelfies && lensFacing == CameraSelector.LENS_FACING_FRONT
            if (settings.location) this@MainActivity.location.last?.let { this.location = it }
        }
        val options = ImageCapture.OutputFileOptions.Builder(
            contentResolver,
            MediaStore.Images.Media.EXTERNAL_CONTENT_URI,
            MediaSaver.photoValues(MediaSaver.timestamp("IMG"), settings.photoTarget),
        ).setMetadata(metadata).build()

        feedback()
        capture.takePicture(
            options,
            ContextCompat.getMainExecutor(this),
            object : ImageCapture.OnImageSavedCallback {
                override fun onImageSaved(output: ImageCapture.OutputFileResults) {
                    endScreenFlash()
                    if (!isVideoSnapshot && !bursting) setBusy(false)
                    output.savedUri?.let {
                        lastMedia = it
                        loadThumbnail(it)
                    }
                    onDone?.invoke()
                }

                override fun onError(exception: ImageCaptureException) {
                    endScreenFlash()
                    if (!isVideoSnapshot) setBusy(false)
                    stopBurst()
                    Log.e(TAG, "Falha ao salvar a foto", exception)
                    showMessage(
                        when (exception.imageCaptureError) {
                            ImageCapture.ERROR_FILE_IO -> "Não foi possível salvar a foto (armazenamento)."
                            ImageCapture.ERROR_CAMERA_CLOSED -> "A câmera fechou antes da foto."
                            else -> "Não foi possível tirar a foto."
                        },
                    )
                }
            },
        )
    }

    private class Shot(val bytes: ByteArray, val rotation: Int, val crop: Rect)

    /** Foto em memoria para processar (filtros, retrato, beleza, noite, HDR, comida, marca d'agua). */
    private fun captureProcessed() {
        val capture = imageCapture ?: return
        val c = caps
        setBusy(true)
        val night = computationalNight()
        val hdr = computationalHdr() && c != null
        val evIndexes: List<Int?> = when {
            hdr && c != null -> {
                val span = (1.5f / c.evStep).roundToInt().coerceAtLeast(1)
                listOf(
                    (-span).coerceAtLeast(c.evRange.lower),
                    0,
                    span.coerceAtMost(c.evRange.upper),
                )
            }
            night -> listOf(null, null, null, null)
            else -> listOf(null)
        }
        val originalEv = camera?.cameraInfo?.exposureState?.exposureCompensationIndex ?: 0
        val shots = mutableListOf<Shot>()

        fun finish() {
            if (hdr) camera?.cameraControl?.setExposureCompensationIndex(originalEv)
            endScreenFlash()
            processShots(shots, night, hdr)
        }

        fun takeNext() {
            val i = shots.size
            if (i >= evIndexes.size) {
                finish()
                return
            }
            val take = {
                if (i == 0) feedback()
                capture.takePicture(
                    ContextCompat.getMainExecutor(this),
                    object : ImageCapture.OnImageCapturedCallback() {
                        override fun onCaptureSuccess(image: ImageProxy) {
                            try {
                                val buffer = image.planes[0].buffer
                                buffer.rewind()
                                val bytes = ByteArray(buffer.remaining())
                                buffer.get(bytes)
                                shots += Shot(bytes, image.imageInfo.rotationDegrees, Rect(image.cropRect))
                            } finally {
                                image.close()
                            }
                            takeNext()
                        }

                        override fun onError(exception: ImageCaptureException) {
                            Log.e(TAG, "Falha na captura", exception)
                            if (hdr) camera?.cameraControl?.setExposureCompensationIndex(originalEv)
                            endScreenFlash()
                            setBusy(false)
                            showMessage("Não foi possível tirar a foto.")
                        }
                    },
                )
            }
            val ev = evIndexes[i]
            if (ev != null) {
                // Espera a exposicao nova assentar antes de fotografar.
                camera?.cameraControl?.setExposureCompensationIndex(ev)?.addListener(
                    { main.postDelayed({ take() }, 350) },
                    ContextCompat.getMainExecutor(this),
                ) ?: take()
            } else {
                take()
            }
        }
        takeNext()
    }

    private fun processShots(shots: List<Shot>, night: Boolean, hdr: Boolean) {
        if (shots.isEmpty()) {
            setBusy(false)
            return
        }
        val mirror = settings.mirrorSelfies && lensFacing == CameraSelector.LENS_FACING_FRONT
        val portraitSoftware = mode == Mode.PORTRAIT && nativeExtension == null
        val beauty = if (beautyApplies()) FaceEffects.Beauty(
            settings.beautySmooth, settings.beautyBright, settings.beautyEyes,
            settings.beautyFace, settings.beautyTeeth, settings.beautyContour,
        ) else null
        val food = mode == Mode.FOOD
        // Na foto o "Aprimorar" e o completo (niveis, cor, nitidez); o visor so mostra uma previa.
        val enhance = enhanceApplies()
        val photoMatrix = ColorMatrix().apply {
            if (filterApplies()) postConcat(Filters.byId(settings.filter).matrix(settings.filterIntensity / 100f))
            if (food) postConcat(foodMatrix())
        }
        val watermark = watermarkLines()
        val quality = settings.jpegQuality
        val folder = settings.photoTarget
        val place = if (settings.location) location.last else null

        io.execute {
            var notice: String? = null
            val uri = try {
                val maxPixels = if (night || hdr) 8_500_000L else MediaSaver.MAX_PROCESSED_PIXELS
                val frames = shots.map { MediaSaver.decodeJpeg(it.bytes, it.rotation, it.crop, mirror, maxPixels) }
                val exif = MediaSaver.exifOf(shots[shots.size / 2].bytes)
                var bitmap = when {
                    night -> ImageEffects.nightMerge(frames)
                    hdr -> ImageEffects.hdrFuse(frames)
                    else -> frames.first()
                }
                if (portraitSoftware) {
                    val blurred = FaceEffects.portrait(bitmap, settings.portraitBlur)
                    // Sem pessoa na foto, ela sai sem desfoque (sem aviso).
                    if (blurred != null) bitmap = blurred
                }
                if (beauty != null && beauty.active) bitmap = FaceEffects.beauty(bitmap, beauty)
                if (food) {
                    val t = settings.foodIntensity / 100f
                    bitmap = ImageEffects.sharpen(bitmap, 0.5f * t)
                    bitmap = ImageEffects.radialFocus(bitmap, 0.5f, 0.5f, FOOD_RADIUS, min(bitmap.width, bitmap.height) * 0.03f * (0.3f + t))
                }
                if (enhance) bitmap = ImageEffects.autoEnhance(bitmap)
                bitmap = ImageEffects.applyMatrix(bitmap, photoMatrix)
                bitmap = ImageEffects.watermark(bitmap, watermark)
                MediaSaver.saveBitmap(this, bitmap, quality, folder, exif, place)
            } catch (error: OutOfMemoryError) {
                notice = "Memória insuficiente para processar esta foto. Tente uma resolução menor."
                null
            } catch (error: Exception) {
                Log.e(TAG, "Falha ao processar a foto", error)
                notice = "Não foi possível salvar a foto."
                null
            }
            main.post {
                setBusy(false)
                notice?.let { showMessage(it) }
                uri?.let {
                    lastMedia = it
                    loadThumbnail(it)
                }
            }
        }
    }

    private fun watermarkLines(): List<String> {
        if (!settings.watermark) return emptyList()
        val lines = mutableListOf<String>()
        settings.watermarkText.takeIf { it.isNotBlank() }?.let { lines += it }
        val now = java.util.Date()
        val date = if (settings.watermarkDate) java.text.SimpleDateFormat("dd/MM/yyyy", Locale("pt", "BR")).format(now) else null
        val time = if (settings.watermarkTime) java.text.SimpleDateFormat("HH:mm", Locale("pt", "BR")).format(now) else null
        listOfNotNull(date, time).takeIf { it.isNotEmpty() }?.let { lines += it.joinToString("  ") }
        if (settings.watermarkModel) lines += "${Build.MANUFACTURER.replaceFirstChar { it.uppercase() }} ${Build.MODEL}"
        return lines
    }

    // --- Fotos continuas ----------------------------------------------------------------------

    private fun canBurst() = settings.burstOnHold && mode in listOf(Mode.PHOTO, Mode.PRO) &&
        !busy && imageCapture != null && timerSeconds == 0 && !computationalHdr()

    private fun startBurst() {
        if (!hasSpace()) return
        bursting = true
        burstCount = 0
        shutterLabel.visibility = View.VISIBLE
        burstNext()
    }

    private fun burstNext() {
        if (!bursting || burstCount >= 60) {
            stopBurst()
            return
        }
        burstCount++
        shutterLabel.text = burstCount.toString()
        captureDirect { burstNext() }
    }

    private fun stopBurst() {
        if (!bursting) return
        bursting = false
        shutterLabel.visibility = View.GONE
    }

    // --- Video ---------------------------------------------------------------------------------

    @SuppressLint("MissingPermission")
    private fun toggleRecording() {
        recording?.let {
            it.stop()
            return
        }
        val capture = videoCapture ?: return
        if (!hasSpace()) return

        val output = MediaStoreOutputOptions.Builder(contentResolver, MediaStore.Video.Media.EXTERNAL_CONTENT_URI)
            .setContentValues(MediaSaver.videoValues(MediaSaver.timestamp("VID"), settings.videoTarget))
            .apply { if (settings.location) this@MainActivity.location.last?.let { setLocation(it) } }
            .build()

        var pending = capture.output.prepareRecording(this, output)
        if (settings.microphone && hasAudioPermission()) pending = pending.withAudioEnabled()
        // Persistente: continua gravando se a camera for trocada no meio.
        pending = pending.asPersistentRecording()

        if (settings.vibration) shutter.performHapticFeedback(HapticFeedbackConstants.VIRTUAL_KEY)
        recording = pending.start(ContextCompat.getMainExecutor(this)) { event ->
            when (event) {
                is VideoRecordEvent.Start -> setRecordingUi(true)
                is VideoRecordEvent.Pause -> {
                    recordingPaused = true
                    pauseButton.setImageResource(R.drawable.ic_play)
                    recDot.alpha = 0.3f
                }
                is VideoRecordEvent.Resume -> {
                    recordingPaused = false
                    pauseButton.setImageResource(R.drawable.ic_pause)
                    recDot.alpha = 1f
                }
                is VideoRecordEvent.Status -> {
                    val seconds = TimeUnit.NANOSECONDS.toSeconds(event.recordingStats.recordedDurationNanos)
                    recTime.text = String.format(Locale.US, "%02d:%02d", seconds / 60, seconds % 60)
                }
                is VideoRecordEvent.Finalize -> {
                    recording = null
                    recordingPaused = false
                    setRecordingUi(false)
                    if (event.hasError()) {
                        val message = when (event.error) {
                            VideoRecordEvent.Finalize.ERROR_INSUFFICIENT_STORAGE -> "Armazenamento cheio: o vídeo foi salvo até onde deu."
                            VideoRecordEvent.Finalize.ERROR_NO_VALID_DATA -> "O vídeo ficou curto demais e não foi salvo."
                            VideoRecordEvent.Finalize.ERROR_SOURCE_INACTIVE -> null
                            VideoRecordEvent.Finalize.ERROR_ENCODING_FAILED -> "Falha na codificação do vídeo."
                            else -> "Erro durante a gravação."
                        }
                        message?.let { showMessage(it) }
                    }
                    val uri = event.outputResults.outputUri
                    if (uri != Uri.EMPTY) {
                        lastMedia = uri
                        loadThumbnail(uri)
                    }
                    // Solta o VideoCapture persistente para a proxima gravacao.
                    if (mode == Mode.VIDEO) bindCamera()
                }
            }
        }
    }

    private fun setRecordingUi(active: Boolean) {
        shutter.setBackgroundResource(if (active) R.drawable.shutter_stop else R.drawable.shutter_video)
        recTime.text = "00:00"
        recDot.alpha = 1f
        recBox.visibility = if (active) View.VISIBLE else View.GONE
        pauseButton.setImageResource(R.drawable.ic_pause)
        pauseButton.visibility = if (active) View.VISIBLE else View.GONE
        snapshotButton.visibility = if (active && imageCapture != null) View.VISIBLE else View.GONE
        val hide = if (active) View.INVISIBLE else View.VISIBLE
        listOf(settingsButton, micButton, fpsButton, resolutionButton, modeBar, thumbnail).forEach { it.visibility = hide }
        if (!active) renderModes()
    }

    // --- Panorama ---------------------------------------------------------------------------------

    private fun renderPanoramaIdle() {
        panoramaText.text = "Toque no botão e gire o celular devagar para um lado (ou para cima)."
        panoramaProgress.progress = 0
        shutter.setBackgroundResource(if (mode == Mode.VIDEO) R.drawable.shutter_video else R.drawable.shutter)
    }

    private fun togglePanorama() {
        val session = panorama
        if (session != null && session.running) {
            finishPanorama()
            return
        }
        if (busy || analysis == null) return
        if (!hasSpace()) return
        val c = caps ?: return
        val newSession = PanoramaSession(this, c.fovShortSide, c.fovLongSide, object : PanoramaSession.Listener {
            override fun requestFrame() {
                analyzer.panoramaRequest = true
            }

            override fun onGuide(progress: Float, tooFast: Boolean, drift: Float, vertical: Boolean?) {
                panoramaProgress.progress = (progress * 1000).toInt()
                panoramaText.text = when {
                    vertical == null -> "Gire devagar para um lado (ou para cima)…"
                    tooFast -> "Mais devagar!"
                    abs(drift) > 6f -> if (vertical) {
                        if (drift > 0) "← Mantenha na linha" else "Mantenha na linha →"
                    } else {
                        if (drift > 0) "↓ Abaixe um pouco" else "↑ Suba um pouco"
                    }
                    else -> "${panorama?.frameCount ?: 0} quadros · continue girando"
                }
                panoramaText.setTextColor(if (tooFast) 0xFFFF6B6B.toInt() else WHITE)
            }

            override fun onAutoFinish() {
                finishPanorama()
            }
        })
        if (!newSession.available) {
            toast("Este aparelho não tem giroscópio para o panorama.")
            return
        }
        panorama = newSession
        shutter.setBackgroundResource(R.drawable.shutter_stop)
        feedback()
        newSession.start()
    }

    private fun finishPanorama() {
        val session = panorama ?: return
        session.stop()
        shutter.setBackgroundResource(R.drawable.shutter)
        if (session.frameCount < 2) {
            session.release()
            panorama = null
            renderPanoramaIdle()
            toast("Gire mais o celular para montar o panorama.")
            return
        }
        setBusy(true)
        panoramaText.text = "Montando o panorama…"
        val quality = settings.jpegQuality
        val folder = settings.photoTarget
        val place = if (settings.location) location.last else null
        io.execute {
            val uri = try {
                session.stitch()?.let { MediaSaver.saveBitmap(this, it, quality, folder, null, place, "PANO") }
            } catch (error: Throwable) {
                Log.e(TAG, "Falha no panorama", error)
                null
            }
            main.post {
                session.release()
                panorama = null
                setBusy(false)
                renderPanoramaIdle()
                if (uri == null) {
                    showMessage("Não foi possível montar o panorama. Gire mais devagar e em linha reta.")
                } else {
                    lastMedia = uri
                    loadThumbnail(uri)
                }
            }
        }
    }

    // --- Documentos -----------------------------------------------------------------------------

    private fun startDocumentScan() {
        val options = GmsDocumentScannerOptions.Builder()
            .setGalleryImportAllowed(false)
            .setScannerMode(GmsDocumentScannerOptions.SCANNER_MODE_FULL)
            .setResultFormats(GmsDocumentScannerOptions.RESULT_FORMAT_JPEG, GmsDocumentScannerOptions.RESULT_FORMAT_PDF)
            .build()
        GmsDocumentScanning.getClient(options).getStartScanIntent(this)
            .addOnSuccessListener { sender -> scanLauncher.launch(IntentSenderRequest.Builder(sender).build()) }
            .addOnFailureListener {
                showMessage("O scanner de documentos precisa do Google Play Services atualizado.")
            }
    }

    private fun saveScan(data: Intent?) {
        val result = GmsDocumentScanningResult.fromActivityResultIntent(data) ?: return
        val folder = settings.photoTarget
        io.execute {
            var saved = 0
            var last: Uri? = null
            try {
                result.pages?.forEach { page ->
                    val values = MediaSaver.photoValues(MediaSaver.timestamp("DOC"), "Documentos")
                    val uri = contentResolver.insert(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, values) ?: return@forEach
                    contentResolver.openInputStream(page.imageUri)?.use { input ->
                        contentResolver.openOutputStream(uri)?.use { input.copyTo(it) }
                    }
                    saved++
                    last = uri
                }
                result.pdf?.let { pdf ->
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                        val values = ContentValues().apply {
                            put(MediaStore.MediaColumns.DISPLAY_NAME, MediaSaver.timestamp("DOC") + ".pdf")
                            put(MediaStore.MediaColumns.MIME_TYPE, "application/pdf")
                            put(MediaStore.MediaColumns.RELATIVE_PATH, "Documents/Foto/")
                        }
                        contentResolver.insert(MediaStore.Files.getContentUri("external"), values)?.let { uri ->
                            contentResolver.openInputStream(pdf.uri)?.use { input ->
                                contentResolver.openOutputStream(uri)?.use { input.copyTo(it) }
                            }
                        }
                    }
                }
            } catch (error: Exception) {
                Log.e(TAG, "Falha ao salvar o documento", error)
            }
            main.post {
                if (saved > 0) {
                    last?.let {
                        lastMedia = it
                        loadThumbnail(it)
                    }
                } else {
                    showMessage("Não foi possível salvar o documento.")
                }
            }
        }
    }

    // --- Ultima foto -----------------------------------------------------------------------------

    private fun loadLastPhoto() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) return
        val folder = settings.photoTarget
        io.execute {
            val uri = try {
                contentResolver.query(
                    MediaStore.Images.Media.EXTERNAL_CONTENT_URI,
                    arrayOf(MediaStore.Images.Media._ID),
                    "${MediaStore.MediaColumns.RELATIVE_PATH} LIKE ?",
                    arrayOf("${MediaSaver.photoPath(folder)}%"),
                    "${MediaStore.MediaColumns.DATE_ADDED} DESC",
                )?.use { cursor ->
                    if (cursor.moveToFirst()) ContentUris.withAppendedId(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, cursor.getLong(0)) else null
                }
            } catch (error: Exception) {
                null
            }
            if (uri != null) {
                main.post {
                    if (lastMedia == null) {
                        lastMedia = uri
                        loadThumbnail(uri)
                    }
                }
            }
        }
    }

    private fun loadThumbnail(uri: Uri) {
        io.execute {
            val bitmap: Bitmap? = try {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                    contentResolver.loadThumbnail(uri, Size(256, 256), null)
                } else {
                    contentResolver.openInputStream(uri)?.use {
                        BitmapFactory.decodeStream(it, null, BitmapFactory.Options().apply { inSampleSize = 16 })
                    }
                }
            } catch (error: Exception) {
                null
            }
            main.post { if (bitmap != null && uri == lastMedia) thumbnail.setImageBitmap(bitmap) }
        }
    }

    /**
     * Toque na miniatura: abre a foto direto na Galeria do celular. Sem foto
     * ainda, abre a Galeria nas imagens. So se nao houver app de galeria cai
     * no visualizador do proprio app.
     */
    private fun openLastMedia() {
        val uri = lastMedia
        val intent = if (uri != null) {
            Intent(Intent.ACTION_VIEW).apply {
                setDataAndType(uri, contentResolver.getType(uri) ?: "image/jpeg")
                addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            }
        } else {
            Intent(Intent.ACTION_VIEW).setDataAndType(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, "image/*")
        }
        try {
            viewerLauncher.launch(intent)
        } catch (error: Exception) {
            openInAppViewer()
        }
    }

    /** Toque longo na miniatura: visualizador do app, com editar e informacoes. */
    private fun openInAppViewer() {
        val uri = lastMedia ?: return
        viewerLauncher.launch(Intent(this, ViewerActivity::class.java).setData(uri))
    }

    private fun showMessage(text: String) {
        showInfo(text, 3500)
    }

    private fun toast(text: String) {
        Toast.makeText(this, text, Toast.LENGTH_SHORT).show()
    }

    companion object {
        private const val TAG = "Foto"
        private const val FOOD_RADIUS = 0.32f
        private val WHITE = 0xFFFFFFFF.toInt()
        private val ACCENT = 0xFFFFD60A.toInt()
    }
}
