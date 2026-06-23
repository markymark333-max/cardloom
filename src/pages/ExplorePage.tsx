import { Compass } from 'lucide-react'

export function ExplorePage() {
  return (
    <div className="max-w-4xl mx-auto px-6 py-24 text-center">
      <div className="w-16 h-16 bg-navy-800 rounded-2xl flex items-center justify-center mx-auto mb-6 border border-white/5">
        <Compass size={28} className="text-gold" />
      </div>
      <p className="text-gold text-xs font-semibold tracking-widest mb-3">EXPLORE</p>
      <h1 className="font-heading text-4xl md:text-5xl font-bold text-white mb-4">Coming Soon</h1>
      <p className="text-gray-400 text-lg">Discover sets, trends, and collections.</p>
    </div>
  )
}
