import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { X, Search, Package, Loader2, Plus, Minus } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'

const GAMES = [
  { id: 'pokemon', label: 'Pokémon' },
  { id: 'magicthegathering', label: 'MTG' },
  { id: 'yugioh', label: 'Yu-Gi-Oh!' },
  { id: 'onepiece', label: 'One Piece' },
  { id: 'lorcana', label: 'Lorcana' },
]

const PRODUCT_TYPES = [
  { id: 'booster_box', label: 'Booster Box' },
  { id: 'etb', label: 'ETB' },
  { id: 'pack', label: 'Pack' },
  { id: 'tin', label: 'Tin' },
  { id: 'bundle', label: 'Bundle' },
  { id: 'case', label: 'Case' },
  { id: 'other', label: 'Other' },
]

interface SearchResult {
  id: string
  name: string
  set_name: string | null
  game: string
  product_type: string
  image_url: string | null
  market_price: number | null
  low_price: number | null
}

interface Portfolio {
  id: string
  name: string
}

interface AddSealedDialogProps {
  onClose: () => void
  defaultContext?: 'inventory' | 'collection'
  defaultPortfolioId?: string
  onAdded?: () => void
}

export function AddSealedDialog({ onClose, defaultContext = 'inventory', defaultPortfolioId, onAdded }: AddSealedDialogProps) {
  const { user } = useAuth()
  const [query, setQuery] = useState('')
  const [game, setGame] = useState('pokemon')
  const [results, setResults] = useState<SearchResult[]>([])
  const [searching, setSearching] = useState(false)
  const [selected, setSelected] = useState<SearchResult | null>(null)
  const [quantity, setQuantity] = useState(1)
  const [purchasePrice, setPurchasePrice] = useState('')
  const [context, setContext] = useState<'inventory' | 'collection'>(defaultContext)
  const [portfolioId, setPortfolioId] = useState(defaultPortfolioId || '')
  const [portfolios, setPortfolios] = useState<Portfolio[]>([])
  const [productType, setProductType] = useState('booster_box')
  const [submitting, setSubmitting] = useState(false)
  const [noKey, setNoKey] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (user) loadPortfolios()
  }, [user])

  async function loadPortfolios() {
    const { data } = await supabase.from('portfolios').select('id, name').eq('user_id', user!.id).order('name')
    setPortfolios(data ?? [])
    if (!defaultPortfolioId && data?.length) setPortfolioId(data[0].id)
  }

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    const q = query.trim()
    if (q.length < 2) { setResults([]); return }
    debounceRef.current = setTimeout(() => search(q), 400)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [query, game])

  async function search(q: string) {
    setSearching(true)
    setNoKey(false)
    try {
      const res = await fetch(`/api/tcg/search?q=${encodeURIComponent(q)}&game=${game}`)
      if (res.status === 401) { setNoKey(true); setResults([]); return }
      const json = await res.json()
      setResults(json.data ?? [])
    } catch {
      setResults([])
    } finally {
      setSearching(false)
    }
  }

  async function handleAdd() {
    if (!user || !selected) return
    setSubmitting(true)
    const price = purchasePrice ? parseFloat(purchasePrice) : null
    const { error } = await supabase.from('sealed_products').insert({
      user_id: user.id,
      tcg_product_id: selected.id,
      name: selected.name,
      set_name: selected.set_name,
      game: selected.game,
      product_type: productType,
      image_url: selected.image_url,
      quantity,
      purchase_price: price,
      market_price: selected.market_price,
      context,
      portfolio_id: context === 'collection' && portfolioId ? portfolioId : null,
      status: 'in_stock',
    })
    setSubmitting(false)
    if (!error) { onAdded?.(); onClose() }
  }

  async function handleAddManual() {
    if (!user || !query.trim()) return
    setSubmitting(true)
    const price = purchasePrice ? parseFloat(purchasePrice) : null
    const { error } = await supabase.from('sealed_products').insert({
      user_id: user.id,
      name: query.trim(),
      game,
      product_type: productType,
      quantity,
      purchase_price: price,
      context,
      portfolio_id: context === 'collection' && portfolioId ? portfolioId : null,
      status: 'in_stock',
    })
    setSubmitting(false)
    if (!error) { onAdded?.(); onClose() }
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-[#1a1a1d] rounded-2xl border border-white/10 w-full max-w-xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-white/8">
          <h2 className="font-heading font-semibold text-white text-lg">Add Sealed Product</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white p-1 transition-colors">
            <X size={20} />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* Context toggle */}
          <div className="flex gap-2">
            <button
              onClick={() => setContext('inventory')}
              className={`flex-1 py-2 rounded-xl text-sm font-medium transition-colors ${
                context === 'inventory'
                  ? 'bg-gold text-navy-900'
                  : 'border border-white/10 text-gray-400 hover:text-white'
              }`}
            >
              Inventory (Reseller)
            </button>
            <button
              onClick={() => setContext('collection')}
              className={`flex-1 py-2 rounded-xl text-sm font-medium transition-colors ${
                context === 'collection'
                  ? 'bg-gold text-navy-900'
                  : 'border border-white/10 text-gray-400 hover:text-white'
              }`}
            >
              Collection (Portfolio)
            </button>
          </div>

          {/* Portfolio picker — only when adding to collection */}
          {context === 'collection' && portfolios.length > 0 && (
            <div>
              <label className="block text-xs text-gray-400 mb-1.5">Portfolio</label>
              <select
                value={portfolioId}
                onChange={(e) => setPortfolioId(e.target.value)}
                className="w-full bg-[#111113] border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm focus:outline-none focus:border-gold/50"
              >
                {portfolios.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
          )}

          {/* Game tabs */}
          <div className="flex gap-1.5 flex-wrap">
            {GAMES.map((g) => (
              <button
                key={g.id}
                onClick={() => setGame(g.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  game === g.id
                    ? 'bg-gold/15 border border-gold/40 text-gold'
                    : 'border border-white/10 text-gray-400 hover:text-white'
                }`}
              >
                {g.label}
              </button>
            ))}
          </div>

          {/* Search */}
          <div className="relative">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search products (e.g. Prismatic Evolutions booster box)…"
              className="w-full bg-[#111113] border border-white/10 rounded-xl pl-9 pr-4 py-2.5 text-white text-sm placeholder-gray-600 focus:outline-none focus:border-gold/50"
              autoFocus
            />
          </div>

          {/* API key missing notice */}
          {noKey && (
            <div className="p-3 bg-amber-900/20 border border-amber-500/30 rounded-xl text-amber-400 text-xs">
              TCG API key not set. Set <code className="bg-black/30 px-1 rounded">TCGAPI_KEY</code> in Railway env vars, or add manually below.
            </div>
          )}

          {/* Results */}
          {searching && (
            <div className="flex justify-center py-6">
              <Loader2 size={20} className="text-gold animate-spin" />
            </div>
          )}

          {!searching && results.length > 0 && !selected && (
            <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
              {results.map((r) => (
                <button
                  key={r.id}
                  onClick={() => { setSelected(r); setProductType(r.product_type || 'booster_box') }}
                  className="w-full flex items-center gap-3 p-3 bg-[#111113] rounded-xl border border-white/5 hover:border-gold/30 transition-colors text-left"
                >
                  {r.image_url ? (
                    <img src={r.image_url} alt={r.name} className="w-10 h-14 object-contain rounded flex-shrink-0" />
                  ) : (
                    <div className="w-10 h-14 bg-white/5 rounded flex-shrink-0 flex items-center justify-center">
                      <Package size={16} className="text-gray-600" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-white text-sm font-medium truncate">{r.name}</p>
                    {r.set_name && <p className="text-gray-500 text-xs">{r.set_name}</p>}
                    {r.market_price != null && (
                      <p className="text-gold text-xs mt-1">${r.market_price.toFixed(2)} market</p>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}

          {/* Selected product detail */}
          {selected && (
            <div className="p-3 bg-gold/5 border border-gold/20 rounded-xl flex gap-3 items-start">
              {selected.image_url ? (
                <img src={selected.image_url} alt={selected.name} className="w-12 h-16 object-contain rounded flex-shrink-0" />
              ) : (
                <div className="w-12 h-16 bg-white/5 rounded flex-shrink-0 flex items-center justify-center">
                  <Package size={18} className="text-gray-600" />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-white text-sm font-semibold">{selected.name}</p>
                {selected.set_name && <p className="text-gray-400 text-xs">{selected.set_name}</p>}
                {selected.market_price != null && (
                  <p className="text-gold text-xs mt-0.5">${selected.market_price.toFixed(2)} market</p>
                )}
              </div>
              <button onClick={() => setSelected(null)} className="text-gray-500 hover:text-white flex-shrink-0 p-1">
                <X size={14} />
              </button>
            </div>
          )}

          {/* Manual fallback when no results */}
          {!searching && results.length === 0 && query.length >= 2 && !selected && (
            <p className="text-xs text-gray-500 text-center">
              No results — you can still add manually using the fields below.
            </p>
          )}

          {/* Product type */}
          <div>
            <label className="block text-xs text-gray-400 mb-1.5">Product Type</label>
            <select
              value={productType}
              onChange={(e) => setProductType(e.target.value)}
              className="w-full bg-[#111113] border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm focus:outline-none focus:border-gold/50"
            >
              {PRODUCT_TYPES.map((t) => (
                <option key={t.id} value={t.id}>{t.label}</option>
              ))}
            </select>
          </div>

          {/* Quantity + cost */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-400 mb-1.5">Quantity</label>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                  className="w-9 h-9 rounded-lg bg-[#111113] border border-white/10 flex items-center justify-center text-white hover:border-gold/40 transition-colors"
                >
                  <Minus size={14} />
                </button>
                <span className="text-white font-semibold w-6 text-center">{quantity}</span>
                <button
                  onClick={() => setQuantity((q) => q + 1)}
                  className="w-9 h-9 rounded-lg bg-[#111113] border border-white/10 flex items-center justify-center text-white hover:border-gold/40 transition-colors"
                >
                  <Plus size={14} />
                </button>
              </div>
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1.5">Purchase Price</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm">$</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={purchasePrice}
                  onChange={(e) => setPurchasePrice(e.target.value)}
                  placeholder="0.00"
                  className="w-full bg-[#111113] border border-white/10 rounded-xl pl-7 pr-3 py-2.5 text-white text-sm focus:outline-none focus:border-gold/50"
                />
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-1">
            <button
              onClick={onClose}
              className="flex-1 py-3 rounded-xl border border-white/10 text-gray-400 hover:text-white text-sm transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={selected ? handleAdd : handleAddManual}
              disabled={submitting || (!selected && query.trim().length < 2)}
              className="flex-1 py-3 rounded-xl bg-gold text-navy-900 font-semibold text-sm hover:opacity-90 disabled:opacity-40 transition-opacity"
            >
              {submitting ? 'Adding…' : selected ? 'Add to ' + (context === 'inventory' ? 'Inventory' : 'Collection') : 'Add Manually'}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  )
}
