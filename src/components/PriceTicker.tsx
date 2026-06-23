import { TrendingUp, TrendingDown } from 'lucide-react'

interface PriceTickerProps {
  pct: number
  size?: 'sm' | 'md'
}

export function PriceTicker({ pct, size = 'sm' }: PriceTickerProps) {
  const isPositive = pct >= 0
  const textSize = size === 'md' ? 'text-base' : 'text-xs'
  const iconSize = size === 'md' ? 16 : 12

  return (
    <span
      className={`inline-flex items-center gap-0.5 font-medium ${textSize} ${
        isPositive ? 'text-green-400' : 'text-red-400'
      }`}
    >
      {isPositive ? (
        <TrendingUp size={iconSize} />
      ) : (
        <TrendingDown size={iconSize} />
      )}
      {isPositive ? '+' : ''}
      {pct.toFixed(1)}%
    </span>
  )
}
