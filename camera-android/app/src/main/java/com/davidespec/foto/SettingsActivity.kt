package com.davidespec.foto

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.content.res.ColorStateList
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.provider.Settings
import android.text.InputType
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.widget.EditText
import android.widget.ImageButton
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import androidx.appcompat.widget.SwitchCompat
import androidx.camera.core.CameraInfo
import androidx.camera.core.DynamicRange
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.video.Quality
import androidx.camera.video.Recorder
import androidx.core.content.ContextCompat
import androidx.core.content.pm.PackageInfoCompat
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.updatePadding

/**
 * Configuracoes no estilo da camera da Samsung: grupos em cartoes
 * arredondados, titulo azul e chaves azuis. Cada opcao so aparece se o
 * aparelho oferece o recurso.
 */
class SettingsActivity : AppCompatActivity() {

    private lateinit var settings: CameraSettings
    private lateinit var content: LinearLayout
    private var cameraInfos: List<CameraInfo> = emptyList()
    private var pendingSwitch: SwitchCompat? = null

    private val locationLauncher =
        registerForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) { result ->
            val granted = result.values.any { it }
            settings.location = granted
            pendingSwitch?.isChecked = granted
            if (!granted) toast("Sem permissão de localização, as fotos não terão local.")
        }

    private val micLauncher =
        registerForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
            settings.microphone = granted
            pendingSwitch?.isChecked = granted
        }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        WindowCompat.setDecorFitsSystemWindows(window, false)
        settings = CameraSettings(this)

        val scroll = ScrollView(this).apply { setBackgroundColor(BG) }
        content = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(16), 0, dp(16), dp(24))
        }
        scroll.addView(content)
        setContentView(scroll)
        ViewCompat.setOnApplyWindowInsetsListener(scroll) { _, insets ->
            val bars = insets.getInsets(WindowInsetsCompat.Type.systemBars())
            content.updatePadding(top = bars.top + dp(12), bottom = bars.bottom + dp(24))
            insets
        }

        build()
        // As qualidades de video e o diagnostico precisam das cameras.
        val future = ProcessCameraProvider.getInstance(this)
        future.addListener({
            cameraInfos = try {
                future.get().availableCameraInfos
            } catch (error: Exception) {
                emptyList()
            }
            build()
        }, ContextCompat.getMainExecutor(this))
    }

    private fun dp(v: Int) = (v * resources.displayMetrics.density).toInt()

    private fun backCamera(): CameraInfo? = cameraInfos.firstOrNull { !CameraCapabilities(it).isFront } ?: cameraInfos.firstOrNull()

    private fun build() {
        content.removeAllViews()
        header()

        section("Recursos inteligentes")
        card {
            switchRow("Ler códigos QR", null, settings.qrCodes) { settings.qrCodes = it }
        }

        section("Fotos")
        card {
            valueRow("Segurar o botão da câmera para", if (settings.burstOnHold) "Tirar fotos contínuas" else "Nada") {
                choose("Segurar o botão da câmera para", listOf("Tirar fotos contínuas", "Nada"), if (settings.burstOnHold) 0 else 1) {
                    settings.burstOnHold = it == 0
                    build()
                }
            }
            divider()
            switchRow("Marca d'água", watermarkSummary(), settings.watermark, onRowClick = { editWatermark() }) {
                settings.watermark = it
            }
            divider()
            val qualities = listOf(100 to "Máxima (100)", 95 to "Alta (95)", 85 to "Econômica (85)")
            valueRow("Qualidade da imagem (JPEG)", qualities.firstOrNull { it.first == settings.jpegQuality }?.second ?: "${settings.jpegQuality}") {
                choose("Qualidade da imagem", qualities.map { it.second }, qualities.indexOfFirst { it.first == settings.jpegQuality }) {
                    settings.jpegQuality = qualities[it].first
                    build()
                }
            }
            divider()
            infoRow("Formato das fotos", "JPEG com dados EXIF e processamento de alta qualidade do sensor (redução de ruído, nitidez). A resolução é escolhida na tela da câmera (toque no \"12M\").")
        }

        section("Efeitos nas fotos")
        card {
            switchRow(
                "Aprimorar automaticamente",
                "Ajusta a luz, dá mais vida às cores e um toque de nitidez em cada foto.",
                settings.enhance,
            ) { settings.enhance = it }
            val levels = listOf(0, 25, 50, 75, 100)
            fun levelName(v: Int) = if (v == 0) "Desligado" else "$v%"
            listOf(
                Triple("Pele lisa", { settings.beautySmooth }, { v: Int -> settings.beautySmooth = v }),
                Triple("Brilho da pele", { settings.beautyBright }, { v: Int -> settings.beautyBright = v }),
                Triple("Olhos maiores", { settings.beautyEyes }, { v: Int -> settings.beautyEyes = v }),
                Triple("Rosto mais fino", { settings.beautyFace }, { v: Int -> settings.beautyFace = v }),
                Triple("Dentes mais brancos", { settings.beautyTeeth }, { v: Int -> settings.beautyTeeth = v }),
                Triple("Contorno", { settings.beautyContour }, { v: Int -> settings.beautyContour = v }),
            ).forEach { (title, get, set) ->
                divider()
                valueRow("Beleza: $title", levelName(get())) {
                    val current = levels.indexOfFirst { it >= get() }.coerceAtLeast(0)
                    choose(title, levels.map { levelName(it) }, current) {
                        set(levels[it])
                        build()
                    }
                }
            }
        }

        section("Selfies")
        card {
            switchRow("Salvar selfies como visualizadas", "Salva as selfies conforme aparecem na pré-visualização, sem invertê-las.", settings.mirrorSelfies) {
                settings.mirrorSelfies = it
            }
            divider()
            switchRow("Desliz. cima/baixo p/ alternar câmeras", null, settings.swipeToSwitch) { settings.swipeToSwitch = it }
            val front = cameraInfos.map { CameraCapabilities(it) }.firstOrNull { it.isFront }
            if (front == null || !front.hasFlash) {
                divider()
                switchRow("Flash de tela", "A tela acende em branco na selfie, já que a câmera frontal não tem flash.", settings.screenFlash) {
                    settings.screenFlash = it
                }
            }
        }

        section("Vídeos")
        card {
            val back = backCamera()
            val qualities = back?.let { supportedQualities(it) }.orEmpty()
            if (qualities.isNotEmpty()) {
                val current = qualities.firstOrNull { qualityName(it) == settings.videoQuality } ?: qualities.first()
                valueRow("Tamanho do vídeo", qualityLabel(current)) {
                    choose("Tamanho do vídeo", qualities.map { qualityLabel(it) }, qualities.indexOf(current)) {
                        settings.videoQuality = qualityName(qualities[it])
                        build()
                    }
                }
                divider()
            }
            val fps = back?.let { CameraCapabilities(it).fixedFps() }.orEmpty()
            if (fps.isNotEmpty()) {
                val current = if (settings.videoFps in fps) settings.videoFps else fps.last()
                valueRow("Quadros por segundo", "$current fps" + if (fps.size == 1) " (único disponível)" else "") {
                    if (fps.size > 1) {
                        choose("Quadros por segundo", fps.map { "$it fps" }, fps.indexOf(current)) {
                            settings.videoFps = fps[it]
                            build()
                        }
                    }
                }
                divider()
            }
            switchRow("Gravar som", "Usa o microfone durante a gravação.", settings.microphone && hasPermission(Manifest.permission.RECORD_AUDIO)) { on ->
                if (on && !hasPermission(Manifest.permission.RECORD_AUDIO)) {
                    micLauncher.launch(Manifest.permission.RECORD_AUDIO)
                } else {
                    settings.microphone = on
                }
            }
            divider()
            infoRow("Formato do vídeo", "MP4 com H.264 (AVC). HEVC não é oferecido pelo gravador desta versão do app.")
        }

        section("Geral")
        card {
            switchRow("Linhas de grade", null, settings.grid) { settings.grid = it }
            divider()
            valueRow("Tipo de grade", if (settings.gridType == "4x4") "4 × 4" else "3 × 3 (regra dos terços)") {
                choose("Tipo de grade", listOf("3 × 3 (regra dos terços)", "4 × 4"), if (settings.gridType == "4x4") 1 else 0) {
                    settings.gridType = if (it == 1) "4x4" else "3x3"
                    build()
                }
            }
            divider()
            switchRow("Guia central", null, settings.centerGuide) { settings.centerGuide = it }
            divider()
            switchRow("Nivelador", "Linha de horizonte que fica amarela quando o celular está reto.", settings.level) { settings.level = it }
            divider()
            switchRow("Histograma", "Distribuição de luz do visor.", settings.histogram) { settings.histogram = it }
            divider()
            switchRow(
                "Marcas de localização",
                "Adiciona o local às fotos e vídeos, para ver onde foram tirados.",
                settings.location && hasPermission(Manifest.permission.ACCESS_COARSE_LOCATION),
            ) { on ->
                if (on && !hasPermission(Manifest.permission.ACCESS_COARSE_LOCATION)) {
                    locationLauncher.launch(arrayOf(Manifest.permission.ACCESS_COARSE_LOCATION, Manifest.permission.ACCESS_FINE_LOCATION))
                } else {
                    settings.location = on
                }
            }
            divider()
            val actions = listOf("photo" to "Tirar foto ou gravar vídeo", "zoom" to "Zoom", "system" to "Controlar o volume do sistema")
            valueRow("Métodos de disparo", "Teclas de volume: " + (actions.firstOrNull { it.first == settings.volumeAction }?.second ?: "")) {
                choose("Pressionar as teclas de volume para", actions.map { it.second }, actions.indexOfFirst { it.first == settings.volumeAction }) {
                    settings.volumeAction = actions[it].first
                    build()
                }
            }
            divider()
            switchRow("Som do obturador", null, settings.shutterSound) { settings.shutterSound = it }
            divider()
            switchRow("Vibração", "Vibra ao tirar fotos e iniciar vídeos.", settings.vibration) { settings.vibration = it }
            divider()
            valueRow("Configurações a serem mantidas", keepSummary()) { editKeep() }
        }

        section("Armazenamento")
        card {
            switchRow(
                "Salvar junto com as fotos do celular",
                "Fotos e vídeos vão para DCIM/Camera e aparecem no álbum Câmera da Galeria.",
                settings.saveToCameraRoll,
            ) {
                settings.saveToCameraRoll = it
                build()
            }
            if (!settings.saveToCameraRoll) {
                divider()
                valueRow("Pasta das fotos", "Imagens/${settings.photoFolder}") {
                    editText("Pasta das fotos", settings.photoFolder) { settings.photoFolder = it; build() }
                }
                divider()
                valueRow("Pasta dos vídeos", "Filmes/${settings.videoFolder}") {
                    editText("Pasta dos vídeos", settings.videoFolder) { settings.videoFolder = it; build() }
                }
            }
        }

        section("Privacidade")
        card {
            plainRow("Permissões") {
                startActivity(Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.fromParts("package", packageName, null)))
            }
        }

        section("Atualizações")
        card {
            switchRow("Atualizar o app automaticamente", "Baixa e instala versões novas do Foto.", settings.prefs.getBoolean("autoUpdate", true)) {
                settings.prefs.edit().putBoolean("autoUpdate", it).apply()
            }
        }

        section("")
        card {
            plainRow("Diagnóstico da câmera") { showDiagnostics() }
            divider()
            plainRow("Redefinir configurações") {
                AlertDialog.Builder(this)
                    .setTitle("Redefinir configurações?")
                    .setMessage("Todas as opções voltam ao padrão. Suas fotos não são afetadas.")
                    .setPositiveButton("Redefinir") { _, _ ->
                        settings.reset()
                        build()
                        toast("Configurações redefinidas.")
                    }
                    .setNegativeButton("Cancelar", null)
                    .show()
            }
            divider()
            plainRow("Sobre a Câmera") { showAbout() }
        }
    }

    // --- Blocos de interface --------------------------------------------------------------------

    private fun header() {
        val bar = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            setPadding(0, dp(16), 0, dp(24))
        }
        bar.addView(ImageButton(this).apply {
            setImageResource(R.drawable.ic_back)
            imageTintList = ColorStateList.valueOf(TEXT)
            background = null
            contentDescription = "Voltar"
            setOnClickListener { finish() }
            layoutParams = LinearLayout.LayoutParams(dp(44), dp(44))
        })
        bar.addView(TextView(this).apply {
            text = "Configurações da câmera"
            setTextColor(BLUE)
            textSize = 25f
            typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
            setPadding(dp(8), 0, 0, 0)
        })
        content.addView(bar)
    }

    private fun section(title: String) {
        if (title.isEmpty()) {
            content.addView(View(this), LinearLayout.LayoutParams(1, dp(20)))
            return
        }
        content.addView(TextView(this).apply {
            text = title
            setTextColor(SECTION)
            textSize = 14f
            typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
            setPadding(dp(16), dp(18), dp(16), dp(8))
        })
    }

    private var currentCard: LinearLayout? = null

    private fun card(block: () -> Unit) {
        val card = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            background = GradientDrawable().apply {
                setColor(CARD)
                cornerRadius = dp(26).toFloat()
            }
        }
        currentCard = card
        block()
        currentCard = null
        content.addView(card, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT))
    }

    private fun divider() {
        currentCard?.addView(
            View(this).apply { setBackgroundColor(DIVIDER) },
            LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 1).apply {
                marginStart = dp(20)
                marginEnd = dp(20)
            },
        )
    }

    private fun texts(title: String, summary: String?, summaryColor: Int): LinearLayout {
        val box = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
        box.addView(TextView(this).apply {
            text = title
            setTextColor(TEXT)
            textSize = 17f
        })
        if (!summary.isNullOrEmpty()) {
            box.addView(TextView(this).apply {
                text = summary
                setTextColor(summaryColor)
                textSize = 14f
                setPadding(0, dp(2), 0, 0)
            })
        }
        return box
    }

    private fun rowContainer(onClick: (() -> Unit)?): LinearLayout = LinearLayout(this).apply {
        orientation = LinearLayout.HORIZONTAL
        gravity = Gravity.CENTER_VERTICAL
        minimumHeight = dp(64)
        setPadding(dp(20), dp(14), dp(20), dp(14))
        if (onClick != null) {
            isClickable = true
            val attrs = obtainStyledAttributes(intArrayOf(android.R.attr.selectableItemBackground))
            foreground = attrs.getDrawable(0)
            attrs.recycle()
            setOnClickListener { onClick() }
        }
    }

    private fun switchRow(
        title: String,
        summary: String?,
        checked: Boolean,
        onRowClick: (() -> Unit)? = null,
        onChange: (Boolean) -> Unit,
    ) {
        val switch = SwitchCompat(this).apply {
            isChecked = checked
            val states = arrayOf(intArrayOf(android.R.attr.state_checked), intArrayOf())
            thumbTintList = ColorStateList(states, intArrayOf(0xFFFFFFFF.toInt(), 0xFFB0B0B0.toInt()))
            trackTintList = ColorStateList(states, intArrayOf(BLUE, 0xFF5A5A5E.toInt()))
            setOnCheckedChangeListener { view, on ->
                pendingSwitch = view as SwitchCompat
                onChange(on)
            }
        }
        val row = rowContainer(onRowClick ?: { switch.toggle() })
        row.addView(texts(title, summary, SUMMARY), LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f))
        if (onRowClick != null) {
            row.addView(View(this).apply { setBackgroundColor(DIVIDER) }, LinearLayout.LayoutParams(1, dp(28)).apply {
                marginStart = dp(12)
                marginEnd = dp(12)
            })
        }
        row.addView(switch)
        currentCard?.addView(row)
    }

    private fun valueRow(title: String, value: String, onClick: () -> Unit) {
        val row = rowContainer(onClick)
        row.addView(texts(title, value, BLUE), LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f))
        currentCard?.addView(row)
    }

    private fun infoRow(title: String, value: String) {
        val row = rowContainer(null)
        row.addView(texts(title, value, SUMMARY), LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f))
        currentCard?.addView(row)
    }

    private fun plainRow(title: String, onClick: () -> Unit) {
        val row = rowContainer(onClick)
        row.addView(texts(title, null, SUMMARY), LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f))
        currentCard?.addView(row)
    }

    // --- Dialogos -----------------------------------------------------------------------------

    private fun choose(title: String, options: List<String>, checked: Int, onPick: (Int) -> Unit) {
        AlertDialog.Builder(this)
            .setTitle(title)
            .setSingleChoiceItems(options.toTypedArray(), checked) { dialog, which ->
                dialog.dismiss()
                onPick(which)
            }
            .setNegativeButton("Cancelar", null)
            .show()
    }

    private fun editText(title: String, value: String, onSave: (String) -> Unit) {
        val input = EditText(this).apply {
            setText(value)
            inputType = InputType.TYPE_CLASS_TEXT
            setSingleLine()
        }
        val box = LinearLayout(this).apply {
            setPadding(dp(24), dp(8), dp(24), 0)
            addView(input, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT))
        }
        AlertDialog.Builder(this)
            .setTitle(title)
            .setView(box)
            .setPositiveButton("Salvar") { _, _ ->
                // Nome de pasta simples: sem barras nem caracteres especiais.
                val clean = input.text.toString().trim().replace(Regex("[^\\p{L}\\p{N} _-]"), "")
                onSave(clean.ifBlank { "Foto" })
            }
            .setNegativeButton("Cancelar", null)
            .show()
    }

    private fun watermarkSummary(): String {
        val parts = listOfNotNull(
            settings.watermarkText.takeIf { it.isNotBlank() },
            "data".takeIf { settings.watermarkDate },
            "hora".takeIf { settings.watermarkTime },
            "modelo".takeIf { settings.watermarkModel },
        )
        return if (parts.isEmpty()) "Nada selecionado" else parts.joinToString(", ")
    }

    private fun editWatermark() {
        val box = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(24), dp(8), dp(24), 0)
        }
        val name = EditText(this).apply {
            hint = "Nome personalizado (opcional)"
            setText(settings.watermarkText)
            setSingleLine()
        }
        box.addView(name)
        val options = arrayOf("Data", "Hora", "Modelo do aparelho")
        val checked = booleanArrayOf(settings.watermarkDate, settings.watermarkTime, settings.watermarkModel)
        val checks = options.mapIndexed { i, label ->
            androidx.appcompat.widget.AppCompatCheckBox(this).apply {
                text = label
                isChecked = checked[i]
            }
        }
        checks.forEach { box.addView(it) }
        AlertDialog.Builder(this)
            .setTitle("Marca d'água")
            .setView(box)
            .setPositiveButton("Salvar") { _, _ ->
                settings.watermarkText = name.text.toString().trim()
                settings.watermarkDate = checks[0].isChecked
                settings.watermarkTime = checks[1].isChecked
                settings.watermarkModel = checks[2].isChecked
                build()
            }
            .setNegativeButton("Cancelar", null)
            .show()
    }

    private fun keepSummary(): String {
        val parts = listOfNotNull("modo da câmera".takeIf { settings.keepMode }, "filtros".takeIf { settings.keepFilter })
        return if (parts.isEmpty()) "Nada" else parts.joinToString(", ").replaceFirstChar { it.uppercase() }
    }

    private fun editKeep() {
        val labels = arrayOf("Modo da câmera", "Filtros")
        val checked = booleanArrayOf(settings.keepMode, settings.keepFilter)
        AlertDialog.Builder(this)
            .setTitle("Configurações a serem mantidas")
            .setMultiChoiceItems(labels, checked) { _, which, on ->
                if (which == 0) settings.keepMode = on else settings.keepFilter = on
            }
            .setPositiveButton("OK") { _, _ -> build() }
            .show()
    }

    private fun showDiagnostics() {
        val text = if (cameraInfos.isEmpty()) {
            "Nenhuma câmera disponível."
        } else {
            cameraInfos.mapIndexed { i, info ->
                val c = CameraCapabilities(info)
                val name = if (c.isFront) "Câmera frontal" else "Câmera traseira ${i + 1}"
                val qualities = supportedQualities(info).joinToString { qualityLabel(it) }
                c.describe(name) + "Vídeo: ${qualities.ifEmpty { "-" }}\n"
            }.joinToString("\n") +
                "\nMacro liberada para apps: " + (CameraCapabilities.findMacroCameraId(this, null)?.let { "sim (id $it)" } ?: "não")
        }
        val view = TextView(this).apply {
            this.text = text
            setTextIsSelectable(true)
            textSize = 13f
            setPadding(dp(24), dp(12), dp(24), dp(12))
        }
        AlertDialog.Builder(this)
            .setTitle("Diagnóstico da câmera")
            .setView(ScrollView(this).apply { addView(view) })
            .setPositiveButton("OK", null)
            .show()
    }

    private fun showAbout() {
        val info = packageManager.getPackageInfo(packageName, 0)
        AlertDialog.Builder(this)
            .setTitle("Sobre a Câmera")
            .setMessage(
                "Foto ${info.versionName} (build ${PackageInfoCompat.getLongVersionCode(info)})\n\n" +
                    "Câmera feita com CameraX e ML Kit. Tudo é processado no aparelho; " +
                    "nada é enviado para a internet, exceto a verificação de atualizações.\n\n" +
                    "Aparelho: ${Build.MANUFACTURER} ${Build.MODEL} · Android ${Build.VERSION.RELEASE}",
            )
            .setPositiveButton("OK", null)
            .show()
    }

    private fun supportedQualities(info: CameraInfo): List<Quality> = try {
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
        Quality.UHD -> "UHD 4K (3840×2160)"
        Quality.FHD -> "FHD (1920×1080)"
        Quality.HD -> "HD (1280×720)"
        Quality.SD -> "SD (720×480)"
        else -> "?"
    }

    private fun hasPermission(permission: String) =
        ContextCompat.checkSelfPermission(this, permission) == PackageManager.PERMISSION_GRANTED

    private fun toast(text: String) = android.widget.Toast.makeText(this, text, android.widget.Toast.LENGTH_SHORT).show()

    companion object {
        private val BG = 0xFF000000.toInt()
        private val CARD = 0xFF1E1E1E.toInt()
        private val DIVIDER = 0xFF2E2E30.toInt()
        private val TEXT = 0xFFF2F2F2.toInt()
        private val SUMMARY = 0xFF9A9A9E.toInt()
        private val SECTION = 0xFFA0A0A4.toInt()
        private val BLUE = 0xFF8AB4F8.toInt()
    }
}
