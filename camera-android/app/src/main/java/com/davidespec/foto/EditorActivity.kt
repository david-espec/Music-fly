package com.davidespec.foto

import android.annotation.SuppressLint
import android.content.Context
import android.content.Intent
import android.content.res.ColorStateList
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.ColorMatrix
import android.graphics.Matrix
import android.graphics.Paint
import android.graphics.RectF
import android.graphics.Typeface
import android.net.Uri
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.Gravity
import android.view.MotionEvent
import android.view.View
import android.view.ViewGroup
import android.widget.FrameLayout
import android.widget.HorizontalScrollView
import android.widget.ImageButton
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.ProgressBar
import android.widget.SeekBar
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.updatePadding
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicInteger
import kotlin.math.abs
import kotlin.math.max
import kotlin.math.min
import kotlin.math.pow

/**
 * Editor basico. A edicao e uma lista de parametros (nao destrutiva): o
 * desfazer/refazer troca o estado e a imagem e recalculada. A foto original
 * nunca e alterada; salvar cria uma imagem nova.
 */
class EditorActivity : AppCompatActivity() {

    data class EditState(
        val rotation: Int = 0,
        val flip: Boolean = false,
        /** Recorte em fracoes (0..1) da imagem ja girada/espelhada. */
        val crop: RectF = RectF(0f, 0f, 1f, 1f),
        val adjust: Map<String, Int> = emptyMap(),
        val filter: String = "original",
        val filterIntensity: Int = 100,
        val bw: Boolean = false,
    ) {
        fun value(key: String) = adjust[key] ?: 0
    }

    private class Adjustment(val key: String, val label: String, val min: Int, val max: Int)

    private val adjustments = listOf(
        Adjustment("brilho", "Brilho", -100, 100),
        Adjustment("exposicao", "Exposição", -100, 100),
        Adjustment("contraste", "Contraste", -100, 100),
        Adjustment("saturacao", "Saturação", -100, 100),
        Adjustment("temperatura", "Temperatura", -100, 100),
        Adjustment("matiz", "Matiz", -100, 100),
        Adjustment("sombras", "Sombras", -100, 100),
        Adjustment("realces", "Realces", -100, 100),
        Adjustment("nitidez", "Nitidez", 0, 100),
        Adjustment("desfoque", "Desfoque", 0, 100),
    )

    private lateinit var image: ImageView
    private lateinit var cropView: CropView
    private lateinit var toolArea: LinearLayout
    private lateinit var spinner: ProgressBar
    private lateinit var undoButton: ImageButton
    private lateinit var redoButton: ImageButton

    private var source: Uri? = null
    private var base: Bitmap? = null
    private var state = EditState()
    private val undo = ArrayDeque<EditState>()
    private val redo = ArrayDeque<EditState>()
    private var tool = "adjust"
    private var selectedAdjust = "brilho"

    private val io = Executors.newSingleThreadExecutor()
    private val main = Handler(Looper.getMainLooper())
    private val renderToken = AtomicInteger()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        WindowCompat.setDecorFitsSystemWindows(window, false)
        source = intent.data ?: run {
            finish()
            return
        }

