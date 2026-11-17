package com.stocktrading

import java.text.NumberFormat
import java.util.Locale
import kotlin.math.round

/**
 * A single market quote shown in the watchlist.
 */
data class Stock(
    val symbol: String,
    val name: String,
    val price: Double,
    val change: Double,
    val percentChange: Double,
    val volume: Long,
    val high: Double,
    val low: Double,
    val open: Double,
    val prevClose: Double
)

/**
 * Formatters for Indian market conventions (lakh / crore abbreviations).
 */
object Fmt {
    private val priceFormat: NumberFormat =
        NumberFormat.getNumberInstance(Locale("en", "IN")).apply {
            minimumFractionDigits = 2
            maximumFractionDigits = 2
            isGroupingUsed = true
        }

    fun price(value: Double): String = "\u20b9" + priceFormat.format(value)

    fun percent(value: Double): String {
        val sign = if (value >= 0) "+" else ""
        return sign + String.format(Locale.US, "%.2f", value) + "%"
    }

    fun volume(value: Long): String = when {
        value >= 10_000_000L -> String.format(Locale.US, "%.2f Cr", value / 10_000_000.0)
        value >= 100_000L -> String.format(Locale.US, "%.2f L", value / 100_000.0)
        value >= 1_000L -> String.format(Locale.US, "%.1f K", value / 1_000.0)
        else -> value.toString()
    }
}

/**
 * Offline simulation of the NSE/BSE quote feed. It keeps a random walk per
 * symbol so the app is useful without any backend running.
 */
class DemoMarketFeed {

    private data class Instrument(val symbol: String, val name: String, val basePrice: Double)

    private class State(
        val prevClose: Double,
        val open: Double,
        var price: Double,
        var high: Double,
        var low: Double,
        var volume: Long
    )

    private val instruments = listOf(
        Instrument("NIFTY50", "NIFTY 50", 22000.00),
        Instrument("BANKNIFTY", "Bank Nifty", 48000.00),
        Instrument("SENSEX", "SENSEX", 73000.00),
        Instrument("TCS", "Tata Consultancy Services", 3800.00),
        Instrument("RELIANCE", "Reliance Industries", 2800.00),
        Instrument("HDFCBANK", "HDFC Bank", 1650.00),
        Instrument("INFY", "Infosys", 1600.00),
        Instrument("WIPRO", "Wipro", 480.00),
        Instrument("ICICIBANK", "ICICI Bank", 1200.00),
        Instrument("HUL", "Hindustan Unilever", 2300.00),
        Instrument("SUNPHARMA", "Sun Pharma", 1100.00),
        Instrument("ITC", "ITC", 450.00),
        Instrument("LT", "Larsen & Toubro", 3200.00)
    )

    private val states = HashMap<String, State>()
    private val random = java.util.Random()

    init {
        reset()
    }

    fun reset() {
        states.clear()
        instruments.forEach { instrument ->
            val open = round2(instrument.basePrice * (1 + (random.nextDouble() - 0.5) * 0.006))
            states[instrument.symbol] = State(
                prevClose = instrument.basePrice,
                open = open,
                price = open,
                high = open,
                low = open,
                volume = random.nextInt(800_000).toLong()
            )
        }
    }

    /** Produces one tick for every tracked symbol. */
    fun nextSnapshot(): List<Stock> = instruments.map { instrument ->
        val state = states.getValue(instrument.symbol)
        val drift = (random.nextDouble() - 0.5) * 0.0045 // up to ~0.22% per tick
        state.price = (state.price * (1 + drift))
            .coerceIn(state.prevClose * 0.94, state.prevClose * 1.06)
        if (state.price > state.high) state.high = state.price
        if (state.price < state.low) state.low = state.price
        state.volume += 20_000L + random.nextInt(380_000).toLong()

        val change = state.price - state.prevClose
        Stock(
            symbol = instrument.symbol,
            name = instrument.name,
            price = round2(state.price),
            change = round2(change),
            percentChange = round2(change / state.prevClose * 100.0),
            volume = state.volume,
            high = round2(state.high),
            low = round2(state.low),
            open = round2(state.open),
            prevClose = round2(state.prevClose)
        )
    }

    companion object {
        private val names = mapOf(
            "NIFTY50" to "NIFTY 50",
            "NIFTY_50" to "NIFTY 50",
            "BANKNIFTY" to "Bank Nifty",
            "SENSEX" to "SENSEX",
            "SENSITIVE" to "SENSEX",
            "TCS" to "Tata Consultancy Services",
            "RELIANCE" to "Reliance Industries",
            "HDFCBANK" to "HDFC Bank",
            "INFY" to "Infosys",
            "WIPRO" to "Wipro",
            "ICICIBANK" to "ICICI Bank",
            "HUL" to "Hindustan Unilever",
            "SUNPHARMA" to "Sun Pharma",
            "ITC" to "ITC",
            "LT" to "Larsen & Toubro"
        )

        fun displayName(symbol: String): String = names[symbol] ?: symbol

        private fun round2(value: Double): Double = round(value * 100.0) / 100.0
    }
}
