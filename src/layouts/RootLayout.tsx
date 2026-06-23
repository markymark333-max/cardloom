import { ReactNode } from 'react'
import { SiteHeader } from '../components/SiteHeader'

interface RootLayoutProps {
  children: ReactNode
}

export function RootLayout({ children }: RootLayoutProps) {
  return (
    <div className="min-h-screen flex flex-col bg-navy-900">
      <SiteHeader />
      <main className="flex-1">{children}</main>
      <footer className="border-t border-white/5 py-6 px-8 flex justify-between items-center text-sm text-gray-500">
        <span>© CARDLOOM</span>
        <span>COLLECT • ORGANIZE • VALUE</span>
      </footer>
    </div>
  )
}
