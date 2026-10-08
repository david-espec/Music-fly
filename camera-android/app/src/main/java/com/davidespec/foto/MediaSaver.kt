package com.davidespec.foto

import android.annotation.SuppressLint
import android.content.ContentValues
import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Matrix
import android.graphics.Rect
import android.location.Location
import android.location.LocationListener
import android.location.LocationManager
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.os.Looper
import android.os.StatFs
import android.provider.MediaStore
import androidx.exifinterface.media.ExifInterface
import java.io.ByteArrayInputStream
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import kotlin.math.max

/** Gravacao de fotos na galeria (MediaStore), com EXIF, e utilitarios de arquivo. */
object MediaSaver {

    /** Fotos processadas saem com no maximo isto de pixels, para caber na memoria. */
    const val MAX_PROCESSED_PIXELS = 12_600_000L

    fun timestamp(prefix: String): String =
        SimpleDateFormat("'${prefix}_'yyyyMMdd_HHmmss_SSS", Locale.US).format(Date())

    /** Destino especial: a pasta da camera do celular (album "Camera" da Galeria). */
    const val CAMERA_ROLL = "camera"

    fun photoPath(folder: String) =
        if (folder == CAMERA_ROLL) "${Environment.DIRECTORY_DCIM}/Camera/"
        else "${Environment.DIRECTORY_PICTURES}/${folder.ifBlank { "Foto" }}/"

    fun videoPath(folder: String) =
        if (folder == CAMERA_ROLL) "${Environment.DIRECTORY_DCIM}/Camera/"
        else "${Environment.DIRECTORY_MOVIES}/${folder.ifBlank { "Foto" }}/"

