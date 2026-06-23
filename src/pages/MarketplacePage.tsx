import { useState, useEffect } from 'react'
import { ImageIcon } from 'lucide-react'
import { supabase } from '../lib/supabase'

interface Listing {
  id: string
  price: number
  status: string
  cards: {
    id: string
    name: string
    set_name?: string
    year?: number
    condition?: string
    front_image_url?: string
    market_price?: number
  } | null
}

export function MarketplacePage() {
  const [listings, setListings] = useState<Listing[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function fetchListings() {
      setLoading(true)
      const { data, error } = await supabase
        .from('listings')
        .select('*, cards(*)')
        .eq('status', 'active')
        .order('created_at', { ascending: false })

      if (error) {
        setError(error.message)
      } else {
        setListings(data as Listing[])
      }
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

      {/* Content */}
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
          <div className="w-16 h-16 bg-navy-800 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-white/5">
            <ImageIcon size={28} className="text-gray-600" />
          </div>
          <h3 className="font-heading text-xl font-semibold text-white mb-2">No listings yet.</h3>
          <p className="text-gray-500 text-sm">Be the first to sell.</p>
        </div>
      )}

      {!loading && !error && listings.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5">
          {listings.map((listing) => {
            const card = listing.cards
            if (!card) return null
            return (
              <div
                key={listing.id}
                className="bg-navy-800 rounded-2xl border border-white/5 overflow-hidden hover:border-gold/20 transition-colors"
              >
                {card.front_image_url ? (
                  <img
                    src={card.front_image_url}
                    alt={card.name}
                    className="w-full aspect-[3/4] object-cover"
                  />
                ) : (
                  <div className="w-full aspect-[3/4] bg-navy-900 flex items-center justify-center">
                    <ImageIcon size={32} className="text-gray-700" />
                  </div>
                )}
                <div className="p-4">
                  <p className="text-white font-semibold truncate">{card.name}</p>
                  <p className="text-gray-500 text-xs mt-0.5">
                    {[card.set_name, card.year, card.condition].filter(Boolean).join(' · ')}
                  </p>
                  <div className="mt-3 flex items-center justify-between">
                    <span className="text-gold font-bold text-lg">
                      ${listing.price.toFixed(2)}
                    </span>
                    <span className="text-xs px-2 py-1 bg-green-900/30 text-green-400 rounded-lg border border-green-500/20">
                      ACTIVE
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
