package com.davidespec.foto

import android.Manifest
import android.annotation.SuppressLint
import android.content.ContentUris
import android.content.ContentValues
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.graphics.BitmapFactory
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
import android.view.HapticFeedbackConstants
import android.view.KeyEvent
import android.view.MotionEvent
import android.view.OrientationEventListener
import android.view.ScaleGestureDetector
import android.view.Surface
import android.view.View
import android.widget.Button
import android.widget.ImageButton
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.TextView
import android.widget.Toast
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.camera.core.Camera
import androidx.camera.core.CameraSelector
import androidx.camera.core.FocusMeteringAction
import androidx.camera.core.ImageCapture
import androidx.camera.core.ImageCaptureException
import androidx.camera.core.Preview
import androidx.camera.core.resolutionselector.AspectRatioStrategy
import androidx.camera.core.resolutionselector.ResolutionSelector
import androidx.camera.core.resolutionselector.ResolutionStrategy
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.view.PreviewView
import androidx.core.content.ContextCompat
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.updatePadding
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit

class MainActivity : AppCompatActivity() {

    private lateinit var preview: PreviewView
    private lateinit var grid: GridOverlay
    private lateinit var flashOverlay: View
    private lateinit var focusRing: View
    private lateinit var countdown: TextView
    private lateinit var zoomLabel: TextView
    private lateinit var resolution: TextView
    private lateinit var flashButton: ImageButton
    private lateinit var timerButton: ImageButton
    private lateinit var timerLabel: TextView
    private lateinit var gridButton: ImageButton
    private lateinit var thumbnail: ImageView
    private lateinit var shutter: ImageButton
    private lateinit var switchButton: ImageButton
    private lateinit var permissionPanel: LinearLayout

    private var cameraProvider: ProcessCameraProvider? = null
    private var camera: Camera? = null
    private var imageCapture: ImageCapture? = null

