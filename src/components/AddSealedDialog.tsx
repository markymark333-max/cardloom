import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { X, Search, Package, Loader2, Plus, Minus, Barcode, AlertCircle } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'

const GAMES = [
  { id: 'pokemon', label: 'Pokémon' },
  { id: 'magicthegathering', label: 'MTG' },
  { id: 'yugioh', label: 'Yu-Gi-Oh!' },
  { id: 'onepiece', label: 'One Piece' },
  { id: 'lorcana', label: 'Lorcana' },
  { id: 'other', label: 'Other' },
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

function detectGame(name: string): string {
  const n = name.toLowerCase()
  if (n.includes('pokemon') || n.includes('pokémon')) return 'pokemon'
  if (n.includes('magic') || n.includes('mtg') || n.includes('the gathering')) return 'magicthegathering'
  if (n.includes('yu-gi-oh') || n.includes('yugioh') || n.includes('yu gi oh')) return 'yugioh'
  if (n.includes('one piece')) return 'onepiece'
  if (n.includes('lorcana')) return 'lorcana'
  return 'pokemon'
}

function detectProductType(name: string): string {
  const n = name.toLowerCase()
  if (n.includes('elite trainer') || n.includes(' etb')) return 'etb'
  if (n.includes('booster box')) return 'booster_box'
  if (n.includes('booster pack') || (n.includes('booster') && !n.includes('box'))) return 'pack'
  if (n.includes(' tin')) return 'tin'
  if (n.includes('bundle')) return 'bundle'
  if (n.includes('case')) return 'case'
  return 'booster_box'
}

interface EbayResult {
  id: string
  name: string
  image_url: string | null
  price: number | null
  condition: string | null
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
  const [results, setResults] = useState<EbayResult[]>([])
  const [searching, setSearching] = useState(false)
  const [searchError, setSearchError] = useState<string | null>(null)
  const [selected, setSelected] = useState<EbayResult | null>(null)
  const [quantity, setQuantity] = useState(1)
  const [purchasePrice, setPurchasePrice] = useState('')
  const [context, setContext] = useState<'inventory' | 'collection'>(defaultContext)
  const [portfolioId, setPortfolioId] = useState(defaultPortfolioId || '')
  const [portfolios, setPortfolios] = useState<Portfolio[]>([])
  const [productType, setProductType] = useState('booster_box')
  const [submitting, setSubmitting] = useState(false)
  const [noKey, setNoKey] = useState(false)
  const [scanning, setScanning] = useState(false)
  const [scanError, setScanError] = useState<string | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const videoRef = useRef<HTMLVideoElement>(null)

  // Prevent background scroll while dialog is open
  useEffect(() => {
    const prev = document.documentElement.style.overflow
    document.documentElement.style.overflow = 'hidden'
    return () => { document.documentElement.style.overflow = prev }
  }, [])

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
    if (q.length < 2) { setResults([]); setSearchError(null); return }
    debounceRef.current = setTimeout(() => searchEbay(q), 400)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [query])

  async function searchEbay(q: string) {
    setSearching(true)
    setNoKey(false)
    setSearchError(null)
    try {
      const res = await fetch(`/api/ebay/search?q=${encodeURIComponent(q)}`)
      if (res.status === 401) { setNoKey(true); setResults([]); return }
      const json = await res.json()
      if (json.error) { setSearchError(json.error); setResults([]); return }
      setResults(json.data ?? [])
    } catch {
      setSearchError('Search failed — check your connection.')
      setResults([])
    } finally {
      setSearching(false)
    }
  }

  // Camera barcode scanner
  useEffect(() => {
    if (!scanning) return
    let cancelled = false
    let stream: MediaStream | null = null
    let frameId = 0

    async function init() {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 } },
        })
        if (cancelled) { stream.getTracks().forEach(t => t.stop()); return }
        if (!videoRef.current) { setScanError('Camera init failed.'); return }
        videoRef.current.srcObject = stream
        await videoRef.current.play()

        if (!('BarcodeDetector' in window)) {
          setScanError('Barcode scanning not supported in this browser — type the UPC manually.')
          return
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const detector = new (window as any).BarcodeDetector({
          formats: ['upc_a', 'upc_e', 'ean_13', 'ean_8', 'code_128', 'code_39'],
        })

        const detect = async () => {
          if (cancelled || !videoRef.current) return
          try {
            const codes = await detector.detect(videoRef.current)
            if (codes.length > 0 && !cancelled) {
              setQuery(codes[0].rawValue)
              setScanning(false)
              return
            }
          } catch {}
          if (!cancelled) frameId = requestAnimationFrame(detect)
        }
        frameId = requestAnimationFrame(detect)
      } catch {
        if (!cancelled) setScanError('Camera access denied.')
      }
    }

    init()

    return () => {
      cancelled = true
      cancelAnimationFrame(frameId)
      stream?.getTracks().forEach(t => t.stop())
      if (videoRef.current) videoRef.current.srcObject = null
    }
  }, [scanning])

  async function selectResult(r: EbayResult) {
    setSelected(r)
    setGame(detectGame(r.name))
    setProductType(detectProductType(r.name))
    // Try to enrich with TCGPlayer market price in the background
    try {
      const game = detectGame(r.name)
      const res = await fetch(`/api/tcg/search?q=${encodeURIComponent(r.name)}&game=${game}`)
      const json = await res.json()
      const first = json.data?.[0]
      if (first?.market_price != null) {
        setSelected((prev) => prev ? { ...prev, price: first.market_price } : prev)
      }
    } catch { /* silently ignore — eBay price is the fallback */ }
  }

  async function handleAdd() {
    if (!user || !selected) return
    setSubmitting(true)
    const price = purchasePrice ? parseFloat(purchasePrice) : null
    const { error } = await supabase.from('sealed_products').insert({
      user_id: user.id,
      tcg_product_id: selected.id,
      name: selected.name,
      game,
      product_type: productType,
      image_url: selected.image_url,
      quantity,
      purchase_price: price,
      market_price: selected.price,
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

  const BRACKET_STYLES: Record<string, string> = {
    tl: '2px 0 0 2px', tr: '2px 2px 0 0', bl: '0 0 2px 2px', br: '0 2px 2px 0',
  }

  const mainDialog = (
    <div
      className="fixed inset-0 z-[100] flex flex-col justify-end sm:justify-center sm:items-center sm:p-4 bg-black/70 backdrop-blur-sm"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className="bg-[#1a1a1d] rounded-t-2xl sm:rounded-2xl border-t border-x sm:border border-white/10 w-full sm:max-w-xl flex flex-col h-[85dvh] sm:h-auto sm:max-h-[85vh]"
      >
        {/* Header — never scrolls */}
        <div className="flex-shrink-0 flex items-center justify-between p-5 border-b border-white/8">
          <h2 className="font-heading font-semibold text-white text-lg">Add Sealed Product</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white p-1 transition-colors">
            <X size={20} />
          </button>
        </div>

        {/* Scrollable body — grows to fill remaining dialog height */}
        <div className="flex-1 overflow-y-auto overscroll-contain p-5 space-y-4">
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

          {/* Portfolio picker */}
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

          {/* Search bar + barcode scan button */}
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search by name or paste UPC…"
                className="w-full bg-[#111113] border border-white/10 rounded-xl pl-9 pr-4 py-2.5 text-white text-sm placeholder-gray-600 focus:outline-none focus:border-gold/50"
              />
            </div>
            <button
              onClick={() => { setScanError(null); setScanning(true) }}
              title="Scan barcode"
              className="flex-shrink-0 w-10 h-10 flex items-center justify-center rounded-xl border border-white/10 text-gray-400 hover:text-gold hover:border-gold/40 transition-colors"
            >
              <Barcode size={17} />
            </button>
          </div>

          {/* Error states */}
          {noKey && (
            <div className="p-3 bg-amber-900/20 border border-amber-500/30 rounded-xl text-amber-400 text-xs">
              eBay API not configured. Set <code className="bg-black/30 px-1 rounded">EBAY_APP_ID</code> and{' '}
              <code className="bg-black/30 px-1 rounded">EBAY_CERT_ID</code> in Railway env vars.
            </div>
          )}
          {searchError && !noKey && (
            <div className="flex items-center gap-2 p-3 bg-red-900/20 border border-red-500/30 rounded-xl text-red-400 text-xs">
              <AlertCircle size={13} className="flex-shrink-0" />
              {searchError}
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
                  onClick={() => selectResult(r)}
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
                    <p className="text-white text-sm font-medium line-clamp-2">{r.name}</p>
                    {r.condition && <p className="text-gray-500 text-xs mt-0.5">{r.condition}</p>}
                    {r.price != null && (
                      <p className="text-gold text-xs mt-1">${r.price.toFixed(2)}</p>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}

          {/* Selected product */}
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
                <p className="text-white text-sm font-semibold line-clamp-2">{selected.name}</p>
                {selected.price != null && (
                  <p className="text-gold text-xs mt-0.5">${selected.price.toFixed(2)} listed</p>
                )}
              </div>
              <button onClick={() => setSelected(null)} className="text-gray-500 hover:text-white flex-shrink-0 p-1">
                <X size={14} />
              </button>
            </div>
          )}

          {/* Manual fallback */}
          {!searching && results.length === 0 && query.length >= 2 && !selected && !searchError && !noKey && (
            <p className="text-xs text-gray-500 text-center">
              No results — you can still add manually using the fields below.
            </p>
          )}

          {/* Game + Product type — only needed for manual adds; eBay results auto-detect both */}
          {!selected && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-gray-400 mb-1.5">Game</label>
                <select
                  value={game}
                  onChange={(e) => setGame(e.target.value)}
                  className="w-full bg-[#111113] border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm focus:outline-none focus:border-gold/50"
                >
                  {GAMES.map((g) => (
                    <option key={g.id} value={g.id}>{g.label}</option>
                  ))}
                </select>
              </div>
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
            </div>
          )}

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
    </div>
  )

  const scanOverlay = (
    <div className="fixed inset-0 z-[200] bg-black/95 flex flex-col items-center justify-center gap-5 p-6">
      <p className="text-white font-semibold text-lg">Point camera at barcode</p>
      <div className="relative w-full max-w-sm">
        <video ref={videoRef} autoPlay playsInline muted className="w-full rounded-2xl bg-black" />
        {(['tl', 'tr', 'bl', 'br'] as const).map(pos => (
          <div
            key={pos}
            className="absolute"
            style={{
              width: 36, height: 36,
              top: pos.startsWith('t') ? 12 : undefined,
              bottom: pos.startsWith('b') ? 12 : undefined,
              left: pos.endsWith('l') ? 12 : undefined,
              right: pos.endsWith('r') ? 12 : undefined,
              borderColor: '#C9956A',
              borderStyle: 'solid',
              borderWidth: BRACKET_STYLES[pos],
            }}
          />
        ))}
      </div>
      {scanError
        ? <p className="text-red-400 text-sm text-center max-w-xs">{scanError}</p>
        : <p className="text-gray-500 text-xs">Auto-detects UPC · EAN · Code-128</p>
      }
      <button
        onClick={() => setScanning(false)}
        className="px-8 py-3 border border-white/20 text-white rounded-xl hover:border-white/40 transition-colors text-sm"
      >
        Cancel
      </button>
    </div>
  )

  return (
    <>
      {createPortal(mainDialog, document.body)}
      {scanning && createPortal(scanOverlay, document.body)}
    </>
  )
}
