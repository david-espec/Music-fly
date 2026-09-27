package com.davidespec.foto

import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.pm.PackageInstaller
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.provider.Settings
import android.util.Log
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.IntentCompat
import androidx.core.content.pm.PackageInfoCompat
import org.json.JSONObject
import java.io.File
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.Executors

/**
 * Atualizacao automatica a partir da Release do GitHub.
 *
 * Ao abrir o app, confere o version.json publicado junto com o APK. Se houver
 * versao nova, baixa em segundo plano. Depois:
 *  - Android 12+ com o proprio Foto como instalador (a partir da segunda
 *    atualizacao): instala sozinho quando o app sai da tela, sem perguntar.
 *  - Nos demais casos o Android exige uma confirmacao: o app mostra um aviso
 *    e a tela padrao do sistema pede um toque.
 */
class Updater(private val activity: AppCompatActivity) {

    private val context = activity.applicationContext
    private val prefs = context.getSharedPreferences("foto", Context.MODE_PRIVATE)
    private val io = Executors.newSingleThreadExecutor()
    private val main = Handler(Looper.getMainLooper())

    private var readyFile: File? = null
    private var readyName = ""
    private var askedThisSession = false
    private var installing = false

    var enabled: Boolean
        get() = prefs.getBoolean("autoUpdate", true)
        set(value) = prefs.edit().putBoolean("autoUpdate", value).apply()

    private fun currentVersion(): Long {
        val info = context.packageManager.getPackageInfo(context.packageName, 0)
        return PackageInfoCompat.getLongVersionCode(info)
    }

    /** Procura versao nova e baixa, sem travar a tela. */
    fun check() {
        if (!enabled) return
        io.execute {
            try {
                val json = JSONObject(fetchText(VERSION_URL))
                val remote = json.getLong("versionCode")
                val current = currentVersion()
                cleanOld(keep = remote)
                if (remote <= current) return@execute

                val file = File(context.cacheDir, "update-$remote.apk")
                if (!isValidApk(file, remote)) {
                    val partial = File(context.cacheDir, "update-$remote.part")
                    download(APK_URL, partial)
                    partial.renameTo(file)
                }
                if (!isValidApk(file, remote)) {
                    file.delete()
                    return@execute
                }
                val name = json.optString("versionName", "")
                main.post {
                    readyFile = file
                    readyName = name
                    offer()
                }
            } catch (error: Exception) {
                Log.w(TAG, "Nao foi possivel procurar atualizacao", error)
            }
        }
    }

    /** Chamado no onResume: volta das configuracoes de "instalar apps desconhecidos". */
    fun onResume() {
        if (readyFile != null && !canSilentUpdate()) offer()
    }

    /** Chamado no onStop: a atualizacao silenciosa acontece com o app fora da tela. */
    fun onStop() {
        val file = readyFile ?: return
        if (canSilentUpdate() && !installing) install(file)
    }

    private fun offer() {
        val file = readyFile ?: return
        if (installing || askedThisSession || activity.isFinishing || canSilentUpdate()) return
        askedThisSession = true

        val version = if (readyName.isNotEmpty()) " $readyName" else ""
        if (!context.packageManager.canRequestPackageInstalls()) {
            AlertDialog.Builder(activity)
                .setTitle("Nova versão$version")
                .setMessage(
                    "Para o Foto se atualizar sozinho, o Android pede uma permissão só uma vez: " +
                        "ative \"Permitir desta fonte\" na próxima tela e volte ao app.",
                )
                .setPositiveButton("Permitir") { _, _ ->
                    askedThisSession = false
                    activity.startActivity(
                        Intent(
                            Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                            Uri.parse("package:${context.packageName}"),
                        ),
                    )
                }
                .setNegativeButton("Depois", null)
                .show()
            return
        }

        AlertDialog.Builder(activity)
            .setTitle("Nova versão$version")
            .setMessage("A atualização já foi baixada. Instalar agora?")
            .setPositiveButton("Atualizar") { _, _ -> install(file) }
            .setNegativeButton("Depois", null)
            .show()
    }