    fun photoValues(name: String, folder: String, mime: String = "image/jpeg") = ContentValues().apply {
        put(MediaStore.MediaColumns.DISPLAY_NAME, name)
        put(MediaStore.MediaColumns.MIME_TYPE, mime)
        // Data da foto: a Galeria ordena por ela.
        put(MediaStore.Images.ImageColumns.DATE_TAKEN, System.currentTimeMillis())
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            put(MediaStore.MediaColumns.RELATIVE_PATH, photoPath(folder))
        }
    }

    fun videoValues(name: String, folder: String) = ContentValues().apply {
        put(MediaStore.MediaColumns.DISPLAY_NAME, name)
        put(MediaStore.MediaColumns.MIME_TYPE, "video/mp4")
        put(MediaStore.Video.VideoColumns.DATE_TAKEN, System.currentTimeMillis())
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            put(MediaStore.MediaColumns.RELATIVE_PATH, videoPath(folder))
        }
    }

    /** Espaco livre no armazenamento principal, em bytes. */
    fun freeBytes(): Long = try {
        StatFs(Environment.getExternalStorageDirectory().path).availableBytes
    } catch (error: Exception) {
        Long.MAX_VALUE
    }

    /**
     * Le um JPEG em memoria ja na orientacao certa, recortado como o visor e,
     * se pedido, espelhado. Fotos muito grandes sao lidas reduzidas.
     */
    fun decodeJpeg(bytes: ByteArray, rotation: Int, crop: Rect?, mirror: Boolean, maxPixels: Long = MAX_PROCESSED_PIXELS): Bitmap {
        val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        BitmapFactory.decodeByteArray(bytes, 0, bytes.size, bounds)
        var sample = 1
        while (bounds.outWidth.toLong() / sample * (bounds.outHeight / sample) > maxPixels) sample *= 2
        val decoded = BitmapFactory.decodeByteArray(
            bytes, 0, bytes.size,
            BitmapFactory.Options().apply {
                inSampleSize = sample
                inPreferredConfig = Bitmap.Config.ARGB_8888
                inMutable = true
            },
        ) ?: throw IllegalStateException("Nao foi possivel decodificar a foto")

        var bitmap = decoded
        if (crop != null && (crop.width() < bounds.outWidth || crop.height() < bounds.outHeight)) {
            val r = Rect(crop.left / sample, crop.top / sample, crop.right / sample, crop.bottom / sample)
            r.intersect(0, 0, bitmap.width, bitmap.height)
            if (r.width() > 0 && r.height() > 0) {
                bitmap = Bitmap.createBitmap(bitmap, r.left, r.top, r.width(), r.height())
            }
        }
        if (rotation != 0 || mirror) {
            val matrix = Matrix().apply {
                postRotate(rotation.toFloat())
                if (mirror) postScale(-1f, 1f)
            }
            val rotated = Bitmap.createBitmap(bitmap, 0, 0, bitmap.width, bitmap.height, matrix, true)
            if (rotated !== bitmap) bitmap.recycle()
            bitmap = rotated
        }
        return bitmap
    }

    fun exifOf(bytes: ByteArray): ExifInterface? = try {
        ExifInterface(ByteArrayInputStream(bytes))
    } catch (error: Exception) {
        null
    }

    private val copiedTags = listOf(
        ExifInterface.TAG_DATETIME,
        ExifInterface.TAG_DATETIME_ORIGINAL,
        ExifInterface.TAG_DATETIME_DIGITIZED,
        ExifInterface.TAG_SUBSEC_TIME,
        ExifInterface.TAG_OFFSET_TIME,
        ExifInterface.TAG_MAKE,
        ExifInterface.TAG_MODEL,
        ExifInterface.TAG_PHOTOGRAPHIC_SENSITIVITY,
        ExifInterface.TAG_EXPOSURE_TIME,
        ExifInterface.TAG_F_NUMBER,
        ExifInterface.TAG_APERTURE_VALUE,
        ExifInterface.TAG_FOCAL_LENGTH,
        ExifInterface.TAG_FOCAL_LENGTH_IN_35MM_FILM,
        ExifInterface.TAG_WHITE_BALANCE,
        ExifInterface.TAG_FLASH,
        ExifInterface.TAG_EXPOSURE_BIAS_VALUE,
        ExifInterface.TAG_EXPOSURE_PROGRAM,
        ExifInterface.TAG_METERING_MODE,
        ExifInterface.TAG_LENS_MODEL,
    )

    /**
     * Salva um bitmap como JPEG na galeria, copiando o EXIF da captura original
     * (data, camera, ISO, exposicao...) e, se autorizado, a localizacao.
     */
    fun saveBitmap(
        context: Context,
        bitmap: Bitmap,
        quality: Int,
        folder: String,
        source: ExifInterface?,
        location: Location?,
        prefix: String = "IMG",
    ): Uri? {
        val resolver = context.contentResolver
        val values = photoValues(timestamp(prefix), folder)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) values.put(MediaStore.MediaColumns.IS_PENDING, 1)
        val uri = resolver.insert(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, values) ?: return null
        try {
            resolver.openOutputStream(uri)?.use { bitmap.compress(Bitmap.CompressFormat.JPEG, quality, it) }
                ?: throw IllegalStateException("Sem acesso ao arquivo")
            resolver.openFileDescriptor(uri, "rw")?.use { pfd ->
                val exif = ExifInterface(pfd.fileDescriptor)
                source?.let { src -> copiedTags.forEach { tag -> src.getAttribute(tag)?.let { exif.setAttribute(tag, it) } } }
                if (source?.getAttribute(ExifInterface.TAG_DATETIME) == null) {
                    val now = SimpleDateFormat("yyyy:MM:dd HH:mm:ss", Locale.US).format(Date())
                    exif.setAttribute(ExifInterface.TAG_DATETIME, now)
                    exif.setAttribute(ExifInterface.TAG_DATETIME_ORIGINAL, now)
                }
                if (exif.getAttribute(ExifInterface.TAG_MAKE) == null) exif.setAttribute(ExifInterface.TAG_MAKE, Build.MANUFACTURER)
                if (exif.getAttribute(ExifInterface.TAG_MODEL) == null) exif.setAttribute(ExifInterface.TAG_MODEL, Build.MODEL)
                exif.setAttribute(ExifInterface.TAG_ORIENTATION, ExifInterface.ORIENTATION_NORMAL.toString())
                exif.setAttribute(ExifInterface.TAG_IMAGE_WIDTH, bitmap.width.toString())
                exif.setAttribute(ExifInterface.TAG_IMAGE_LENGTH, bitmap.height.toString())
                exif.setAttribute(ExifInterface.TAG_SOFTWARE, "Foto")
                location?.let { exif.setGpsInfo(it) }
                exif.saveAttributes()
            }
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                resolver.update(uri, ContentValues().apply { put(MediaStore.MediaColumns.IS_PENDING, 0) }, null, null)
            }
            return uri
        } catch (error: Exception) {
            resolver.delete(uri, null, null)
            throw error
        }
    }

    /** Le uma imagem da galeria reduzida para caber em [maxPixels], na orientacao certa. */
    fun loadBitmap(context: Context, uri: Uri, maxPixels: Long): Bitmap? {
        val resolver = context.contentResolver
        val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        // Com inJustDecodeBounds o decode sempre devolve null: so o tamanho
        // em [bounds] interessa aqui.
        resolver.openInputStream(uri)?.use { BitmapFactory.decodeStream(it, null, bounds) }
        if (bounds.outWidth <= 0 || bounds.outHeight <= 0) return null
        var sample = 1
        while (bounds.outWidth.toLong() / sample * (bounds.outHeight / sample) > maxPixels) sample *= 2
        val bitmap = resolver.openInputStream(uri)?.use {
            BitmapFactory.decodeStream(it, null, BitmapFactory.Options().apply { inSampleSize = sample })
        } ?: return null
        val orientation = try {
            resolver.openInputStream(uri)?.use { ExifInterface(it).rotationDegrees } ?: 0
        } catch (error: Exception) {
            0
        }
        if (orientation == 0) return bitmap
        val rotated = Bitmap.createBitmap(bitmap, 0, 0, bitmap.width, bitmap.height, Matrix().apply { postRotate(orientation.toFloat()) }, true)
        if (rotated !== bitmap) bitmap.recycle()
        return rotated
    }

    fun readExif(context: Context, uri: Uri): ExifInterface? = try {
        context.contentResolver.openInputStream(uri)?.use { ExifInterface(it) }
    } catch (error: Exception) {
        null
    }

    fun longSide(bitmap: Bitmap) = max(bitmap.width, bitmap.height)
}

