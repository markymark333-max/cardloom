import { ReactNode, useState } from 'react'
import { SiteHeader } from '../components/SiteHeader'
import { BottomNav } from '../components/BottomNav'
import { GlobalAddCardFlow } from '../components/GlobalAddCardFlow'

interface RootLayoutProps {
  children: ReactNode
}

export function RootLayout({ children }: RootLayoutProps) {
  const [showAddCard, setShowAddCard] = useState(false)

  return (
    <div className="min-h-dvh flex flex-col bg-navy-900">
      <SiteHeader onOpenScan={() => setShowAddCard(true)} />
      <main className="flex-1 pb-20 md:pb-0">{children}</main>
      <footer className="hidden md:flex border-t border-white/5 py-6 px-8 justify-between items-center text-sm text-gray-500">
        <span>© CARDLOOM</span>
        <span>COLLECT • ORGANIZE • VALUE</span>
      </footer>
      <BottomNav onOpenScan={() => setShowAddCard(true)} />
      {showAddCard && <GlobalAddCardFlow onClose={() => setShowAddCard(false)} />}
    </div>
  )
}
