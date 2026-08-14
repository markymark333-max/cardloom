import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
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
  Check,
  Pencil,
  Search,
  Printer,
} from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { getCardPrices, getCardImageUrl, priceForCondition } from '../lib/scrydex'
import { dataUrlToFile, uploadCardImage } from '../lib/storage'
import { insertScannedCard } from '../lib/cards'
import { PriceTicker } from '../components/PriceTicker'
import { CardDetailDialog } from '../components/CardDetailDialog'
import { ScanCardsDialog } from '../components/ScanCardsDialog'
import { BrowseAddCardDialog } from '../components/BrowseAddCardDialog'
import { PrintLabelDialog } from '../components/PrintLabelDialog'

interface CardRecord {
  id: string
  name: string
  card_set?: string
  card_number?: string
  year?: number
  condition?: string
  scrydex_id?: string
  image_url?: string
  back_image_url?: string
  tcg_image_url?: string
  estimated_value?: number
  price_change_pct?: number
  quantity?: number
  game?: string
  variant?: string
  portfolio_id: string
}

interface Portfolio {
  id: string
  name: string
  description?: string
  user_id: string
}

type ImageOption = 'stock' | 'front' | 'back'

export function VaultDetailPage() {
  const { id } = useParams({ from: '/vault/$id' })
  const { user, loading: authLoading } = useAuth()

  const [portfolio, setPortfolio] = useState<Portfolio | null>(null)
  const [cards, setCards] = useState<CardRecord[]>([])
  const [search, setSearch] = useState('')
  const [sortBy, setSortBy] = useState<'default' | 'name' | 'value'>('default')
  const [loading, setLoading] = useState(true)
  const [showAddForm, setShowAddForm] = useState(false)
  const [showBrowse, setShowBrowse] = useState(false)
  const [showScan, setShowScan] = useState(false)
  const [detailCard, setDetailCard] = useState<CardRecord | null>(null)
  const [cardImageSide, setCardImageSide] = useState<Record<string, ImageOption>>({})
  const [deleteCardId, setDeleteCardId] = useState<string | null>(null)
  const [uploadTarget, setUploadTarget] = useState<{ cardId: string; slot: 'front' | 'back' } | null>(null)
  const [listedCardIds, setListedCardIds] = useState<Set<string>>(new Set())
  const [sellingCardId, setSellingCardId] = useState<string | null>(null)
  // When adding a card that's already in this portfolio (same print + condition),
  // prompt to bump the quantity instead of creating a duplicate row.
  const [dupPrompt, setDupPrompt] = useState<{ existing: CardRecord; addQty: number } | null>(null)
  // Quantity editing is locked until you tap the edit icon (avoids fat-finger changes).
  const [editingQtyId, setEditingQtyId] = useState<string | null>(null)
  const [editQty, setEditQty] = useState(1)
  const [printCard, setPrintCard] = useState<CardRecord | null>(null)

  // Add card form state
  const [formName, setFormName] = useState('')
  const [formSet, setFormSet] = useState('')
  const [formYear, setFormYear] = useState('')
  const [formCondition, setFormCondition] = useState('NM')
  const [formQuantity, setFormQuantity] = useState(1)
  const [formScrydexId, setFormScrydexId] = useState('')
  const [frontFile, setFrontFile] = useState<File | null>(null)
  const [backFile, setBackFile] = useState<File | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const frontInputRef = useRef<HTMLInputElement>(null)
  const backInputRef = useRef<HTMLInputElement>(null)
  const slotInputRef = useRef<HTMLInputElement>(null)

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

    if (user && cardData?.length) {
      const { data: activeListings } = await supabase
        .from('listings')
        .select('card_id')
        .eq('seller_id', user.id)
        .eq('status', 'active')
        .in('card_id', cardData.map((c) => c.id))
      setListedCardIds(new Set((activeListings ?? []).map((l) => l.card_id)))
    } else {
      setListedCardIds(new Set())
    }

    setLoading(false)
  }

  // Same Scrydex print + condition already in this portfolio?
  const findDup = (scrydexId?: string | null, condition?: string | null) =>
    scrydexId ? cards.find((c) => c.scrydex_id === scrydexId && (c.condition || '') === (condition || '')) : undefined

  async function bumpQuantity(existing: CardRecord, add: number) {
    await supabase
      .from('cards')
      .update({ quantity: (existing.quantity ?? 1) + add })
      .eq('id', existing.id)
    setDupPrompt(null)
    fetchData()
  }

  // Directly set a card's quantity (inline stepper on an existing card).
  async function setCardQuantity(card: CardRecord, next: number) {
    const q = Math.max(1, next)
    setCards((prev) => prev.map((c) => (c.id === card.id ? { ...c, quantity: q } : c)))
    const { error } = await supabase.from('cards').update({ quantity: q }).eq('id', card.id)
    if (error) {
      console.error('Update quantity failed:', error.message)
      fetchData()
    }
  }

  async function handleAddCard(e: React.FormEvent) {
    e.preventDefault()
    if (!user) return
    setSubmitting(true)

    const dup = findDup(formScrydexId.trim() || undefined, formCondition)
    if (dup) {
      setSubmitting(false)
      setShowAddForm(false)
      setDupPrompt({ existing: dup, addQty: formQuantity })
      return
    }

    let frontUrl: string | null = null
    let backUrl: string | null = null
    const timestamp = Date.now()

    if (frontFile) {
      const path = `${user.id}/${id}/${timestamp}_front.${frontFile.name.split('.').pop()}`
      frontUrl = await uploadCardImage(frontFile, path)
    }
    if (backFile) {
      const path = `${user.id}/${id}/${timestamp}_back.${backFile.name.split('.').pop()}`
      backUrl = await uploadCardImage(backFile, path)
    }

    let estimatedValue: number | null = null
    let priceChangePct: number | null = null
    if (formScrydexId) {
      const prices = await getCardPrices(formScrydexId)
      if (prices) {
        estimatedValue = priceForCondition(prices, formCondition)
        priceChangePct = prices.price_change_pct ?? null
      }
    }

    const { error } = await supabase.from('cards').insert({
      portfolio_id: id,
      user_id: user.id,
      name: formName.trim(),
      card_set: formSet.trim() || null,
      year: formYear ? parseInt(formYear) : null,
      condition: formCondition,
      scrydex_id: formScrydexId.trim() || null,
      image_url: frontUrl,
      back_image_url: backUrl,
      estimated_value: estimatedValue,
      price_change_pct: priceChangePct,
      quantity: formQuantity,
    })
    if (error) console.error('Add card failed:', error.message)

    setFormName('')
    setFormSet('')
    setFormYear('')
    setFormCondition('NM')
    setFormQuantity(1)
    setFormScrydexId('')
    setFrontFile(null)
    setBackFile(null)
    setShowAddForm(false)
    setSubmitting(false)
    fetchData()
  }

  async function handleAddFromBrowse(data: {
    name: string
    set_name?: string
    year?: number
    card_number?: string
    scrydex_id: string
    condition: string
    estimated_value?: number
    image_url?: string
    quantity?: number
    game?: string
  }) {
    if (!user) return
    const qty = data.quantity ?? 1
    const dup = findDup(data.scrydex_id, data.condition)
    if (dup) {
      setDupPrompt({ existing: dup, addQty: qty })
      return
    }
    const { error } = await supabase.from('cards').insert({
      portfolio_id: id,
      user_id: user.id,
      name: data.name,
      card_set: data.set_name || null,
      year: data.year || null,
      condition: data.condition,
      scrydex_id: data.scrydex_id,
      card_number: data.card_number || null,
      estimated_value: data.estimated_value ?? null,
      image_url: data.image_url ?? null,
      quantity: qty,
      game: data.game || 'pokemon',
    })
    if (error) console.error('Add card from browse failed:', error.message)
    fetchData()
  }

  async function handleCardFound(data: {
    name: string
    set_name?: string
    year?: number
    image?: string
    backImage?: string
    scrydex_id?: string
    card_number?: string
    estimated_value?: number
    price_change_pct?: number
    variant?: string
  }) {
    if (!user) return

    // Already have this exact card? Bump quantity instead of a duplicate row.
    const dup = findDup(data.scrydex_id, 'NM')
    if (dup) {
      setDupPrompt({ existing: dup, addQty: 1 })
      return
    }

    let frontUrl: string | null = null
    if (data.image) {
      const file = dataUrlToFile(data.image, `${Date.now()}_scan_front.jpg`)
      const path = `${user.id}/${id}/${Date.now()}_scan_front.jpg`
      frontUrl = await uploadCardImage(file, path)
    }
    let backUrl: string | null = null
    if (data.backImage) {
      const file = dataUrlToFile(data.backImage, `${Date.now()}_scan_back.jpg`)
      const path = `${user.id}/${id}/${Date.now()}_scan_back.jpg`
      backUrl = await uploadCardImage(file, path)
    }

    const { error } = await supabase.from('cards').insert({
      portfolio_id: id,
      user_id: user.id,
      name: data.name,
      card_set: data.set_name || null,
      year: data.year || null,
      condition: 'NM',
      image_url: frontUrl,
      back_image_url: backUrl,
      scrydex_id: data.scrydex_id || null,
      card_number: data.card_number || null,
      estimated_value: data.estimated_value ?? null,
      price_change_pct: data.price_change_pct ?? null,
      quantity: 1,
      variant: data.variant || null,
    })
    if (error) console.error('Add scanned card failed:', error.message)

    fetchData()
  }

  // Bulk add from the "Scan multiple" flow. Reuses insertScannedCard so every
  // card keeps the same fields + dedupe-to-quantity behaviour as a single scan.
  async function handleCardsFound(
    list: Array<{
      name: string
      set_name?: string
      year?: number
      image?: string
      scrydex_id?: string
      card_number?: string
      estimated_value?: number
      price_change_pct?: number
      quantity?: number
      variant?: string
    }>
  ) {
    if (!user) return
    for (const c of list) {
      await insertScannedCard(user.id, id, {
        name: c.name,
        set_name: c.set_name,
        year: c.year,
        image: c.image,
        scrydex_id: c.scrydex_id,
        card_number: c.card_number,
        estimated_value: c.estimated_value,
        price_change_pct: c.price_change_pct,
        quantity: c.quantity,
        variant: c.variant,
      })
    }
    fetchData()
  }

  async function handleRefreshPrice(card: CardRecord) {
    if (!card.scrydex_id) return
    // Re-read the SAME variant the card was priced at (e.g. master ball), so a
    // refresh doesn't snap a special foil back to the cheap base price.
    const prices = await getCardPrices(card.scrydex_id, card.game, card.variant)
    if (!prices) return
    // Price the card at ITS grade/condition (not always raw NM), and never
    // overwrite a good value with null if the grade isn't priced.
    const val = priceForCondition(prices, card.condition)
    await supabase
      .from('cards')
      .update({
        estimated_value: val != null ? val : card.estimated_value ?? null,
        price_change_pct: prices.price_change_pct ?? null,
      })
      .eq('id', card.id)
    fetchData()
  }

  async function handleSell(card: CardRecord) {
    if (!user || listedCardIds.has(card.id)) return
    // Don't create a $0 listing for a card with no known value.
    if (!card.estimated_value || card.estimated_value <= 0) {
      alert('This card has no market value yet — refresh its price before listing it.')
      return
    }
    setSellingCardId(card.id)
    const { error } = await supabase.from('listings').insert({
      card_id: card.id,
      seller_id: user.id,
      price: card.estimated_value,
      status: 'active',
    })
    setSellingCardId(null)
    if (error) {
      console.error('List for sale failed:', error.message)
      alert('Could not list this card for sale. Please try again.')
      return
    }
    setListedCardIds((prev) => new Set(prev).add(card.id))
  }

  async function handleDeleteCard(cardId: string) {
    await supabase.from('cards').delete().eq('id', cardId)
    setDeleteCardId(null)
    fetchData()
  }

  function openSlotUpload(cardId: string, slot: 'front' | 'back') {
    setUploadTarget({ cardId, slot })
    slotInputRef.current?.click()
  }

  async function handleSlotFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file || !user || !uploadTarget) return
    const { cardId, slot } = uploadTarget
    setUploadTarget(null)

    const path = `${user.id}/${id}/${Date.now()}_${slot}.${file.name.split('.').pop()}`
    const url = await uploadCardImage(file, path)
    if (!url) return

    const column = slot === 'front' ? 'image_url' : 'back_image_url'
    const { error } = await supabase.from('cards').update({ [column]: url }).eq('id', cardId)
    if (error) console.error('Add card photo failed:', error.message)
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

  const totalValue = cards.reduce((sum, c) => sum + (c.estimated_value ?? 0) * (c.quantity ?? 1), 0)
  const totalCards = cards.reduce((sum, c) => sum + (c.quantity ?? 1), 0)

  // Client-side search over the already-loaded cards (name / set / number / year).
  const q = search.trim().toLowerCase()
  const matchedCards = q
    ? cards.filter((c) =>
        [c.name, c.card_set, c.card_number, c.year != null ? String(c.year) : '', c.game]
          .some((f) => f?.toLowerCase().includes(q))
      )
    : cards

  // Sort: keep insertion order by default, or A–Z / price high→low on request.
  const filteredCards = [...matchedCards]
  if (sortBy === 'name') {
    filteredCards.sort((a, b) => a.name.localeCompare(b.name))
  } else if (sortBy === 'value') {
    filteredCards.sort((a, b) => (b.estimated_value ?? 0) - (a.estimated_value ?? 0))
  }

  return (
    <div className="max-w-7xl mx-auto px-6 py-12 binder-enter">
      {/* Back link */}
      <Link to="/vault" className="inline-flex items-center gap-2 text-gray-500 hover:text-white text-sm mb-8 transition-colors">
        <ArrowLeft size={16} />
        All portfolios
      </Link>

      {/* Header */}
      <div className="mb-10">
        <h1 className="font-heading text-4xl font-bold text-white">{portfolio?.name ?? 'Portfolio'}</h1>
        {portfolio?.description && (
          <p className="text-gray-400 mt-1">{portfolio.description}</p>
        )}
        {cards.length > 0 && (
          <div className="flex items-center gap-6 mt-4 mb-1">
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-widest mb-0.5">Portfolio Value</p>
              <p className="font-heading text-3xl font-bold text-white">
                ${totalValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
            </div>
            <div className="w-px h-10 bg-white/10" />
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-widest mb-0.5">Cards</p>
              <p className="font-heading text-3xl font-bold text-white">{totalCards}</p>
            </div>
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2 mt-5">
          <button
            onClick={() => setShowBrowse(true)}
            className="flex items-center gap-2 bg-gold text-navy-900 font-semibold px-4 py-2.5 rounded-xl text-sm hover:opacity-90 transition-opacity"
          >
            <Plus size={14} />
            Add Card
          </button>
          <button
            onClick={() => setShowScan(true)}
            className="flex items-center gap-2 border border-white/10 text-gray-300 px-4 py-2.5 rounded-xl text-sm hover:border-white/20 transition-colors"
          >
            <ScanLine size={14} />
            Scan with AI
          </button>
          <button
            onClick={handleSharePortfolio}
            className="flex items-center gap-2 border border-white/10 text-gray-300 px-4 py-2.5 rounded-xl text-sm hover:border-white/20 transition-colors"
          >
            <Share2 size={14} />
            Share
          </button>
        </div>
        <button
          onClick={() => setShowAddForm(true)}
          className="text-gray-500 hover:text-gray-300 text-xs underline underline-offset-2 mt-2"
        >
          or enter a card manually
        </button>
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
            <div>
              <label className="block text-xs text-gray-400 mb-1.5">Quantity</label>
              <input
                value={formQuantity}
                onChange={(e) => setFormQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                type="number"
                min="1"
                className="w-full bg-navy-900 border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm focus:outline-none focus:border-gold/50"
              />
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

      {/* Search + sort */}
      {cards.length > 0 && (
        <div className="mb-6 flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="relative flex-1 sm:max-w-md">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={`Search ${cards.length} card${cards.length > 1 ? 's' : ''} by name, set, number…`}
              className="w-full bg-navy-900 border border-white/10 rounded-xl pl-9 pr-9 py-2.5 text-white text-sm placeholder-gray-600 focus:outline-none focus:border-gold/50"
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                aria-label="Clear search"
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white p-1"
              >
                <X size={15} />
              </button>
            )}
          </div>
          <div className="flex items-center gap-1 text-xs flex-shrink-0">
            <span className="text-gray-500 mr-1">Sort</span>
            {([
              { k: 'default', label: 'Recent' },
              { k: 'name', label: 'A–Z' },
              { k: 'value', label: 'Price ↓' },
            ] as const).map((o) => (
              <button
                key={o.k}
                onClick={() => setSortBy(o.k)}
                className={`px-2.5 py-1.5 rounded-lg border transition-colors ${
                  sortBy === o.k
                    ? 'border-gold text-gold bg-gold/10'
                    : 'border-white/10 text-gray-400 hover:text-white'
                }`}
              >
                {o.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Cards grid */}
      {cards.length === 0 ? (
        <div className="text-center py-20">
          <ImageIcon size={40} className="text-gray-600 mx-auto mb-4" />
          <p className="text-gray-500">No cards yet. Add your first card above.</p>
        </div>
      ) : filteredCards.length === 0 ? (
        <div className="text-center py-16">
          <Search size={32} className="text-gray-600 mx-auto mb-3" />
          <p className="text-gray-500 text-sm">No cards match “{search}”.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5">
          {filteredCards.map((card) => {
            // A stored Scrydex image (browse adds) vs the user's own photo
            // (scan/upload) — image_url can hold either, so tell them apart by
            // the host. Stock = stored Scrydex image, else reconstructed URL.
            const storedStock = card.image_url && card.image_url.includes('scrydex') ? card.image_url : null
            const userPhoto = card.image_url && !card.image_url.includes('scrydex') ? card.image_url : null
            const stockUrl = storedStock || (card.scrydex_id ? getCardImageUrl(card.scrydex_id, card.game) : null)
            const images: { key: ImageOption; url: string; label: string }[] = [
              ...(stockUrl ? [{ key: 'stock' as const, url: stockUrl, label: 'Stock' }] : []),
              ...(userPhoto ? [{ key: 'front' as const, url: userPhoto, label: 'Photo' }] : []),
              ...(card.back_image_url ? [{ key: 'back' as const, url: card.back_image_url, label: 'Back' }] : []),
            ]
            // Scrydex has no distinct art for special foils (Master Ball / Poké
            // Ball), so its stock image shows the plain print. When we have the
            // user's own scan of such a card, default to that — it's the real one.
            const foil = (card.variant || '').toLowerCase().replace(/[^a-z]/g, '')
            const isSpecialFoil = foil.includes('masterball') || foil.includes('pokeball') || foil.includes('friendball')
            const defaultKey = isSpecialFoil && userPhoto ? 'front' : images[0]?.key
            const selected = cardImageSide[card.id] ?? defaultKey
            const currentImageUrl = images.find((img) => img.key === selected)?.url ?? null

            return (
              <div
                key={card.id}
                className="bg-navy-800 rounded-2xl border border-white/5 overflow-hidden hover:border-gold/20 transition-colors"
              >
                {/* Image */}
                <div
                  className="relative cursor-pointer aspect-[5/7] bg-navy-900 p-4"
                  onClick={() => setDetailCard(card)}
                >
                  {(card.quantity ?? 1) > 1 && (
                    <span className="absolute top-2 left-2 z-10 px-2 py-0.5 rounded-md bg-black/70 border border-white/10 text-gold text-xs font-bold">
                      ×{card.quantity}
                    </span>
                  )}
                  {currentImageUrl ? (
                    <img
                      src={currentImageUrl}
                      alt={card.name}
                      loading="lazy"
                      decoding="async"
                      className="w-full h-full object-contain rounded-md"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <ImageIcon size={32} className="text-gray-700" />
                    </div>
                  )}
                </div>

                {/* Thumbnails: stock (if matched) + front/back photo slots — empty slots are a "+" to add that photo */}
                <div className="flex gap-1.5 px-3 pt-3">
                  {images.map((img) => (
                    <button
                      key={img.key}
                      onClick={(e) => {
                        e.stopPropagation()
                        setCardImageSide((prev) => ({ ...prev, [card.id]: img.key }))
                      }}
                      className={`w-10 h-14 rounded-md overflow-hidden border-2 flex-shrink-0 transition-colors ${
                        selected === img.key ? 'border-gold' : 'border-white/10 hover:border-white/30'
                      }`}
                      title={img.label}
                    >
                      <img src={img.url} alt={img.label} className="w-full h-full object-cover" />
                    </button>
                  ))}
                  {!userPhoto && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        openSlotUpload(card.id, 'front')
                      }}
                      title="Add front photo"
                      className="w-10 h-14 rounded-md border-2 border-dashed border-white/15 hover:border-gold/40 flex-shrink-0 flex items-center justify-center text-gray-600 hover:text-gold transition-colors"
                    >
                      <Plus size={14} />
                    </button>
                  )}
                  {!card.back_image_url && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        openSlotUpload(card.id, 'back')
                      }}
                      title="Add back photo"
                      className="w-10 h-14 rounded-md border-2 border-dashed border-white/15 hover:border-gold/40 flex-shrink-0 flex items-center justify-center text-gray-600 hover:text-gold transition-colors"
                    >
                      <Plus size={14} />
                    </button>
                  )}
                </div>

                {/* Info */}
                <div className="p-4">
                  <p className="text-white font-semibold text-sm truncate">{card.name}</p>
                  <p className="text-gray-500 text-xs mt-0.5 truncate">
                    {[card.card_set, card.year, card.condition].filter(Boolean).join(' · ')}
                  </p>
                  <div className="flex items-center gap-2 mt-3">
                    <span className="text-gold font-bold">
                      {card.estimated_value != null
                        ? `$${card.estimated_value.toFixed(2)}`
                        : '—'}
                    </span>
                    {card.price_change_pct != null && (
                      <PriceTicker pct={card.price_change_pct} size="sm" />
                    )}
                  </div>
                  {/* Quantity — locked until you tap edit, then Save to commit */}
                  <div className="flex items-center justify-between mt-3 min-h-[36px]">
                    <span className="text-gray-500 text-xs">Qty</span>
                    {editingQtyId === card.id ? (
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => setEditQty((q) => Math.max(1, q - 1))}
                          disabled={editQty <= 1}
                          className="w-9 h-9 rounded-md bg-navy-900 border border-white/10 text-white text-base leading-none hover:border-gold/40 transition-colors disabled:opacity-40"
                          aria-label="Decrease quantity"
                        >
                          −
                        </button>
                        <span className="text-white text-sm font-semibold w-5 text-center">{editQty}</span>
                        <button
                          onClick={() => setEditQty((q) => q + 1)}
                          className="w-9 h-9 rounded-md bg-navy-900 border border-white/10 text-white text-base leading-none hover:border-gold/40 transition-colors"
                          aria-label="Increase quantity"
                        >
                          +
                        </button>
                        <button
                          onClick={() => {
                            setCardQuantity(card, editQty)
                            setEditingQtyId(null)
                          }}
                          className="ml-1 p-2.5 rounded-md text-green-400 hover:bg-green-500/10 transition-colors"
                          aria-label="Save quantity"
                        >
                          <Check size={16} />
                        </button>
                        <button
                          onClick={() => setEditingQtyId(null)}
                          className="p-2.5 rounded-md text-gray-500 hover:text-white transition-colors"
                          aria-label="Cancel"
                        >
                          <X size={16} />
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => {
                          setEditQty(card.quantity ?? 1)
                          setEditingQtyId(card.id)
                        }}
                        className="flex items-center gap-1.5 text-white text-sm font-semibold hover:text-gold transition-colors"
                        aria-label="Edit quantity"
                      >
                        ×{card.quantity ?? 1}
                        <Pencil size={12} className="text-gray-500" />
                      </button>
                    )}
                  </div>
                  {/* Actions */}
                  <div className="flex items-center gap-2 mt-3 pt-3 border-t border-white/5">
                    <button
                      onClick={() => handleRefreshPrice(card)}
                      disabled={!card.scrydex_id}
                      title="Refresh price"
                      className="p-2.5 text-gray-500 hover:text-white disabled:opacity-30 transition-colors"
                    >
                      <RefreshCw size={14} />
                    </button>
                    <button
                      onClick={() => setPrintCard(card)}
                      title="Print label"
                      className="p-2.5 text-gray-500 hover:text-gold transition-colors"
                    >
                      <Printer size={14} />
                    </button>
                    {listedCardIds.has(card.id) ? (
                      <Link
                        to="/sell"
                        className="flex-1 flex items-center justify-center gap-1 border border-green-500/30 bg-green-900/20 text-green-400 py-2 rounded-lg text-xs"
                      >
                        <Check size={12} />
                        Listed
                      </Link>
                    ) : (
                      <button
                        onClick={() => handleSell(card)}
                        disabled={sellingCardId === card.id}
                        className="flex-1 flex items-center justify-center gap-1 border border-white/10 text-gray-300 py-2 rounded-lg text-xs hover:border-gold/30 hover:text-gold transition-colors disabled:opacity-50"
                      >
                        <Tag size={12} />
                        {sellingCardId === card.id ? 'Listing...' : 'Sell'}
                      </button>
                    )}
                    <button
                      onClick={() => setDeleteCardId(card.id)}
                      className="p-2.5 text-gray-500 hover:text-red-400 transition-colors"
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
      {deleteCardId &&
        createPortal(
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
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
          </div>,
          document.body
        )}

      {dupPrompt &&
        createPortal(
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
            <div className="bg-navy-800 rounded-2xl border border-white/10 p-8 max-w-sm w-full text-center">
              <h3 className="font-heading text-xl font-bold text-white mb-2">Already in this portfolio</h3>
              <p className="text-gray-400 text-sm mb-1">
                <span className="text-white font-medium">{dupPrompt.existing.name}</span>
                {dupPrompt.existing.condition ? ` · ${dupPrompt.existing.condition}` : ''} is already here (currently ×
                {dupPrompt.existing.quantity ?? 1}).
              </p>
              <p className="text-gray-400 text-sm mb-6">
                Update the quantity to{' '}
                <span className="text-gold font-semibold">
                  ×{(dupPrompt.existing.quantity ?? 1) + dupPrompt.addQty}
                </span>
                ?
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setDupPrompt(null)}
                  className="flex-1 py-3 rounded-xl border border-white/10 text-gray-400 text-sm"
                >
                  Cancel
                </button>
                <button
                  onClick={() => bumpQuantity(dupPrompt.existing, dupPrompt.addQty)}
                  className="flex-1 py-3 rounded-xl bg-gold text-navy-900 font-semibold text-sm hover:opacity-90"
                >
                  Update quantity
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}

      {detailCard && (
        <CardDetailDialog
          card={detailCard}
          onClose={() => setDetailCard(null)}
          onSell={() => handleSell(detailCard)}
        />
      )}
      {showScan && (
        <ScanCardsDialog
          onClose={() => setShowScan(false)}
          onCardFound={handleCardFound}
          onCardsFound={handleCardsFound}
        />
      )}
      {showBrowse && (
        <BrowseAddCardDialog onClose={() => setShowBrowse(false)} onAddCard={handleAddFromBrowse} />
      )}
      {printCard && (
        <PrintLabelDialog card={printCard} onClose={() => setPrintCard(null)} />
      )}
      <input
        ref={slotInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleSlotFileSelected}
      />
    </div>
  )
}
