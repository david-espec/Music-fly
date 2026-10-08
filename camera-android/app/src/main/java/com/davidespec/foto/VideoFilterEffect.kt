package com.davidespec.foto

import android.graphics.ColorMatrix
import android.graphics.SurfaceTexture
import android.opengl.EGL14
import android.opengl.EGLConfig
import android.opengl.EGLContext
import android.opengl.EGLDisplay
import android.opengl.EGLExt
import android.opengl.EGLSurface
import android.opengl.GLES11Ext
import android.opengl.GLES20
import android.os.Handler
import android.os.HandlerThread
import android.util.Log
import android.view.Surface
import androidx.camera.core.CameraEffect
import androidx.camera.core.SurfaceOutput
import androidx.camera.core.SurfaceProcessor
import androidx.camera.core.SurfaceRequest
import androidx.core.util.Consumer
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.nio.FloatBuffer
import java.util.concurrent.Executor

/**
 * Filtro de cor em tempo real para o video. O CameraX entrega cada quadro da
 * camera numa textura; aqui um shader OpenGL aplica a mesma ColorMatrix dos
 * filtros de foto e desenha o resultado no visor e no gravador. Assim o
 * filtro fica gravado no video, nao so na tela.
 */
class VideoFilterEffect(processor: VideoFilterProcessor) : CameraEffect(
    PREVIEW or VIDEO_CAPTURE,
    processor.executor,
    processor,
    Consumer { error -> Log.e("FotoGL", "Erro no filtro de video", error) },
)

class VideoFilterProcessor : SurfaceProcessor, SurfaceTexture.OnFrameAvailableListener {

    private val thread = HandlerThread("FotoGL").apply { start() }
    private val handler = Handler(thread.looper)
    val executor = Executor { handler.post(it) }

    // Matriz 3x3 (coluna a coluna, como o GLSL espera) e deslocamento RGB.
    @Volatile private var colorMatrix = floatArrayOf(1f, 0f, 0f, 0f, 1f, 0f, 0f, 0f, 1f)
    @Volatile private var colorOffset = floatArrayOf(0f, 0f, 0f)

    private var display: EGLDisplay = EGL14.EGL_NO_DISPLAY
    private var context: EGLContext = EGL14.EGL_NO_CONTEXT
    private var config: EGLConfig? = null
    private var pbuffer: EGLSurface = EGL14.EGL_NO_SURFACE

    private var program = 0
    private var aPosition = 0
    private var aTexCoord = 0
    private var uTexMatrix = 0
    private var uColor = 0
    private var uOffset = 0
    private var uTexture = 0

    private var textureId = 0
    private var input: SurfaceTexture? = null
    private val outputs = LinkedHashMap<SurfaceOutput, EGLSurface>()
    private val texMatrix = FloatArray(16)
    private val outMatrix = FloatArray(16)
    private var released = false

    private val vertices: FloatBuffer = buffer(floatArrayOf(-1f, -1f, 1f, -1f, -1f, 1f, 1f, 1f))
    private val texCoords: FloatBuffer = buffer(floatArrayOf(0f, 0f, 1f, 0f, 0f, 1f, 1f, 1f))

    /** Troca o filtro na hora, inclusive durante a gravacao. */
    fun setMatrix(matrix: ColorMatrix) {
        val a = matrix.array
        val m = FloatArray(9)
        for (row in 0..2) for (col in 0..2) m[col * 3 + row] = a[row * 5 + col]
        colorMatrix = m
        colorOffset = floatArrayOf(a[4] / 255f, a[9] / 255f, a[14] / 255f)
    }

    override fun onInputSurface(request: SurfaceRequest) {
        if (released || !ensureGl()) {
            request.willNotProvideSurface()
            return
        }
        val tex = IntArray(1)
        GLES20.glGenTextures(1, tex, 0)
        GLES20.glBindTexture(GLES11Ext.GL_TEXTURE_EXTERNAL_OES, tex[0])
        GLES20.glTexParameteri(GLES11Ext.GL_TEXTURE_EXTERNAL_OES, GLES20.GL_TEXTURE_MIN_FILTER, GLES20.GL_LINEAR)
        GLES20.glTexParameteri(GLES11Ext.GL_TEXTURE_EXTERNAL_OES, GLES20.GL_TEXTURE_MAG_FILTER, GLES20.GL_LINEAR)
        GLES20.glTexParameteri(GLES11Ext.GL_TEXTURE_EXTERNAL_OES, GLES20.GL_TEXTURE_WRAP_S, GLES20.GL_CLAMP_TO_EDGE)
        GLES20.glTexParameteri(GLES11Ext.GL_TEXTURE_EXTERNAL_OES, GLES20.GL_TEXTURE_WRAP_T, GLES20.GL_CLAMP_TO_EDGE)

        val texture = SurfaceTexture(tex[0])
        texture.setDefaultBufferSize(request.resolution.width, request.resolution.height)
        val surface = Surface(texture)
        textureId = tex[0]
        input = texture
        texture.setOnFrameAvailableListener(this, handler)
        request.provideSurface(surface, executor) {
            texture.setOnFrameAvailableListener(null)
            texture.release()
            surface.release()
            GLES20.glDeleteTextures(1, tex, 0)
            if (input === texture) input = null
        }
    }

