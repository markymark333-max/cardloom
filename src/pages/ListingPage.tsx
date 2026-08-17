import { useState, useEffect, useCallback } from 'react'
import { Link, useParams } from '@tanstack/react-router'
import { ChevronRight, Star, Truck, Shield, Package, ImageIcon, ChevronLeft, TrendingUp, TrendingDown } from 'lucide-react'
import { supabase } from '../lib/supabase'
import {
  getCardImageUrl, getCardMeta, getCardHistory, getCardPrices,
  CardMeta, PricePoint, ScrydexPrices,
} from '../lib/scrydex'
import { PriceHistoryChart } from '../components/PriceHistoryChart'

interface ListingRecord {
  id: string
  price: number
  status: string
  seller_id: string
  card_id: string
}

interface CardRecord {
  id: string
  name: string
  card_set?: string
  card_number?: string
  year?: number
  condition?: string
  image_url?: string
  back_image_url?: string
  scrydex_id?: string
  game?: string
  variant?: string
  tcg_image_url?: string
  price_change_pct?: number
}

type Step = 'detail' | 'checkout'
type ImageKey = 'stock' | 'front' | 'back'

const CONDITION_LABELS: Record<string, string> = {
  NM: 'Near Mint',
  LP: 'Lightly Played',
  MP: 'Moderately Played',
  HP: 'Heavily Played',
  DMG: 'Damaged',
}

const TYPE_COLORS: Record<string, string> = {
  Fire: 'bg-red-500/20 text-red-400 border-red-500/30',
  Water: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  Grass: 'bg-green-500/20 text-green-400 border-green-500/30',
  Lightning: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  Psychic: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
  Fighting: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
  Darkness: 'bg-gray-500/20 text-gray-400 border-gray-500/30',
  Metal: 'bg-slate-500/20 text-slate-400 border-slate-500/30',
  Dragon: 'bg-neutral-700/40 text-gray-300 border-neutral-500/40',
  Fairy: 'bg-pink-500/20 text-pink-400 border-pink-500/30',
  Colorless: 'bg-white/10 text-gray-300 border-white/20',
}

const WINDOW_OPTIONS = [
  { label: '1M', days: 30 },
  { label: '3M', days: 90 },
  { label: '6M', days: 180 },
  { label: '1Y', days: 365 },
]

function TypeBadge({ type }: { type: string }) {
  const cls = TYPE_COLORS[type] ?? 'bg-white/10 text-gray-300 border-white/20'
  return (
    <span className={`px-2 py-0.5 rounded-md text-xs font-semibold border ${cls}`}>{type}</span>
  )
}

function MetaRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3 py-2.5 border-b border-white/5 last:border-0">
      <span className="text-gray-500 text-sm font-medium w-32 flex-shrink-0">{label}</span>
      <span className="text-white text-sm flex-1">{children}</span>
    </div>
  )
}

function fmt(n: number | undefined | null, fallback = '-') {
  if (n == null) return fallback
  return `$${n.toFixed(2)}`
}

function computeVolatility(pts: PricePoint[]): { label: string; pct: number } {
  if (pts.length < 2) return { label: 'Low', pct: 0.1 }
  const vals = pts.map(p => p.price)
  const mean = vals.reduce((a, b) => a + b, 0) / vals.length
  const variance = vals.reduce((s, v) => s + (v - mean) ** 2, 0) / vals.length
  const cv = Math.sqrt(variance) / mean
  if (cv < 0.05) return { label: 'Low', pct: cv * 10 }
  if (cv < 0.15) return { label: 'Med', pct: 0.3 + (cv - 0.05) * 3 }
  return { label: 'High', pct: 0.7 + Math.min((cv - 0.15) * 2, 0.3) }
}

