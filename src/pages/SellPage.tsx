import { useState, useEffect } from 'react'
import { Tag, X, ImageIcon, Zap } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'

interface Listing {
  id: string
  price: number
  status: string
  created_at: string
  cards: {
    id: string
    name: string
    set_name?: string
    year?: number
    condition?: string
    front_image_url?: string
  } | null
}

export function SellPage() {
  const { user, loading: authLoading } = useAuth()
  const [listings, setListings] = useState<Listing[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (user) fetchListings()
  }, [user])

  async function fetchListings() {
    if (!user) return
    setLoading(true)
    const { data } = await supabase
      .from('listings')
      .select('*, cards(*)')
      .eq('user_id', user.id)
      .eq('status', 'active')
      .order('created_at', { ascending: false })
    setListings((data as Listing[]) ?? [])
    setLoading(false)
  }

  async function handleUnlist(id: string) {
    await supabase.from('listings').update({ status: 'unlisted' }).eq('id', id)
    fetchListings()
  }

  if (authLoading) {
    return (
      <div className="flex justify-center items-center min-h-[60vh]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gold" />
      </div>
    )
  }

  if (!user) {
    return (
      <div className="flex justify-center items-center min-h-[60vh] px-4">
        <div className="bg-navy-800 rounded-2xl border border-white/10 p-10 text-center max-w-sm">
          <Tag size={40} className="text-gold mx-auto mb-4" />
          <h2 className="font-heading text-2xl font-bold text-white mb-2">Seller Portal</h2>
          <p className="text-gray-400 text-sm">Sign in to manage your listings.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-7xl mx-auto px-6 py-12">
      {/* Header */}
      <div className="mb-10">
        <p className="text-gold text-xs font-semibold tracking-widest mb-2">SELLER PORTAL</p>
        <h1 className="font-heading text-4xl md:text-5xl font-bold text-white mb-2">
          Your storefront.
        </h1>
        <p className="text-gray-400">Manage your active listings. Add cards from your vault to sell.</p>
      </div>

      {loading ? (
        <div className="flex justify-center py-20">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gold" />
        </div>
      ) : listings.length === 0 ? (
        <div className="text-center py-24">
          <div className="w-16 h-16 bg-navy-800 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-white/5">
            <Tag size={28} className="text-gray-600" />
          </div>
          <h3 className="font-heading text-xl font-semibold text-white mb-2">Nothing listed yet.</h3>
          <p className="text-gray-500 text-sm">Add cards to your vault and mark them for sale.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5 mb-16">
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
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <p className="text-white font-semibold truncate flex-1">{card.name}</p>
                    <button
                      onClick={() => handleUnlist(listing.id)}
                      className="text-gray-600 hover:text-red-400 transition-colors flex-shrink-0"
                      title="Unlist"
                    >
                      <X size={16} />
                    </button>
                  </div>
                  <p className="text-gray-500 text-xs">
                    {[card.set_name, card.year, card.condition].filter(Boolean).join(' · ')}
                  </p>
                  <div className="flex items-center justify-between mt-3">
                    <span className="text-gold font-bold text-lg">${listing.price.toFixed(2)}</span>
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

      {/* Coming soon */}
      <div className="bg-navy-800/50 rounded-2xl border border-white/5 p-8 text-center opacity-60">
        <Zap size={24} className="text-gray-500 mx-auto mb-3" />
        <p className="text-gray-500 text-xs font-semibold tracking-widest mb-2">COMING SOON</p>
        <h3 className="font-heading text-xl font-semibold text-gray-400 mb-1">
          Live breaks &amp; shows
        </h3>
        <p className="text-gray-600 text-sm">Stream from your storefront to buyers in real time.</p>
      </div>
    </div>
  )
}