    override fun onOutputSurface(output: SurfaceOutput) {
        if (released || !ensureGl()) {
            output.close()
            return
        }
        val surface = output.getSurface(executor) {
            outputs.remove(output)?.let { EGL14.eglDestroySurface(display, it) }
            output.close()
        }
        val eglSurface = EGL14.eglCreateWindowSurface(display, config, surface, intArrayOf(EGL14.EGL_NONE), 0)
        if (eglSurface == null || eglSurface == EGL14.EGL_NO_SURFACE) {
            Log.e("FotoGL", "Nao foi possivel criar a superficie de saida")
            output.close()
            return
        }
        outputs[output] = eglSurface
    }

    override fun onFrameAvailable(texture: SurfaceTexture) {
        if (released || texture !== input) return
        EGL14.eglMakeCurrent(display, pbuffer, pbuffer, context)
        try {
            texture.updateTexImage()
        } catch (error: Exception) {
            return
        }
        texture.getTransformMatrix(texMatrix)
        val timestamp = texture.timestamp
        for ((output, eglSurface) in outputs) {
            if (!EGL14.eglMakeCurrent(display, eglSurface, eglSurface, context)) continue
            // Ajusta recorte, rotacao e espelhamento de cada saida.
            output.updateTransformMatrix(outMatrix, texMatrix)
            GLES20.glViewport(0, 0, output.size.width, output.size.height)
            draw()
            EGLExt.eglPresentationTimeANDROID(display, eglSurface, timestamp)
            EGL14.eglSwapBuffers(display, eglSurface)
        }
    }

    private fun draw() {
        GLES20.glClearColor(0f, 0f, 0f, 1f)
        GLES20.glClear(GLES20.GL_COLOR_BUFFER_BIT)
        GLES20.glUseProgram(program)
        GLES20.glActiveTexture(GLES20.GL_TEXTURE0)
        GLES20.glBindTexture(GLES11Ext.GL_TEXTURE_EXTERNAL_OES, textureId)
        GLES20.glUniform1i(uTexture, 0)
        GLES20.glUniformMatrix4fv(uTexMatrix, 1, false, outMatrix, 0)
        GLES20.glUniformMatrix3fv(uColor, 1, false, colorMatrix, 0)
        GLES20.glUniform3fv(uOffset, 1, colorOffset, 0)
        GLES20.glEnableVertexAttribArray(aPosition)
        GLES20.glVertexAttribPointer(aPosition, 2, GLES20.GL_FLOAT, false, 0, vertices)
        GLES20.glEnableVertexAttribArray(aTexCoord)
        GLES20.glVertexAttribPointer(aTexCoord, 2, GLES20.GL_FLOAT, false, 0, texCoords)
        GLES20.glDrawArrays(GLES20.GL_TRIANGLE_STRIP, 0, 4)
        GLES20.glDisableVertexAttribArray(aPosition)
        GLES20.glDisableVertexAttribArray(aTexCoord)
    }

    /** Cria o contexto OpenGL uma vez, na thread do filtro. */
    private fun ensureGl(): Boolean {
        if (display != EGL14.EGL_NO_DISPLAY) return true
        display = EGL14.eglGetDisplay(EGL14.EGL_DEFAULT_DISPLAY)
        val version = IntArray(2)
        if (!EGL14.eglInitialize(display, version, 0, version, 1)) {
            display = EGL14.EGL_NO_DISPLAY
            return false
        }
        val attributes = intArrayOf(
            EGL14.EGL_RED_SIZE, 8,
            EGL14.EGL_GREEN_SIZE, 8,
            EGL14.EGL_BLUE_SIZE, 8,
            EGL14.EGL_ALPHA_SIZE, 8,
            EGL14.EGL_RENDERABLE_TYPE, EGL14.EGL_OPENGL_ES2_BIT,
            EGL_RECORDABLE_ANDROID, 1,
            EGL14.EGL_SURFACE_TYPE, EGL14.EGL_WINDOW_BIT or EGL14.EGL_PBUFFER_BIT,
            EGL14.EGL_NONE,
        )
        val configs = arrayOfNulls<EGLConfig>(1)
        val count = IntArray(1)
        if (!EGL14.eglChooseConfig(display, attributes, 0, configs, 0, 1, count, 0) || count[0] == 0) {
            Log.e("FotoGL", "Sem configuracao EGL compativel")
            return false
        }
        config = configs[0]
        context = EGL14.eglCreateContext(display, config, EGL14.EGL_NO_CONTEXT, intArrayOf(EGL14.EGL_CONTEXT_CLIENT_VERSION, 2, EGL14.EGL_NONE), 0)
        pbuffer = EGL14.eglCreatePbufferSurface(display, config, intArrayOf(EGL14.EGL_WIDTH, 1, EGL14.EGL_HEIGHT, 1, EGL14.EGL_NONE), 0)
        EGL14.eglMakeCurrent(display, pbuffer, pbuffer, context)

        program = linkProgram(VERTEX_SHADER, FRAGMENT_SHADER)
        aPosition = GLES20.glGetAttribLocation(program, "aPosition")
        aTexCoord = GLES20.glGetAttribLocation(program, "aTexCoord")
        uTexMatrix = GLES20.glGetUniformLocation(program, "uTexMatrix")
        uColor = GLES20.glGetUniformLocation(program, "uColor")
        uOffset = GLES20.glGetUniformLocation(program, "uOffset")
        uTexture = GLES20.glGetUniformLocation(program, "sTexture")
        return program != 0
    }