        val rootView = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setBackgroundColor(0xFF000000.toInt())
        }
        val top = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            setPadding(dp(8), dp(8), dp(8), dp(8))
        }
        top.addView(icon(R.drawable.ic_close, "Cancelar") { confirmExit() })
        top.addView(View(this), LinearLayout.LayoutParams(0, 1, 1f))
        undoButton = icon(R.drawable.ic_undo, "Desfazer") { undo() }
        redoButton = icon(R.drawable.ic_redo, "Refazer") { redo() }
        top.addView(undoButton)
        top.addView(redoButton)
        top.addView(TextView(this).apply {
            text = "Salvar"
            setTextColor(ACCENT)
            textSize = 16f
            typeface = Typeface.DEFAULT_BOLD
            setPadding(dp(16), dp(10), dp(12), dp(10))
            setOnClickListener { save() }
        })
        rootView.addView(top)

        val stage = FrameLayout(this)
        image = ImageView(this).apply { scaleType = ImageView.ScaleType.FIT_CENTER }
        cropView = CropView(this).apply { visibility = View.GONE }
        spinner = ProgressBar(this).apply {
            indeterminateTintList = ColorStateList.valueOf(ACCENT)
            visibility = View.GONE
        }
        stage.addView(image, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
        stage.addView(cropView, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
        stage.addView(spinner, FrameLayout.LayoutParams(dp(48), dp(48), Gravity.CENTER))
        rootView.addView(stage, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f))

        toolArea = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(12), dp(8), dp(12), dp(4))
        }
        rootView.addView(toolArea)

        val tools = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            setPadding(dp(4), dp(4), dp(4), dp(8))
        }
        listOf(
            Triple("crop", R.drawable.ic_crop, "Cortar"),
            Triple("rotate", R.drawable.ic_rotate, "Girar"),
            Triple("flip", R.drawable.ic_flip, "Espelhar"),
            Triple("adjust", R.drawable.ic_sun, "Ajustes"),
            Triple("filters", R.drawable.ic_layers, "Filtros"),
            Triple("bw", R.drawable.ic_gallery, "P&B"),
        ).forEach { (id, res, label) -> tools.addView(toolButton(res, label) { onTool(id) }) }
        rootView.addView(tools)

        ViewCompat.setOnApplyWindowInsetsListener(rootView) { _, insets ->
            val bars = insets.getInsets(WindowInsetsCompat.Type.systemBars())
            top.updatePadding(top = bars.top + dp(8))
            tools.updatePadding(bottom = bars.bottom + dp(8))
            insets
        }
        setContentView(rootView)

        spinner.visibility = View.VISIBLE
        val uri = source!!
        io.execute {
            // Previa leve: ate ~2 MP; a foto salva usa a resolucao completa.
            val preview = try {
                MediaSaver.loadBitmap(this, uri, 2_000_000L)
            } catch (error: Exception) {
                null
            }
            main.post {
                if (preview == null) {
                    toast("Não foi possível abrir a foto.")
                    finish()
                } else {
                    base = preview
                    showTool()
                    render()
                }
            }
        }
    }

    override fun onDestroy() {
        super.onDestroy()
        io.shutdown()
    }

    @Deprecated("Deprecated in Java")
    override fun onBackPressed() {
        confirmExit()
    }

    private fun dp(v: Int) = (v * resources.displayMetrics.density).toInt()

    private fun icon(res: Int, description: String, onClick: () -> Unit) = ImageButton(this).apply {
        setImageResource(res)
        imageTintList = ColorStateList.valueOf(0xFFFFFFFF.toInt())
        background = null
        contentDescription = description
        setOnClickListener { onClick() }
        layoutParams = LinearLayout.LayoutParams(dp(44), dp(44))
    }

    private fun toolButton(res: Int, label: String, onClick: () -> Unit): View {
        val box = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER
            isClickable = true
            contentDescription = label
            setOnClickListener { onClick() }
            layoutParams = LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f)
            setPadding(0, dp(6), 0, dp(6))
        }
        box.addView(ImageView(this).apply {
            setImageResource(res)
            imageTintList = ColorStateList.valueOf(0xFFFFFFFF.toInt())
        })
        box.addView(TextView(this).apply {
            text = label
            setTextColor(0xFFFFFFFF.toInt())
            textSize = 11f
            gravity = Gravity.CENTER
        })
        return box
    }

    private fun chip(text: String, selected: Boolean, onClick: () -> Unit) = TextView(this).apply {
        this.text = text
        setTextColor(if (selected) 0xFF111111.toInt() else 0xFFFFFFFF.toInt())
        textSize = 13f
        typeface = Typeface.DEFAULT_BOLD
        setBackgroundResource(R.drawable.chip_bg)
        isSelected = selected
        setPadding(dp(14), dp(8), dp(14), dp(8))
        layoutParams = LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT).apply { marginEnd = dp(8) }
        setOnClickListener { onClick() }
    }

    private fun chipRow(chips: List<View>): View {
        val line = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL }
        chips.forEach { line.addView(it) }
        return HorizontalScrollView(this).apply {
            isHorizontalScrollBarEnabled = false
            addView(line)
        }
    }

    // --- Ferramentas ------------------------------------------------------------------------

    private fun onTool(id: String) {
        when (id) {
            "rotate" -> commit(state.copy(rotation = (state.rotation + 90) % 360, crop = RectF(0f, 0f, 1f, 1f)))
            "flip" -> commit(state.copy(flip = !state.flip, crop = RectF(1 - state.crop.right, state.crop.top, 1 - state.crop.left, state.crop.bottom)))
            "bw" -> commit(state.copy(bw = !state.bw))
            else -> {
                tool = id
                showTool()
            }
        }
    }

    private fun showTool() {
        toolArea.removeAllViews()
        cropView.visibility = View.GONE
        when (tool) {
            "adjust" -> {
                toolArea.addView(chipRow(adjustments.map { a ->
                    chip(a.label + if (state.value(a.key) != 0) " •" else "", a.key == selectedAdjust) {
                        selectedAdjust = a.key
                        showTool()
                    }
                }))
                val a = adjustments.first { it.key == selectedAdjust }
                toolArea.addView(slider(a.min, a.max, state.value(a.key)) { value, done ->
                    val next = state.copy(adjust = state.adjust + (a.key to value))
                    if (done) commit(next) else preview(next)
                })
            }
            "filters" -> {
                toolArea.addView(chipRow(Filters.all.map { f ->
                    chip(f.name, f.id == state.filter) {
                        commit(state.copy(filter = f.id))
                        showTool()
                    }
                }))
                if (state.filter != "original") {
                    toolArea.addView(slider(0, 100, state.filterIntensity) { value, done ->
                        val next = state.copy(filterIntensity = value)
                        if (done) commit(next) else preview(next)
                    })
                }
            }
            "crop" -> startCrop()
        }
    }

    private fun slider(minValue: Int, maxValue: Int, value: Int, onChange: (Int, Boolean) -> Unit): View {
        val box = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            setPadding(0, dp(8), 0, dp(4))
        }
        val label = TextView(this).apply {
            text = value.toString()
            setTextColor(ACCENT)
            textSize = 13f
            typeface = Typeface.DEFAULT_BOLD
            minWidth = dp(44)
            gravity = Gravity.END
        }
        val seek = SeekBar(this).apply {
            max = maxValue - minValue
            progress = value - minValue
            progressTintList = ColorStateList.valueOf(ACCENT)
            thumbTintList = ColorStateList.valueOf(ACCENT)
            layoutParams = LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f)
            setOnSeekBarChangeListener(object : SeekBar.OnSeekBarChangeListener {
                override fun onProgressChanged(seekBar: SeekBar, progress: Int, fromUser: Boolean) {
                    label.text = (progress + minValue).toString()
                    if (fromUser) onChange(progress + minValue, false)
                }
                override fun onStartTrackingTouch(seekBar: SeekBar) = Unit
                override fun onStopTrackingTouch(seekBar: SeekBar) = onChange(seekBar.progress + minValue, true)
            })
        }
        box.addView(seek)
        box.addView(label)
        return box
    }

    private fun startCrop() {
        val bmp = base ?: return
        // No corte mostra a foto inteira (girada) e a moldura por cima.
        val geometry = geometry(bmp, state.copy(crop = RectF(0f, 0f, 1f, 1f)))
        image.setImageBitmap(ImageEffects.applyMatrix(geometry, colorMatrix(state)))
        cropView.visibility = View.VISIBLE
        image.post { cropView.setup(displayedRect(geometry), RectF(state.crop)) }

        toolArea.addView(chipRow(listOf("Livre" to 0f, "1:1" to 1f, "4:3" to 4f / 3f, "3:4" to 3f / 4f, "16:9" to 16f / 9f).map { (name, ratio) ->
            chip(name, cropView.ratio == ratio) {
                cropView.setRatio(ratio)
                toolArea.removeAllViews()
                showCropButtons()
            }
        }))
        showCropButtons()
    }

    private fun showCropButtons() {
        if (toolArea.childCount == 0) {
            toolArea.addView(chipRow(listOf("Livre" to 0f, "1:1" to 1f, "4:3" to 4f / 3f, "3:4" to 3f / 4f, "16:9" to 16f / 9f).map { (name, ratio) ->
                chip(name, cropView.ratio == ratio) {
                    cropView.setRatio(ratio)
                    toolArea.removeAllViews()
                    showCropButtons()
                }
            }))
        }
        val row = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.END
            setPadding(0, dp(8), 0, 0)
        }
        row.addView(chip("Cancelar", false) {
            tool = "adjust"
            showTool()
            render()
        })
        row.addView(chip("Aplicar corte", true) {
            val crop = cropView.result()
            tool = "adjust"
            commit(state.copy(crop = crop))
            showTool()
        })
        toolArea.addView(row)
    }

    private fun displayedRect(bitmap: Bitmap): RectF {
        val rect = RectF(0f, 0f, bitmap.width.toFloat(), bitmap.height.toFloat())
        image.imageMatrix.mapRect(rect)
        rect.offset(image.paddingLeft.toFloat(), image.paddingTop.toFloat())
        return rect
    }

    // --- Estado, desfazer, refazer -----------------------------------------------------------------

    private fun commit(next: EditState) {
        if (next == state) {
            render()
            return
        }
        undo.addLast(state)
        if (undo.size > 50) undo.removeFirst()
        redo.clear()
        state = next
        render()
    }

    private fun preview(next: EditState) {
        state = next
        render()
    }

    private fun undo() {
        val previous = undo.removeLastOrNull() ?: return
        redo.addLast(state)
        state = previous
        showTool()
        render()
    }

    private fun redo() {
        val next = redo.removeLastOrNull() ?: return
        undo.addLast(state)
        state = next
        showTool()
        render()
    }

    private fun render() {
        undoButton.alpha = if (undo.isEmpty()) 0.35f else 1f
        redoButton.alpha = if (redo.isEmpty()) 0.35f else 1f
        if (tool == "crop") return
        val bmp = base ?: return
        val snapshot = state
        val token = renderToken.incrementAndGet()
        io.execute {
            // So a ultima alteracao conta: pedidos antigos sao descartados.
            if (token != renderToken.get()) return@execute
            val out = try {
                apply(bmp, snapshot)
            } catch (error: OutOfMemoryError) {
                null
            }
            main.post { if (token == renderToken.get() && out != null && tool != "crop") image.setImageBitmap(out) }
        }
    }

    // --- Processamento ---------------------------------------------------------------------------

    private fun geometry(source: Bitmap, s: EditState): Bitmap {
        var bitmap = source
        if (s.rotation != 0 || s.flip) {
            val m = Matrix().apply {
                postRotate(s.rotation.toFloat())
                if (s.flip) postScale(-1f, 1f)
            }
            bitmap = Bitmap.createBitmap(bitmap, 0, 0, bitmap.width, bitmap.height, m, true)
        }
        val c = s.crop
        if (c.left > 0.001f || c.top > 0.001f || c.right < 0.999f || c.bottom < 0.999f) {
            val x = (c.left * bitmap.width).toInt().coerceIn(0, bitmap.width - 1)
            val y = (c.top * bitmap.height).toInt().coerceIn(0, bitmap.height - 1)
            val w = ((c.right - c.left) * bitmap.width).toInt().coerceIn(1, bitmap.width - x)
            val h = ((c.bottom - c.top) * bitmap.height).toInt().coerceIn(1, bitmap.height - y)
            bitmap = Bitmap.createBitmap(bitmap, x, y, w, h)
        }
        return bitmap
    }

    private fun colorMatrix(s: EditState): ColorMatrix {
        val m = ColorMatrix()
        val exposure = s.value("exposicao") / 100f * 1.5f
        if (exposure != 0f) m.postConcat(Filters.exposure(exposure))
        val brightness = s.value("brilho") * 0.6f
        if (brightness != 0f) m.postConcat(Filters.brightness(brightness))
        val contrast = 1f + s.value("contraste") / 100f * 0.6f
        if (contrast != 1f) m.postConcat(Filters.contrast(contrast))
        val saturation = 1f + s.value("saturacao") / 100f
        if (saturation != 1f) m.postConcat(Filters.saturation(saturation))
        val temperature = s.value("temperatura") / 100f * 0.8f
        if (temperature != 0f) m.postConcat(Filters.temperature(temperature))
        val hue = s.value("matiz") / 100f * 180f
        if (hue != 0f) m.postConcat(Filters.hue(hue))
        if (s.filter != "original") m.postConcat(Filters.byId(s.filter).matrix(s.filterIntensity / 100f))
        if (s.bw) m.postConcat(Filters.saturation(0f))
        return m
    }

    /** Pipeline completo; os raios sao proporcionais ao tamanho, entao previa e foto final batem. */
    private fun apply(source: Bitmap, s: EditState): Bitmap {
        var bitmap = geometry(source, s)
        bitmap = ImageEffects.applyMatrix(bitmap, colorMatrix(s))
        bitmap = ImageEffects.shadowsHighlights(bitmap, s.value("sombras") / 100f, s.value("realces") / 100f)
        val sharp = s.value("nitidez") / 100f
        if (sharp > 0f) bitmap = ImageEffects.sharpen(bitmap, sharp * 1.5f)
        val blur = s.value("desfoque") / 100f
        if (blur > 0f) bitmap = ImageEffects.blur(bitmap, min(bitmap.width, bitmap.height) * 0.025f * blur)
        return bitmap
    }

    private fun save() {
        val uri = source ?: return
        if (undo.isEmpty() && state == EditState()) {
            toast("Nenhuma alteração para salvar.")
            return
        }
        spinner.visibility = View.VISIBLE
        val snapshot = state
        val settings = CameraSettings(this)
        io.execute {
            val saved = try {
                val full = MediaSaver.loadBitmap(this, uri, MediaSaver.MAX_PROCESSED_PIXELS) ?: throw IllegalStateException()
                val result = apply(full, snapshot)
                MediaSaver.saveBitmap(this, result, settings.jpegQuality, settings.photoTarget, MediaSaver.readExif(this, uri), null, "EDIT")
            } catch (error: Throwable) {
                null
            }
            main.post {
                spinner.visibility = View.GONE
                if (saved == null) {
                    toast("Não foi possível salvar a edição.")
                } else {
                    toast("Salvo como nova foto. A original foi mantida.")
                    setResult(RESULT_OK, Intent().setData(saved))
                    finish()
                }
            }
        }
    }

    private fun confirmExit() {
        if (undo.isEmpty()) {
            finish()
            return
        }
        AlertDialog.Builder(this)
            .setTitle("Descartar edição?")
            .setMessage("As alterações não salvas serão perdidas.")
            .setPositiveButton("Descartar") { _, _ -> finish() }
            .setNegativeButton("Continuar editando", null)
            .show()
    }

    private fun toast(text: String) = Toast.makeText(this, text, Toast.LENGTH_SHORT).show()

    companion object {
        private val ACCENT = 0xFFFFD60A.toInt()
    }
}

