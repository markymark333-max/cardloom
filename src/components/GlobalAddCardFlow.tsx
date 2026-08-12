import { useState, useEffect } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { X, FolderOpen } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { insertScannedCard, ScannedCardData } from '../lib/cards'
import { ScanCardsDialog } from './ScanCardsDialog'
import { GameIcon } from './GameIcon'

interface Portfolio {
  id: string
  name: string
}

// Best-effort game guess from a Scrydex card id. Pokémon is the default (the
// app is Pokémon-first); a few non-Pokémon set prefixes are recognized so a
// One Piece / Gundam portfolio shows the right icon.
function gameFromScrydexId(id: string | null | undefined): string {
  const p = (id || '').toLowerCase()
  if (/^(op|eb|prb)\d/.test(p)) return 'onepiece'
  if (/^gd\d/.test(p)) return 'gundam'
  if (/^(lorcana|tfc|rotf|ssk|urr|iti|fab)/.test(p)) return 'lorcana'
  return 'pokemon'
}

interface GlobalAddCardFlowProps {
  onClose: () => void
}

export function GlobalAddCardFlow({ onClose }: GlobalAddCardFlowProps) {
  const { user } = useAuth()
  const navigate = useNavigate()

  const [loading, setLoading] = useState(true)
  const [portfolios, setPortfolios] = useState<Portfolio[]>([])
  const [gameByPortfolio, setGameByPortfolio] = useState<Record<string, string>>({})
  const [portfolioId, setPortfolioId] = useState<string | null>(null)

  useEffect(() => {
    if (!user) {
      onClose()
      navigate({ to: '/vault' })
      return
    }

    const load = async () => {
      const { data } = await supabase
        .from('portfolios')
        .select('id, name')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
      const list = data ?? []
      setPortfolios(list)
      if (list.length === 1) setPortfolioId(list[0].id)
      setLoading(false)

      // Pick each portfolio's dominant game from its cards for the row icon.
      if (list.length > 0) {
        const { data: cards } = await supabase
          .from('cards')
          .select('portfolio_id, scrydex_id')
          .in('portfolio_id', list.map((p) => p.id))
        const counts: Record<string, Record<string, number>> = {}
        for (const c of cards ?? []) {
          const g = gameFromScrydexId(c.scrydex_id)
          counts[c.portfolio_id] = counts[c.portfolio_id] || {}
          counts[c.portfolio_id][g] = (counts[c.portfolio_id][g] || 0) + 1
        }
        const winners: Record<string, string> = {}
        for (const [pid, tally] of Object.entries(counts)) {
          winners[pid] = Object.entries(tally).sort((a, b) => b[1] - a[1])[0][0]
        }
        setGameByPortfolio(winners)
      }
    }
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user])

  const handleCardFound = async (data: ScannedCardData) => {
    if (!user || !portfolioId) return
    await insertScannedCard(user.id, portfolioId, data)
    // Drop the user into the portfolio they just added to (instead of leaving
    // them on whatever page they opened the dialog from).
    navigate({ to: '/vault/$id', params: { id: portfolioId } })
  }

  if (!user) return null

  if (portfolioId) {
    return <ScanCardsDialog onClose={onClose} onCardFound={handleCardFound} />
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-[#1a1a1d] rounded-2xl border border-white/10 w-full max-w-sm">
        <div className="flex items-center justify-between p-5 border-b border-white/5">
          <h2 className="font-heading font-bold text-white">Add card to...</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">
            <X size={20} />
          </button>
        </div>
        <div className="p-5">
          {loading ? (
            <div className="flex justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gold" />
            </div>
          ) : portfolios.length === 0 ? (
            <div className="text-center py-4">
              <FolderOpen size={32} className="text-gray-600 mx-auto mb-3" />
              <p className="text-gray-400 text-sm mb-4">You don't have a portfolio yet.</p>
              <button
                onClick={() => {
                  onClose()
                  navigate({ to: '/vault' })
                }}
                className="bg-gold text-navy-900 font-semibold px-5 py-2.5 rounded-xl text-sm hover:opacity-90 transition-opacity"
              >
                Create a Portfolio
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              {portfolios.map((p) => (
                <button
                  key={p.id}
                  onClick={() => setPortfolioId(p.id)}
                  className="w-full flex items-center gap-3 bg-[#111113] border border-white/10 rounded-xl p-3.5 hover:border-gold/30 transition-colors text-left"
                >
                  <GameIcon game={gameByPortfolio[p.id] || 'pokemon'} size={22} className="flex-shrink-0" />
                  <span className="text-white text-sm font-medium truncate">{p.name}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
