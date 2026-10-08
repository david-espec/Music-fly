package com.davidespec.foto

import android.content.Context
import android.graphics.Bitmap
import android.graphics.ColorMatrixColorFilter
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.view.Gravity
import android.view.ViewGroup
import android.widget.HorizontalScrollView
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.TextView
import kotlin.math.min

/**
 * Faixa de filtros com miniaturas: cada quadradinho mostra a imagem real
 * (o visor da camera ou a foto em edicao) ja com o filtro aplicado, como nos
 * apps de camera dos celulares. A cor de cada miniatura vem da mesma
 * ColorMatrix usada na foto final.
 */
object FilterStrip {

    private const val THUMB_DP = 64

    fun create(
        context: Context,
        source: Bitmap?,
        selectedId: String,
        onPick: (Filters.Filter) -> Unit,
    ): HorizontalScrollView {
        val density = context.resources.displayMetrics.density
        fun dp(v: Int) = (v * density).toInt()

        val thumb = if (source != null) squareThumb(source, dp(THUMB_DP) * 2) else sample(context)
        val row = LinearLayout(context).apply {
            orientation = LinearLayout.HORIZONTAL
            setPadding(dp(4), dp(2), dp(4), dp(2))
        }
        var selectedTile: LinearLayout? = null
        var groupRow: LinearLayout? = null
        var currentCategory = ""

        Filters.all.forEach { filter ->
            // Cada categoria vira um bloco com o nome em cima das miniaturas.
            if (filter.category != currentCategory) {
                currentCategory = filter.category
                val group = LinearLayout(context).apply {
                    orientation = LinearLayout.VERTICAL
                    setPadding(0, 0, dp(10), 0)
                }
                group.addView(TextView(context).apply {
                    text = filter.category.uppercase()
                    setShadowLayer(4f, 0f, 1f, 0xCC000000.toInt())
                    textSize = 10f
                    letterSpacing = 0.08f
                    setTextColor(0x99FFFFFF.toInt())
                    typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
                    setPadding(dp(2), 0, 0, dp(4))
                })
                val tiles = LinearLayout(context).apply { orientation = LinearLayout.HORIZONTAL }
                group.addView(tiles)
                row.addView(group)
                groupRow = tiles
            }
            val selected = filter.id == selectedId
            val tile = LinearLayout(context).apply {
                orientation = LinearLayout.VERTICAL
                gravity = Gravity.CENTER_HORIZONTAL
                layoutParams = LinearLayout.LayoutParams(dp(THUMB_DP + 10), ViewGroup.LayoutParams.WRAP_CONTENT).apply {
                    marginEnd = dp(4)
                }
                isClickable = true
                contentDescription = "Filtro ${filter.name}"
                setOnClickListener { onPick(filter) }
            }
            val image = ImageView(context).apply {
                setImageBitmap(thumb)
                scaleType = ImageView.ScaleType.CENTER_CROP
                colorFilter = ColorMatrixColorFilter(filter.matrix(1f))
                // Cantos arredondados de verdade (recorta a imagem).
                background = GradientDrawable().apply {
                    cornerRadius = dp(14).toFloat()
                    setColor(0xFF222222.toInt())
                }
                clipToOutline = true
                // Moldura amarela no filtro escolhido.
                foreground = GradientDrawable().apply {
                    cornerRadius = dp(14).toFloat()
                    setStroke(if (selected) dp(3) else dp(1), if (selected) 0xFFFFD60A.toInt() else 0x33FFFFFF)
                }
                layoutParams = LinearLayout.LayoutParams(dp(THUMB_DP), dp(THUMB_DP))
            }
            val label = TextView(context).apply {
                setShadowLayer(4f, 0f, 1f, 0xCC000000.toInt())
                text = filter.name
                textSize = 11f
                maxLines = 1
                gravity = Gravity.CENTER
                setTextColor(if (selected) 0xFFFFD60A.toInt() else 0xE6FFFFFF.toInt())
                typeface = Typeface.create(Typeface.DEFAULT, if (selected) Typeface.BOLD else Typeface.NORMAL)
                setPadding(0, dp(5), 0, 0)
            }
            tile.addView(image)
            tile.addView(label)
            groupRow?.addView(tile)
            if (selected) selectedTile = tile
        }

        return HorizontalScrollView(context).apply {
            isHorizontalScrollBarEnabled = false
            addView(row)
            layoutParams = LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT).apply {
                bottomMargin = dp(6)
            }
            // Deixa o filtro escolhido a vista, centralizado se possivel.
            post {
                selectedTile?.let { tile ->
                    // Posicao da miniatura dentro da faixa inteira (tile esta dentro do grupo).
                    val group = tile.parent?.parent as? android.view.View
                    val left = tile.left + (group?.left ?: 0)
                    scrollTo((left - (width - tile.width) / 2).coerceAtLeast(0), 0)
                }
            }
        }
    }

    private var cachedSample: Bitmap? = null

    /**
     * Foto fixa de exemplo escolhida pelo dono do app (cachoeira entre pedras
     * com musgo): o azul da agua e o verde do musgo mostram bem a diferenca
     * entre os filtros.
     */
    private fun sample(context: Context): Bitmap =
        cachedSample ?: android.graphics.BitmapFactory.decodeResource(context.resources, R.drawable.filter_sample)
            .also { cachedSample = it }

    /** Recorte quadrado central, reduzido para a miniatura. */
    fun squareThumb(source: Bitmap, size: Int): Bitmap {
        val side = min(source.width, source.height)
        val x = (source.width - side) / 2
        val y = (source.height - side) / 2
        val square = Bitmap.createBitmap(source, x, y, side, side)
        return if (side == size) square else Bitmap.createScaledBitmap(square, size, size, true)
    }
}
