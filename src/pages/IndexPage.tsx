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
      {/* ── Hero ── */}
      <section
        className="relative overflow-hidden flex flex-col items-center justify-center"
        style={{
          minHeight: '100svh',
          background: '#09090f',
          // Diamond crosshatch grid matching the brand design
          backgroundImage: [
            'repeating-linear-gradient(45deg,  rgba(201,149,106,0.055) 0 1px, transparent 1px 22px)',
            'repeating-linear-gradient(-45deg, rgba(201,149,106,0.038) 0 1px, transparent 1px 22px)',
          ].join(', '),
        }}
      >
        {/* Centre radial glow */}
        <div
          className="absolute pointer-events-none"
          style={{
            top: '50%', left: '50%',
            transform: 'translate(-50%,-50%)',
            width: 700, height: 500,
            background: 'radial-gradient(ellipse, rgba(190,140,90,0.10) 0%, transparent 66%)',
            filter: 'blur(48px)',
          }}
        />

        {/* Corner brackets */}
        {(['tl','tr','bl','br'] as const).map(pos => (
          <div
            key={pos}
            className="absolute"
            style={{
              width: 52, height: 52,
              top:    pos.startsWith('t') ? 48 : undefined,
              bottom: pos.startsWith('b') ? 48 : undefined,
              left:   pos.endsWith('l')   ? 48 : undefined,
              right:  pos.endsWith('r')   ? 48 : undefined,
              borderColor: 'rgba(201,149,106,0.32)',
              borderStyle: 'solid',
              borderWidth:
                pos === 'tl' ? '1px 0 0 1px' :
                pos === 'tr' ? '1px 1px 0 0' :
                pos === 'bl' ? '0 0 1px 1px' :
                               '0 1px 1px 0',
            }}
          />
        ))}

        {/* Main content */}
        <div className="relative z-10 flex flex-col items-center text-center px-6 py-20">
          {/* Eyebrow */}
          <p
            className="mb-10 uppercase tracking-[0.2em] sm:tracking-[0.68em] text-[11px]"
            style={{ color: 'rgba(201,149,106,0.55)', fontFamily: "'Josefin Sans','Century Gothic','Gill Sans MT',sans-serif" }}
          >
            Trading Card Marketplace
          </p>

          {/* CARDL ∞ M wordmark */}
          <div
            className="flex items-center"
            style={{
              fontFamily: "'Josefin Sans','Century Gothic','Gill Sans MT',sans-serif",
              fontSize: 'clamp(26px, 9vw, 92px)',
              fontWeight: 400,
              textTransform: 'uppercase',
              color: '#EDEAE3',
              lineHeight: 1,
            }}
          >
            {/* "A" rendered as SVG to remove the crossbar */}
            <span style={{ letterSpacing: '0.42em', whiteSpace: 'nowrap' }}>
              C
              <svg viewBox="0 0 68 72" fill="none" aria-hidden style={{ display: 'inline-block', width: '0.68em', height: '0.72em', verticalAlign: 'baseline', marginRight: '0.42em' }}>
                <path d="M 4,69 L 34,3 L 64,69" stroke="currentColor" strokeWidth="6.5" strokeLinecap="round" />
              </svg>
              RDL
            </span>

            {/* Lemniscate — right loop behind, left loop in front */}
            <svg
              viewBox="0 0 400 190"
              xmlns="http://www.w3.org/2000/svg"
              style={{
                display: 'block',
                width: 'clamp(60px, 14vw, 168px)',
                height: 'auto',
                flexShrink: 0,
                overflow: 'visible',
                marginRight: '0.36em',
                marginTop: '-0.06em',
              }}
            >
              <defs>
                <linearGradient id="infG" x1="10" y1="10" x2="390" y2="180" gradientUnits="userSpaceOnUse">
                  <stop offset="0%"   stopColor="#DFB070" />
                  <stop offset="45%"  stopColor="#C9956A" />
                  <stop offset="100%" stopColor="#8A5828" />
                </linearGradient>
                <filter id="infGlow" x="-15%" y="-35%" width="130%" height="170%">
                  <feGaussianBlur stdDeviation="5" result="b" />
                  <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
                </filter>
                {/* Mask cuts under-strand at crossing so over-strand visibly passes on top */}
                <mask id="heroUnderMask">
                  <rect width="400" height="190" fill="white" />
                  <line x1="210" y1="84" x2="190" y2="106" stroke="black" strokeWidth="30" strokeLinecap="butt" />
                </mask>
              </defs>
              <g filter="url(#infGlow)">
                {/* Under strand: masked at center crossing */}
                <path
                  d="M 20,95 C 20,25 137,25 200,95 C 263,165 380,165 380,95"
                  mask="url(#heroUnderMask)"
                  fill="none" stroke="url(#infG)" strokeWidth="22" strokeLinecap="round"
                />
                {/* Over strand: drawn fully on top */}
                <path
                  d="M 380,95 C 380,25 263,25 200,95 C 137,165 20,165 20,95"
                  fill="none" stroke="url(#infG)" strokeWidth="22" strokeLinecap="round"
                />
              </g>
            </svg>

            <span>M</span>
          </div>

          {/* Divider */}
          <div className="flex items-center gap-4 my-10" style={{ width: 'min(540px, 80vw)' }}>
            <div style={{ flex: 1, height: 1, background: 'linear-gradient(90deg, transparent, rgba(201,149,106,0.55), transparent)' }} />
            <div style={{ width: 5, height: 5, background: 'rgba(201,149,106,0.65)', transform: 'rotate(45deg)' }} />
            <div style={{ flex: 1, height: 1, background: 'linear-gradient(90deg, transparent, rgba(201,149,106,0.55), transparent)' }} />
          </div>

          {/* Tagline */}
          <p
            className="uppercase tracking-[0.2em] sm:tracking-[0.7em] text-[12px] mb-12"
            style={{ color: 'rgba(201,149,106,0.75)', fontFamily: "'Josefin Sans','Century Gothic','Gill Sans MT',sans-serif" }}
          >
            Collect · Organize · Value
          </p>

          {/* CTAs */}
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

        {/* Domain watermark */}
        <p
          className="absolute bottom-12 left-0 right-0 text-center uppercase tracking-[0.48em] text-[10px]"
          style={{ color: 'rgba(201,149,106,0.22)', fontFamily: "'Century Gothic','Gill Sans MT',sans-serif", textIndent: '0.48em' }}
        >
          cardloom.ai
        </p>
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
