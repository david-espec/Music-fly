package com.davidespec.foto

import android.Manifest
import android.annotation.SuppressLint
import android.content.ContentUris
import android.content.ContentValues
import android.content.Intent
import android.content.pm.PackageManager
import android.content.res.ColorStateList
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Typeface
import android.media.MediaActionSound
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.provider.MediaStore
import android.provider.Settings
import android.util.Log
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
import android.widget.Button
import android.widget.FrameLayout
import android.widget.ImageButton
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.TextView
import android.widget.Toast
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import androidx.camera.core.AspectRatio
import androidx.camera.core.Camera
import androidx.camera.core.CameraSelector
import androidx.camera.core.FocusMeteringAction
import androidx.camera.core.ImageCapture
import androidx.camera.core.ImageCaptureException
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
import androidx.constraintlayout.widget.ConstraintLayout
import androidx.core.content.ContextCompat
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.doOnNextLayout
import androidx.core.view.updatePadding
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import kotlin.math.abs

class MainActivity : AppCompatActivity() {

    /** Modos da barra de baixo. Os que tem [extension] usam o processamento do fabricante. */
    private enum class Mode(val label: String, val extension: Int?) {
        PORTRAIT("RETRATO", ExtensionMode.BOKEH),
        PHOTO("FOTO", null),
        VIDEO("VÍDEO", null),
        NIGHT("NOITE", ExtensionMode.NIGHT),
        HDR("HDR", ExtensionMode.HDR),
        RETOUCH("RETOQUE", ExtensionMode.FACE_RETOUCH),
    }

    /** Formatos da foto. [source] e o formato do sensor de onde a foto e recortada. */
    private enum class Aspect(val label: String, val ratio: String?, val source: Int) {
        R3_4("3:4", "H,3:4", AspectRatio.RATIO_4_3),
        R9_16("9:16", "H,9:16", AspectRatio.RATIO_16_9),
        R1_1("1:1", "H,1:1", AspectRatio.RATIO_4_3),
        FULL("Full", null, AspectRatio.RATIO_16_9),
    }

    private lateinit var root: ConstraintLayout
    private lateinit var previewBox: FrameLayout
    private lateinit var preview: PreviewView
    private lateinit var grid: GridOverlay
    private lateinit var flashOverlay: View
    private lateinit var focusRing: View
    private lateinit var countdown: TextView
    private lateinit var topBar: View
    private lateinit var settingsButton: ImageButton
    private lateinit var flashButton: ImageButton
    private lateinit var timerButton: ImageButton
    private lateinit var aspectButton: TextView
    private lateinit var resolutionButton: TextView
    private lateinit var gridButton: ImageButton
    private lateinit var recBox: View
    private lateinit var recTime: TextView
    private lateinit var zoomBar: LinearLayout
    private lateinit var modeBar: View
    private lateinit var modeViews: Map<Mode, TextView>
    private lateinit var modeMore: TextView
    private lateinit var thumbnail: ImageView
    private lateinit var shutter: ImageButton
    private lateinit var switchButton: ImageButton
    private lateinit var permissionPanel: LinearLayout

    private var cameraProvider: ProcessCameraProvider? = null
    private var extensions: ExtensionsManager? = null
    private var camera: Camera? = null
    private var imageCapture: ImageCapture? = null
    private var videoCapture: VideoCapture<Recorder>? = null
    private var recording: Recording? = null

    private var mode = Mode.PHOTO
    private var aspect = Aspect.R3_4
    private var lensFacing = CameraSelector.LENS_FACING_BACK
    private var flashMode = ImageCapture.FLASH_MODE_OFF
    private var timerSeconds = 0
    private var highRes = true
    private var uhdVideo = false
    private var shutterSound = true
    private var mirrorSelfies = true
    private var volumeShutter = true

    private var busy = false
    private var lastMedia: Uri? = null
    private var zoomPresets = listOf(1f, 2f)

    private val main = Handler(Looper.getMainLooper())
    private var countdownTask: Runnable? = null
    private lateinit var io: ExecutorService
    private val sound = MediaActionSound()
    private val prefs by lazy { getSharedPreferences("foto", MODE_PRIVATE) }

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

