package com.davidespec.foto

import android.content.Context
import android.content.SharedPreferences
import kotlin.properties.ReadWriteProperty
import kotlin.reflect.KProperty

/**
 * Todas as preferencias do app num lugar so. As chaves antigas ("lens",
 * "flash", "timer", "aspect", "sound", "mirror", "grid"...) foram mantidas
 * para quem atualiza nao perder o que ja tinha escolhido.
 */
class CameraSettings(context: Context) {

    val prefs: SharedPreferences = context.getSharedPreferences("foto", Context.MODE_PRIVATE)

    // --- Captura --------------------------------------------------------------
    var lens by int("lens", 1) // CameraSelector.LENS_FACING_BACK
    var flash by int("flash", 2) // ImageCapture.FLASH_MODE_OFF
    var timer by int("timer", 0)
    var aspect by string("aspect", "R3_4")
    /** "max" ou "LARGURAxALTURA" por formato do sensor: chave photoSize_43 / photoSize_169. */
    fun photoSize(source43: Boolean): String = prefs.getString(if (source43) "photoSize_43" else "photoSize_169", "max") ?: "max"
    fun setPhotoSize(source43: Boolean, value: String) =
        prefs.edit().putString(if (source43) "photoSize_43" else "photoSize_169", value).apply()
    var jpegQuality by int("jpegQuality", 100)
    var hdr by boolean("hdr", false)
    var burstOnHold by boolean("burst", true)
    var shutterSound by boolean("sound", true)
    var vibration by boolean("vibration", true)
    /** "photo" = tira foto, "zoom" = zoom, "system" = volume do sistema. */
    var volumeAction by string("volumeAction", "photo")

    // --- Selfie ---------------------------------------------------------------
    var mirrorSelfies by boolean("mirror", true)
    var swipeToSwitch by boolean("swipeSwitch", true)
    var screenFlash by boolean("screenFlash", true)

    // --- Composicao -------------------------------------------------------------
    var grid by boolean("grid", false)
    /** "3x3" ou "4x4". */
    var gridType by string("gridType", "3x3")
    var centerGuide by boolean("centerGuide", false)
    var level by boolean("level", false)
    var histogram by boolean("histogram", false)
    var qrCodes by boolean("qr", true)

    // --- Video ----------------------------------------------------------------
    /** Nome da qualidade do CameraX: "UHD", "FHD", "HD", "SD". */
    var videoQuality by string("videoQuality", "FHD")
    var videoFps by int("videoFps", 30)
    var microphone by boolean("mic", true)

    // --- Efeitos ----------------------------------------------------------------
    var filter by string("filter", "original")
    var filterIntensity by int("filterIntensity", 100)
    var portraitBlur by int("portraitBlur", 60)
    var foodIntensity by int("foodIntensity", 50)
    /** -1 frio, 0 neutro, 1 quente. */
    var foodTone by int("foodTone", 1)
    var beautySmooth by int("beautySmooth", 0)
    var beautyBright by int("beautyBright", 0)
    var beautyEyes by int("beautyEyes", 0)
    var beautyFace by int("beautyFace", 0)
    var beautyTeeth by int("beautyTeeth", 0)
    var beautyContour by int("beautyContour", 0)

    // --- Marca d'agua e localizacao -----------------------------------------------
    var watermark by boolean("watermark", false)
    var watermarkText by string("watermarkText", "")
    var watermarkDate by boolean("watermarkDate", true)
    var watermarkTime by boolean("watermarkTime", true)
    var watermarkModel by boolean("watermarkModel", true)
    var location by boolean("location", false)

    // --- Armazenamento -------------------------------------------------------------
    var photoFolder by string("photoFolder", "Foto")
    var videoFolder by string("videoFolder", "Foto")
    /** Salvar junto com as fotos do celular (DCIM/Camera), no album Camera da Galeria. */
    var saveToCameraRoll by boolean("cameraRoll", true)

    /** Destinos usados pelo MediaSaver. */
    val photoTarget get() = if (saveToCameraRoll) MediaSaver.CAMERA_ROLL else photoFolder
    val videoTarget get() = if (saveToCameraRoll) MediaSaver.CAMERA_ROLL else videoFolder

    // --- Configuracoes a manter ------------------------------------------------------
    var keepMode by boolean("keepMode", false)
    var keepFilter by boolean("keepFilter", true)
    var lastMode by string("lastMode", "PHOTO")

    val beautyActive: Boolean
        get() = beautySmooth + beautyBright + beautyEyes + beautyFace + beautyTeeth + beautyContour > 0

    /** Volta tudo ao padrao, mantendo apenas o que nao e escolha de camera. */
    fun reset() {
        val keep = listOf("askedPermission", "autoUpdate")
        val saved = keep.associateWith { prefs.all[it] }
        prefs.edit().clear().apply()
        val editor = prefs.edit()
        saved.forEach { (key, value) -> if (value is Boolean) editor.putBoolean(key, value) }
        editor.apply()
    }

    private fun boolean(key: String, default: Boolean) = object : ReadWriteProperty<CameraSettings, Boolean> {
        override fun getValue(thisRef: CameraSettings, property: KProperty<*>) = prefs.getBoolean(key, default)
        override fun setValue(thisRef: CameraSettings, property: KProperty<*>, value: Boolean) =
            prefs.edit().putBoolean(key, value).apply()
    }

    private fun int(key: String, default: Int) = object : ReadWriteProperty<CameraSettings, Int> {
        override fun getValue(thisRef: CameraSettings, property: KProperty<*>) = prefs.getInt(key, default)
        override fun setValue(thisRef: CameraSettings, property: KProperty<*>, value: Int) =
            prefs.edit().putInt(key, value).apply()
    }

    private fun string(key: String, default: String) = object : ReadWriteProperty<CameraSettings, String> {
        override fun getValue(thisRef: CameraSettings, property: KProperty<*>) = prefs.getString(key, default) ?: default
        override fun setValue(thisRef: CameraSettings, property: KProperty<*>, value: String) =
            prefs.edit().putString(key, value).apply()
    }
}
