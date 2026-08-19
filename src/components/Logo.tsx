interface LogoProps {
  size?: 'sm' | 'md' | 'lg'
  showTagline?: boolean
  className?: string
}

const SIZES = {
  sm: { fontSize: 19, infW: 27, infH: 17, tagSize: 6.5, barW: 14, strokeW: 3.2, gap: 3 },
  md: { fontSize: 38, infW: 52, infH: 33, tagSize: 10,  barW: 26, strokeW: 6,   gap: 5 },
  lg: { fontSize: 56, infW: 78, infH: 50, tagSize: 14,  barW: 38, strokeW: 9,   gap: 7 },
}

export function Logo({ size = 'md', showTagline = true, className = '' }: LogoProps) {
  const { fontSize, infW, infH, tagSize, barW, strokeW, gap } = SIZES[size]

  return (
    <div
      className={`flex flex-col items-center select-none ${className}`}
      style={{ gap: `${gap}px` }}
    >
      {/* Wordmark: CARDL + ∞ + M */}
      <div
        className="flex items-center"
        style={{
          fontFamily: "'Josefin Sans', 'Outfit', sans-serif",
          fontSize: `${fontSize}px`,
          fontWeight: 700,
          letterSpacing: '0.17em',
          color: 'white',
          lineHeight: 1,
          textTransform: 'uppercase',
          gap: '0.06em',
        }}
      >
        <span>CARDL</span>

        {/* Lemniscate — two loops meeting at center, drawn as a single closed stroke */}
        <svg
          width={infW}
          height={infH}
          viewBox="-60 -30 120 60"
          fill="none"
          style={{ display: 'block', flexShrink: 0 }}
          aria-hidden
        >
          {/* Right loop + left loop, both starting/ending at (0,0) creating the figure-eight crossing */}
          <path
            d="M 0,0 C 6,-23 52,-23 52,0 C 52,23 6,23 0,0 C -6,-23 -52,-23 -52,0 C -52,23 -6,23 0,0 Z"
            stroke="#C9956A"
            strokeWidth={strokeW}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>

        <span>M</span>
      </div>

      {/* Tagline */}
      {showTagline && (
        <div
          className="flex items-center"
          style={{
            fontFamily: "'Josefin Sans', 'Outfit', sans-serif",
            fontSize: `${tagSize}px`,
            fontWeight: 400,
            letterSpacing: '0.28em',
            color: '#C9956A',
            textTransform: 'uppercase',
            gap: '8px',
            whiteSpace: 'nowrap',
          }}
        >
          <div style={{ width: `${barW}px`, height: '1px', background: '#C9956A', opacity: 0.75 }} />
          <span>Collect · Organize · Value</span>
          <div style={{ width: `${barW}px`, height: '1px', background: '#C9956A', opacity: 0.75 }} />
        </div>
      )}
    </div>
  )
}
