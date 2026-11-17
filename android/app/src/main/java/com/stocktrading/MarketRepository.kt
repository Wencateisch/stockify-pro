package com.stocktrading

import android.content.Context
import android.os.Handler
import android.os.Looper
import android.util.Log
import io.socket.client.IO
import io.socket.client.Socket
import org.json.JSONObject
import java.util.Locale

enum class FeedMode { CONNECTING, LIVE, DEMO }

/**
 * Provides a quote stream to the UI.
 *
 * The built-in demo feed always runs so the app is usable offline. If a backend
 * URL is configured (via the status chip in the UI, or the
 * `stockifyServerUrl` Gradle property at build time), a Socket.IO connection is
 * opened and its `marketData` events are preferred whenever they arrive.
 */
class MarketRepository(context: Context) {

    companion object {
        private const val TAG = "MarketRepository"
        private const val PREFS = "stockify_prefs"
        private const val KEY_SERVER = "server_url"
        private const val REMOTE_FRESH_MS = 5_000L
        private const val TICK_MS = 1_000L
    }

    private val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
    private val mainHandler = Handler(Looper.getMainLooper())
    private val demoFeed = DemoMarketFeed()

    private var socket: Socket? = null
    private var listener: ((List<Stock>, FeedMode) -> Unit)? = null
    private var running = false
    private var lastRemoteAt = 0L
    private var lastRemoteStocks: List<Stock> = emptyList()

    val serverUrl: String
        get() = prefs.getString(KEY_SERVER, BuildConfig.DEFAULT_SERVER_URL).orEmpty().trim()

    fun setServerUrl(url: String) {
        prefs.edit().putString(KEY_SERVER, url.trim()).apply()
    }

    /** Starts (or restarts) streaming. The listener is invoked on the main thread. */
    fun start(listener: (List<Stock>, FeedMode) -> Unit) {
        stop()
        this.listener = listener
        running = true
        demoFeed.reset()

        if (serverUrl.isEmpty()) {
            listener(demoFeed.nextSnapshot(), FeedMode.DEMO)
        } else {
            listener(demoFeed.nextSnapshot(), FeedMode.CONNECTING)
            connectRemote()
        }
        mainHandler.postDelayed(ticker, TICK_MS)
    }

    fun stop() {
        running = false
        mainHandler.removeCallbacks(ticker)
        disconnectRemote()
        listener = null
    }

    private val ticker = object : Runnable {
        override fun run() {
            if (!running) return
            val now = System.currentTimeMillis()
            val remoteIsFresh = now - lastRemoteAt < REMOTE_FRESH_MS && lastRemoteStocks.isNotEmpty()

            val stocks = if (remoteIsFresh) lastRemoteStocks else demoFeed.nextSnapshot()
            val mode = when {
                remoteIsFresh -> FeedMode.LIVE
                serverUrl.isNotEmpty() && socket?.connected() == true -> FeedMode.CONNECTING
                else -> FeedMode.DEMO
            }

            listener?.invoke(stocks, mode)
            mainHandler.postDelayed(this, TICK_MS)
        }
    }

    private fun connectRemote() {
        val url = serverUrl
        if (url.isEmpty()) return

        try {
            val options = IO.Options().apply {
                transports = arrayOf("websocket")
                reconnection = true
                reconnectionDelay = 2_000L
                timeout = 6_000L
            }
            val client = IO.socket(url, options)
            socket = client

            client.on(Socket.EVENT_CONNECT) {
                Log.i(TAG, "Connected to $url")
            }
            client.on(Socket.EVENT_CONNECT_ERROR) { args ->
                Log.w(TAG, "Connection failed: ${args.firstOrNull()}")
            }
            client.on("marketData") { args ->
                val payload = args.firstOrNull() as? JSONObject ?: return@on
                val stocks = parseMarket(payload)
                if (stocks.isEmpty()) return@on
                mainHandler.post {
                    lastRemoteAt = System.currentTimeMillis()
                    lastRemoteStocks = stocks
                }
            }
            client.connect()
        } catch (error: Exception) {
            Log.e(TAG, "Unable to open socket", error)
            socket = null
        }
    }

    private fun disconnectRemote() {
        socket?.let { client ->
            client.disconnect()
        }
        socket = null
    }

    private fun parseMarket(root: JSONObject): List<Stock> {
        val array = root.optJSONArray("indicators") ?: return emptyList()
        val stocks = ArrayList<Stock>(array.length())
        for (index in 0 until array.length()) {
            val item = array.optJSONObject(index) ?: continue
            val symbol = item.optString("symbol").uppercase(Locale.US)
            if (symbol.isEmpty()) continue
            val price = item.optDouble("price", Double.NaN)
            if (price.isNaN()) continue

            stocks.add(
                Stock(
                    symbol = symbol,
                    name = DemoMarketFeed.displayName(symbol),
                    price = price,
                    change = item.optDouble("change", 0.0),
                    percentChange = item.optDouble("percentChange", 0.0),
                    volume = item.optLong("volume", 0L),
                    high = item.optDouble("high", price),
                    low = item.optDouble("low", price),
                    open = item.optDouble("open", price),
                    prevClose = item.optDouble("prevClose", price)
                )
            )
        }
        return stocks
    }
}
