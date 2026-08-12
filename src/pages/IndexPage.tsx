import { useNavigate } from '@tanstack/react-router'
import {
  FolderOpen,
  ShoppingCart,
  TrendingUp,
  ScanLine,
  Bell,
  Search,
  Infinity,
  Zap,
  Clock,
} from 'lucide-react'
import { Logo } from '../components/Logo'

// Faint, slowly-drifting trading-card silhouettes behind the hero — a subtle
// nod to the collection without competing with the headline.
const HERO_CARDS = [
  { top: '6%', left: '4%', rot: -14, w: 150, dur: 11 },
  { top: '52%', left: '1%', rot: 9, w: 130, dur: 13 },
  { top: '15%', left: '83%', rot: 12, w: 168, dur: 12 },
  { top: '60%', left: '86%', rot: -8, w: 142, dur: 14 },
  { top: '-2%', left: '46%', rot: 6, w: 118, dur: 10 },
  { top: '72%', left: '40%', rot: -6, w: 120, dur: 15 },
  { top: '30%', left: '18%', rot: 16, w: 108, dur: 12 },
  { top: '38%', left: '70%', rot: -13, w: 126, dur: 13 },
]

function HeroCards() {
  return (
    <div
      className="absolute inset-0 pointer-events-none overflow-hidden"
      style={{
        maskImage: 'linear-gradient(to bottom, black 72%, transparent 100%)',
        WebkitMaskImage: 'linear-gradient(to bottom, black 72%, transparent 100%)',
      }}
    >
      {HERO_CARDS.map((c, i) => (
        <div key={i} className="absolute" style={{ top: c.top, left: c.left, transform: `rotate(${c.rot}deg)` }}>
          <div
            className="relative rounded-lg border border-gold/50"
            style={{
              width: c.w,
              aspectRatio: '5 / 7',
              opacity: 0.22,
              background:
                'linear-gradient(160deg, rgba(201,149,106,0.5), rgba(255,255,255,0.08) 42%, rgba(201,149,106,0.07))',
              boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.1)',
              animation: `floatCard ${c.dur}s ease-in-out ${(i * 0.7).toFixed(1)}s infinite`,
            }}
          >
            {/* faint "art window" to hint a card frame */}
            <div className="absolute left-2 right-2 top-2 h-1/2 rounded border border-white/15" />
            <div className="absolute left-2 right-2 bottom-2 h-3 rounded-sm border border-white/15" />
          </div>
        </div>
      ))}
    </div>
  )
}

const features = [
  {
    icon: FolderOpen,
    title: 'Multiple Portfolios',
    description:
      'Organize your collection into separate portfolios — vintage holos, sealed product, modern pulls, all tracked independently.',
  },
  {
    icon: ShoppingCart,
    title: 'One-Click Selling',
    description:
      'List cards directly from your vault. Your storefront stays live and synced with your inventory.',
  },
  {
    icon: TrendingUp,
    title: 'Real Card Valuations',
    description:
      'Powered by Scrydex — get live market prices for raw and graded cards across PSA, CGC, BGS, TAG, ACE, and SGC.',
  },
  {
    icon: ScanLine,
    title: 'Scan with AI — Live',
    description:
      'Point your camera at any card and let AI identify it instantly. Add it to your vault in seconds.',
  },
  {
    icon: Bell,
    title: 'Price Alerts',
    description:
      'Set target prices and get notified the moment a card hits your number. Never miss a buy or sell opportunity.',
  },
  {
    icon: Search,
    title: 'eBay Sold Lookup',
    description:
      'Cross-reference real eBay sold listings alongside Scrydex data for the most complete price picture available.',
  },
]