    /**
     * Sem pergunta so quando o Android permite: 12 ou mais novo, permissao de
     * instalar concedida e o proprio Foto registrado como instalador.
     */
    private fun canSilentUpdate(): Boolean {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) return false
        if (!context.packageManager.canRequestPackageInstalls()) return false
        return try {
            context.packageManager.getInstallSourceInfo(context.packageName).installingPackageName ==
                context.packageName
        } catch (error: Exception) {
            false
        }
    }

    private fun install(file: File) {
        installing = true
        io.execute {
            try {
                val installer = context.packageManager.packageInstaller
                val params = PackageInstaller.SessionParams(PackageInstaller.SessionParams.MODE_FULL_INSTALL).apply {
                    setAppPackageName(context.packageName)
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                        setRequireUserAction(PackageInstaller.SessionParams.USER_ACTION_NOT_REQUIRED)
                    }
                }
                val sessionId = installer.createSession(params)
                installer.openSession(sessionId).use { session ->
                    session.openWrite("foto.apk", 0, file.length()).use { out ->
                        file.inputStream().use { it.copyTo(out) }
                        session.fsync(out)
                    }
                    val flags = PendingIntent.FLAG_UPDATE_CURRENT or
                        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) PendingIntent.FLAG_MUTABLE else 0
                    val callback = PendingIntent.getBroadcast(
                        context,
                        sessionId,
                        Intent(context, UpdateReceiver::class.java),
                        flags,
                    )
                    session.commit(callback.intentSender)
                }
            } catch (error: Exception) {
                Log.e(TAG, "Falha ao instalar a atualizacao", error)
                main.post { installing = false }
            }
        }
    }

    private fun isValidApk(file: File, versionCode: Long): Boolean {
        if (!file.exists() || file.length() == 0L) return false
        val info = context.packageManager.getPackageArchiveInfo(file.path, 0) ?: return false
        return info.packageName == context.packageName &&
            PackageInfoCompat.getLongVersionCode(info) == versionCode
    }

    private fun cleanOld(keep: Long) {
        context.cacheDir.listFiles()
            ?.filter { it.name.startsWith("update-") && !it.name.startsWith("update-$keep.") }
            ?.forEach { it.delete() }
    }

    private fun open(url: String): HttpURLConnection {
        val connection = URL(url).openConnection() as HttpURLConnection
        connection.connectTimeout = 15_000
        connection.readTimeout = 30_000
        connection.instanceFollowRedirects = true
        connection.setRequestProperty("Cache-Control", "no-cache")
        if (connection.responseCode !in 200..299) {
            throw IllegalStateException("HTTP ${connection.responseCode} em $url")
        }
        return connection
    }

    private fun fetchText(url: String): String =
        open("$url?t=${System.currentTimeMillis()}").inputStream.bufferedReader().use { it.readText() }

    private fun download(url: String, target: File) {
        open(url).inputStream.use { input -> target.outputStream().use { input.copyTo(it) } }
    }

    companion object {
        private const val TAG = "FotoUpdate"
        private const val BASE = "https://github.com/david-espec/Music-fly/releases/download/foto-camera"
        private const val VERSION_URL = "$BASE/version.json"
        private const val APK_URL = "$BASE/Foto.apk"
    }
}

/** Recebe o resultado da instalacao; abre a confirmacao do sistema quando ela e exigida. */
class UpdateReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        when (val status = intent.getIntExtra(PackageInstaller.EXTRA_STATUS, -1)) {
            PackageInstaller.STATUS_PENDING_USER_ACTION -> {
                val confirm = IntentCompat.getParcelableExtra(intent, Intent.EXTRA_INTENT, Intent::class.java)
                    ?: return
                confirm.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                try {
                    context.startActivity(confirm)
                } catch (error: Exception) {
                    Log.w("FotoUpdate", "Confirmacao bloqueada", error)
                }
            }
            PackageInstaller.STATUS_SUCCESS -> Unit
            else -> Log.w(
                "FotoUpdate",
                "Instalacao terminou com status $status: ${intent.getStringExtra(PackageInstaller.EXTRA_STATUS_MESSAGE)}",
            )
        }
    }
}
