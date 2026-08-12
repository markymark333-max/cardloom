interface LogoProps {
  size?: 'sm' | 'md' | 'lg'
  showTagline?: boolean
  className?: string
}

const HEIGHTS = {
  sm: 'h-7',
  md: 'h-14',
  // Smaller on phones so the wide lockup fits without being clamped (a clamped
  // width against a fixed height is what stretched it); grows on larger screens.
  lg: 'h-16 sm:h-20 md:h-28',
}

export function Logo({ size = 'md', showTagline = true, className = '' }: LogoProps) {
  return (
    <img
      src={showTagline ? '/logo-lockup.png' : '/logo-wordmark.png'}
      alt="CardLoom — Collect. Organize. Value."
      // w-auto + max-w-full keeps the true aspect ratio; object-contain guarantees
      // it never distorts even if a narrow screen has to clamp the width.
      className={`${HEIGHTS[size]} w-auto max-w-full object-contain select-none ${className}`}
    />
  )
}
