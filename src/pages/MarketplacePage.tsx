import { useState, useEffect } from 'react'
import { ImageIcon } from 'lucide-react'
import { useNavigate } from '@tanstack/react-router'
import { supabase } from '../lib/supabase'
import { getCardImageUrl } from '../lib/scrydex'
import { PriceTicker } from '../components/PriceTicker'

interface Listing {
  id: string
  price: number
  status: string
  seller_id: string
  cards: {
    id: string
    name: string
    card_set?: string
    card_number?: string
    year?: number
    condition?: string
    image_url?: string
    back_image_url?: string
    scrydex_id?: string
    price_change_pct?: number
    game?: string
    variant?: string
    tcg_image_url?: string
  } | null
}

type ImageOption = 'stock' | 'front' | 'back'

export function MarketplacePage() {
  const navigate = useNavigate()
  const [listings, setListings] = useState<Listing[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [imageSide, setImageSide] = useState<Record<string, ImageOption>>({})

  useEffect(() => {
    async function fetchListings() {
      setLoading(true)
      const { data: rows, error } = await supabase
        .from('listings')
        .select('id, price, status, card_id, seller_id, created_at')
        .eq('status', 'active')
        .order('created_at', { ascending: false })

      if (error) {
        setError(error.message)
        setLoading(false)
        return
      }

      const cardIds = [...new Set((rows ?? []).map((r) => r.card_id).filter(Boolean))]
      let byId: Record<string, NonNullable<Listing['cards']>> = {}
      if (cardIds.length) {
        const { data: cards } = await supabase.from('marketplace_cards').select('*').in('id', cardIds)
        byId = Object.fromEntries(
          (cards ?? []).map((c) => [c.id as string, c as NonNullable<Listing['cards']>])
        )
      }

      setListings(
        (rows ?? []).map((r) => ({
          id: r.id,
          price: r.price,
          status: r.status,
          seller_id: r.seller_id,
          cards: byId[r.card_id] ?? null,
        }))
      )
      setLoading(false)
    }
    fetchListings()
  }, [])

  return (
    <div className="max-w-7xl mx-auto px-6 py-12">
      {/* Header */}
      <div className="mb-10">
        <p className="text-gold text-xs font-semibold tracking-widest mb-2">THE MARKETPLACE</p>
        <h1 className="font-heading text-4xl md:text-5xl font-bold text-white mb-3">
          Find your next grail.
        </h1>
        <p className="text-gray-400 text-lg">Cards listed by Cardloom collectors.</p>
      </div>

      {loading && (
        <div className="flex justify-center py-20">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gold" />
        </div>
      )}

      {error && (
        <div className="p-4 bg-red-900/30 border border-red-500/30 rounded-xl text-red-400 text-sm">
          Error loading listings: {error}
        </div>
      )}

      {!loading && !error && listings.length === 0 && (
        <div className="text-center py-24">
          <div className="w-16 h-16 bg-navy-900 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-white/5">
            <ImageIcon size={28} className="text-gray-600" />
          </div>
          <h3 className="font-heading text-xl font-semibold text-white mb-2">No listings yet.</h3>
          <p className="text-gray-500 text-sm">Be the first to sell.</p>
        </div>
      )}

      {!loading && !error && listings.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5">
          {listings.map((listing) => {
            const card = listing.cards
            if (!card) return null

            const storedStock = card.image_url?.includes('scrydex') ? card.image_url : null
            const userPhoto = card.image_url && !card.image_url.includes('scrydex') ? card.image_url : null
            const stockUrl = card.tcg_image_url || storedStock || (card.scrydex_id ? getCardImageUrl(card.scrydex_id, card.game) : null)
            const images: { key: ImageOption; url: string; label: string }[] = [
              ...(stockUrl ? [{ key: 'stock' as const, url: stockUrl, label: 'Stock' }] : []),
              ...(userPhoto ? [{ key: 'front' as const, url: userPhoto, label: 'Photo' }] : []),
              ...(card.back_image_url ? [{ key: 'back' as const, url: card.back_image_url, label: 'Back' }] : []),
            ]
            const selected_key = imageSide[listing.id] ?? images[0]?.key
            const imageUrl = images.find((img) => img.key === selected_key)?.url ?? null

            return (
              <div
                key={listing.id}
                onClick={() => navigate({ to: '/marketplace/$listingId', params: { listingId: listing.id } })}
                className="bg-navy-900 rounded-2xl border border-white/5 overflow-hidden hover:border-gold/30 transition-colors cursor-pointer group"
              >
                <div className="relative aspect-[5/7] bg-navy-900 p-4">
                  {imageUrl ? (
                    <img
                      src={imageUrl}
                      alt={card.name}
                      loading="lazy"
                      decoding="async"
                      className="w-full h-full object-contain rounded-md group-hover:scale-[1.02] transition-transform duration-200"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <ImageIcon size={32} className="text-gray-700" />
                    </div>
                  )}
                </div>

                {images.length > 1 && (
                  <div className="flex gap-1.5 px-3 pt-3" onClick={e => e.stopPropagation()}>
                    {images.map((img) => (
                      <button
                        key={img.key}
                        onClick={() => setImageSide((prev) => ({ ...prev, [listing.id]: img.key }))}
                        className={`w-10 h-14 rounded-md overflow-hidden border-2 flex-shrink-0 transition-colors ${
                          selected_key === img.key ? 'border-gold' : 'border-white/10 hover:border-white/30'
                        }`}
                        title={img.label}
                      >
                        <img src={img.url} alt={img.label} className="w-full h-full object-cover" />
                      </button>
                    ))}
                  </div>
                )}

                <div className="p-4">
                  <p className="text-white font-semibold text-sm truncate">
                    {card.name}
                    {card.card_number && <span className="text-gray-500 font-normal"> #{card.card_number}</span>}
                  </p>
                  <p className="text-gray-500 text-xs mt-0.5 truncate">
                    {[card.card_set, card.year, card.condition].filter(Boolean).join(' · ')}
                  </p>
                  <div className="flex items-center gap-2 mt-3">
                    <span className="text-gold font-bold">${listing.price.toFixed(2)}</span>
                    {card.price_change_pct != null && (
                      <PriceTicker pct={card.price_change_pct} size="sm" />
                    )}
                  </div>
                  <div className="mt-3 pt-3 border-t border-white/5">
                    <span className="block w-full text-center text-xs py-2 rounded-lg bg-gold/10 text-gold font-semibold group-hover:bg-gold group-hover:text-navy-900 transition-colors">
                      View Listing →
                    </span>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

    </div>
  )
}
