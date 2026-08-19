interface LogoProps {
  size?: 'sm' | 'md' | 'lg'
  showTagline?: boolean
  className?: string
}

const SIZES = {
  sm: { fontSize: 19, infW: 46, infH: 23, tagSize: 6.5, barW: 14, strokeW: 22, gap: 3 },
  md: { fontSize: 38, infW: 90, infH: 45, tagSize: 10,  barW: 26, strokeW: 22, gap: 5 },
  lg: { fontSize: 56, infW: 134, infH: 67, tagSize: 14, barW: 38, strokeW: 22, gap: 7 },
}

// Josefin Sans has a crossbar-less A — matches the target wordmark
const FONT = "'Josefin Sans','Century Gothic','Gill Sans MT',sans-serif"

export function Logo({ size = 'md', showTagline = true, className = '' }: LogoProps) {
  const { fontSize, infW, infH, tagSize, barW, gap } = SIZES[size]
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
          fontWeight: 700,
          letterSpacing: '0.18em',
          color: '#EDEAE3',
          lineHeight: 1,
          textTransform: 'uppercase',
          gap: '0.04em',
        }}
      >
        <span>CARDL</span>

        {/*
          True lemniscate — both paths start at center (0,0) and diverge in
          opposite directions, creating the figure-eight crossing.
          Path 1 (right loop, behind): goes down-right first.
          Path 2 (left loop, in front): goes up-left first — drawn on top.
        */}
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
          {/* S-curve through center (behind): left-end → upper arc → center → lower arc → right-end */}
          <path
            d="M 20,95 C 20,25 137,25 200,95 C 263,165 380,165 380,95"
            stroke={`url(#${gradId})`}
            strokeWidth={SIZES[size].strokeW}
            strokeLinecap="round"
          />
          {/* Reverse-S through center (in front): right-end → upper arc → center → lower arc → left-end */}
          <path
            d="M 380,95 C 380,25 263,25 200,95 C 137,165 20,165 20,95"
            stroke={`url(#${gradId})`}
            strokeWidth={SIZES[size].strokeW}
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
            letterSpacing: '0.3em',
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