export function IndexPage() {
  const navigate = useNavigate()

  return (
    <div className="text-white">
      {/* Hero */}
      <section className="relative overflow-hidden">
        {/* Faint drifting cards */}
        <HeroCards />
        {/* Background glow */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-gold/5 rounded-full blur-3xl" />
        </div>

        <div className="relative max-w-4xl mx-auto px-6 pt-24 pb-20 text-center">
          <div className="flex justify-center mb-10">
            <Logo size="lg" showTagline />
          </div>

          <h1 className="font-heading text-5xl md:text-7xl font-bold leading-tight mb-6">
            Every card,
            <br />
            <span className="text-gold">woven into</span> one place.
          </h1>

          <p className="text-gray-400 text-lg md:text-xl max-w-2xl mx-auto mb-10">
            CardLoom is the collector's operating system — built to track, value, and sell your
            entire card portfolio with professional-grade tools.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <button
              onClick={() => navigate({ to: '/vault' })}
              className="bg-gold text-navy-900 font-semibold px-8 py-4 rounded-xl hover:opacity-90 transition-opacity text-base"
            >
              Start your vault →
            </button>
            <button
              onClick={() => navigate({ to: '/marketplace' })}
              className="border border-white/15 text-white px-8 py-4 rounded-xl hover:bg-white/5 transition-colors text-base"
            >
              Browse marketplace
            </button>
          </div>
        </div>
      </section>

      {/* Stats bar */}
      <section className="max-w-4xl mx-auto px-6 mb-24">
        <div className="bg-navy-800 rounded-2xl border border-white/5 grid grid-cols-3 divide-x divide-white/5">
          {[
            { Icon: Infinity, value: 'Portfolios', label: 'NO LIMITS' },
            { Icon: Zap, value: '1-Click', label: 'TO SELL' },
            { Icon: Clock, value: '24/7', label: 'PRICE WATCH' },
          ].map(({ Icon, value, label }) => (
            <div key={value} className="py-7 sm:py-8 px-1.5 sm:px-4 flex flex-col items-center text-center">
              <Icon size={20} className="text-gold mb-2.5" />
              <span className="font-heading font-bold text-white text-[15px] sm:text-xl leading-tight">
                {value}
              </span>
              <p className="text-gray-500 text-[9.5px] sm:text-xs font-medium tracking-[0.16em] mt-1.5">{label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Features */}
      <section className="max-w-7xl mx-auto px-6 mb-24">
        <div className="text-center mb-14">
          <p className="text-gold text-xs font-semibold tracking-widest mb-3">WHAT'S INSIDE</p>
          <h2 className="font-heading text-4xl md:text-5xl font-bold text-white mb-4">
            Everything a serious collector needs.
          </h2>
          <p className="text-gray-400 text-lg max-w-2xl mx-auto">
            From hobbyist shelves to seven-figure portfolios — built to scale with you.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {features.map((feature) => {
            const Icon = feature.icon
            return (
              <div
                key={feature.title}
                className="bg-navy-800 rounded-2xl border border-white/5 p-6 hover:border-gold/20 transition-colors"
              >
                <div className="w-10 h-10 bg-gold/10 rounded-xl flex items-center justify-center mb-4">
                  <Icon size={20} className="text-gold" />
                </div>
                <h3 className="font-heading font-semibold text-white text-lg mb-2">
                  {feature.title}
                </h3>
                <p className="text-gray-400 text-sm leading-relaxed">{feature.description}</p>
              </div>
            )
          })}
        </div>
      </section>

      {/* Two-column CTA */}
      <section className="max-w-7xl mx-auto px-6 mb-24">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div className="bg-navy-800 rounded-2xl border border-white/5 p-10 hover:border-gold/20 transition-colors">
            <p className="text-gold text-xs font-semibold tracking-widest mb-3">
              COLLECTOR PORTAL
            </p>
            <h3 className="font-heading text-3xl font-bold text-white mb-3">
              Curate the perfect vault.
            </h3>
            <p className="text-gray-400 text-sm mb-6">
              Track every card, every grade, every portfolio — with live valuations powered by
              Scrydex.
            </p>
            <button
              onClick={() => navigate({ to: '/vault' })}
              className="bg-gold text-navy-900 font-semibold px-6 py-3 rounded-xl hover:opacity-90 transition-opacity"
            >
              Enter vault →
            </button>
          </div>

          <div className="bg-navy-800 rounded-2xl border border-white/5 p-10 hover:border-gold/20 transition-colors">
            <p className="text-gold text-xs font-semibold tracking-widest mb-3">SELLER PORTAL</p>
            <h3 className="font-heading text-3xl font-bold text-white mb-3">
              Sell smarter, not harder.
            </h3>
            <p className="text-gray-400 text-sm mb-6">
              List from your vault, manage your storefront, and reach buyers — all in one place.
            </p>
            <button
              onClick={() => navigate({ to: '/sell' })}
              className="border border-white/15 text-white font-semibold px-6 py-3 rounded-xl hover:bg-white/5 transition-colors"
            >
              Open portal →
            </button>
          </div>
        </div>
      </section>

      {/* Membership teaser */}
      <section className="max-w-4xl mx-auto px-6 pb-24 text-center">
        <p className="text-gold text-xs font-semibold tracking-widest mb-3">MEMBERSHIP</p>
        <h2 className="font-heading text-4xl md:text-5xl font-bold text-white mb-4">
          Value data, unlocked.
        </h2>
        <p className="text-gray-400 text-lg mb-8">
          Access graded population reports, historical price charts, and eBay sold data — free and
          premium tiers available.
        </p>
        <button
          onClick={() => navigate({ to: '/membership' })}
          className="border border-white/15 text-white font-semibold px-8 py-4 rounded-xl hover:bg-white/5 transition-colors"
        >
          See membership tiers
        </button>
      </section>
    </div>
  )
}
