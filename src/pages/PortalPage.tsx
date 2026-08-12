import { useState, useEffect } from 'react'
import { TrendingUp, DollarSign, BarChart2, ImageIcon } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { PriceTicker } from '../components/PriceTicker'
import { CardDetailDialog } from '../components/CardDetailDialog'

interface CardRow {
  id: string
  name: string
  card_set?: string
  year?: number
  condition?: string
  scrydex_id?: string
  image_url?: string
  estimated_value?: number
  price_change_pct?: number
  portfolio_id: string
  portfolio_name?: string
}

export function PortalPage() {
  const { user, loading: authLoading } = useAuth()
  const [cards, setCards] = useState<CardRow[]>([])
  const [loading, setLoading] = useState(true)
  const [detailCard, setDetailCard] = useState<CardRow | null>(null)

  useEffect(() => {
    if (user) fetchAllCards()
  }, [user])

  async function fetchAllCards() {
    if (!user) return
    setLoading(true)

    // Get all portfolios for this user
    const { data: portfolios } = await supabase
      .from('portfolios')
      .select('id, name')
      .eq('user_id', user.id)

    if (!portfolios || portfolios.length === 0) {
      setCards([])
      setLoading(false)
      return
    }

    const portfolioIds = portfolios.map((p) => p.id)
    const { data: cardData } = await supabase
      .from('cards')
      .select('*')
      .in('portfolio_id', portfolioIds)
      .order('estimated_value', { ascending: false })

    // Attach portfolio names
    const enriched: CardRow[] = (cardData ?? []).map((c) => ({
      ...c,
      portfolio_name: portfolios.find((p) => p.id === c.portfolio_id)?.name ?? '',
    }))

    setCards(enriched)
    setLoading(false)
  }

  const totalValue = cards.reduce((sum, c) => sum + (c.estimated_value ?? 0), 0)
  const moversUp = cards.filter((c) => (c.price_change_pct ?? 0) > 0).length
  const moversDown = cards.filter((c) => (c.price_change_pct ?? 0) < 0).length
  const topMovers = [...cards]
    .filter((c) => c.price_change_pct != null)
    .sort((a, b) => (b.price_change_pct ?? 0) - (a.price_change_pct ?? 0))
    .slice(0, 5)

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
          <BarChart2 size={40} className="text-gold mx-auto mb-4" />
          <h2 className="font-heading text-2xl font-bold text-white mb-2">Collection Portal</h2>
          <p className="text-gray-400 text-sm">Sign in to view your live collection data.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-7xl mx-auto px-6 py-12">
      {/* Header */}
      <div className="mb-10">
        <p className="text-gold text-xs font-semibold tracking-widest mb-2">COLLECTOR'S PORTAL</p>
        <h1 className="font-heading text-4xl md:text-5xl font-bold text-white mb-2">
          Your Collection, Live
        </h1>
        <p className="text-gray-400">Real-time valuations across all your portfolios.</p>
      </div>

      {/* Stat boxes */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-10">
        <div className="bg-navy-800 rounded-2xl border border-white/5 p-5">
          <div className="flex items-center gap-2 mb-1">
            <DollarSign size={14} className="text-gold" />
            <span className="text-xs text-gray-500 tracking-widest">LIVE MARKET VALUE</span>
          </div>
          <p className="text-white font-bold text-2xl font-heading">
            ${totalValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
        </div>
        <div className="bg-navy-800 rounded-2xl border border-white/5 p-5">
          <div className="flex items-center gap-2 mb-1">
            <DollarSign size={14} className="text-gray-500" />
            <span className="text-xs text-gray-500 tracking-widest">COST BASIS</span>
          </div>
          <p className="text-white font-bold text-2xl font-heading">$0.00</p>
          <p className="text-gray-600 text-xs mt-1">Not tracked</p>
        </div>
        <div className="bg-navy-800 rounded-2xl border border-white/5 p-5">
          <div className="flex items-center gap-2 mb-1">
            <TrendingUp size={14} className="text-green-400" />
            <span className="text-xs text-gray-500 tracking-widest">UNREALIZED P/L</span>
          </div>
          <p className="text-green-400 font-bold text-2xl font-heading">—</p>
        </div>
        <div className="bg-navy-800 rounded-2xl border border-white/5 p-5">
          <div className="flex items-center gap-2 mb-1">
            <BarChart2 size={14} className="text-gold" />
            <span className="text-xs text-gray-500 tracking-widest">30-DAY MOVERS</span>
          </div>
          <p className="text-white font-bold text-2xl font-heading">
            <span className="text-green-400">{moversUp}↑</span>
            <span className="text-gray-600 mx-1">·</span>
            <span className="text-red-400">{moversDown}↓</span>
          </p>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-16">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gold mx-auto mb-3" />
          <p className="text-gray-500 text-sm">Loading live price data from Scrydex...</p>
        </div>
      ) : (
        <>
          {/* Top Movers */}
          {topMovers.length > 0 && (
            <div className="mb-10">
              <h2 className="font-heading text-xl font-bold text-white mb-4">Top Movers (30d)</h2>
              <div className="space-y-2">
                {topMovers.map((card) => (
                  <div
                    key={card.id}
                    className="bg-navy-800 rounded-xl border border-white/5 px-4 py-3 flex items-center justify-between"
                  >
                    <div>
                      <span className="text-white text-sm font-medium">{card.name}</span>
                      {card.portfolio_name && (
                        <span className="text-gray-500 text-xs ml-2">{card.portfolio_name}</span>
                      )}
                    </div>
                    {card.price_change_pct != null && (
                      <PriceTicker pct={card.price_change_pct} size="md" />
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* All Cards table */}
          <div>
            <h2 className="font-heading text-xl font-bold text-white mb-4">All Cards</h2>
            {cards.length === 0 ? (
              <div className="text-center py-10 text-gray-500 text-sm">
                No cards in your portfolios yet.
              </div>
            ) : (
              <div className="bg-navy-800 rounded-2xl border border-white/5 overflow-x-auto">
                <table className="w-full min-w-[520px]">
                  <thead>
                    <tr className="border-b border-white/5">
                      <th className="text-left text-xs text-gray-500 tracking-widest px-6 py-4">CARD</th>
                      <th className="text-right text-xs text-gray-500 tracking-widest px-6 py-4">MARKET</th>
                      <th className="text-right text-xs text-gray-500 tracking-widest px-6 py-4">30D</th>
                      <th className="text-right text-xs text-gray-500 tracking-widest px-6 py-4"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {cards.map((card) => (
                      <tr
                        key={card.id}
                        className="border-b border-white/5 last:border-0 hover:bg-white/2"
                      >
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            {card.image_url ? (
                              <img
                                src={card.image_url}
                                alt={card.name}
                                className="w-8 h-10 object-cover rounded"
                              />
                            ) : (
                              <div className="w-8 h-10 bg-navy-900 rounded flex items-center justify-center">
                                <ImageIcon size={12} className="text-gray-700" />
                              </div>
                            )}
                            <div>
                              <p className="text-white text-sm font-medium">{card.name}</p>
                              {card.portfolio_name && (
                                <p className="text-gray-500 text-xs">{card.portfolio_name}</p>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <span className="text-gold font-semibold text-sm">
                            {card.estimated_value != null ? `$${card.estimated_value.toFixed(2)}` : '—'}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-right">
                          {card.price_change_pct != null ? (
                            <PriceTicker pct={card.price_change_pct} size="sm" />
                          ) : (
                            <span className="text-gray-600 text-xs">—</span>
                          )}
                        </td>
                        <td className="px-6 py-4 text-right">
                          <button
                            onClick={() => setDetailCard(card)}
                            className="text-xs text-gray-500 hover:text-gold transition-colors"
                          >
                            Details
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {detailCard && (
        <CardDetailDialog card={detailCard} onClose={() => setDetailCard(null)} />
      )}
    </div>
  )
}