    private var lensFacing = CameraSelector.LENS_FACING_BACK
    private var flashMode = ImageCapture.FLASH_MODE_OFF
    private var timerSeconds = 0
    private var busy = false
    private var lastPhoto: Uri? = null

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
                val degrees = when (rotation) {
                    Surface.ROTATION_90 -> 90f
                    Surface.ROTATION_180 -> 180f
                    Surface.ROTATION_270 -> -90f
                    else -> 0f
                }
                listOf<View>(flashButton, timerButton, gridButton, thumbnail, switchButton, zoomLabel)
                    .forEach { if (it.rotation != degrees) it.animate().rotation(degrees).setDuration(200).start() }
            }
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        WindowCompat.setDecorFitsSystemWindows(window, false)
        setContentView(R.layout.activity_main)

        preview = findViewById(R.id.preview)
        grid = findViewById(R.id.grid)
        flashOverlay = findViewById(R.id.flashOverlay)
        focusRing = findViewById(R.id.focusRing)
        countdown = findViewById(R.id.countdown)
        zoomLabel = findViewById(R.id.zoomLabel)
        resolution = findViewById(R.id.resolution)
        flashButton = findViewById(R.id.flashButton)
        timerButton = findViewById(R.id.timerButton)
        timerLabel = findViewById(R.id.timerLabel)
        gridButton = findViewById(R.id.gridButton)
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

    // Botoes de volume tambem tiram a foto, como nas cameras de fabrica.
    override fun onKeyDown(keyCode: Int, event: KeyEvent): Boolean {
        if (keyCode == KeyEvent.KEYCODE_VOLUME_UP || keyCode == KeyEvent.KEYCODE_VOLUME_DOWN ||
            keyCode == KeyEvent.KEYCODE_CAMERA
        ) {
            if (event.repeatCount == 0) onShutter()
            return true
        }
        return super.onKeyDown(keyCode, event)
    }

    private fun hasCameraPermission() =
        ContextCompat.checkSelfPermission(this, Manifest.permission.CAMERA) ==
            PackageManager.PERMISSION_GRANTED

    private fun applyInsets() {
        val topBar = findViewById<View>(R.id.topBar)
        val bottomBar = findViewById<View>(R.id.bottomBar)
        val dp = resources.displayMetrics.density
        ViewCompat.setOnApplyWindowInsetsListener(findViewById(R.id.root)) { _, insets ->
            val bars = insets.getInsets(
                WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout(),
            )
            topBar.updatePadding(top = bars.top + (8 * dp).toInt())
            bottomBar.updatePadding(bottom = bars.bottom + (28 * dp).toInt())
            insets
        }
    }

    // --- Preferencias ---------------------------------------------------------

    private fun restorePrefs() {
        lensFacing = prefs.getInt("lens", CameraSelector.LENS_FACING_BACK)
        flashMode = prefs.getInt("flash", ImageCapture.FLASH_MODE_OFF)
        timerSeconds = prefs.getInt("timer", 0)
        grid.visibility = if (prefs.getBoolean("grid", false)) View.VISIBLE else View.GONE
        renderFlash()
        renderTimer()
        renderGrid()
    }

    private fun savePrefs() {
        prefs.edit()
            .putInt("lens", lensFacing)
            .putInt("flash", flashMode)
            .putInt("timer", timerSeconds)
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
            flashMode = when (flashMode) {
                ImageCapture.FLASH_MODE_OFF -> ImageCapture.FLASH_MODE_AUTO
                ImageCapture.FLASH_MODE_AUTO -> ImageCapture.FLASH_MODE_ON
                else -> ImageCapture.FLASH_MODE_OFF
            }
            imageCapture?.flashMode = flashMode
            savePrefs()
            renderFlash()
            toast(
                when (flashMode) {
                    ImageCapture.FLASH_MODE_AUTO -> "Flash automático"
                    ImageCapture.FLASH_MODE_ON -> "Flash ligado"
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

        gridButton.setOnClickListener {
            grid.visibility = if (grid.visibility == View.VISIBLE) View.GONE else View.VISIBLE
            savePrefs()
            renderGrid()
        }

        // Toque no indicador de zoom volta para 1x.
        zoomLabel.setOnClickListener { camera?.cameraControl?.setZoomRatio(1f) }

        thumbnail.setOnClickListener { openLastPhoto() }

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

    private fun renderFlash() {
        flashButton.setImageResource(
            when (flashMode) {
                ImageCapture.FLASH_MODE_AUTO -> R.drawable.ic_flash_auto
                ImageCapture.FLASH_MODE_ON -> R.drawable.ic_flash_on
                else -> R.drawable.ic_flash_off
            },
        )
        flashButton.setColorFilter(if (flashMode == ImageCapture.FLASH_MODE_OFF) WHITE else ACCENT)
    }

    private fun renderTimer() {
        timerLabel.text = if (timerSeconds == 0) "" else "${timerSeconds}s"
        timerButton.setColorFilter(if (timerSeconds == 0) WHITE else ACCENT)
    }

    private fun renderGrid() {
        gridButton.setColorFilter(if (grid.visibility == View.VISIBLE) ACCENT else WHITE)
    }

    // --- Camera ----------------------------------------------------------------

    private fun startCamera() {
        val future = ProcessCameraProvider.getInstance(this)
        future.addListener({
            cameraProvider = future.get()
            bindCamera()
        }, ContextCompat.getMainExecutor(this))
    }

    private fun bindCamera() {
        val provider = cameraProvider ?: return

        var selector = CameraSelector.Builder().requireLensFacing(lensFacing).build()
        if (!provider.hasCamera(selector)) {
            lensFacing = if (lensFacing == CameraSelector.LENS_FACING_BACK) {
                CameraSelector.LENS_FACING_FRONT
            } else {
                CameraSelector.LENS_FACING_BACK
            }
            selector = CameraSelector.Builder().requireLensFacing(lensFacing).build()
        }
        switchButton.visibility =
            if (provider.hasCamera(CameraSelector.DEFAULT_BACK_CAMERA) &&
                provider.hasCamera(CameraSelector.DEFAULT_FRONT_CAMERA)
            ) View.VISIBLE else View.INVISIBLE

        val previewUseCase = Preview.Builder()
            .setResolutionSelector(
                ResolutionSelector.Builder()
                    .setAspectRatioStrategy(AspectRatioStrategy.RATIO_4_3_FALLBACK_AUTO_STRATEGY)
                    .build(),
            )
            .build()
            .also { it.setSurfaceProvider(preview.surfaceProvider) }

        // A maior resolucao que o sensor oferece, inclusive os modos de alta
        // resolucao (50 MP, 108 MP...) que alguns celulares so liberam quando
        // o app aceita uma captura um pouco mais lenta.
        val captureUseCase = ImageCapture.Builder()
            .setCaptureMode(ImageCapture.CAPTURE_MODE_MAXIMIZE_QUALITY)
            .setJpegQuality(100)
            .setFlashMode(flashMode)
            .setResolutionSelector(
                ResolutionSelector.Builder()
                    .setAspectRatioStrategy(AspectRatioStrategy.RATIO_4_3_FALLBACK_AUTO_STRATEGY)
                    .setResolutionStrategy(ResolutionStrategy.HIGHEST_AVAILABLE_STRATEGY)
                    .setAllowedResolutionMode(ResolutionSelector.PREFER_HIGHER_RESOLUTION_OVER_CAPTURE_RATE)
                    .build(),
            )
            .build()

        try {
            provider.unbindAll()
            val bound = provider.bindToLifecycle(this, selector, previewUseCase, captureUseCase)
            camera = bound
            imageCapture = captureUseCase
            shutter.isEnabled = true

            flashButton.visibility = if (bound.cameraInfo.hasFlashUnit()) View.VISIBLE else View.GONE
            bound.cameraInfo.zoomState.observe(this) { state ->
                zoomLabel.text = String.format(Locale.US, "%.1fx", state.zoomRatio)
            }
            bound.cameraInfo.cameraState.observe(this) { showResolution() }
            showResolution()
        } catch (error: Exception) {
            Log.e(TAG, "Falha ao abrir a camera", error)
            toast("Não foi possível abrir a câmera.")
        }
    }

    private fun showResolution() {
        val size = imageCapture?.resolutionInfo?.resolution ?: return
        val mp = size.width.toLong() * size.height / 1_000_000.0
        resolution.text = if (mp >= 10) "${mp.toInt()} MP" else String.format(Locale.US, "%.1f MP", mp)
    }

    // --- Gestos: toque para focar, pinca para zoom -------------------------------

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

        preview.setOnTouchListener { view, event ->
            scaleDetector.onTouchEvent(event)
            when (event.actionMasked) {
                MotionEvent.ACTION_DOWN -> scaled = false
                MotionEvent.ACTION_UP -> {
                    if (!scaled && event.eventTime - event.downTime < 400) {
                        focusAt(event.x, event.y)
                        view.performClick()
                    }
                }
            }
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
        focusRing.translationX = preview.left + x - focusRing.width / 2f
        focusRing.translationY = preview.top + y - focusRing.height / 2f
        focusRing.alpha = 1f
        focusRing.scaleX = 1.4f
        focusRing.scaleY = 1.4f
        focusRing.animate().scaleX(1f).scaleY(1f).setDuration(200).withEndAction {
            focusRing.animate().alpha(0f).setStartDelay(900).setDuration(300).start()
        }.start()
    }

    // --- Captura -----------------------------------------------------------------

    private fun onShutter() {
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

    private fun capture() {
        val capture = imageCapture ?: return
        busy = true
        shutter.isEnabled = false

        val name = SimpleDateFormat("'IMG_'yyyyMMdd_HHmmss", Locale.US).format(Date())
        val values = ContentValues().apply {
            put(MediaStore.MediaColumns.DISPLAY_NAME, name)
            put(MediaStore.MediaColumns.MIME_TYPE, "image/jpeg")
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                put(MediaStore.MediaColumns.RELATIVE_PATH, ALBUM_PATH)
            }
        }
        // A camera frontal salva a foto como aparece no visor (espelhada).
        val metadata = ImageCapture.Metadata().apply {
            isReversedHorizontal = lensFacing == CameraSelector.LENS_FACING_FRONT
        }
        val options = ImageCapture.OutputFileOptions.Builder(
            contentResolver,
            MediaStore.Images.Media.EXTERNAL_CONTENT_URI,
            values,
        ).setMetadata(metadata).build()

        sound.play(MediaActionSound.SHUTTER_CLICK)
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
                        lastPhoto = it
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

    // --- Ultima foto ---------------------------------------------------------------

    private fun loadLastPhoto() {
        // Antes do Android 10 a busca exigiria permissao de leitura da galeria.
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) return
        io.execute {
            val uri = try {
                contentResolver.query(
                    MediaStore.Images.Media.EXTERNAL_CONTENT_URI,
                    arrayOf(MediaStore.Images.Media._ID),
                    "${MediaStore.MediaColumns.RELATIVE_PATH} LIKE ?",
                    arrayOf("$ALBUM_PATH%"),
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
                    if (lastPhoto == null) {
                        lastPhoto = uri
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
            main.post { if (bitmap != null && uri == lastPhoto) thumbnail.setImageBitmap(bitmap) }
        }
    }

    private fun openLastPhoto() {
        val uri = lastPhoto ?: run {
            toast("Nenhuma foto ainda.")
            return
        }
        val intent = Intent(Intent.ACTION_VIEW).apply {
            setDataAndType(uri, "image/jpeg")
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
        private const val ALBUM_PATH = "Pictures/Foto/"
        private val WHITE = 0xFFFFFFFF.toInt()
        private val ACCENT = 0xFFFFD60A.toInt()
    }
}
