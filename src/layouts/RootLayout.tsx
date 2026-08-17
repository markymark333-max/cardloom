import { ReactNode, useState } from 'react'
import { useRouterState } from '@tanstack/react-router'
import { SiteHeader } from '../components/SiteHeader'
import { BottomNav } from '../components/BottomNav'
import { GlobalAddCardFlow } from '../components/GlobalAddCardFlow'

interface RootLayoutProps {
  children: ReactNode
}

export function RootLayout({ children }: RootLayoutProps) {
  const [showAddCard, setShowAddCard] = useState(false)
  const { location } = useRouterState()
  const isLanding = location.pathname === '/'

  return (
    <div className="min-h-dvh flex flex-col bg-navy-900">
      <SiteHeader onOpenScan={() => setShowAddCard(true)} />
      <main className="flex-1 pb-20 md:pb-0 relative">
        {!isLanding && (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 z-0"
            style={{
              backgroundImage: `
                linear-gradient(45deg,  rgba(201,149,106,0.055) 1px, transparent 1px),
                linear-gradient(135deg, rgba(201,149,106,0.055) 1px, transparent 1px)
              `,
              backgroundSize: '38px 38px',
            }}
          />
        )}
        <div className="relative z-10">{children}</div>
      </main>
      <footer className="hidden md:flex border-t border-white/5 py-6 px-8 justify-between items-center text-sm text-gray-500">
        <span>© CARDLOOM</span>
        <span>COLLECT • ORGANIZE • VALUE</span>
      </footer>
      <BottomNav onOpenScan={() => setShowAddCard(true)} />
      {showAddCard && <GlobalAddCardFlow onClose={() => setShowAddCard(false)} />}
    </div>
  )
}
