package com.davidespec.foto

import android.app.RecoverableSecurityException
import android.content.ContentUris
import android.content.Intent
import android.content.res.ColorStateList
import android.graphics.Typeface
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.provider.MediaStore
import android.view.GestureDetector
import android.view.Gravity
import android.view.MotionEvent
import android.view.View
import android.view.ViewGroup
import android.widget.FrameLayout
import android.widget.ImageButton
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.MediaController
import android.widget.TextView
import android.widget.Toast
import android.widget.VideoView
import androidx.activity.result.IntentSenderRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.updatePadding
import androidx.exifinterface.media.ExifInterface
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.concurrent.Executors
import kotlin.math.abs

/** Mostra a ultima captura e as anteriores do app, com as acoes de sempre. */
class ViewerActivity : AppCompatActivity() {

    private data class Item(val uri: Uri, val video: Boolean, val date: Long, val name: String, val size: Long)

    private lateinit var settings: CameraSettings
    private lateinit var image: ImageView
    private lateinit var video: VideoView
    private lateinit var title: TextView
    private lateinit var editButton: View
    private val io = Executors.newSingleThreadExecutor()
    private val main = Handler(Looper.getMainLooper())
    private var items: List<Item> = emptyList()
    private var index = 0
    private var current: Uri? = null

    private val deleteLauncher =
        registerForActivityResult(ActivityResultContracts.StartIntentSenderForResult()) { result ->
            if (result.resultCode == RESULT_OK) afterDelete()
        }

    private val editLauncher =
        registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { result ->
            result.data?.data?.let { reload(it) }
        }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        WindowCompat.setDecorFitsSystemWindows(window, false)
        settings = CameraSettings(this)
        setResult(RESULT_OK)

        val rootView = FrameLayout(this).apply { setBackgroundColor(0xFF000000.toInt()) }
        image = ImageView(this).apply { scaleType = ImageView.ScaleType.FIT_CENTER }
        video = VideoView(this).apply { visibility = View.GONE }
        rootView.addView(image, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
        rootView.addView(video, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT, Gravity.CENTER))

