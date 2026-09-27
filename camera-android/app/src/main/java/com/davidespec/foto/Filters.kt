package com.davidespec.foto

import android.graphics.ColorMatrix

/**
 * Filtros de cor. Cada um e uma ColorMatrix: a mesma matriz pinta o visor em
 * tempo real (na GPU, pela camada do PreviewView) e e aplicada na foto final,
 * entao o que se ve e o que sai.
 *
 * Para criar um filtro novo basta acrescentar uma entrada em [all].
 */
object Filters {

    class Filter(val id: String, val name: String, private val build: () -> ColorMatrix) {
        /** Matriz na intensidade pedida (0..1): 0 = original, 1 = filtro completo. */
        fun matrix(intensity: Float): ColorMatrix = mix(ColorMatrix(), build(), intensity)
    }

    val all: List<Filter> = listOf(
        Filter("original", "Original") { ColorMatrix() },
        Filter("natural", "Natural") { chain(contrast(1.05f), saturation(1.08f)) },
        Filter("vivo", "Vivo") { chain(saturation(1.45f), contrast(1.12f)) },
        Filter("quente", "Quente") { chain(temperature(0.35f), saturation(1.05f)) },
        Filter("frio", "Frio") { chain(temperature(-0.35f), saturation(0.95f)) },
        Filter("vintage", "Vintage") { chain(sepia(0.55f), contrast(0.9f), lift(18f)) },
        Filter("retro", "Retrô") { chain(saturation(0.75f), scale(1.08f, 1.02f, 0.85f), lift(12f), contrast(0.95f)) },
        Filter("cinema", "Cinema") { chain(saturation(0.82f), contrast(1.18f), offset(-6f, 0f, 10f)) },
        Filter("drama", "Drama") { chain(contrast(1.4f), saturation(0.85f), brightness(-12f)) },
        Filter("pb", "Preto e branco") { chain(saturation(0f), contrast(1.25f)) },
        Filter("cinza", "Cinza") { saturation(0f) },
        Filter("fade", "Fade") { chain(contrast(0.8f), lift(30f), saturation(0.9f)) },
        Filter("dourado", "Dourado") { chain(scale(1.12f, 1.04f, 0.78f), saturation(1.1f)) },
        Filter("noite", "Noite") { chain(scale(0.85f, 0.92f, 1.12f), saturation(0.7f), brightness(-8f)) },
        Filter("por_do_sol", "Pôr do sol") { chain(scale(1.16f, 0.95f, 0.82f), saturation(1.2f), offset(8f, 0f, 6f)) },
    )

    fun byId(id: String): Filter = all.firstOrNull { it.id == id } ?: all.first()

    // --- Blocos de montagem -------------------------------------------------------

    fun chain(vararg matrices: ColorMatrix): ColorMatrix {
        val result = ColorMatrix()
        matrices.forEach { result.postConcat(it) }
        return result
    }

    fun saturation(value: Float) = ColorMatrix().apply { setSaturation(value) }

    fun scale(r: Float, g: Float, b: Float) = ColorMatrix().apply { setScale(r, g, b, 1f) }

    fun offset(r: Float, g: Float, b: Float) = ColorMatrix(
        floatArrayOf(
            1f, 0f, 0f, 0f, r,
            0f, 1f, 0f, 0f, g,
            0f, 0f, 1f, 0f, b,
            0f, 0f, 0f, 1f, 0f,
        ),
    )

    fun brightness(value: Float) = offset(value, value, value)

    /** Clareia as sombras sem mexer nas luzes (aspecto "desbotado"). */
    fun lift(value: Float): ColorMatrix {
        val k = (255f - value) / 255f
        return ColorMatrix(
            floatArrayOf(
                k, 0f, 0f, 0f, value,
                0f, k, 0f, 0f, value,
                0f, 0f, k, 0f, value,
                0f, 0f, 0f, 1f, 0f,
            ),
        )
    }

    fun contrast(value: Float): ColorMatrix {
        val t = 128f * (1f - value)
        return ColorMatrix(
            floatArrayOf(
                value, 0f, 0f, 0f, t,
                0f, value, 0f, 0f, t,
                0f, 0f, value, 0f, t,
                0f, 0f, 0f, 1f, 0f,
            ),
        )
    }

    /** Positivo esquenta (mais vermelho, menos azul); negativo esfria. -1..1 */
    fun temperature(value: Float) = scale(1f + value * 0.25f, 1f + value * 0.05f, 1f - value * 0.25f)

    /** Tonalidade das cores medias: puxa para verde (-) ou magenta (+). -1..1 */
    fun tint(value: Float) = scale(1f + value * 0.1f, 1f - value * 0.15f, 1f + value * 0.1f)

    fun exposure(stops: Float): ColorMatrix {
        val k = Math.pow(2.0, stops.toDouble()).toFloat()
        return scale(k, k, k)
    }

    /** Gira o matiz em graus, em torno do eixo de luminancia. */
    fun hue(degrees: Float): ColorMatrix {
        val cos = Math.cos(Math.toRadians(degrees.toDouble())).toFloat()
        val sin = Math.sin(Math.toRadians(degrees.toDouble())).toFloat()
        val lr = 0.213f
        val lg = 0.715f
        val lb = 0.072f
        return ColorMatrix(
            floatArrayOf(
                lr + cos * (1 - lr) - sin * lr, lg - cos * lg - sin * lg, lb - cos * lb + sin * (1 - lb), 0f, 0f,
                lr - cos * lr + sin * 0.143f, lg + cos * (1 - lg) + sin * 0.140f, lb - cos * lb - sin * 0.283f, 0f, 0f,
                lr - cos * lr - sin * (1 - lr), lg - cos * lg + sin * lg, lb + cos * (1 - lb) + sin * lb, 0f, 0f,
                0f, 0f, 0f, 1f, 0f,
            ),
        )
    }

    fun sepia(amount: Float): ColorMatrix {
        val sepia = ColorMatrix(
            floatArrayOf(
                0.393f, 0.769f, 0.189f, 0f, 0f,
                0.349f, 0.686f, 0.168f, 0f, 0f,
                0.272f, 0.534f, 0.131f, 0f, 0f,
                0f, 0f, 0f, 1f, 0f,
            ),
        )
        return mix(ColorMatrix(), sepia, amount)
    }

    /** Interpola duas matrizes: equivale a misturar as duas imagens resultantes. */
    fun mix(a: ColorMatrix, b: ColorMatrix, t: Float): ColorMatrix {
        val x = a.array
        val y = b.array
        val k = t.coerceIn(0f, 1f)
        return ColorMatrix(FloatArray(20) { x[it] + (y[it] - x[it]) * k })
    }

    fun isIdentity(matrix: ColorMatrix): Boolean {
        val identity = ColorMatrix().array
        val m = matrix.array
        return m.indices.all { kotlin.math.abs(m[it] - identity[it]) < 1e-4f }
    }
}
