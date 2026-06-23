import { useState, useEffect, useRef } from 'react'
import { useParams, Link } from '@tanstack/react-router'
import {
  ArrowLeft,
  Plus,
  RefreshCw,
  Tag,
  Trash2,
  ImageIcon,
  Share2,
  ScanLine,
  X,
} from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { getCardPrices, getCardImageUrl } from '../lib/scrydex'
import { PriceTicker } from '../components/PriceTicker'
import { CardDetailDialog } from '../components/CardDetailDialog'
import { ScanCardsDialog } from '../components/ScanCardsDialog'

interface CardRecord {
  id: string
  name: string
  set_name?: string
  year?: number
  condition?: string
  scrydex_id?: string
  front_image_url?: string
  back_image_url?: string
  market_price?: number
  price_change_pct?: number
  portfolio_id: string
}

interface Portfolio {
  id: string
  name: string
  user_id: string
}

type ImageSide = 'front' | 'back'

export function VaultDetailPage() {
  const { id } = useParams({ from: '/vault/$id' })
  const { user, loading: authLoading } = useAuth()

  const [portfolio, setPortfolio] = useState<Portfolio | null>(null)
  const [cards, setCards] = useState<CardRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [showAddForm, setShowAddForm] = useState(false)
  const [showScan, setShowScan] = useState(false)
  const [detailCard, setDetailCard] = useState<CardRecord | null>(null)
  const [cardImageSide, setCardImageSide] = useState<Record<string, ImageSide>>({})
  const [deleteCardId, setDeleteCardId] = useState<string | null>(null)

  // Add card form state
  const [formName, setFormName] = useState('')
  const [formSet, setFormSet] = useState('')
  const [formYear, setFormYear] = useState('')
  const [formCondition, setFormCondition] = useState('NM')
  const [formScrydexId, setFormScrydexId] = useState('')
  const [frontFile, setFrontFile] = useState<File | null>(null)
  const [backFile, setBackFile] = useState<File | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const frontInputRef = useRef<HTMLInputElement>(null)
  const backInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (user) fetchData()
  }, [user, id])

  async function fetchData() {
    setLoading(true)
    const { data: pf } = await supabase.from('portfolios').select('*').eq('id', id).single()
    setPortfolio(pf)
    const { data: cardData } = await supabase
      .from('cards')
      .select('*')
      .eq('portfolio_id', id)
      .order('created_at', { ascending: false })
    setCards(cardData ?? [])
    setLoading(false)
  }

  async function uploadImage(file: File, path: string): Promise<string | null> {
    const { error } = await supabase.storage.from('card-images').upload(path, file, {
      upsert: true,
    })
    if (error) return null
    return supabase.storage.from('card-images').getPublicUrl(path).data.publicUrl
  }

  async function handleAddCard(e: React.FormEvent) {
    e.preventDefault()
    if (!user) return
    setSubmitting(true)

    let frontUrl: string | null = null
    let backUrl: string | null = null
    const timestamp = Date.now()

    if (frontFile) {
      const path = `${user.id}/${id}/${timestamp}_front.${frontFile.name.split('.').pop()}`
      frontUrl = await uploadImage(frontFile, path)
    }
    if (backFile) {
      const path = `${user.id}/${id}/${timestamp}_back.${backFile.name.split('.').pop()}`
      backUrl = await uploadImage(backFile, path)
    }

    let marketPrice: number | null = null
    if (formScrydexId) {
      const prices = await getCardPrices(formScrydexId)
      if (prices) marketPrice = prices.raw.nm ?? null
    }

    await supabase.from('cards').insert({
      portfolio_id: id,
      name: formName.trim(),
      set_name: formSet.trim() || null,
      year: formYear ? parseInt(formYear) : null,
      condition: formCondition,
      scrydex_id: formScrydexId.trim() || null,
      front_image_url: frontUrl,
      back_image_url: backUrl,
      market_price: marketPrice,
    })

    setFormName('')
    setFormSet('')
    setFormYear('')
    setFormCondition('NM')
    setFormScrydexId('')
    setFrontFile(null)
    setBackFile(null)
    setShowAddForm(false)
    setSubmitting(false)
    fetchData()
  }

  async function handleRefreshPrice(card: CardRecord) {
    if (!card.scrydex_id) return
    const prices = await getCardPrices(card.scrydex_id)
    if (!prices) return
    const nm = prices.raw.nm
    const old = card.market_price ?? 0
    const pct = old > 0 ? ((nm - old) / old) * 100 : 0
    await supabase
      .from('cards')
      .update({ market_price: nm, price_change_pct: pct })
      .eq('id', card.id)
    fetchData()
  }

  async function handleSell(card: CardRecord) {
    if (!user) return
    await supabase.from('listings').insert({
      card_id: card.id,
      user_id: user.id,
      price: card.market_price ?? 0,
      status: 'active',
    })
  }

  async function handleDeleteCard(cardId: string) {
    await supabase.from('cards').delete().eq('id', cardId)
    setDeleteCardId(null)
    fetchData()
  }

  const handleSharePortfolio = () => {
    const url = window.location.href
    navigator.clipboard.writeText(url).then(() => alert('Portfolio link copied!'))
  }

  if (authLoading || loading) {
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
          <p className="text-gray-400 text-sm">Sign in to access your vault.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-7xl mx-auto px-6 py-12">
      {/* Back link */}
      <Link to="/vault" className="inline-flex items-center gap-2 text-gray-500 hover:text-white text-sm mb-8 transition-colors">
        <ArrowLeft size={16} />
        All portfolios
      </Link>

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-10">
        <h1 className="font-heading text-4xl font-bold text-white">{portfolio?.name ?? 'Portfolio'}</h1>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={handleSharePortfolio}
            className="flex items-center gap-2 border border-white/10 text-gray-300 px-4 py-2.5 rounded-xl text-sm hover:border-white/20 transition-colors"
          >
            <Share2 size={14} />
            Share
          </button>
          <button
            onClick={() => setShowScan(true)}
            className="flex items-center gap-2 border border-white/10 text-gray-300 px-4 py-2.5 rounded-xl text-sm hover:border-white/20 transition-colors"
          >
            <ScanLine size={14} />
            Scan with AI
          </button>
          <button
            onClick={() => setShowAddForm(true)}
            className="flex items-center gap-2 bg-gold text-navy-900 font-semibold px-4 py-2.5 rounded-xl text-sm hover:opacity-90 transition-opacity"
          >
            <Plus size={14} />
            Add Card
          </button>
        </div>
      </div>

      {/* Add Card Form */}
      {showAddForm && (
        <div className="bg-navy-800 rounded-2xl border border-gold/20 p-6 mb-8">
          <div className="flex items-center justify-between mb-5">
            <h3 className="font-heading font-semibold text-white">Add Card</h3>
            <button onClick={() => setShowAddForm(false)} className="text-gray-400 hover:text-white">
              <X size={18} />
            </button>
          </div>
          <form onSubmit={handleAddCard} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-gray-400 mb-1.5">Card Name *</label>
              <input
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                required
                className="w-full bg-navy-900 border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm placeholder-gray-600 focus:outline-none focus:border-gold/50"
                placeholder="Charizard"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1.5">Set Name</label>
              <input
                value={formSet}
                onChange={(e) => setFormSet(e.target.value)}
                className="w-full bg-navy-900 border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm placeholder-gray-600 focus:outline-none focus:border-gold/50"
                placeholder="Base Set"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1.5">Year</label>
              <input
                value={formYear}
                onChange={(e) => setFormYear(e.target.value)}
                type="number"
                min="1993"
                max="2099"
                className="w-full bg-navy-900 border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm placeholder-gray-600 focus:outline-none focus:border-gold/50"
                placeholder="1999"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1.5">Condition</label>
              <select
                value={formCondition}
                onChange={(e) => setFormCondition(e.target.value)}
                className="w-full bg-navy-900 border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm focus:outline-none focus:border-gold/50"
              >
                {['NM', 'LP', 'MP', 'HP', 'DM'].map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs text-gray-400 mb-1.5">Scrydex ID</label>
              <input
                value={formScrydexId}
                onChange={(e) => setFormScrydexId(e.target.value)}
                className="w-full bg-navy-900 border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm placeholder-gray-600 focus:outline-none focus:border-gold/50"
                placeholder="e.g. xy1-11"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1.5">Front Image</label>
              <button
                type="button"
                onClick={() => frontInputRef.current?.click()}
                className="w-full bg-navy-900 border border-white/10 rounded-xl px-3 py-2.5 text-gray-500 text-sm text-left hover:border-white/20 transition-colors"
              >
                {frontFile ? frontFile.name : 'Choose file...'}
              </button>
              <input
                ref={frontInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => setFrontFile(e.target.files?.[0] ?? null)}
              />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1.5">Back Image</label>
              <button
                type="button"
                onClick={() => backInputRef.current?.click()}
                className="w-full bg-navy-900 border border-white/10 rounded-xl px-3 py-2.5 text-gray-500 text-sm text-left hover:border-white/20 transition-colors"
              >
                {backFile ? backFile.name : 'Choose file...'}
              </button>
              <input
                ref={backInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => setBackFile(e.target.files?.[0] ?? null)}
              />
            </div>
            <div className="sm:col-span-2 flex gap-3 mt-2">
              <button
                type="button"
                onClick={() => setShowAddForm(false)}
                className="flex-1 py-3 rounded-xl border border-white/10 text-gray-400 hover:text-white text-sm"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="flex-1 py-3 rounded-xl bg-gold text-navy-900 font-semibold text-sm hover:opacity-90 disabled:opacity-50"
              >
                {submitting ? 'Adding...' : 'Add Card'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Cards grid */}
      {cards.length === 0 ? (
        <div className="text-center py-20">
          <ImageIcon size={40} className="text-gray-600 mx-auto mb-4" />
          <p className="text-gray-500">No cards yet. Add your first card above.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {cards.map((card) => {
            const side = cardImageSide[card.id] ?? 'front'
            const currentImageUrl =
              side === 'front'
                ? card.front_image_url || (card.scrydex_id ? getCardImageUrl(card.scrydex_id) : null)
                : card.back_image_url || null
            const hasBoth = card.front_image_url && card.back_image_url

            return (
              <div
                key={card.id}
                className="bg-navy-800 rounded-2xl border border-white/5 overflow-hidden hover:border-gold/20 transition-colors"
              >
                {/* Image */}
                <div
                  className="relative cursor-pointer aspect-[3/4] bg-navy-900"
                  onClick={() => setDetailCard(card)}
                >
                  {currentImageUrl ? (
                    <img
                      src={currentImageUrl}
                      alt={card.name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <ImageIcon size={32} className="text-gray-700" />
                    </div>
                  )}
                  {hasBoth && (
                    <div className="absolute bottom-2 left-2 flex gap-1">
                      {(['front', 'back'] as ImageSide[]).map((s) => (
                        <button
                          key={s}
                          onClick={(e) => {
                            e.stopPropagation()
                            setCardImageSide((prev) => ({ ...prev, [card.id]: s }))
                          }}
                          className={`text-xs px-2 py-0.5 rounded-md ${
                            side === s
                              ? 'bg-gold text-navy-900 font-semibold'
                              : 'bg-black/50 text-gray-400'
                          }`}
                        >
                          {s.charAt(0).toUpperCase() + s.slice(1)}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Info */}
                <div className="p-4">
                  <p className="text-white font-semibold text-sm truncate">{card.name}</p>
                  <p className="text-gray-500 text-xs mt-0.5 truncate">
                    {[card.set_name, card.year, card.condition].filter(Boolean).join(' · ')}
                  </p>
                  <div className="flex items-center justify-between mt-3">
                    <span className="text-gold font-bold">
                      {card.market_price != null
                        ? `$${card.market_price.toFixed(2)}`
                        : '—'}
                    </span>
                    {card.price_change_pct != null && (
                      <PriceTicker pct={card.price_change_pct} size="sm" />
                    )}
                  </div>
                  {/* Actions */}
                  <div className="flex items-center gap-2 mt-3 pt-3 border-t border-white/5">
                    <button
                      onClick={() => handleRefreshPrice(card)}
                      disabled={!card.scrydex_id}
                      title="Refresh price"
                      className="p-2 text-gray-500 hover:text-white disabled:opacity-30 transition-colors"
                    >
                      <RefreshCw size={14} />
                    </button>
                    <button
                      onClick={() => handleSell(card)}
                      className="flex-1 flex items-center justify-center gap-1 border border-white/10 text-gray-300 py-2 rounded-lg text-xs hover:border-gold/30 hover:text-gold transition-colors"
                    >
                      <Tag size={12} />
                      Sell
                    </button>
                    <button
                      onClick={() => setDeleteCardId(card.id)}
                      className="p-2 text-gray-500 hover:text-red-400 transition-colors"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Delete confirm */}
      {deleteCardId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="bg-navy-800 rounded-2xl border border-white/10 p-8 max-w-sm w-full text-center">
            <h3 className="font-heading text-xl font-bold text-white mb-2">Delete Card?</h3>
            <p className="text-gray-400 text-sm mb-6">This will permanently remove the card from your portfolio.</p>
            <div className="flex gap-3">
              <button
                onClick={() => setDeleteCardId(null)}
                className="flex-1 py-3 rounded-xl border border-white/10 text-gray-400 text-sm"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDeleteCard(deleteCardId)}
                className="flex-1 py-3 rounded-xl bg-red-600 text-white font-semibold text-sm hover:bg-red-500"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {detailCard && (
        <CardDetailDialog card={detailCard} onClose={() => setDetailCard(null)} />
      )}
      {showScan && <ScanCardsDialog onClose={() => setShowScan(false)} />}
    </div>
  )
}
