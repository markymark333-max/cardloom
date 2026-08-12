interface GameIconProps {
  game: string
  size?: number
  className?: string
}

// Self-contained, theme-matching icons for each supported TCG so the brand
// picker never depends on external (hot-linked) brand assets. These are simple
// category marks, not the trademarked brand logos.
export function GameIcon({ game, size = 40, className = '' }: GameIconProps) {
  const common = {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    className,
    xmlns: 'http://www.w3.org/2000/svg',
  }

  switch (game) {
    case 'pokemon':
      // Classic Poké Ball.
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="10" fill="#EDEFF4" />
          <path d="M2.2 12a9.8 9.8 0 0 1 19.6 0Z" fill="#EF4444" />
          <line x1="2.2" y1="12" x2="21.8" y2="12" stroke="#0c0c0e" strokeWidth="2" />
          <circle cx="12" cy="12" r="9.8" fill="none" stroke="#0c0c0e" strokeWidth="1.4" />
          <circle cx="12" cy="12" r="3.5" fill="#EDEFF4" stroke="#0c0c0e" strokeWidth="1.6" />
          <circle cx="12" cy="12" r="1.4" fill="#0c0c0e" />
        </svg>
      )

    case 'onepiece':
      // Straw hat.
      return (
        <svg {...common} fill="none">
          <ellipse cx="12" cy="16" rx="10" ry="2.7" fill="#E3B76C" stroke="#8a6a34" strokeWidth="0.8" />
          <path d="M6.2 15.4C6.2 8.6 8.9 5.5 12 5.5s5.8 3.1 5.8 9.9Z" fill="#EBC57E" stroke="#8a6a34" strokeWidth="0.8" />
          <path d="M6.4 13.7c3.6 1.5 7.6 1.5 11.2 0l-.2 1.9c-3.5 1.4-7.3 1.4-10.8 0Z" fill="#C4402F" />
        </svg>
      )

    case 'magicthegathering': {
      // Five-color mana ring (W U B R G).
      const mana = [
        { a: -90, c: '#F5F1E1' },
        { a: -18, c: '#3B7CC4' },
        { a: 54, c: '#3A3A3E' },
        { a: 126, c: '#C6402F' },
        { a: 198, c: '#3FA05E' },
      ]
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="9.4" fill="none" stroke="#C9956A" strokeWidth="1" opacity="0.5" />
          {mana.map(({ a, c }, i) => {
            const rad = (a * Math.PI) / 180
            return (
              <circle
                key={i}
                cx={12 + 6.4 * Math.cos(rad)}
                cy={12 + 6.4 * Math.sin(rad)}
                r="2.3"
                fill={c}
                stroke="#0c0c0e"
                strokeWidth="0.6"
              />
            )
          })}
        </svg>
      )
    }

    case 'lorcana':
      // Ink droplet.
      return (
        <svg {...common} fill="none">
          <path
            d="M12 3s6.6 7.9 6.6 11.4A6.6 6.6 0 0 1 5.4 14.4C5.4 10.9 12 3 12 3Z"
            fill="#C9956A"
            stroke="#8a6a34"
            strokeWidth="0.8"
          />
          <path d="M9.4 14.6a2.6 2.6 0 0 0 2.2 2.4" stroke="#F3E4CE" strokeWidth="1.1" strokeLinecap="round" />
        </svg>
      )

    case 'gundam':
      // Mobile-suit visor.
      return (
        <svg {...common} fill="none">
          <path d="M7 6h10v7l-5 5-5-5Z" fill="#DCE0E8" stroke="#8b909b" strokeWidth="0.8" />
          <path d="M8.6 6 12 3.3 15.4 6" stroke="#E0B24D" strokeWidth="1.5" strokeLinejoin="round" />
          <line x1="12" y1="3.3" x2="12" y2="6" stroke="#E0B24D" strokeWidth="1.3" />
          <rect x="8.6" y="9" width="2.2" height="1.5" rx="0.3" fill="#46B36C" transform="skewX(-12)" />
          <rect x="13.4" y="9" width="2.2" height="1.5" rx="0.3" fill="#46B36C" transform="skewX(12)" />
          <path d="M10.6 13.4h2.8" stroke="#8b909b" strokeWidth="1" strokeLinecap="round" />
        </svg>
      )

    case 'riftbound':
      // Rift portal with a crack of light.
      return (
        <svg {...common} fill="none">
          <path d="M12 3 19 12 12 21 5 12Z" fill="#1c1c20" stroke="#C9956A" strokeWidth="1.3" strokeLinejoin="round" />
          <path d="M12 4.2 10.4 10.4 13 12l-2.4 8" stroke="#E7C070" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )

    default:
      // Generic card fallback.
      return (
        <svg {...common} fill="none">
          <rect x="5" y="3.5" width="14" height="17" rx="2" fill="none" stroke="#C9956A" strokeWidth="1.4" />
          <circle cx="12" cy="10" r="2.4" fill="#C9956A" />
          <path d="M8 17c.9-2 2.3-3 4-3s3.1 1 4 3" stroke="#C9956A" strokeWidth="1.3" strokeLinecap="round" />
        </svg>
      )
  }
}
