import { Link, useRouterState } from '@tanstack/react-router'
import { Home, Archive, Camera, Rss, ShoppingBag } from 'lucide-react'

interface BottomNavProps {
  onOpenScan: () => void
}

const LEFT_ITEMS = [
  { to: '/', icon: Home, label: 'Home' },
  { to: '/vault', icon: Archive, label: 'Vault' },
]

const RIGHT_ITEMS = [
  { to: '/portal', icon: Rss, label: 'Feed' },
  { to: '/marketplace', icon: ShoppingBag, label: 'Shop' },
]

export function BottomNav({ onOpenScan }: BottomNavProps) {
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  const isActive = (to: string) => (to === '/' ? pathname === '/' : pathname.startsWith(to))

  return (
    <nav className="bottom-nav md:hidden fixed bottom-0 left-0 right-0 z-40 bg-navy-900/95 backdrop-blur-sm border-t border-white/5 pb-[env(safe-area-inset-bottom)]">
      <div className="flex items-center justify-around h-16 px-1">
        {LEFT_ITEMS.map(({ to, icon: Icon, label }) => (
          <Link
            key={to}
            to={to}
            className={`flex flex-col items-center gap-0.5 px-3 py-1 transition-colors ${
              isActive(to) ? 'text-gold' : 'text-gray-500'
            }`}
          >
            <Icon size={20} />
            <span className="text-[10px] font-medium">{label}</span>
          </Link>
        ))}

        <button
          onClick={onOpenScan}
          className="flex items-center justify-center w-14 h-14 rounded-full bg-gold text-navy-900 -mt-6 shadow-lg shadow-black/30 flex-shrink-0"
        >
          <Camera size={24} />
        </button>

        {RIGHT_ITEMS.map(({ to, icon: Icon, label }) => (
          <Link
            key={to}
            to={to}
            className={`flex flex-col items-center gap-0.5 px-3 py-1 transition-colors ${
              isActive(to) ? 'text-gold' : 'text-gray-500'
            }`}
          >
            <Icon size={20} />
            <span className="text-[10px] font-medium">{label}</span>
          </Link>
        ))}
      </div>
    </nav>
  )
}
