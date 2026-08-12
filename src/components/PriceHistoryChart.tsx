import { useRef, useState } from 'react'
import type { PricePoint } from '../lib/scrydex'

interface PriceHistoryChartProps {
  points: PricePoint[]
}

const W = 600
const H = 220
const PAD_LEFT = 52
const PAD_RIGHT = 12
const PAD_TOP = 12
const PAD_BOTTOM = 28

function compactPrice(v: number): string {
  if (v >= 1000) return `$${(v / 1000).toFixed(v >= 10000 ? 0 : 1)}k`
  return `$${v.toFixed(0)}`
}

function formatDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00`)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export function PriceHistoryChart({ points }: PriceHistoryChartProps) {
  const svgRef = useRef<SVGSVGElement>(null)
  const [hoverIndex, setHoverIndex] = useState<number | null>(null)

  if (points.length < 2) {
    return (
      <div className="h-[220px] flex items-center justify-center text-gray-500 text-sm">
        Not enough price history yet.
      </div>
    )
  }

  const prices = points.map((p) => p.price)
  const minPrice = Math.min(...prices)
  const maxPrice = Math.max(...prices)
  const range = maxPrice - minPrice || maxPrice * 0.1 || 1
  const yMin = minPrice - range * 0.08
  const yMax = maxPrice + range * 0.08

  const plotW = W - PAD_LEFT - PAD_RIGHT
  const plotH = H - PAD_TOP - PAD_BOTTOM

  const xAt = (i: number) => PAD_LEFT + (i / (points.length - 1)) * plotW
  const yAt = (price: number) => PAD_TOP + (1 - (price - yMin) / (yMax - yMin)) * plotH

  const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${xAt(i)} ${yAt(p.price)}`).join(' ')
  const areaPath = `${linePath} L ${xAt(points.length - 1)} ${PAD_TOP + plotH} L ${xAt(0)} ${PAD_TOP + plotH} Z`

  const yTicks = [yMin + (yMax - yMin) * 0.05, (yMin + yMax) / 2, yMax - (yMax - yMin) * 0.05]
  const xTickIndices = [0, Math.floor((points.length - 1) / 2), points.length - 1]

  const handlePointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const svg = svgRef.current
    if (!svg) return
    const rect = svg.getBoundingClientRect()
    const relX = ((e.clientX - rect.left) / rect.width) * W
    const t = (relX - PAD_LEFT) / plotW
    const idx = Math.round(t * (points.length - 1))
    setHoverIndex(Math.max(0, Math.min(points.length - 1, idx)))
  }

  const hovered = hoverIndex != null ? points[hoverIndex] : null
  const hoverX = hoverIndex != null ? xAt(hoverIndex) : 0
  const hoverY = hovered ? yAt(hovered.price) : 0
  // Flip the tooltip to the left once we're past ~70% of the plot width so it doesn't clip off-screen.
  const tooltipLeft = hoverIndex != null && hoverIndex / (points.length - 1) > 0.7

  return (
    <div className="relative">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        className="w-full h-auto touch-none"
        onPointerMove={handlePointerMove}
        onPointerLeave={() => setHoverIndex(null)}
      >
        <defs>
          <linearGradient id="priceFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#C9956A" stopOpacity="0.22" />
            <stop offset="100%" stopColor="#C9956A" stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* Y gridlines + labels */}
        {yTicks.map((v, i) => (
          <g key={i}>
            <line
              x1={PAD_LEFT}
              x2={W - PAD_RIGHT}
              y1={yAt(v)}
              y2={yAt(v)}
              stroke="#ffffff"
              strokeOpacity="0.06"
              strokeWidth="1"
            />
            <text x={PAD_LEFT - 8} y={yAt(v) + 4} textAnchor="end" fontSize="11" fill="#6b7280">
              {compactPrice(v)}
            </text>
          </g>
        ))}

        {/* X labels */}
        {xTickIndices.map((i) => (
          <text
            key={i}
            x={xAt(i)}
            y={H - 8}
            textAnchor={i === 0 ? 'start' : i === points.length - 1 ? 'end' : 'middle'}
            fontSize="11"
            fill="#6b7280"
          >
            {formatDate(points[i].date)}
          </text>
        ))}

        <path d={areaPath} fill="url(#priceFill)" />
        <path d={linePath} fill="none" stroke="#C9956A" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />

        {/* End dot */}
        <circle
          cx={xAt(points.length - 1)}
          cy={yAt(points[points.length - 1].price)}
          r="4"
          fill="#C9956A"
          stroke="#111827"
          strokeWidth="2"
        />

        {/* Hover crosshair */}
        {hovered && (
          <>
            <line
              x1={hoverX}
              x2={hoverX}
              y1={PAD_TOP}
              y2={PAD_TOP + plotH}
              stroke="#ffffff"
              strokeOpacity="0.15"
              strokeWidth="1"
            />
            <circle cx={hoverX} cy={hoverY} r="4" fill="#C9956A" stroke="#111827" strokeWidth="2" />
          </>
        )}
      </svg>

      {hovered && (
        <div
          className="absolute top-1 bg-navy-900 border border-white/10 rounded-lg px-2.5 py-1.5 pointer-events-none text-center"
          style={{
            left: `${(hoverX / W) * 100}%`,
            transform: tooltipLeft ? 'translateX(-100%)' : 'translateX(0%)',
            marginLeft: tooltipLeft ? -8 : 8,
          }}
        >
          <p className="text-white text-xs font-semibold whitespace-nowrap">${hovered.price.toFixed(2)}</p>
          <p className="text-gray-500 text-[10px] whitespace-nowrap">{formatDate(hovered.date)}</p>
        </div>
      )}
    </div>
  )
}
