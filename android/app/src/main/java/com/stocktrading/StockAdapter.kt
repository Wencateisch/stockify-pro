package com.stocktrading

import android.view.LayoutInflater
import android.view.ViewGroup
import androidx.recyclerview.widget.RecyclerView
import com.stocktrading.databinding.ItemStockBinding
import java.util.Locale

class StockAdapter : RecyclerView.Adapter<StockAdapter.StockViewHolder>() {

    private val items = mutableListOf<Stock>()

    fun submit(stocks: List<Stock>) {
        if (items.size != stocks.size) {
            items.clear()
            items.addAll(stocks)
            notifyDataSetChanged()
            return
        }

        for (index in stocks.indices) {
            val old = items[index]
            val new = stocks[index]
            if (old.symbol != new.symbol) {
                items.clear()
                items.addAll(stocks)
                notifyDataSetChanged()
                return
            }
            if (old.price != new.price || old.change != new.change ||
                old.volume != new.volume || old.high != new.high || old.low != new.low
            ) {
                items[index] = new
                notifyItemChanged(index)
            }
        }
    }

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): StockViewHolder {
        val binding = ItemStockBinding.inflate(
            LayoutInflater.from(parent.context), parent, false
        )
        return StockViewHolder(binding)
    }

    override fun onBindViewHolder(holder: StockViewHolder, position: Int) {
        holder.bind(items[position])
    }

    override fun getItemCount(): Int = items.size

    class StockViewHolder(private val binding: ItemStockBinding) :
        RecyclerView.ViewHolder(binding.root) {

        fun bind(stock: Stock) {
            val context = binding.root.context
            val isUp = stock.change >= 0

            binding.symbolText.text = stock.symbol
            binding.nameText.text = stock.name
            binding.priceText.text = Fmt.price(stock.price)
            binding.volumeText.text = "Vol " + Fmt.volume(stock.volume)
            binding.rangeText.text = String.format(
                Locale.US,
                "H %s  \u00b7  L %s",
                Fmt.price(stock.high),
                Fmt.price(stock.low)
            )

            binding.changeText.text = Fmt.percent(stock.percentChange)
            binding.changeText.setTextColor(
                context.getColor(if (isUp) R.color.accent_green else R.color.accent_red)
            )
            binding.changeText.setBackgroundResource(
                if (isUp) R.drawable.badge_up else R.drawable.badge_down
            )
        }
    }
}