        val top = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            setBackgroundColor(0x66000000)
            setPadding(dp(8), dp(8), dp(16), dp(8))
        }
        top.addView(iconButton(R.drawable.ic_back, "Voltar") { finish() })
        title = TextView(this).apply {
            setTextColor(0xFFFFFFFF.toInt())
            textSize = 15f
            setPadding(dp(8), 0, 0, 0)
        }
        top.addView(title)
        rootView.addView(top, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT, Gravity.TOP))

        val bottom = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER
            setBackgroundColor(0x66000000)
            setPadding(dp(8), dp(10), dp(8), dp(10))
        }
        editButton = action(R.drawable.ic_edit, "Editar") { edit() }
        bottom.addView(editButton)
        bottom.addView(action(R.drawable.ic_share, "Compartilhar") { share() })
        bottom.addView(action(R.drawable.ic_delete, "Excluir") { confirmDelete() })
        bottom.addView(action(R.drawable.ic_gallery, "Galeria") { openInGallery() })
        bottom.addView(action(R.drawable.ic_info, "Info") { showInfo() })
        rootView.addView(bottom, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT, Gravity.BOTTOM))

        ViewCompat.setOnApplyWindowInsetsListener(rootView) { _, insets ->
            val bars = insets.getInsets(WindowInsetsCompat.Type.systemBars())
            top.updatePadding(top = bars.top + dp(8))
            bottom.updatePadding(bottom = bars.bottom + dp(10))
            insets
        }
        setContentView(rootView)

        // Deslizar para os lados passa para a foto anterior/seguinte.
        val gestures = GestureDetector(this, object : GestureDetector.SimpleOnGestureListener() {
            override fun onDown(e: MotionEvent) = true
            override fun onFling(e1: MotionEvent?, e2: MotionEvent, velocityX: Float, velocityY: Float): Boolean {
                val start = e1 ?: return false
                val dx = e2.x - start.x
                if (abs(dx) < dp(80) || abs(dx) < abs(e2.y - start.y)) return false
                show(index + if (dx < 0) 1 else -1)
                return true
            }
        })
        image.setOnTouchListener { v, event ->
            gestures.onTouchEvent(event)
            if (event.actionMasked == MotionEvent.ACTION_UP) v.performClick()
            true
        }

        intent.data?.let { reload(it) } ?: finish()
    }

    override fun onDestroy() {
        super.onDestroy()
        io.shutdown()
    }

    private fun dp(v: Int) = (v * resources.displayMetrics.density).toInt()

    private fun iconButton(icon: Int, description: String, onClick: () -> Unit) = ImageButton(this).apply {
        setImageResource(icon)
        imageTintList = ColorStateList.valueOf(0xFFFFFFFF.toInt())
        background = null
        contentDescription = description
        setOnClickListener { onClick() }
        layoutParams = LinearLayout.LayoutParams(dp(44), dp(44))
    }

    private fun action(icon: Int, label: String, onClick: () -> Unit): View {
        val box = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER
            isClickable = true
            setOnClickListener { onClick() }
            contentDescription = label
            layoutParams = LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f)
        }
        box.addView(ImageView(this).apply {
            setImageResource(icon)
            imageTintList = ColorStateList.valueOf(0xFFFFFFFF.toInt())
        })
        box.addView(TextView(this).apply {
            text = label
            setTextColor(0xFFFFFFFF.toInt())
            textSize = 12f
            typeface = Typeface.DEFAULT_BOLD
            gravity = Gravity.CENTER
        })
        return box
    }

    /** Lista as fotos e videos das pastas do app e abre em [focus]. */
    private fun reload(focus: Uri) {
        io.execute {
            val list = queryItems()
            val found = list.indexOfFirst { it.uri == focus }
            val finalList = if (found >= 0) list else listOf(Item(focus, isVideo(focus), System.currentTimeMillis(), "", 0)) + list
            main.post {
                items = finalList
                show(if (found >= 0) found else 0)
            }
        }
    }

    private fun isVideo(uri: Uri) = contentResolver.getType(uri)?.startsWith("video") == true

    private fun queryItems(): List<Item> {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) return emptyList()
        val result = mutableListOf<Item>()
        fun query(collection: Uri, folder: String, video: Boolean) {
            try {
                contentResolver.query(
                    collection,
                    arrayOf(MediaStore.MediaColumns._ID, MediaStore.MediaColumns.DATE_ADDED, MediaStore.MediaColumns.DISPLAY_NAME, MediaStore.MediaColumns.SIZE),
                    "${MediaStore.MediaColumns.RELATIVE_PATH} LIKE ?",
                    arrayOf("$folder%"),
                    null,
                )?.use { c ->
                    while (c.moveToNext()) {
                        result += Item(ContentUris.withAppendedId(collection, c.getLong(0)), video, c.getLong(1), c.getString(2) ?: "", c.getLong(3))
                    }
                }
            } catch (error: Exception) {
                // Sem acesso: mostra so o item aberto.
            }
        }
        query(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, MediaSaver.photoPath(settings.photoTarget), false)
        query(MediaStore.Video.Media.EXTERNAL_CONTENT_URI, MediaSaver.videoPath(settings.videoTarget), true)
        return result.sortedByDescending { it.date }
    }

    private fun show(position: Int) {
        if (items.isEmpty()) {
            finish()
            return
        }
        index = position.coerceIn(0, items.lastIndex)
        val item = items[index]
        current = item.uri
        title.text = buildString {
            if (item.date > 0) append(SimpleDateFormat("dd 'de' MMM, HH:mm", Locale("pt", "BR")).format(Date(item.date * 1000)))
            if (items.size > 1) append("   ${index + 1}/${items.size}")
        }
        editButton.visibility = if (item.video) View.GONE else View.VISIBLE
        if (item.video) {
            image.visibility = View.GONE
            video.visibility = View.VISIBLE
            video.setMediaController(MediaController(this).also { it.setAnchorView(video) })
            video.setVideoURI(item.uri)
            video.start()
        } else {
            video.stopPlayback()
            video.visibility = View.GONE
            image.visibility = View.VISIBLE
            val maxPixels = resources.displayMetrics.widthPixels.toLong() * resources.displayMetrics.heightPixels * 2
            io.execute {
                val bitmap = try {
                    MediaSaver.loadBitmap(this, item.uri, maxPixels)
                } catch (error: Exception) {
                    null
                }
                main.post { if (current == item.uri) image.setImageBitmap(bitmap) }
            }
        }
    }

    private fun edit() {
        val uri = current ?: return
        editLauncher.launch(Intent(this, EditorActivity::class.java).setData(uri))
    }

    private fun share() {
        val uri = current ?: return
        val send = Intent(Intent.ACTION_SEND).apply {
            type = contentResolver.getType(uri) ?: "image/jpeg"
            putExtra(Intent.EXTRA_STREAM, uri)
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        }
        startActivity(Intent.createChooser(send, "Compartilhar"))
    }

    private fun openInGallery() {
        val uri = current ?: return
        try {
            startActivity(Intent(Intent.ACTION_VIEW).apply {
                setDataAndType(uri, contentResolver.getType(uri) ?: "image/*")
                addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            })
        } catch (error: Exception) {
            toast("Nenhum app de galeria encontrado.")
        }
    }

    private fun confirmDelete() {
        val uri = current ?: return
        AlertDialog.Builder(this)
            .setTitle("Excluir?")
            .setMessage("O arquivo será apagado do aparelho.")
            .setPositiveButton("Excluir") { _, _ -> delete(uri) }
            .setNegativeButton("Cancelar", null)
            .show()
    }

    private fun delete(uri: Uri) {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                // Android 11+: o sistema confirma quando o arquivo nao e do app.
                try {
                    if (contentResolver.delete(uri, null, null) > 0) {
                        afterDelete()
                        return
                    }
                } catch (error: SecurityException) {
                    // Cai no pedido de confirmacao abaixo.
                }
                val request = MediaStore.createDeleteRequest(contentResolver, listOf(uri))
                deleteLauncher.launch(IntentSenderRequest.Builder(request.intentSender).build())
            } else {
                contentResolver.delete(uri, null, null)
                afterDelete()
            }
        } catch (error: SecurityException) {
            if (Build.VERSION.SDK_INT == Build.VERSION_CODES.Q && error is RecoverableSecurityException) {
                deleteLauncher.launch(IntentSenderRequest.Builder(error.userAction.actionIntent.intentSender).build())
            } else {
                toast("Sem permissão para excluir este arquivo.")
            }
        }
    }

    private fun afterDelete() {
        toast("Excluído.")
        val removed = current
        items = items.filter { it.uri != removed }
        if (items.isEmpty()) finish() else show(index)
    }

    private fun showInfo() {
        val item = items.getOrNull(index) ?: return
        io.execute {
            val lines = mutableListOf<String>()
            if (item.name.isNotEmpty()) lines += "Nome: ${item.name}"
            if (item.size > 0) lines += "Tamanho: ${"%.1f".format(item.size / 1024.0 / 1024.0)} MB"
            if (!item.video) {
                MediaSaver.readExif(this, item.uri)?.let { exif ->
                    val w = exif.getAttribute(ExifInterface.TAG_IMAGE_WIDTH) ?: exif.getAttribute(ExifInterface.TAG_PIXEL_X_DIMENSION)
                    val h = exif.getAttribute(ExifInterface.TAG_IMAGE_LENGTH) ?: exif.getAttribute(ExifInterface.TAG_PIXEL_Y_DIMENSION)
                    if (w != null && h != null) lines += "Resolução: $w × $h"
                    exif.getAttribute(ExifInterface.TAG_DATETIME_ORIGINAL)?.let { lines += "Data: $it" }
                    val camera = listOfNotNull(exif.getAttribute(ExifInterface.TAG_MAKE), exif.getAttribute(ExifInterface.TAG_MODEL)).joinToString(" ")
                    if (camera.isNotBlank()) lines += "Câmera: $camera"
                    exif.getAttribute(ExifInterface.TAG_PHOTOGRAPHIC_SENSITIVITY)?.let { lines += "ISO: $it" }
                    exif.getAttributeDouble(ExifInterface.TAG_EXPOSURE_TIME, 0.0).takeIf { it > 0 }?.let {
                        lines += "Exposição: " + if (it >= 0.3) "%.1f s".format(it) else "1/${Math.round(1 / it)} s"
                    }
                    exif.getAttributeDouble(ExifInterface.TAG_F_NUMBER, 0.0).takeIf { it > 0 }?.let { lines += "Abertura: f/%.1f".format(it) }
                    exif.getAttributeDouble(ExifInterface.TAG_FOCAL_LENGTH, 0.0).takeIf { it > 0 }?.let { lines += "Distância focal: %.1f mm".format(it) }
                    exif.getAttribute(ExifInterface.TAG_WHITE_BALANCE)?.let { lines += "Balanço de branco: " + if (it == "0") "automático" else "manual" }
                    exif.latLong?.let { lines += "Local: %.5f, %.5f".format(it[0], it[1]) }
                }
            }
            main.post {
                AlertDialog.Builder(this)
                    .setTitle("Informações")
                    .setMessage(lines.joinToString("\n").ifEmpty { "Sem informações." })
                    .setPositiveButton("OK", null)
                    .show()
            }
        }
    }

    private fun toast(text: String) = Toast.makeText(this, text, Toast.LENGTH_SHORT).show()
}