    // O microfone so e pedido ao entrar no modo de video; sem ele o video sai mudo.
    private val audioLauncher =
        registerForActivityResult(ActivityResultContracts.RequestPermission()) { }

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
                    settingsButton, flashButton, timerButton, aspectButton, resolutionButton,
                    gridButton, thumbnail, switchButton,
                ).forEach { if (it.rotation != degrees) it.animate().rotation(degrees).setDuration(200).start() }
            }
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        WindowCompat.setDecorFitsSystemWindows(window, false)
        setContentView(R.layout.activity_main)

        root = findViewById(R.id.root)
        previewBox = findViewById(R.id.previewBox)
        preview = findViewById(R.id.preview)
        grid = findViewById(R.id.grid)
        flashOverlay = findViewById(R.id.flashOverlay)
        focusRing = findViewById(R.id.focusRing)
        countdown = findViewById(R.id.countdown)
        topBar = findViewById(R.id.topBar)
        settingsButton = findViewById(R.id.settingsButton)
        flashButton = findViewById(R.id.flashButton)
        timerButton = findViewById(R.id.timerButton)
        aspectButton = findViewById(R.id.aspectButton)
        resolutionButton = findViewById(R.id.resolutionButton)
        gridButton = findViewById(R.id.gridButton)
        recBox = findViewById(R.id.recBox)
        recTime = findViewById(R.id.recTime)
        zoomBar = findViewById(R.id.zoomBar)
        modeBar = findViewById(R.id.modeBar)
        modeMore = findViewById(R.id.modeMore)
        modeViews = mapOf(
            Mode.PORTRAIT to findViewById(R.id.modePortrait),
            Mode.PHOTO to findViewById(R.id.modePhoto),
            Mode.VIDEO to findViewById(R.id.modeVideo),
        )
        thumbnail = findViewById(R.id.thumbnail)
        shutter = findViewById(R.id.shutter)
        switchButton = findViewById(R.id.switchButton)
        permissionPanel = findViewById(R.id.permissionPanel)

        io = Executors.newSingleThreadExecutor()
        thumbnail.clipToOutline = true
        sound.load(MediaActionSound.SHUTTER_CLICK)

        applyInsets()
        restorePrefs()
        setupControls()
        setupGestures()
        applyLayout()
        loadLastPhoto()

        if (hasCameraPermission()) startCamera() else permissionLauncher.launch(permissions)
    }

    override fun onStart() {
        super.onStart()
        orientationListener.enable()
    }

    override fun onStop() {
        super.onStop()
        orientationListener.disable()
        cancelCountdown()
        recording?.stop()
    }

    override fun onResume() {
        super.onResume()
        // Volta das configuracoes do sistema com a permissao concedida.
        if (permissionPanel.visibility == View.VISIBLE && hasCameraPermission()) {
            permissionPanel.visibility = View.GONE
            startCamera()
        }
    }

    override fun onDestroy() {
        super.onDestroy()
        io.shutdown()
        sound.release()
    }

    // Botoes de volume tambem disparam, como nas cameras de fabrica.
    override fun onKeyDown(keyCode: Int, event: KeyEvent): Boolean {
        val volume = keyCode == KeyEvent.KEYCODE_VOLUME_UP || keyCode == KeyEvent.KEYCODE_VOLUME_DOWN
        if ((volume && volumeShutter) || keyCode == KeyEvent.KEYCODE_CAMERA) {
            if (event.repeatCount == 0) onShutter()
            return true
        }
        return super.onKeyDown(keyCode, event)
    }

    private fun hasCameraPermission() =
        ContextCompat.checkSelfPermission(this, Manifest.permission.CAMERA) ==
            PackageManager.PERMISSION_GRANTED

    private fun hasAudioPermission() =
        ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO) ==
            PackageManager.PERMISSION_GRANTED

    private fun dp(value: Int) = (value * resources.displayMetrics.density).toInt()

    private fun applyInsets() {
        val bottomPanel = findViewById<View>(R.id.bottomPanel)
        ViewCompat.setOnApplyWindowInsetsListener(root) { _, insets ->
            val bars = insets.getInsets(
                WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout(),
            )
            topBar.updatePadding(top = bars.top + dp(12))
            bottomPanel.updatePadding(bottom = bars.bottom + dp(36))
            insets
        }
    }

    // --- Preferencias ---------------------------------------------------------

    private fun restorePrefs() {
        lensFacing = prefs.getInt("lens", CameraSelector.LENS_FACING_BACK)
        flashMode = prefs.getInt("flash", ImageCapture.FLASH_MODE_OFF)
        timerSeconds = prefs.getInt("timer", 0)
        aspect = Aspect.entries.firstOrNull { it.name == prefs.getString("aspect", null) } ?: Aspect.R3_4
        highRes = prefs.getBoolean("highRes", true)
        uhdVideo = prefs.getBoolean("uhd", false)
        shutterSound = prefs.getBoolean("sound", true)
        mirrorSelfies = prefs.getBoolean("mirror", true)
        volumeShutter = prefs.getBoolean("volumeShutter", true)
        grid.visibility = if (prefs.getBoolean("grid", false)) View.VISIBLE else View.GONE
        renderFlash()
        renderTimer()
        renderGrid()
        renderModes()
    }

    private fun savePrefs() {
        prefs.edit()
            .putInt("lens", lensFacing)
            .putInt("flash", flashMode)
            .putInt("timer", timerSeconds)
            .putString("aspect", aspect.name)
            .putBoolean("highRes", highRes)
            .putBoolean("uhd", uhdVideo)
            .putBoolean("sound", shutterSound)
            .putBoolean("mirror", mirrorSelfies)
            .putBoolean("volumeShutter", volumeShutter)
            .putBoolean("grid", grid.visibility == View.VISIBLE)
            .apply()
    }

    // --- Controles ------------------------------------------------------------

    private fun setupControls() {
        shutter.setOnClickListener { onShutter() }

        switchButton.setOnClickListener {
            lensFacing = if (lensFacing == CameraSelector.LENS_FACING_BACK) {
                CameraSelector.LENS_FACING_FRONT
            } else {
                CameraSelector.LENS_FACING_BACK
            }
            savePrefs()
            switchButton.animate().rotationBy(180f).setDuration(250).start()
            bindCamera()
        }

        flashButton.setOnClickListener {
            flashMode = if (mode == Mode.VIDEO) {
                // No video o flash vira lanterna: liga ou desliga.
                if (flashMode == ImageCapture.FLASH_MODE_OFF) ImageCapture.FLASH_MODE_ON else ImageCapture.FLASH_MODE_OFF
            } else {
                when (flashMode) {
                    ImageCapture.FLASH_MODE_OFF -> ImageCapture.FLASH_MODE_AUTO
                    ImageCapture.FLASH_MODE_AUTO -> ImageCapture.FLASH_MODE_ON
                    else -> ImageCapture.FLASH_MODE_OFF
                }
            }
            imageCapture?.flashMode = flashMode
            if (mode == Mode.VIDEO) camera?.cameraControl?.enableTorch(flashMode == ImageCapture.FLASH_MODE_ON)
            savePrefs()
            renderFlash()
            toast(
                when (flashMode) {
                    ImageCapture.FLASH_MODE_AUTO -> "Flash automático"
                    ImageCapture.FLASH_MODE_ON -> if (mode == Mode.VIDEO) "Lanterna ligada" else "Flash ligado"
                    else -> "Flash desligado"
                },
            )
        }

        timerButton.setOnClickListener {
            timerSeconds = when (timerSeconds) {
                0 -> 3
                3 -> 10
                else -> 0
            }
            savePrefs()
            renderTimer()
            toast(if (timerSeconds == 0) "Temporizador desligado" else "Temporizador: $timerSeconds s")
        }

        aspectButton.setOnClickListener {
            aspect = Aspect.entries[(aspect.ordinal + 1) % Aspect.entries.size]
            savePrefs()
            applyLayout()
        }

        resolutionButton.setOnClickListener {
            if (mode == Mode.VIDEO) {
                uhdVideo = !uhdVideo
                toast(if (uhdVideo) "Vídeo em 4K (UHD)" else "Vídeo em Full HD")
            } else {
                highRes = !highRes
                toast(if (highRes) "Resolução máxima" else "Resolução padrão (12 MP)")
            }
            savePrefs()
            bindCamera()
        }

        gridButton.setOnClickListener {
            grid.visibility = if (grid.visibility == View.VISIBLE) View.GONE else View.VISIBLE
            savePrefs()
            renderGrid()
        }

        settingsButton.setOnClickListener { showSettings() }

        modeViews.forEach { (target, view) -> view.setOnClickListener { setMode(target) } }
        modeMore.setOnClickListener { showMoreModes() }

        thumbnail.setOnClickListener { openLastMedia() }

        findViewById<Button>(R.id.permissionButton).setOnClickListener {
            if (shouldShowRequestPermissionRationale(Manifest.permission.CAMERA) ||
                !prefs.getBoolean("askedPermission", false)
            ) {
                prefs.edit().putBoolean("askedPermission", true).apply()
                permissionLauncher.launch(permissions)
            } else {
                // Negada de vez: so pelas configuracoes do sistema.
                startActivity(
                    Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.fromParts("package", packageName, null)),
                )
            }
        }
    }

    private fun tint(view: ImageView, active: Boolean) {
        view.imageTintList = ColorStateList.valueOf(if (active) ACCENT else WHITE)
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

    private fun renderTimer() {
        tint(timerButton, timerSeconds > 0)
        timerButton.contentDescription =
            if (timerSeconds == 0) "Temporizador desligado" else "Temporizador de $timerSeconds segundos"
    }

    private fun renderGrid() {
        tint(gridButton, grid.visibility == View.VISIBLE)
    }

    private fun renderModes() {
        modeViews.forEach { (target, view) -> styleMode(view, target == mode) }
        val extra = mode == Mode.NIGHT || mode == Mode.HDR || mode == Mode.RETOUCH
        modeMore.text = if (extra) mode.label else "MAIS"
        styleMode(modeMore, extra)
        shutter.setBackgroundResource(if (mode == Mode.VIDEO) R.drawable.shutter_video else R.drawable.shutter)
        aspectButton.visibility = if (mode == Mode.VIDEO) View.INVISIBLE else View.VISIBLE
        timerButton.visibility = if (mode == Mode.VIDEO) View.INVISIBLE else View.VISIBLE
    }

    private fun styleMode(view: TextView, selected: Boolean) {
        view.setTextColor(if (selected) WHITE else 0xD9FFFFFF.toInt())
        view.setTextSize(TypedValue.COMPLEX_UNIT_SP, if (selected) 16f else 14f)
        view.typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
    }

    private fun setMode(target: Mode) {
        if (target == mode || recording != null) return
        cancelCountdown()
        if (target == Mode.VIDEO && !hasAudioPermission()) {
            audioLauncher.launch(Manifest.permission.RECORD_AUDIO)
        }
        if (mode == Mode.VIDEO) camera?.cameraControl?.enableTorch(false)
        mode = target
        if (mode == Mode.VIDEO && flashMode == ImageCapture.FLASH_MODE_AUTO) flashMode = ImageCapture.FLASH_MODE_OFF
        renderFlash()
        renderModes()
        applyLayout()
    }

    private fun showMoreModes() {
        if (recording != null) return
        val manager = extensions
        val base = baseSelector()
        val extras = listOf(Mode.NIGHT, Mode.HDR, Mode.RETOUCH)
        val names = arrayOf("Noite", "HDR", "Auto-retoque (rosto)")
        val available = extras.map { m ->
            manager != null && base != null && m.extension != null && manager.isExtensionAvailable(base, m.extension)
        }
        val labels = names.mapIndexed { i, name -> if (available[i]) name else "$name (indisponível neste celular)" }
        AlertDialog.Builder(this)
            .setTitle("Mais modos")
            .setItems(labels.toTypedArray()) { _, which ->
                if (available[which]) setMode(extras[which]) else toast("${names[which]} não é oferecido por esta câmera.")
            }
            .setNegativeButton("Fechar", null)
            .show()
    }

    private fun showSettings() {
        val labels = arrayOf(
            "Som do obturador",
            "Salvar selfies como aparecem na tela",
            "Botões de volume tiram foto",
        )
        val checked = booleanArrayOf(shutterSound, mirrorSelfies, volumeShutter)
        AlertDialog.Builder(this)
            .setTitle("Configurações")
            .setMultiChoiceItems(labels, checked) { _, which, isChecked ->
                when (which) {
                    0 -> shutterSound = isChecked
                    1 -> mirrorSelfies = isChecked
                    2 -> volumeShutter = isChecked
                }
                savePrefs()
            }
            .setPositiveButton("OK", null)
            .show()
    }

    // --- Formato do visor ------------------------------------------------------

    /** Ajusta a area do visor ao formato e religa a camera quando o novo tamanho existir. */
    private fun applyLayout() {
        val params = previewBox.layoutParams as ConstraintLayout.LayoutParams
        val ratio = if (mode == Mode.VIDEO) "H,9:16" else aspect.ratio
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

    // --- Camera ----------------------------------------------------------------

    private fun startCamera() {
        val future = ProcessCameraProvider.getInstance(this)
        future.addListener({
            val provider = future.get()
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
        if (provider.hasCamera(wanted)) return wanted
        lensFacing = if (lensFacing == CameraSelector.LENS_FACING_BACK) {
            CameraSelector.LENS_FACING_FRONT
        } else {
            CameraSelector.LENS_FACING_BACK
        }
        return CameraSelector.Builder().requireLensFacing(lensFacing).build()
    }

    private fun bindCamera(retry: Boolean = true) {
        val provider = cameraProvider ?: return
        if (recording != null || permissionPanel.visibility == View.VISIBLE) return
        val base = baseSelector() ?: return

        switchButton.visibility =
            if (provider.hasCamera(CameraSelector.DEFAULT_BACK_CAMERA) &&
                provider.hasCamera(CameraSelector.DEFAULT_FRONT_CAMERA)
            ) View.VISIBLE else View.INVISIBLE

        var selector = base
        mode.extension?.let { ext ->
            val manager = extensions
            if (manager != null && manager.isExtensionAvailable(base, ext)) {
                selector = manager.getExtensionEnabledCameraSelector(base, ext)
            } else {
                toast("${mode.label.lowercase().replaceFirstChar { it.uppercase() }} não está disponível nesta câmera.")
                mode = Mode.PHOTO
                renderModes()
            }
        }

        val source = if (mode == Mode.VIDEO) AspectRatio.RATIO_16_9 else aspect.source
        val ratioStrategy = AspectRatioStrategy(source, AspectRatioStrategy.FALLBACK_RULE_AUTO)

        val previewUseCase = Preview.Builder()
            .setResolutionSelector(ResolutionSelector.Builder().setAspectRatioStrategy(ratioStrategy).build())
            .build()
            .also { it.setSurfaceProvider(preview.surfaceProvider) }

        val useCases = mutableListOf<UseCase>(previewUseCase)
        imageCapture = null
        videoCapture = null

        if (mode == Mode.VIDEO) {
            val quality = if (uhdVideo) Quality.UHD else Quality.FHD
            val recorder = Recorder.Builder()
                .setQualitySelector(QualitySelector.from(quality, FallbackStrategy.lowerQualityOrHigherThan(quality)))
                .build()
            videoCapture = VideoCapture.withOutput(recorder).also { useCases += it }
        } else {
            val resolution = ResolutionSelector.Builder().setAspectRatioStrategy(ratioStrategy)
            if (highRes && mode.extension == null) {
                // A maior resolucao do sensor, inclusive os modos de 50 MP, 108 MP...
                resolution
                    .setResolutionStrategy(ResolutionStrategy.HIGHEST_AVAILABLE_STRATEGY)
                    .setAllowedResolutionMode(ResolutionSelector.PREFER_HIGHER_RESOLUTION_OVER_CAPTURE_RATE)
            } else if (!highRes) {
                val target = if (source == AspectRatio.RATIO_4_3) Size(4000, 3000) else Size(4000, 2252)
                resolution.setResolutionStrategy(
                    ResolutionStrategy(target, ResolutionStrategy.FALLBACK_RULE_CLOSEST_LOWER_THEN_HIGHER),
                )
            } else {
                resolution.setResolutionStrategy(ResolutionStrategy.HIGHEST_AVAILABLE_STRATEGY)
            }
            imageCapture = ImageCapture.Builder()
                .setCaptureMode(ImageCapture.CAPTURE_MODE_MAXIMIZE_QUALITY)
                .setJpegQuality(100)
                .setFlashMode(flashMode)
                .setResolutionSelector(resolution.build())
                .build()
                .also { useCases += it }
        }

        try {
            provider.unbindAll()
            // O recorte da foto segue exatamente o que aparece no visor.
            val viewPort = if (mode != Mode.VIDEO) preview.viewPort else null
            val bound = if (viewPort != null) {
                val group = UseCaseGroup.Builder().setViewPort(viewPort)
                useCases.forEach { group.addUseCase(it) }
                provider.bindToLifecycle(this, selector, group.build())
            } else {
                provider.bindToLifecycle(this, selector, *useCases.toTypedArray())
            }
            camera = bound
            shutter.isEnabled = true

            flashButton.visibility = if (bound.cameraInfo.hasFlashUnit()) View.VISIBLE else View.INVISIBLE
            if (mode == Mode.VIDEO) bound.cameraControl.enableTorch(flashMode == ImageCapture.FLASH_MODE_ON)

            bound.cameraInfo.zoomState.removeObservers(this)
            bound.cameraInfo.zoomState.observe(this) { state ->
                buildZoomPresets(state.minZoomRatio, state.maxZoomRatio)
                renderZoom(state.zoomRatio)
            }
            bound.cameraInfo.cameraState.removeObservers(this)
            bound.cameraInfo.cameraState.observe(this) { showResolution() }
            showResolution()
        } catch (error: Exception) {
            Log.e(TAG, "Falha ao abrir a camera", error)
            if (retry && (highRes || mode.extension != null)) {
                // Combinacao que o aparelho nao aceita: tenta o modo mais simples.
                highRes = false
                if (mode.extension != null) {
                    mode = Mode.PHOTO
                    renderModes()
                }
                bindCamera(retry = false)
            } else {
                toast("Não foi possível abrir a câmera.")
            }
        }
    }

    private fun showResolution() {
        if (mode == Mode.VIDEO) {
            resolutionButton.text = if (uhdVideo) "UHD" else "FHD"
            return
        }
        val info = imageCapture?.resolutionInfo ?: return
        val crop = info.cropRect
        val mp = crop.width().toLong() * crop.height() / 1_000_000.0
        resolutionButton.text = if (mp >= 1) "${Math.round(mp)}M" else String.format(Locale.US, "%.1fM", mp)
    }

    // --- Zoom ----------------------------------------------------------------------

    private fun buildZoomPresets(min: Float, max: Float) {
        val presets = buildList {
            if (min < 0.95f) add(min)
            add(1f)
            if (max >= 2f) add(2f)
        }
        if (presets == zoomPresets && zoomBar.childCount == presets.size) return
        zoomPresets = presets
        zoomBar.removeAllViews()
        presets.forEach { value ->
            val chip = TextView(this).apply {
                layoutParams = LinearLayout.LayoutParams(dp(44), dp(44)).apply {
                    marginStart = dp(6)
                    marginEnd = dp(6)
                }
                gravity = Gravity.CENTER
                setTextColor(WHITE)
                typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
                setOnClickListener { camera?.cameraControl?.setZoomRatio(value) }
            }
            zoomBar.addView(chip)
        }
        zoomBar.visibility = if (presets.size > 1) View.VISIBLE else View.INVISIBLE
    }

    private fun formatZoom(value: Float): String {
        val rounded = Math.round(value * 10) / 10f
        return if (rounded % 1f == 0f) rounded.toInt().toString() else String.format(Locale.US, "%.1f", rounded)
    }

    /** O botao ativo mostra o zoom atual ("1×", "2.5×"); os outros, so o numero. */
    private fun renderZoom(current: Float) {
        val active = zoomPresets.indices.lastOrNull { zoomPresets[it] <= current + 0.05f } ?: 0
        for (i in 0 until zoomBar.childCount) {
            val chip = zoomBar.getChildAt(i) as TextView
            if (i == active) {
                chip.text = "${formatZoom(current)}×"
                chip.setBackgroundResource(R.drawable.zoom_chip)
                chip.setTextSize(TypedValue.COMPLEX_UNIT_SP, 13f)
            } else {
                chip.text = formatZoom(zoomPresets[i])
                chip.background = null
                chip.setTextSize(TypedValue.COMPLEX_UNIT_SP, 13f)
            }
        }
    }

    // --- Gestos: toque para focar, pinca para zoom, deslizar para trocar de modo ---

    @SuppressLint("ClickableViewAccessibility")
    private fun setupGestures() {
        var scaled = false
        val scaleDetector = ScaleGestureDetector(
            this,
            object : ScaleGestureDetector.SimpleOnScaleGestureListener() {
                override fun onScale(detector: ScaleGestureDetector): Boolean {
                    val cam = camera ?: return false
                    val current = cam.cameraInfo.zoomState.value?.zoomRatio ?: 1f
                    cam.cameraControl.setZoomRatio(current * detector.scaleFactor)
                    scaled = true
                    return true
                }
            },
        )
        val swipeModes = listOf(Mode.PORTRAIT, Mode.PHOTO, Mode.VIDEO)
        val gestures = GestureDetector(
            this,
            object : GestureDetector.SimpleOnGestureListener() {
                override fun onDown(e: MotionEvent) = true

                override fun onSingleTapUp(e: MotionEvent): Boolean {
                    if (!scaled) focusAt(e.x, e.y)
                    return true
                }

                override fun onFling(e1: MotionEvent?, e2: MotionEvent, velocityX: Float, velocityY: Float): Boolean {
                    if (scaled || e1 == null || e1.pointerCount > 1) return false
                    val dx = e2.x - e1.x
                    val dy = e2.y - e1.y
                    if (abs(dx) < dp(80) || abs(dx) < abs(dy) * 1.5f) return false
                    val index = swipeModes.indexOf(mode).takeIf { it >= 0 } ?: 1
                    // Deslizar para a esquerda avanca (FOTO -> VIDEO), como na Samsung.
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

    private fun focusAt(x: Float, y: Float) {
        val cam = camera ?: return
        val point = preview.meteringPointFactory.createPoint(x, y)
        val action = FocusMeteringAction.Builder(
            point,
            FocusMeteringAction.FLAG_AF or FocusMeteringAction.FLAG_AE or FocusMeteringAction.FLAG_AWB,
        ).setAutoCancelDuration(4, TimeUnit.SECONDS).build()
        cam.cameraControl.startFocusAndMetering(action)

        focusRing.animate().cancel()
        focusRing.translationX = previewBox.left + x - focusRing.width / 2f
        focusRing.translationY = previewBox.top + y - focusRing.height / 2f
        focusRing.alpha = 1f
        focusRing.scaleX = 1.4f
        focusRing.scaleY = 1.4f
        focusRing.animate().scaleX(1f).scaleY(1f).setDuration(200).withEndAction {
            focusRing.animate().alpha(0f).setStartDelay(900).setDuration(300).start()
        }.start()
    }

    // --- Disparo -----------------------------------------------------------------

    private fun onShutter() {
        if (mode == Mode.VIDEO) {
            toggleRecording()
            return
        }
        if (countdownTask != null) {
            // Segundo toque durante a contagem cancela.
            cancelCountdown()
            return
        }
        if (busy || imageCapture == null) return
        if (timerSeconds > 0) startCountdown(timerSeconds) else capture()
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

    private fun timestamp(prefix: String) =
        SimpleDateFormat("'${prefix}_'yyyyMMdd_HHmmss", Locale.US).format(Date())

    private fun capture() {
        val capture = imageCapture ?: return
        busy = true
        shutter.isEnabled = false

        val values = ContentValues().apply {
            put(MediaStore.MediaColumns.DISPLAY_NAME, timestamp("IMG"))
            put(MediaStore.MediaColumns.MIME_TYPE, "image/jpeg")
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                put(MediaStore.MediaColumns.RELATIVE_PATH, PHOTO_PATH)
            }
        }
        val metadata = ImageCapture.Metadata().apply {
            isReversedHorizontal = mirrorSelfies && lensFacing == CameraSelector.LENS_FACING_FRONT
        }
        val options = ImageCapture.OutputFileOptions.Builder(
            contentResolver,
            MediaStore.Images.Media.EXTERNAL_CONTENT_URI,
            values,
        ).setMetadata(metadata).build()

        if (shutterSound) sound.play(MediaActionSound.SHUTTER_CLICK)
        shutter.performHapticFeedback(HapticFeedbackConstants.VIRTUAL_KEY)
        flashOverlay.animate().cancel()
        flashOverlay.alpha = 0.85f
        flashOverlay.animate().alpha(0f).setDuration(300).start()

        capture.takePicture(
            options,
            ContextCompat.getMainExecutor(this),
            object : ImageCapture.OnImageSavedCallback {
                override fun onImageSaved(output: ImageCapture.OutputFileResults) {
                    busy = false
                    shutter.isEnabled = true
                    output.savedUri?.let {
                        lastMedia = it
                        loadThumbnail(it)
                    }
                }

                override fun onError(exception: ImageCaptureException) {
                    busy = false
                    shutter.isEnabled = true
                    Log.e(TAG, "Falha ao salvar a foto", exception)
                    toast("Não foi possível salvar a foto.")
                }
            },
        )
    }

    // --- Video -------------------------------------------------------------------

    @SuppressLint("MissingPermission")
    private fun toggleRecording() {
        recording?.let {
            it.stop()
            return
        }
        val capture = videoCapture ?: return

        val values = ContentValues().apply {
            put(MediaStore.MediaColumns.DISPLAY_NAME, timestamp("VID"))
            put(MediaStore.MediaColumns.MIME_TYPE, "video/mp4")
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                put(MediaStore.MediaColumns.RELATIVE_PATH, VIDEO_PATH)
            }
        }
        val output = MediaStoreOutputOptions.Builder(contentResolver, MediaStore.Video.Media.EXTERNAL_CONTENT_URI)
            .setContentValues(values)
            .build()

        var pending = capture.output.prepareRecording(this, output)
        if (hasAudioPermission()) pending = pending.withAudioEnabled()

        shutter.performHapticFeedback(HapticFeedbackConstants.VIRTUAL_KEY)
        recording = pending.start(ContextCompat.getMainExecutor(this)) { event ->
            when (event) {
                is VideoRecordEvent.Start -> setRecordingUi(true)
                is VideoRecordEvent.Status -> {
                    val seconds = TimeUnit.NANOSECONDS.toSeconds(event.recordingStats.recordedDurationNanos)
                    recTime.text = String.format(Locale.US, "%02d:%02d", seconds / 60, seconds % 60)
                }
                is VideoRecordEvent.Finalize -> {
                    recording = null
                    setRecordingUi(false)
                    if (event.hasError() && event.error != VideoRecordEvent.Finalize.ERROR_SOURCE_INACTIVE) {
                        Log.e(TAG, "Falha no video: ${event.error}", event.cause)
                        toast("Não foi possível salvar o vídeo.")
                    }
                    val uri = event.outputResults.outputUri
                    if (uri != Uri.EMPTY) {
                        lastMedia = uri
                        loadThumbnail(uri)
                    }
                }
            }
        }
    }

    private fun setRecordingUi(active: Boolean) {
        shutter.setBackgroundResource(if (active) R.drawable.shutter_stop else R.drawable.shutter_video)
        recTime.text = "00:00"
        recBox.visibility = if (active) View.VISIBLE else View.GONE
        val hide = if (active) View.INVISIBLE else View.VISIBLE
        listOf(settingsButton, aspectButton, resolutionButton, gridButton, modeBar, switchButton, thumbnail)
            .forEach { it.visibility = hide }
        // O temporizador e o formato continuam ocultos no modo video.
        if (!active) renderModes()
    }

    // --- Ultima foto -----------------------------------------------------------------

    private fun loadLastPhoto() {
        // Antes do Android 10 a busca exigiria permissao de leitura da galeria.
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) return
        io.execute {
            val uri = try {
                contentResolver.query(
                    MediaStore.Images.Media.EXTERNAL_CONTENT_URI,
                    arrayOf(MediaStore.Images.Media._ID),
                    "${MediaStore.MediaColumns.RELATIVE_PATH} LIKE ?",
                    arrayOf("$PHOTO_PATH%"),
                    "${MediaStore.MediaColumns.DATE_ADDED} DESC",
                )?.use { cursor ->
                    if (cursor.moveToFirst()) {
                        ContentUris.withAppendedId(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, cursor.getLong(0))
                    } else {
                        null
                    }
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

    private fun openLastMedia() {
        val uri = lastMedia ?: run {
            toast("Nenhuma foto ainda.")
            return
        }
        val intent = Intent(Intent.ACTION_VIEW).apply {
            setDataAndType(uri, contentResolver.getType(uri) ?: "image/jpeg")
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        }
        try {
            startActivity(intent)
        } catch (error: Exception) {
            toast("Nenhum app de galeria encontrado.")
        }
    }

    private fun toast(text: String) {
        Toast.makeText(this, text, Toast.LENGTH_SHORT).show()
    }

    companion object {
        private const val TAG = "Foto"
        private const val PHOTO_PATH = "Pictures/Foto/"
        private const val VIDEO_PATH = "Movies/Foto/"
        private val WHITE = 0xFFFFFFFF.toInt()
        private val ACCENT = 0xFFFFD60A.toInt()
    }
}
