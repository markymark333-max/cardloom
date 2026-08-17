import { useState, useEffect } from 'react'
import { Link, useParams } from '@tanstack/react-router'
import { ChevronRight, Star, Truck, Shield, Package, ImageIcon, ChevronLeft } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { getCardImageUrl, getCardMeta, getCardHistory, CardMeta, PricePoint } from '../lib/scrydex'
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
  Dragon: 'bg-indigo-500/20 text-indigo-400 border-indigo-500/30',
  Fairy: 'bg-pink-500/20 text-pink-400 border-pink-500/30',
  Colorless: 'bg-white/10 text-gray-300 border-white/20',
}

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

export function ListingPage() {
  const { listingId } = useParams({ from: '/marketplace/$listingId' })
  const [listing, setListing] = useState<ListingRecord | null>(null)
  const [card, setCard] = useState<CardRecord | null>(null)
  const [meta, setMeta] = useState<CardMeta | null>(null)
  const [history, setHistory] = useState<PricePoint[]>([])
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

  useEffect(() => {
    async function load() {
      setLoading(true)
      setError(null)

      // 1. Fetch listing
      const { data: listingRow, error: listErr } = await supabase
        .from('listings')
        .select('id, price, status, seller_id, card_id')
        .eq('id', listingId)
        .single()
      if (listErr || !listingRow) { setError('Listing not found.'); setLoading(false); return }
      setListing(listingRow)

      // 2. Fetch card from safe marketplace view
      const { data: cardRow } = await supabase
        .from('marketplace_cards')
        .select('*')
        .eq('id', listingRow.card_id)
        .single()
      if (cardRow) setCard(cardRow as CardRecord)

      // 3. Fetch seller profile
      supabase
        .from('profiles')
        .select('username, avatar_url')
        .eq('id', listingRow.seller_id)
        .single()
        .then(({ data }) => { setSellerName(data?.username ?? null); setSellerAvatar(data?.avatar_url ?? null) })

      setLoading(false)

      // 4. Fetch Scrydex meta + price history in parallel (non-blocking)
      if (cardRow?.scrydex_id) {
        const game = cardRow.game ?? 'pokemon'
        getCardMeta(cardRow.scrydex_id, game).then(setMeta)
        getCardHistory(cardRow.scrydex_id, 90, game).then(setHistory)
      }
    }
    load()
  }, [listingId])

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

  const game = card.game ?? 'pokemon'
  const storedStock = card.image_url?.includes('scrydex') ? card.image_url : null
  const userPhoto = card.image_url && !card.image_url.includes('scrydex') ? card.image_url : null
  const stockUrl = card.tcg_image_url || storedStock || (card.scrydex_id ? getCardImageUrl(card.scrydex_id, game) : null)

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

      {/* Main 2-col layout */}
      <div className="flex flex-col lg:flex-row gap-8 mb-10">

        {/* ── Left: Image ── */}
        <div className="lg:w-[320px] flex-shrink-0">
          <div className="bg-navy-800 rounded-2xl border border-white/5 overflow-hidden">
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
                  <button
                    key={img.key}
                    onClick={() => setImageKey(img.key)}
                    className={`w-12 h-16 rounded-lg overflow-hidden border-2 transition-colors flex-shrink-0 ${
                      imageKey === img.key ? 'border-gold' : 'border-white/10 hover:border-white/30'
                    }`}
                  >
                    <img src={img.url} alt={img.label} className="w-full h-full object-cover" />
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ── Center: Product Details ── */}
        <div className="flex-1 min-w-0">
          <div className="bg-navy-800 rounded-2xl border border-white/5 p-6">
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
              {/* Fallback if no meta yet */}
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
        <div className="lg:w-[300px] flex-shrink-0">
          {step === 'detail' ? (
            <div className="bg-navy-800 rounded-2xl border border-white/5 p-6 flex flex-col gap-5 sticky top-6">

              {/* Price */}
              <div>
                <p className="text-3xl font-bold text-white">${listing.price.toFixed(2)}</p>
                <p className="text-xs text-green-400 mt-1.5 flex items-center gap-1.5">
                  <Truck size={12} /> Free shipping
                </p>
              </div>

              {/* Seller */}
              <div className="border-t border-white/5 pt-4">
                <p className="text-[11px] text-gray-600 uppercase tracking-widest mb-2">Seller</p>
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-navy-900 border border-white/10 flex items-center justify-center overflow-hidden flex-shrink-0">
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

              {/* Condition + variant */}
              <div className="border-t border-white/5 pt-4 flex flex-wrap gap-2">
                <span className="px-2.5 py-1 bg-navy-900 rounded-lg text-xs font-medium text-gray-300 border border-white/10">
                  {conditionLabel}
                </span>
                {card.variant && (
                  <span className="px-2.5 py-1 bg-navy-900 rounded-lg text-xs font-medium text-gold border border-gold/20">
                    {card.variant.replace(/([A-Z])/g, ' $1').trim()}
                  </span>
                )}
              </div>

              {/* Qty */}
              <div className="border-t border-white/5 pt-4">
                <p className="text-[11px] text-gray-600 uppercase tracking-widest mb-2">Quantity</p>
                <div className="flex items-center gap-3">
                  <button onClick={() => setQty(q => Math.max(1, q - 1))}
                    className="w-9 h-9 rounded-lg bg-navy-900 border border-white/10 text-white font-bold hover:border-white/30 transition-colors active:scale-95">−</button>
                  <span className="text-white font-semibold w-5 text-center">{qty}</span>
                  <button onClick={() => setQty(q => Math.min(10, q + 1))}
                    className="w-9 h-9 rounded-lg bg-navy-900 border border-white/10 text-white font-bold hover:border-white/30 transition-colors active:scale-95">+</button>
                  <span className="text-xs text-gray-600">1 available</span>
                </div>
              </div>

              {/* Trust */}
              <div className="flex flex-col gap-2 border-t border-white/5 pt-4">
                <span className="flex items-center gap-1.5 text-xs text-gray-500">
                  <Shield size={13} className="text-green-400" /> Buyer protection
                </span>
                <span className="flex items-center gap-1.5 text-xs text-gray-500">
                  <Package size={13} className="text-blue-400" /> Tracked shipping
                </span>
              </div>

              <button
                onClick={() => setStep('checkout')}
                className="w-full py-4 rounded-xl bg-gold text-navy-900 font-bold text-base hover:opacity-90 transition-all active:scale-[0.98]"
              >
                Buy Now · ${total}
              </button>
            </div>
          ) : (
            /* Checkout panel */
            <div className="bg-navy-800 rounded-2xl border border-white/5 overflow-hidden sticky top-6">
              <div className="flex items-center gap-3 px-5 py-4 border-b border-white/5">
                <button onClick={() => setStep('detail')} className="text-gray-400 hover:text-white transition-colors">
                  <ChevronLeft size={18} />
                </button>
                <span className="text-sm font-semibold text-white">Checkout</span>
              </div>

              {/* Mini order summary */}
              <div className="p-5 border-b border-white/5 bg-navy-900/50">
                <div className="flex gap-3 mb-4">
                  {activeImage && (
                    <img src={activeImage} alt={card.name} className="w-14 h-18 object-contain rounded-lg bg-navy-900 p-1 flex-shrink-0" style={{height:'4.5rem'}} />
                  )}
                  <div className="min-w-0">
                    <p className="text-white text-sm font-semibold leading-tight truncate">{card.name}</p>
                    {card.card_number && <p className="text-gray-500 text-xs">#{card.card_number}</p>}
                    <p className="text-gray-500 text-xs mt-0.5">{conditionLabel}</p>
                  </div>
                </div>
                <div className="space-y-1.5 text-sm border-t border-white/5 pt-3">
                  <div className="flex justify-between text-gray-400">
                    <span>Subtotal ({qty}×)</span><span>${total}</span>
                  </div>
                  <div className="flex justify-between text-gray-400">
                    <span>Shipping</span><span className="text-green-400">Free</span>
                  </div>
                  <div className="flex justify-between text-white font-bold border-t border-white/5 pt-2 mt-1">
                    <span>Total</span><span>${total}</span>
                  </div>
                </div>
              </div>

              <div className="p-5 flex flex-col gap-4">
                {/* Shipping */}
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
                      <input key={f.key} placeholder={f.label}
                        value={shipping[f.key]}
                        onChange={e => setShipping(p => ({ ...p, [f.key]: e.target.value }))}
                        className={`${f.span === 2 ? 'col-span-2' : ''} bg-navy-900 border border-white/10 rounded-xl px-3 py-2.5 text-xs text-white placeholder-gray-600 focus:outline-none focus:border-gold/40 transition-colors`}
                      />
                    ))}
                  </div>
                </div>

                {/* Payment placeholder */}
                <div>
                  <p className="text-[11px] text-gray-600 uppercase tracking-widest mb-2">Payment</p>
                  <div className="bg-navy-900 border border-dashed border-white/15 rounded-xl p-4 flex flex-col items-center gap-1.5">
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

      {/* Price history chart */}
      {history.length > 0 && (
        <div className="bg-navy-800 rounded-2xl border border-white/5 p-6 mb-6">
          <h2 className="text-base font-bold text-white mb-4">Market Price History</h2>
          <PriceHistoryChart points={history} />
        </div>
      )}
    </div>
  )
}