    /** Solta tudo; chamar uma vez quando a tela da camera for destruida. */
    fun release() {
        handler.post {
            released = true
            outputs.forEach { (output, surface) ->
                EGL14.eglDestroySurface(display, surface)
                output.close()
            }
            outputs.clear()
            input?.release()
            input = null
            if (display != EGL14.EGL_NO_DISPLAY) {
                EGL14.eglMakeCurrent(display, EGL14.EGL_NO_SURFACE, EGL14.EGL_NO_SURFACE, EGL14.EGL_NO_CONTEXT)
                if (program != 0) GLES20.glDeleteProgram(program)
                EGL14.eglDestroySurface(display, pbuffer)
                EGL14.eglDestroyContext(display, context)
                EGL14.eglTerminate(display)
                display = EGL14.EGL_NO_DISPLAY
            }
            thread.quitSafely()
        }
    }

    private fun linkProgram(vertexSource: String, fragmentSource: String): Int {
        val vertex = compile(GLES20.GL_VERTEX_SHADER, vertexSource)
        val fragment = compile(GLES20.GL_FRAGMENT_SHADER, fragmentSource)
        if (vertex == 0 || fragment == 0) return 0
        val program = GLES20.glCreateProgram()
        GLES20.glAttachShader(program, vertex)
        GLES20.glAttachShader(program, fragment)
        GLES20.glLinkProgram(program)
        val status = IntArray(1)
        GLES20.glGetProgramiv(program, GLES20.GL_LINK_STATUS, status, 0)
        if (status[0] == 0) {
            Log.e("FotoGL", "Falha ao ligar o shader: " + GLES20.glGetProgramInfoLog(program))
            GLES20.glDeleteProgram(program)
            return 0
        }
        return program
    }

    private fun compile(type: Int, source: String): Int {
        val shader = GLES20.glCreateShader(type)
        GLES20.glShaderSource(shader, source)
        GLES20.glCompileShader(shader)
        val status = IntArray(1)
        GLES20.glGetShaderiv(shader, GLES20.GL_COMPILE_STATUS, status, 0)
        if (status[0] == 0) {
            Log.e("FotoGL", "Falha ao compilar o shader: " + GLES20.glGetShaderInfoLog(shader))
            GLES20.glDeleteShader(shader)
            return 0
        }
        return shader
    }

    companion object {
        /** Superficie gravavel pelo MediaCodec (constante do EGL do Android). */
        private const val EGL_RECORDABLE_ANDROID = 0x3142

        private const val VERTEX_SHADER = """
            attribute vec4 aPosition;
            attribute vec4 aTexCoord;
            uniform mat4 uTexMatrix;
            varying vec2 vTexCoord;
            void main() {
                gl_Position = aPosition;
                vTexCoord = (uTexMatrix * aTexCoord).xy;
            }
        """

        private const val FRAGMENT_SHADER = """
            #extension GL_OES_EGL_image_external : require
            precision mediump float;
            uniform samplerExternalOES sTexture;
            uniform mat3 uColor;
            uniform vec3 uOffset;
            varying vec2 vTexCoord;
            void main() {
                vec4 c = texture2D(sTexture, vTexCoord);
                vec3 rgb = uColor * c.rgb + uOffset;
                gl_FragColor = vec4(clamp(rgb, 0.0, 1.0), 1.0);
            }
        """

        private fun buffer(data: FloatArray): FloatBuffer =
            ByteBuffer.allocateDirect(data.size * 4).order(ByteOrder.nativeOrder()).asFloatBuffer().apply {
                put(data)
                position(0)
            }
    }
}