/**
 * Ultima localizacao conhecida, so enquanto a opcao "Marcas de localizacao"
 * esta ligada e a permissao foi concedida.
 */
class LocationTracker(context: Context) : LocationListener {
    private val manager = context.getSystemService(Context.LOCATION_SERVICE) as LocationManager
    var last: Location? = null
        private set
    private var running = false

    @SuppressLint("MissingPermission")
    fun start() {
        if (running) return
        running = true
        try {
            listOf(LocationManager.GPS_PROVIDER, LocationManager.NETWORK_PROVIDER, LocationManager.PASSIVE_PROVIDER)
                .filter { manager.isProviderEnabled(it) }
                .forEach { provider ->
                    manager.getLastKnownLocation(provider)?.let { if (better(it)) last = it }
                    manager.requestLocationUpdates(provider, 30_000L, 25f, this, Looper.getMainLooper())
                }
        } catch (error: SecurityException) {
            running = false
        }
    }

    fun stop() {
        if (!running) return
        running = false
        manager.removeUpdates(this)
    }

    private fun better(candidate: Location): Boolean {
        val current = last ?: return true
        return candidate.time > current.time || candidate.accuracy < current.accuracy
    }

    override fun onLocationChanged(location: Location) {
        if (better(location)) last = location
    }

    @Deprecated("Deprecated in Java")
    override fun onStatusChanged(provider: String?, status: Int, extras: android.os.Bundle?) = Unit
    override fun onProviderEnabled(provider: String) = Unit
    override fun onProviderDisabled(provider: String) = Unit
}
