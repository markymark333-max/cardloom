import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { X, ChevronLeft, Star, Truck, Shield, Package, ImageIcon } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { getCardImageUrl } from '../lib/scrydex'

interface ListingCard {
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
}

export interface ListingDetail {
  id: string
  price: number
  seller_id: string
  cards: ListingCard | null
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

function fmtVariant(v: string) {
  return v.replace(/([A-Z])/g, ' $1').trim()
}

export function ListingDetailDialog({ listing, onClose }: { listing: ListingDetail; onClose: () => void }) {
  const [step, setStep] = useState<Step>('detail')
  const [sellerName, setSellerName] = useState<string | null>(null)
  const [sellerAvatar, setSellerAvatar] = useState<string | null>(null)
  const [qty, setQty] = useState(1)
  const [imageKey, setImageKey] = useState<ImageKey>('stock')
  const [orderPlaced, setOrderPlaced] = useState(false)
  const [shipping, setShipping] = useState({
    name: '', address: '', city: '', state: '', zip: '', country: 'US',
  })

  const card = listing.cards
  const game = card?.game ?? 'pokemon'

  const storedStock = card?.image_url?.includes('scrydex') ? card.image_url : null
  const userPhoto = card?.image_url && !card.image_url.includes('scrydex') ? card.image_url : null
  const stockUrl = card?.tcg_image_url || storedStock || (card?.scrydex_id ? getCardImageUrl(card.scrydex_id, game) : null)

  const images: { key: ImageKey; url: string; label: string }[] = [
    ...(stockUrl ? [{ key: 'stock' as const, url: stockUrl, label: 'Stock' }] : []),
    ...(userPhoto ? [{ key: 'front' as const, url: userPhoto, label: 'Photo' }] : []),
    ...(card?.back_image_url ? [{ key: 'back' as const, url: card.back_image_url, label: 'Back' }] : []),
  ]
  const activeImage = images.find(i => i.key === imageKey)?.url ?? images[0]?.url ?? null

  useEffect(() => {
    if (images[0]) setImageKey(images[0].key)
    setStep('detail')
    setOrderPlaced(false)
    setQty(1)
  }, [listing.id])

  useEffect(() => {
    if (!listing.seller_id) return
    supabase
      .from('profiles')
      .select('username, avatar_url')
      .eq('id', listing.seller_id)
      .single()
      .then(({ data }) => {
        setSellerName(data?.username ?? null)
        setSellerAvatar(data?.avatar_url ?? null)
      })
  }, [listing.seller_id])

  const conditionLabel = CONDITION_LABELS[card?.condition ?? ''] ?? card?.condition ?? 'Unknown'
  const displayName = sellerName ?? 'CardLoom Seller'
  const total = (listing.price * qty).toFixed(2)

  return createPortal(
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/90 backdrop-blur-sm"
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-[#111113] rounded-2xl border border-white/10 w-full max-w-4xl max-h-[92vh] overflow-y-auto shadow-2xl">

        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-white/5">
          <div className="flex items-center gap-3">
            {step === 'checkout' && (
              <button onClick={() => setStep('detail')} className="text-gray-400 hover:text-white transition-colors">
                <ChevronLeft size={20} />
              </button>
            )}
            <span className="text-sm font-semibold text-white">
              {step === 'detail' ? 'Listing' : 'Checkout'}
            </span>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">
            <X size={20} />
          </button>
        </div>

        {step === 'detail' ? (
          <div className="flex flex-col md:flex-row">

            {/* ── Left: image ── */}
            <div className="md:w-[42%] p-6 flex flex-col items-center gap-4 border-b md:border-b-0 md:border-r border-white/5">
              <div className="w-full aspect-[5/7] bg-navy-900 rounded-xl overflow-hidden flex items-center justify-center">
                {activeImage ? (
                  <img src={activeImage} alt={card?.name ?? ''} className="w-full h-full object-contain p-6" />
                ) : (
                  <ImageIcon size={40} className="text-gray-700" />
                )}
              </div>
              {images.length > 1 && (
                <div className="flex gap-2">
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

            {/* ── Right: details ── */}
            <div className="md:w-[58%] p-6 flex flex-col gap-5">

              {/* Card name + badges */}
              <div>
                <h2 className="text-xl font-bold text-white leading-tight">
                  {card?.name}
                  {card?.card_number && (
                    <span className="text-gray-400 font-normal"> #{card.card_number}</span>
                  )}
                </h2>
                {(card?.card_set || card?.year) && (
                  <p className="text-gray-500 text-sm mt-1">
                    {[card.card_set, card.year].filter(Boolean).join(' · ')}
                  </p>
                )}
                <div className="flex flex-wrap gap-2 mt-3">
                  <span className="px-2.5 py-1 bg-navy-900 rounded-lg text-xs font-medium text-gray-300 border border-white/10">
                    {conditionLabel}
                  </span>
                  {card?.variant && (
                    <span className="px-2.5 py-1 bg-navy-900 rounded-lg text-xs font-medium text-gold border border-gold/20">
                      {fmtVariant(card.variant)}
                    </span>
                  )}
                </div>
              </div>

              {/* Price */}
              <div className="border-t border-white/5 pt-4">
                <p className="text-3xl font-bold text-white">${listing.price.toFixed(2)}</p>
                <p className="text-xs text-gray-500 mt-1.5 flex items-center gap-1.5">
                  <Truck size={12} className="text-green-400" />
                  <span className="text-green-400">Free shipping</span>
                </p>
              </div>

              {/* Seller */}
              <div className="border-t border-white/5 pt-4">
                <p className="text-[11px] text-gray-600 uppercase tracking-widest mb-3">Seller</p>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-navy-900 border border-white/10 flex items-center justify-center overflow-hidden flex-shrink-0">
                    {sellerAvatar ? (
                      <img src={sellerAvatar} alt={displayName} className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-sm font-bold text-gold">{displayName[0]?.toUpperCase()}</span>
                    )}
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

              {/* Qty */}
              <div className="border-t border-white/5 pt-4">
                <p className="text-[11px] text-gray-600 uppercase tracking-widest mb-3">Quantity</p>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setQty(q => Math.max(1, q - 1))}
                    className="w-9 h-9 rounded-lg bg-navy-900 border border-white/10 text-white font-bold hover:border-white/30 transition-colors active:scale-95"
                  >
                    −
                  </button>
                  <span className="text-white font-semibold w-5 text-center">{qty}</span>
                  <button
                    onClick={() => setQty(q => Math.min(10, q + 1))}
                    className="w-9 h-9 rounded-lg bg-navy-900 border border-white/10 text-white font-bold hover:border-white/30 transition-colors active:scale-95"
                  >
                    +
                  </button>
                  <span className="text-xs text-gray-600">1 available</span>
                </div>
              </div>

              {/* Trust badges */}
              <div className="flex flex-wrap gap-5 border-t border-white/5 pt-4">
                <span className="flex items-center gap-1.5 text-xs text-gray-500">
                  <Shield size={13} className="text-green-400" /> Buyer protection
                </span>
                <span className="flex items-center gap-1.5 text-xs text-gray-500">
                  <Package size={13} className="text-blue-400" /> Tracked shipping
                </span>
              </div>

              {/* CTA */}
              <button
                onClick={() => setStep('checkout')}
                className="w-full py-4 rounded-xl bg-gold text-navy-900 font-bold text-base hover:opacity-90 transition-all active:scale-[0.98]"
              >
                Buy Now · ${total}
              </button>
            </div>
          </div>
        ) : (
          /* ── Checkout step ── */
          <div className="flex flex-col md:flex-row">

            {/* Order summary sidebar */}
            <div className="md:w-[38%] p-6 border-b md:border-b-0 md:border-r border-white/5 bg-[#0d0d0f]">
              <p className="text-[11px] text-gray-600 uppercase tracking-widest mb-4">Order Summary</p>
              <div className="flex gap-3 mb-5">
                {activeImage ? (
                  <img src={activeImage} alt={card?.name ?? ''} className="w-16 h-20 object-contain rounded-lg bg-navy-900 p-1 flex-shrink-0" />
                ) : (
                  <div className="w-16 h-20 rounded-lg bg-navy-900 flex items-center justify-center flex-shrink-0">
                    <ImageIcon size={20} className="text-gray-700" />
                  </div>
                )}
                <div className="min-w-0">
                  <p className="text-white text-sm font-semibold leading-tight">{card?.name}</p>
                  {card?.card_number && <p className="text-gray-500 text-xs mt-0.5">#{card.card_number}</p>}
                  <p className="text-gray-500 text-xs mt-1">{conditionLabel}</p>
                  {card?.variant && (
                    <p className="text-gold text-xs mt-0.5">{fmtVariant(card.variant)}</p>
                  )}
                </div>
              </div>
              <div className="space-y-2 border-t border-white/5 pt-4 text-sm">
                <div className="flex justify-between text-gray-400">
                  <span>Subtotal ({qty}×)</span>
                  <span>${total}</span>
                </div>
                <div className="flex justify-between text-gray-400">
                  <span>Shipping</span>
                  <span className="text-green-400">Free</span>
                </div>
                <div className="flex justify-between text-white font-bold text-base border-t border-white/5 pt-3 mt-1">
                  <span>Total</span>
                  <span>${total}</span>
                </div>
              </div>
            </div>

            {/* Shipping + payment */}
            <div className="md:w-[62%] p-6 flex flex-col gap-6">

              {/* Shipping address */}
              <div>
                <p className="text-[11px] text-gray-600 uppercase tracking-widest mb-3">Shipping Address</p>
                <div className="grid grid-cols-2 gap-3">
                  {([
                    { label: 'Full Name', key: 'name', span: 2 },
                    { label: 'Street Address', key: 'address', span: 2 },
                    { label: 'City', key: 'city', span: 1 },
                    { label: 'State', key: 'state', span: 1 },
                    { label: 'ZIP Code', key: 'zip', span: 1 },
                    { label: 'Country', key: 'country', span: 1 },
                  ] as { label: string; key: keyof typeof shipping; span: 1 | 2 }[]).map(f => (
                    <input
                      key={f.key}
                      placeholder={f.label}
                      value={shipping[f.key]}
                      onChange={e => setShipping(prev => ({ ...prev, [f.key]: e.target.value }))}
                      className={`${f.span === 2 ? 'col-span-2' : ''} bg-navy-900 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-gold/40 transition-colors`}
                    />
                  ))}
                </div>
              </div>

              {/* Payment */}
              <div>
                <p className="text-[11px] text-gray-600 uppercase tracking-widest mb-3">Payment</p>
                <div className="bg-navy-900 border border-dashed border-white/15 rounded-xl p-6 flex flex-col items-center justify-center gap-2 min-h-[100px]">
                  <div className="flex items-center gap-2 text-gray-500">
                    {/* Stripe card element will mount here */}
                    <Shield size={16} className="text-gray-600" />
                    <span className="text-sm font-medium">Secure Payment</span>
                  </div>
                  <p className="text-xs text-gray-600">Stripe integration coming soon</p>
                </div>
              </div>

              {/* Place order */}
              {orderPlaced ? (
                <div className="py-5 px-6 rounded-xl bg-green-600/15 border border-green-500/25 text-center">
                  <p className="text-green-400 font-semibold text-base">Order received!</p>
                  <p className="text-green-400/60 text-xs mt-1">We'll notify you when payment is ready to process.</p>
                </div>
              ) : (
                <button
                  onClick={() => setOrderPlaced(true)}
                  className="w-full py-4 rounded-xl bg-gold text-navy-900 font-bold text-base hover:opacity-90 transition-all active:scale-[0.98]"
                >
                  Place Order · ${total}
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body
  )
}
