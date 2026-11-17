package com.stocktrading

import android.os.Bundle
import android.text.InputType
import android.widget.EditText
import android.widget.Toast
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import androidx.recyclerview.widget.LinearLayoutManager
import com.stocktrading.databinding.ActivityMainBinding
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

class MainActivity : AppCompatActivity() {

    private lateinit var binding: ActivityMainBinding
    private lateinit var repository: MarketRepository
    private val adapter = StockAdapter()
    private val timeFormat = SimpleDateFormat("HH:mm:ss", Locale.ENGLISH)

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityMainBinding.inflate(layoutInflater)
        setContentView(binding.root)

        binding.recyclerView.layoutManager = LinearLayoutManager(this)
        binding.recyclerView.adapter = adapter
        // Prevent constant item animations while ticking once per second.
        binding.recyclerView.itemAnimator = null

        repository = MarketRepository(this)
        binding.statusPill.setOnClickListener { showSourceDialog() }
        repository.start(::render)
    }

    private fun render(stocks: List<Stock>, mode: FeedMode) {
        adapter.submit(stocks)

        val gainers = stocks.count { it.change >= 0 }
        binding.symbolCountText.text = stocks.size.toString()
        binding.gainersText.text = gainers.toString()
        binding.losersText.text = (stocks.size - gainers).toString()
        binding.volumeText.text = Fmt.volume(stocks.sumOf { it.volume })
        binding.updatedText.text = "Updated ${timeFormat.format(Date())}"

        applyMode(mode)
    }

    private fun applyMode(mode: FeedMode) {
        when (mode) {
            FeedMode.LIVE -> {
                binding.statusPill.setBackgroundResource(R.drawable.pill_live)
                binding.statusPill.setText(R.string.status_live)
                binding.statusPill.setTextColor(getColor(R.color.accent_green))
            }
            FeedMode.DEMO -> {
                binding.statusPill.setBackgroundResource(R.drawable.pill_demo)
                binding.statusPill.setText(R.string.status_demo)
                binding.statusPill.setTextColor(getColor(R.color.accent_amber))
            }
            FeedMode.CONNECTING -> {
                binding.statusPill.setBackgroundResource(R.drawable.pill_connecting)
                binding.statusPill.setText(R.string.status_connecting)
                binding.statusPill.setTextColor(getColor(R.color.text_secondary))
            }
        }
    }

    private fun showSourceDialog() {
        val input = EditText(this).apply {
            setText(repository.serverUrl)
            hint = "http://192.168.1.20:3001"
            inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_URI
            setSingleLine(true)
            setPadding(48, 32, 48, 32)
        }

        AlertDialog.Builder(this)
            .setTitle("Data source")
            .setMessage(
                "Leave this empty to use the built-in demo feed (works offline).\n\n" +
                    "To use the Node backend, enter its URL. On a phone, use your " +
                    "computer's LAN IP, for example http://192.168.1.20:3001"
            )
            .setView(input)
            .setPositiveButton("Save") { _, _ ->
                repository.setServerUrl(input.text.toString())
                restartFeed()
                toast("Reconnecting\u2026")
            }
            .setNeutralButton("Use demo") { _, _ ->
                repository.setServerUrl("")
                restartFeed()
                toast("Demo feed enabled")
            }
            .setNegativeButton("Cancel", null)
            .show()
    }

    private fun restartFeed() {
        repository.start(::render)
    }

    private fun toast(message: String) {
        Toast.makeText(this, message, Toast.LENGTH_SHORT).show()
    }

    override fun onDestroy() {
        repository.stop()
        super.onDestroy()
    }
}
