interface LogoProps {
  size?: 'sm' | 'md' | 'lg'
  showTagline?: boolean
  className?: string
}

const SIZES = {
  sm: { fontSize: 18, infW: 44, infH: 22, tagSize: 6.5, barW: 14, strokeW: 20, gap: 3 },
  md: { fontSize: 36, infW: 86, infH: 43, tagSize: 10,  barW: 26, strokeW: 20, gap: 5 },
  lg: { fontSize: 54, infW: 130, infH: 65, tagSize: 14, barW: 38, strokeW: 20, gap: 7 },
}

// Century Gothic has a crossbar-less A — matching the hero wordmark font
const FONT = "'Century Gothic','Gill Sans MT','Trebuchet MS','Josefin Sans',sans-serif"

export function Logo({ size = 'md', showTagline = true, className = '' }: LogoProps) {
  const { fontSize, infW, infH, tagSize, barW, gap } = SIZES[size]
  // Unique gradient ID per instance (avoids conflicts if multiple Logos render)
  const gradId = `infG-${size}`

  return (
    <div
      className={`flex flex-col items-center select-none ${className}`}
      style={{ gap: `${gap}px` }}
    >
      {/* Wordmark: CARDL + ∞ + M */}
      <div
        className="flex items-center"
        style={{
          fontFamily: FONT,
          fontSize: `${fontSize}px`,
          fontWeight: 400,
          letterSpacing: '0.32em',
          color: '#EDEAE3',
          lineHeight: 1,
          textTransform: 'uppercase',
          gap: '0.06em',
        }}
      >
        <span>CARDL</span>

        {/* Lemniscate matching the hero — two loops with gold gradient */}
        <svg
          width={infW}
          height={infH}
          viewBox="0 0 400 190"
          fill="none"
          style={{ display: 'block', flexShrink: 0, marginTop: '-0.04em' }}
          aria-hidden
        >
          <defs>
            <linearGradient id={gradId} x1="10" y1="10" x2="390" y2="180" gradientUnits="userSpaceOnUse">
              <stop offset="0%"   stopColor="#DFB070" />
              <stop offset="45%"  stopColor="#C9956A" />
              <stop offset="100%" stopColor="#8A5828" />
            </linearGradient>
          </defs>
          {/* Right loop */}
          <path
            d="M200,95 C200,48 228,8 268,8 C334,8 390,46 390,95 C390,144 334,182 268,182 C228,182 200,142 200,95"
            stroke={`url(#${gradId})`}
            strokeWidth="22"
            strokeLinecap="round"
          />
          {/* Left loop — drawn on top for crossing effect */}
          <path
            d="M200,95 C200,48 172,8 132,8 C66,8 10,46 10,95 C10,144 66,182 132,182 C172,182 200,142 200,95"
            stroke={`url(#${gradId})`}
            strokeWidth="22"
            strokeLinecap="round"
          />
        </svg>

        <span>M</span>
      </div>

      {/* Tagline */}
      {showTagline && (
        <div
          className="flex items-center"
          style={{
            fontFamily: FONT,
            fontSize: `${tagSize}px`,
            fontWeight: 400,
            letterSpacing: '0.32em',
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