/** Moldura de corte com cantos arrastaveis. */
@SuppressLint("ViewConstructor")
class CropView(context: Context) : View(context) {

    private var bounds = RectF()
    private var frame = RectF()
    var ratio = 0f
        private set
    private var dragging = -1
    private var lastX = 0f
    private var lastY = 0f
    private val density = resources.displayMetrics.density

    private val shade = Paint().apply { color = 0x99000000.toInt() }
    private val line = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = 0xFFFFFFFF.toInt()
        style = Paint.Style.STROKE
        strokeWidth = 2 * density
    }
    private val handle = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = 0xFFFFD60A.toInt() }

    /** [image] = onde a foto aparece na tela; [crop] = recorte atual em fracoes. */
    fun setup(image: RectF, crop: RectF) {
        bounds = image
        frame = RectF(
            image.left + crop.left * image.width(),
            image.top + crop.top * image.height(),
            image.left + crop.right * image.width(),
            image.top + crop.bottom * image.height(),
        )
        invalidate()
    }

    fun setRatio(value: Float) {
        ratio = value
        if (value > 0f) {
            var w = bounds.width()
            var h = w / value
            if (h > bounds.height()) {
                h = bounds.height()
                w = h * value
            }
            frame = RectF(bounds.centerX() - w / 2, bounds.centerY() - h / 2, bounds.centerX() + w / 2, bounds.centerY() + h / 2)
        }
        invalidate()
    }

    fun result(): RectF {
        if (bounds.width() <= 0f) return RectF(0f, 0f, 1f, 1f)
        return RectF(
            ((frame.left - bounds.left) / bounds.width()).coerceIn(0f, 1f),
            ((frame.top - bounds.top) / bounds.height()).coerceIn(0f, 1f),
            ((frame.right - bounds.left) / bounds.width()).coerceIn(0f, 1f),
            ((frame.bottom - bounds.top) / bounds.height()).coerceIn(0f, 1f),
        )
    }

    override fun onDraw(canvas: Canvas) {
        super.onDraw(canvas)
        if (bounds.isEmpty) return
        canvas.drawRect(bounds.left, bounds.top, bounds.right, frame.top, shade)
        canvas.drawRect(bounds.left, frame.bottom, bounds.right, bounds.bottom, shade)
        canvas.drawRect(bounds.left, frame.top, frame.left, frame.bottom, shade)
        canvas.drawRect(frame.right, frame.top, bounds.right, frame.bottom, shade)
        canvas.drawRect(frame, line)
        val r = 7 * density
        corners().forEach { (x, y) -> canvas.drawCircle(x, y, r, handle) }
    }

    private fun corners() = listOf(
        frame.left to frame.top, frame.right to frame.top,
        frame.left to frame.bottom, frame.right to frame.bottom,
    )

    @SuppressLint("ClickableViewAccessibility")
    override fun onTouchEvent(event: MotionEvent): Boolean {
        when (event.actionMasked) {
            MotionEvent.ACTION_DOWN -> {
                val touch = 32 * density
                dragging = corners().indexOfFirst { (x, y) -> abs(x - event.x) < touch && abs(y - event.y) < touch }
                if (dragging < 0 && frame.contains(event.x, event.y)) dragging = 4
                lastX = event.x
                lastY = event.y
                return dragging >= 0
            }
            MotionEvent.ACTION_MOVE -> {
                val dx = event.x - lastX
                val dy = event.y - lastY
                lastX = event.x
                lastY = event.y
                move(dragging, dx, dy)
                invalidate()
            }
            MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL -> dragging = -1
        }
        return true
    }

    private fun move(corner: Int, dx: Float, dy: Float) {
        val minSize = 48 * density
        val f = RectF(frame)
        when (corner) {
            4 -> {
                val ox = dx.coerceIn(bounds.left - f.left, bounds.right - f.right)
                val oy = dy.coerceIn(bounds.top - f.top, bounds.bottom - f.bottom)
                f.offset(ox, oy)
            }
            0 -> { f.left += dx; f.top += if (ratio > 0) dx / ratio else dy }
            1 -> { f.right += dx; f.top -= if (ratio > 0) dx / ratio else -dy }
            2 -> { f.left += dx; f.bottom -= if (ratio > 0) dx / ratio else -dy }
            3 -> { f.right += dx; f.bottom += if (ratio > 0) dx / ratio else dy }
            else -> return
        }
        if (f.width() < minSize || f.height() < minSize) return
        if (f.left < bounds.left - 0.5f || f.top < bounds.top - 0.5f || f.right > bounds.right + 0.5f || f.bottom > bounds.bottom + 0.5f) return
        frame = f
    }
}
