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

    class Filter(
        val id: String,
        val name: String,
        val category: String,
        private val build: () -> ColorMatrix,
    ) {
        /** Matriz na intensidade pedida (0..1): 0 = original, 1 = filtro completo. */
        fun matrix(intensity: Float): ColorMatrix = mix(ColorMatrix(), build(), intensity)
    }

    private const val BASIC = "Básicos"
    private const val VIVID = "Vívidos"
    private const val SOCIAL = "Redes sociais"
    private const val CINEMA = "Cinema"
    private const val MONO = "P&B"

    // Os ids antigos foram mantidos: a escolha salva continua valendo.
    val all: List<Filter> = listOf(
        Filter("original", "Original", BASIC) { ColorMatrix() },
        Filter("natural", "Natural", BASIC) { chain(contrast(1.05f), saturation(1.08f)) },
        Filter("quente", "Quente", BASIC) { chain(temperature(0.35f), saturation(1.05f)) },
        Filter("frio", "Frio", BASIC) { chain(temperature(-0.35f), saturation(0.95f)) },
        Filter("leve", "Leve", BASIC) { chain(brightness(14f), contrast(0.94f), saturation(0.92f)) },

        // Estilos de camera de celular: cores fortes, versoes quente e fria.
        Filter("vivo", "Vívido", VIVID) { chain(saturation(1.45f), contrast(1.12f)) },
        Filter("vivido_quente", "Vívido quente", VIVID) { chain(saturation(1.4f), contrast(1.1f), temperature(0.3f)) },
        Filter("vivido_frio", "Vívido frio", VIVID) { chain(saturation(1.4f), contrast(1.1f), temperature(-0.3f)) },
        Filter("drama", "Dramático", VIVID) { chain(contrast(1.4f), saturation(0.85f), brightness(-12f)) },
        Filter("drama_quente", "Dramático quente", VIVID) { chain(contrast(1.35f), saturation(0.9f), brightness(-10f), temperature(0.35f)) },
        Filter("drama_frio", "Dramático frio", VIVID) { chain(contrast(1.35f), saturation(0.85f), brightness(-10f), temperature(-0.35f)) },

        // Estilos populares nas redes: contraste com sombras frias, pastel, verao...
        Filter("brilhante", "Brilhante", SOCIAL) { chain(contrast(1.2f), saturation(1.3f), offset(-4f, 0f, 8f)) },
        Filter("pastel", "Pastel", SOCIAL) { chain(lift(28f), saturation(0.8f), contrast(0.9f), offset(6f, 2f, 6f)) },
        Filter("verao", "Verão", SOCIAL) { chain(sepia(0.18f), temperature(0.25f), lift(14f), saturation(1.12f)) },
        Filter("tropical", "Tropical", SOCIAL) { chain(saturation(1.35f), scale(0.98f, 1.08f, 1.04f), contrast(1.06f)) },
        Filter("rosado", "Rosado", SOCIAL) { chain(lift(20f), contrast(0.92f), saturation(0.9f), scale(1.06f, 0.96f, 1.02f)) },
        Filter("suave", "Suave", SOCIAL) { chain(lift(22f), contrast(0.88f), saturation(0.85f), scale(1.03f, 1.02f, 0.94f)) },
        Filter("fade", "Fade", SOCIAL) { chain(contrast(0.8f), lift(30f), saturation(0.9f)) },
        Filter("dourado", "Hora dourada", SOCIAL) { chain(scale(1.12f, 1.04f, 0.78f), saturation(1.1f)) },
        Filter("por_do_sol", "Pôr do sol", SOCIAL) { chain(scale(1.16f, 0.95f, 0.82f), saturation(1.2f), offset(8f, 0f, 6f)) },
        Filter("nordico", "Nórdico", SOCIAL) { chain(temperature(-0.25f), saturation(0.7f), brightness(10f), contrast(1.05f)) },

        // Cinema: tons de filme e looks de clipe.
        Filter("cinema", "Cinema", CINEMA) { chain(saturation(0.82f), contrast(1.18f), offset(-6f, 0f, 10f)) },
        Filter("teal_orange", "Teal & Orange", CINEMA) { chain(contrast(1.15f), scale(1.12f, 0.98f, 0.9f), offset(-10f, 2f, 14f), saturation(1.1f)) },
        Filter("filme", "Filme", CINEMA) { chain(lift(12f), temperature(0.15f), saturation(1.05f), contrast(1.04f)) },
        Filter("moody", "Moody", CINEMA) { chain(saturation(0.65f), brightness(-14f), contrast(1.12f), offset(-2f, 0f, 8f)) },
        Filter("cyberpunk", "Cyberpunk", CINEMA) { chain(scale(1.12f, 0.82f, 1.22f), contrast(1.2f), saturation(1.25f)) },
        Filter("anos70", "Anos 70", CINEMA) { chain(sepia(0.4f), temperature(0.3f), lift(20f), contrast(0.92f)) },
        Filter("vintage", "Vintage", CINEMA) { chain(sepia(0.55f), contrast(0.9f), lift(18f)) },
        Filter("retro", "Retrô", CINEMA) { chain(saturation(0.75f), scale(1.08f, 1.02f, 0.85f), lift(12f), contrast(0.95f)) },
        Filter("noite", "Noite", CINEMA) { chain(scale(0.85f, 0.92f, 1.12f), saturation(0.7f), brightness(-8f)) },

        // Preto e branco.
        Filter("pb", "Mono", MONO) { chain(saturation(0f), contrast(1.25f)) },
        Filter("prata", "Prata", MONO) { chain(saturation(0f), lift(16f), contrast(1.05f), scale(0.97f, 0.99f, 1.04f)) },
        Filter("noir", "Noir", MONO) { chain(saturation(0f), contrast(1.6f), brightness(-14f)) },
        Filter("cinza", "Cinza", MONO) { saturation(0f) },
    )

    /** Ajuste usado no visor para a melhoria automatica (a foto recebe a versao completa). */
    fun enhancePreview(): ColorMatrix = chain(contrast(1.06f), saturation(1.12f))

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