export function ListingPage() {
  const { listingId } = useParams({ from: '/marketplace/$listingId' })
  const [listing, setListing] = useState<ListingRecord | null>(null)
  const [card, setCard] = useState<CardRecord | null>(null)
  const [meta, setMeta] = useState<CardMeta | null>(null)
  const [prices, setPrices] = useState<ScrydexPrices | null>(null)
  const [history, setHistory] = useState<PricePoint[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [windowDays, setWindowDays] = useState(90)
  const [scrydexId, setScrydexId] = useState<string | null>(null)
  const [game, setGame] = useState('pokemon')
  const [sellerName, setSellerName] = useState<string | null>(null)
  const [sellerAvatar, setSellerAvatar] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [imageKey, setImageKey] = useState<ImageKey>('stock')
  const [step, setStep] = useState<Step>('detail')
  const [qty, setQty] = useState(1)
  const [orderPlaced, setOrderPlaced] = useState(false)
  const [shipping, setShipping] = useState({
    name: '', address: '', city: '', state: '', zip: '', country: 'US',
  })

  // Main data load
  useEffect(() => {
    async function load() {
      setLoading(true)
      setError(null)

      const { data: listingRow, error: listErr } = await supabase
        .from('listings')
        .select('id, price, status, seller_id, card_id')
        .eq('id', listingId)
        .single()
      if (listErr || !listingRow) { setError('Listing not found.'); setLoading(false); return }
      setListing(listingRow)

      const { data: cardRow } = await supabase
        .from('marketplace_cards')
        .select('*')
        .eq('id', listingRow.card_id)
        .single()
      if (cardRow) {
        setCard(cardRow as CardRecord)
        const g = (cardRow as CardRecord).game ?? 'pokemon'
        setGame(g)
        const sid = (cardRow as CardRecord).scrydex_id ?? null
        setScrydexId(sid)

        if (sid) {
          getCardMeta(sid, g).then(setMeta)
          getCardPrices(sid, g).then(setPrices)
        }
      }

      supabase
        .from('profiles')
        .select('username, avatar_url')
        .eq('id', listingRow.seller_id)
        .single()
        .then(({ data }) => { setSellerName(data?.username ?? null); setSellerAvatar(data?.avatar_url ?? null) })

      setLoading(false)
    }
    load()
  }, [listingId])

  // History re-fetch when window changes
  const fetchHistory = useCallback(async (sid: string, g: string, days: number) => {
    setHistoryLoading(true)
    const pts = await getCardHistory(sid, days, g)
    setHistory(pts)
    setHistoryLoading(false)
  }, [])

  useEffect(() => {
    if (!scrydexId) return
    fetchHistory(scrydexId, game, windowDays)
  }, [scrydexId, game, windowDays, fetchHistory])

  if (loading) return (
    <div className="flex justify-center items-center min-h-[60vh]">
      <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-gold" />
    </div>
  )

  if (error || !listing || !card) return (
    <div className="max-w-2xl mx-auto px-6 py-20 text-center">
      <p className="text-red-400 text-lg mb-4">{error ?? 'Listing not found.'}</p>
      <Link to="/marketplace" className="text-gold hover:underline text-sm">← Back to Marketplace</Link>
    </div>
  )

  const storedStock = card.image_url?.includes('scrydex') ? card.image_url : null
  const userPhoto = card.image_url && !card.image_url.includes('scrydex') ? card.image_url : null
  const stockUrl = card.tcg_image_url || storedStock || (scrydexId ? getCardImageUrl(scrydexId, game) : null)

  const images: { key: ImageKey; url: string; label: string }[] = [
    ...(stockUrl ? [{ key: 'stock' as const, url: stockUrl, label: 'Stock' }] : []),
    ...(userPhoto ? [{ key: 'front' as const, url: userPhoto, label: 'Photo' }] : []),
    ...(card.back_image_url ? [{ key: 'back' as const, url: card.back_image_url, label: 'Back' }] : []),
  ]
  const activeImage = images.find(i => i.key === imageKey)?.url ?? images[0]?.url ?? null
  const conditionLabel = CONDITION_LABELS[card.condition ?? ''] ?? card.condition ?? 'Unknown'
  const displayName = sellerName ?? 'CardLoom Seller'
  const total = (listing.price * qty).toFixed(2)
  const setName = meta?.expansion?.name ?? card.card_set ?? ''
  const gameName = game === 'pokemon' ? 'Pokémon' : game.replace(/([A-Z])/g, ' $1').trim()

  // Price data computations
  const nmPrice = prices?.raw?.nm
  const lpPrice = prices?.raw?.lp
  const mpPrice = prices?.raw?.mp
  const hpPrice = prices?.raw?.hp
  const mostRecentSale = history.length > 0 ? history[history.length - 1].price : null
  const histMin = history.length > 0 ? Math.min(...history.map(p => p.price)) : null
  const histMax = history.length > 0 ? Math.max(...history.map(p => p.price)) : null
  const volatility = computeVolatility(history)
  const trend30 = prices?.trends?.days_30
  const hasPriceData = nmPrice != null

  return (
    <div className="max-w-7xl mx-auto px-4 md:px-6 py-8">

      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-xs text-gray-500 mb-6 flex-wrap">
        <Link to="/marketplace" className="hover:text-gold transition-colors">Marketplace</Link>
        <ChevronRight size={12} className="flex-shrink-0" />
        <span>{gameName}</span>
        {setName && (<><ChevronRight size={12} className="flex-shrink-0" /><span>{setName}</span></>)}
        <ChevronRight size={12} className="flex-shrink-0" />
        <span className="text-white font-medium">{card.name}{card.card_number ? ` - ${card.card_number}` : ''}</span>
      </nav>

      {/* Page title */}
      <h1 className="text-2xl md:text-3xl font-bold text-white mb-1">
        {card.name}
        {card.card_number && <span className="text-gray-400 font-normal"> - {card.card_number}</span>}
        {setName && <span className="text-gray-400 font-normal"> - {setName}</span>}
      </h1>
      {setName && <p className="text-gray-500 text-sm mb-8">{setName}</p>}

      {/* Main 3-col layout */}
      <div className="flex flex-col lg:flex-row gap-8 mb-10">

        {/* ── Left: Image ── */}
        <div className="lg:w-[300px] flex-shrink-0">
          <div className="bg-navy-900 rounded-2xl border border-white/5 overflow-hidden">
            <div className="aspect-[5/7] p-6 flex items-center justify-center bg-navy-900">
              {activeImage ? (
                <img src={activeImage} alt={card.name} className="w-full h-full object-contain" />
              ) : (
                <ImageIcon size={48} className="text-gray-700" />
              )}
            </div>
            {images.length > 1 && (
              <div className="flex gap-2 p-3 border-t border-white/5">
                {images.map(img => (
                  <button key={img.key} onClick={() => setImageKey(img.key)}
                    className={`w-12 h-16 rounded-lg overflow-hidden border-2 transition-colors flex-shrink-0 ${imageKey === img.key ? 'border-gold' : 'border-white/10 hover:border-white/30'}`}>
                    <img src={img.url} alt={img.label} className="w-full h-full object-cover" />
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ── Center: Product Details ── */}
        <div className="flex-1 min-w-0 order-3 lg:order-2">
          <div className="bg-navy-900 rounded-2xl border border-white/5 p-6">
            <h2 className="text-base font-bold text-white mb-4">Product Details</h2>
            <div className="divide-y divide-white/0">
              {meta?.rarity && <MetaRow label="Rarity">{meta.rarity}</MetaRow>}
              {(card.card_number || meta?.number) && (
                <MetaRow label="Number">{card.card_number ?? meta?.number}</MetaRow>
              )}
              {meta?.types && meta.types.length > 0 && (
                <MetaRow label="Card Type">
                  <div className="flex gap-1.5 flex-wrap">
                    {meta.types.map(t => <TypeBadge key={t} type={t} />)}
                  </div>
                </MetaRow>
              )}
              {meta?.hp && <MetaRow label="HP">{meta.hp}</MetaRow>}
              {(meta?.stage ?? meta?.subtypes?.[0]) && (
                <MetaRow label="Stage">{meta?.stage ?? meta?.subtypes?.[0]}</MetaRow>
              )}
              {meta?.weaknesses && meta.weaknesses.length > 0 && (
                <MetaRow label="Weakness">
                  <div className="flex gap-1.5 flex-wrap">
                    {meta.weaknesses.map((w, i) => (
                      <span key={i} className="flex items-center gap-1">
                        <TypeBadge type={w.type} />
                        <span className="text-gray-400 text-xs">{w.value}</span>
                      </span>
                    ))}
                  </div>
                </MetaRow>
              )}
              {meta?.retreat_cost != null && (
                <MetaRow label="Retreat Cost">{meta.retreat_cost}</MetaRow>
              )}
              {meta?.attacks && meta.attacks.map((atk, i) => (
                <MetaRow key={i} label={`Attack ${i + 1}`}>
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      {atk.cost && atk.cost.length > 0 && (
                        <span className="text-gray-500 text-xs">[{atk.cost.join('][')}]</span>
                      )}
                      <span className="font-semibold">{atk.name}</span>
                      {atk.damage && <span className="text-gold font-bold">({atk.damage})</span>}
                    </div>
                    {atk.text && <p className="text-gray-400 text-xs mt-1 leading-relaxed">{atk.text}</p>}
                  </div>
                </MetaRow>
              ))}
              {meta?.flavor_text && (
                <MetaRow label="Flavor Text">
                  <span className="text-gray-400 italic text-xs leading-relaxed">{meta.flavor_text}</span>
                </MetaRow>
              )}
              {!meta && (
                <>
                  {card.condition && <MetaRow label="Condition">{conditionLabel}</MetaRow>}
                  {card.card_set && <MetaRow label="Set">{card.card_set}</MetaRow>}
                  {card.year && <MetaRow label="Year">{card.year}</MetaRow>}
                </>
              )}
            </div>
          </div>
        </div>

        {/* ── Right: Purchase box ── */}
        <div className="lg:w-[300px] flex-shrink-0 order-2 lg:order-3">
          {step === 'detail' ? (
            <div className="bg-navy-900 rounded-2xl border border-white/5 p-6 flex flex-col gap-5 sticky top-6">
              <div>
                <p className="text-3xl font-bold text-white">${listing.price.toFixed(2)}</p>
                <p className="text-xs text-green-400 mt-1.5 flex items-center gap-1.5">
                  <Truck size={12} /> Free shipping
                </p>
              </div>
              <div className="border-t border-white/5 pt-4">
                <p className="text-[11px] text-gray-600 uppercase tracking-widest mb-2">Seller</p>
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-white/5 border border-white/10 flex items-center justify-center overflow-hidden flex-shrink-0">
                    {sellerAvatar
                      ? <img src={sellerAvatar} alt={displayName} className="w-full h-full object-cover" />
                      : <span className="text-sm font-bold text-gold">{displayName[0]?.toUpperCase()}</span>}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-white">{displayName}</p>
                    <div className="flex items-center gap-1 mt-0.5">
                      <Star size={11} className="text-gold fill-gold" />
                      <span className="text-xs text-gray-400">New Seller</span>
                    </div>
                  </div>
                </div>
              </div>
              <div className="border-t border-white/5 pt-4 flex flex-wrap gap-2">
                <span className="px-2.5 py-1 bg-white/5 rounded-lg text-xs font-medium text-gray-300 border border-white/10">
                  {conditionLabel}
                </span>
                {card.variant && (
                  <span className="px-2.5 py-1 bg-white/5 rounded-lg text-xs font-medium text-gold border border-gold/20">
                    {card.variant.replace(/([A-Z])/g, ' $1').trim()}
                  </span>
                )}
              </div>
              <div className="border-t border-white/5 pt-4">
                <p className="text-[11px] text-gray-600 uppercase tracking-widest mb-2">Quantity</p>
                <div className="flex items-center gap-3">
                  <button onClick={() => setQty(q => Math.max(1, q - 1))}
                    className="w-9 h-9 rounded-lg bg-white/5 border border-white/10 text-white font-bold hover:border-white/30 transition-colors active:scale-95">−</button>
                  <span className="text-white font-semibold w-5 text-center">{qty}</span>
                  <button onClick={() => setQty(q => Math.min(10, q + 1))}
                    className="w-9 h-9 rounded-lg bg-white/5 border border-white/10 text-white font-bold hover:border-white/30 transition-colors active:scale-95">+</button>
                  <span className="text-xs text-gray-600">1 available</span>
                </div>
              </div>
              <div className="flex flex-col gap-2 border-t border-white/5 pt-4">
                <span className="flex items-center gap-1.5 text-xs text-gray-500">
                  <Shield size={13} className="text-green-400" /> Buyer protection
                </span>
                <span className="flex items-center gap-1.5 text-xs text-gray-500">
                  <Package size={13} className="text-blue-400" /> Tracked shipping
                </span>
              </div>
              <button onClick={() => setStep('checkout')}
                className="w-full py-4 rounded-xl bg-gold text-navy-900 font-bold text-base hover:opacity-90 transition-all active:scale-[0.98]">
                Buy Now · ${total}
              </button>
            </div>
          ) : (
            <div className="bg-navy-900 rounded-2xl border border-white/5 overflow-hidden sticky top-6">
              <div className="flex items-center gap-3 px-5 py-4 border-b border-white/5">
                <button onClick={() => setStep('detail')} className="text-gray-400 hover:text-white transition-colors">
                  <ChevronLeft size={18} />
                </button>
                <span className="text-sm font-semibold text-white">Checkout</span>
              </div>
              <div className="p-5 border-b border-white/5 bg-navy-900/50">
                <div className="flex gap-3 mb-4">
                  {activeImage && (
                    <img src={activeImage} alt={card.name} className="w-14 object-contain rounded-lg bg-navy-900 p-1 flex-shrink-0" style={{height:'4.5rem'}} />
                  )}
                  <div className="min-w-0">
                    <p className="text-white text-sm font-semibold leading-tight truncate">{card.name}</p>
                    {card.card_number && <p className="text-gray-500 text-xs">#{card.card_number}</p>}
                    <p className="text-gray-500 text-xs mt-0.5">{conditionLabel}</p>
                  </div>
                </div>
                <div className="space-y-1.5 text-sm border-t border-white/5 pt-3">
                  <div className="flex justify-between text-gray-400"><span>Subtotal ({qty}×)</span><span>${total}</span></div>
                  <div className="flex justify-between text-gray-400"><span>Shipping</span><span className="text-green-400">Free</span></div>
                  <div className="flex justify-between text-white font-bold border-t border-white/5 pt-2 mt-1"><span>Total</span><span>${total}</span></div>
                </div>
              </div>
              <div className="p-5 flex flex-col gap-4">
                <div>
                  <p className="text-[11px] text-gray-600 uppercase tracking-widest mb-2">Shipping Address</p>
                  <div className="grid grid-cols-2 gap-2">
                    {([
                      { label: 'Full Name', key: 'name', span: 2 },
                      { label: 'Address', key: 'address', span: 2 },
                      { label: 'City', key: 'city', span: 1 },
                      { label: 'State', key: 'state', span: 1 },
                      { label: 'ZIP', key: 'zip', span: 1 },
                      { label: 'Country', key: 'country', span: 1 },
                    ] as { label: string; key: keyof typeof shipping; span: 1 | 2 }[]).map(f => (
                      <input key={f.key} placeholder={f.label} value={shipping[f.key]}
                        onChange={e => setShipping(p => ({ ...p, [f.key]: e.target.value }))}
                        className={`${f.span === 2 ? 'col-span-2' : ''} bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-xs text-white placeholder-gray-600 focus:outline-none focus:border-gold/40 transition-colors`}
                      />
                    ))}
                  </div>
                </div>
                <div>
                  <p className="text-[11px] text-gray-600 uppercase tracking-widest mb-2">Payment</p>
                  <div className="bg-white/5 border border-dashed border-white/15 rounded-xl p-4 flex flex-col items-center gap-1.5">
                    <Shield size={16} className="text-gray-600" />
                    <p className="text-xs text-gray-500 font-medium">Secure Payment</p>
                    <p className="text-[11px] text-gray-700">Stripe integration coming soon</p>
                  </div>
                </div>
                {orderPlaced ? (
                  <div className="py-4 px-4 rounded-xl bg-green-600/15 border border-green-500/25 text-center">
                    <p className="text-green-400 font-semibold text-sm">Order received!</p>
                    <p className="text-green-400/60 text-xs mt-1">We'll notify you when ready.</p>
                  </div>
                ) : (
                  <button onClick={() => setOrderPlaced(true)}
                    className="w-full py-3.5 rounded-xl bg-gold text-navy-900 font-bold text-sm hover:opacity-90 transition-all active:scale-[0.98]">
                    Place Order · ${total}
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Bottom: Price History + Market Data ── */}
      {scrydexId && (
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 mb-6">

          {/* Market Price History (2/3 wide) */}
          <div className="xl:col-span-2 bg-navy-900 rounded-2xl border border-white/5 p-6">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-base font-bold text-white">Market Price History</h2>
              <div className="flex gap-1">
                {WINDOW_OPTIONS.map(w => (
                  <button key={w.days} onClick={() => setWindowDays(w.days)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                      windowDays === w.days
                        ? 'bg-white/10 text-white border border-white/20'
                        : 'text-gray-500 hover:text-gray-300'
                    }`}>
                    {w.label}
                  </button>
                ))}
              </div>
            </div>
            {historyLoading ? (
              <div className="flex justify-center py-10">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-gold" />
              </div>
            ) : history.length > 1 ? (
              <PriceHistoryChart points={history} />
            ) : (
              <div className="flex flex-col items-center justify-center py-10 text-gray-600 text-sm">
                No price history available
              </div>
            )}
          </div>

          {/* Right column: Comparison + Snapshot */}
          <div className="flex flex-col gap-6">

            {/* Condition Comparison Prices */}
            {hasPriceData && (
              <div className="bg-navy-900 rounded-2xl border border-white/5 p-5">
                <h2 className="text-sm font-bold text-white mb-1">Near Mint Comparison Prices</h2>
                <p className="text-xs text-gray-600 mb-4">Market prices for this card by condition</p>
                <div className="space-y-1">
                  {([
                    { label: 'Near Mint', val: nmPrice },
                    { label: 'Lightly Played', val: lpPrice },
                    { label: 'Moderately Played', val: mpPrice },
                    { label: 'Heavily Played', val: hpPrice },
                  ]).filter(r => r.val != null).map(row => (
                    <div key={row.label}
                      className="flex justify-between items-center py-2.5 border-b border-white/5 last:border-0">
                      <span className="text-sm text-gray-300">{row.label}</span>
                      <span className="text-sm font-semibold text-white">{fmt(row.val)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Price Points */}
            {hasPriceData && (
              <div className="bg-navy-900 rounded-2xl border border-white/5 p-5">
                <div className="flex items-start justify-between mb-4">
                  <h2 className="text-sm font-bold text-white">Price Points</h2>
                  {card.variant && (
                    <span className="text-xs text-gray-500">{card.variant.replace(/([A-Z])/g, ' $1').trim()}</span>
                  )}
                </div>

                {/* Market price row */}
                <div className="flex justify-between items-center mb-1">
                  <span className="text-sm font-bold text-white">Market Price</span>
                  <span className="text-sm font-bold text-white">{fmt(nmPrice)}</span>
                </div>
                <div className="flex justify-between items-center mb-4">
                  <span className="text-xs text-gray-500">Most Recent Sale</span>
                  <span className="text-xs text-gray-400">{fmt(mostRecentSale)}</span>
                </div>

                {/* Trend */}
                {trend30 && (
                  <div className="flex items-center gap-2 mb-4 pb-4 border-b border-white/5">
                    {trend30.percent_change >= 0
                      ? <TrendingUp size={14} className="text-green-400" />
                      : <TrendingDown size={14} className="text-red-400" />}
                    <span className={`text-xs font-semibold ${trend30.percent_change >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                      {trend30.percent_change >= 0 ? '+' : ''}{trend30.percent_change.toFixed(1)}% (30d)
                    </span>
                  </div>
                )}

                {/* Volatility bar */}
                <div className="mb-4 pb-4 border-b border-white/5">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-xs text-gray-500 italic font-medium">{volatility.label} Volatility</span>
                  </div>
                  <div className="relative h-2 bg-white/8 rounded-full overflow-hidden">
                    <div
                      className={`absolute inset-y-0 left-0 rounded-full transition-all duration-500 ${
                        volatility.label === 'Low' ? 'bg-green-500' :
                        volatility.label === 'Med' ? 'bg-blue-500' : 'bg-orange-500'
                      }`}
                      style={{ width: `${Math.round(volatility.pct * 100)}%` }}
                    />
                  </div>
                  <div className="flex justify-between text-[10px] text-gray-700 mt-1">
                    <span>Low</span><span>High</span>
                  </div>
                </div>

                {/* Listed median placeholder + period range */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-[11px] text-gray-600 mb-0.5">Listed Median</p>
                    <p className="text-sm text-gray-400">-</p>
                  </div>
                  <div>
                    <p className="text-[11px] text-gray-600 mb-0.5">Price Range</p>
                    <p className="text-sm text-gray-400">
                      {histMin != null && histMax != null ? `${fmt(histMin)} – ${fmt(histMax)}` : '-'}
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 3-Month Snapshot */}
      {scrydexId && (histMin != null || histMax != null) && (
        <div className="bg-navy-900 rounded-2xl border border-white/5 p-6 mb-6">
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-base font-bold text-white">
              {WINDOW_OPTIONS.find(w => w.days === windowDays)?.label ?? '3M'} Snapshot
            </h2>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            <div>
              <p className="text-xs text-gray-500 mb-1">Low Sale Price</p>
              <p className="text-xl font-bold text-white">{fmt(histMin)}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500 mb-1">High Sale Price</p>
              <p className="text-xl font-bold text-white">{fmt(histMax)}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500 mb-1">Market Price</p>
              <p className="text-xl font-bold text-white">{fmt(nmPrice)}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500 mb-1">30d Change</p>
              <p className={`text-xl font-bold flex items-center gap-1 ${
                (trend30?.percent_change ?? 0) >= 0 ? 'text-green-400' : 'text-red-400'
              }`}>
                {trend30 ? (
                  <>
                    {trend30.percent_change >= 0
                      ? <TrendingUp size={16} />
                      : <TrendingDown size={16} />}
                    {trend30.percent_change >= 0 ? '+' : ''}{trend30.percent_change.toFixed(1)}%
                  </>
                ) : '-'}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
