import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { X, Search, Package, Loader2, Plus, Minus, Barcode, AlertCircle, Camera } from 'lucide-react'
import { BrowserMultiFormatReader } from '@zxing/browser'
import { NotFoundException } from '@zxing/library'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'

function detectGame(name: string): string {
  const n = name.toLowerCase()
  if (n.includes('japan') || n.includes('japanese') || /\b(sv|sm|xy|bw|dp)\d/.test(n)) return 'japanesetcg'
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

interface TcgResult {
  id: string
  name: string
  set_name: string | null
  image_url: string | null
  market_price: number | null
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
  const [results, setResults] = useState<TcgResult[]>([])
  const [searching, setSearching] = useState(false)
  const [searchError, setSearchError] = useState<string | null>(null)
  const [selected, setSelected] = useState<TcgResult | null>(null)
  const [quantity, setQuantity] = useState(1)
  const [purchasePrice, setPurchasePrice] = useState('')
  const [context, setContext] = useState<'inventory' | 'collection'>(defaultContext)
  const [portfolioId, setPortfolioId] = useState(defaultPortfolioId || '')
  const [portfolios, setPortfolios] = useState<Portfolio[]>([])
  const [productType, setProductType] = useState('booster_box')
  const [submitting, setSubmitting] = useState(false)

  // UPC barcode scanner
  const [scanning, setScanning] = useState(false)
  const [scanError, setScanError] = useState<string | null>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const zxingRef = useRef<BrowserMultiFormatReader | null>(null)

  // Photo identification
  const [photoMode, setPhotoMode] = useState(false)
  const [identifying, setIdentifying] = useState(false)
  const [photoError, setPhotoError] = useState<string | null>(null)
  const photoVideoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const photoStreamRef = useRef<MediaStream | null>(null)

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const searchIdRef = useRef(0) // incremented each call; stale responses are ignored
  const skipSearchRef = useRef(false) // set true after a UPC hit to suppress the debounce

  // Prevent background scroll
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

  // Debounce: text query → TCGPlayer search
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    const q = query.trim()
    if (q.length < 2) { setResults([]); setSearchError(null); return }
    if (skipSearchRef.current) { skipSearchRef.current = false; return }
    debounceRef.current = setTimeout(() => searchTcg(q), 400)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [query])

  async function searchTcg(q: string) {
    const id = ++searchIdRef.current
    setSearching(true)
    setSearchError(null)
    const detectedGame = detectGame(q)
    try {
      const res = await fetch(`/api/tcg/search-smart?q=${encodeURIComponent(q)}&game=${detectedGame}`)
      const json = await res.json()
      if (id !== searchIdRef.current) return // stale response — a newer search is in flight
      const hits: TcgResult[] = json.data ?? []
      setResults(hits)
    } catch {
      if (id !== searchIdRef.current) return
      setSearchError('Search failed — check your connection.')
      setResults([])
    } finally {
      if (id === searchIdRef.current) setSearching(false)
    }
  }

  // UPC barcode scanner via ZXing (works on iOS Safari + all browsers)
  useEffect(() => {
    if (!scanning) return
    let stopped = false

    const reader = new BrowserMultiFormatReader()
    zxingRef.current = reader

    reader.decodeFromConstraints(
      { video: { facingMode: { ideal: 'environment' } } },
      videoRef.current!,
      (result, err) => {
        if (stopped) return
        if (result) {
          stopped = true
          setScanning(false)
          resolveUpcToTitle(result.getText())
        } else if (err && !(err instanceof NotFoundException)) {
          setScanError('Camera access denied.')
        }
      }
    ).catch(() => {
      if (!stopped) setScanError('Camera access denied.')
    })

    return () => {
      stopped = true
      BrowserMultiFormatReader.releaseAllStreams()
      if (videoRef.current) videoRef.current.srcObject = null
    }
  }, [scanning])

  async function resolveUpcToTitle(upc: string) {
    setSearching(true)
    setSearchError(null)
    setQuery(upc)
    try {
      // 1. Direct catalog lookup — instant, no external API needed
      const upcRes  = await fetch(`/api/tcg/upc/${encodeURIComponent(upc)}`)
      const upcJson = await upcRes.json()
      if (upcJson.data) {
        const hit: TcgResult = upcJson.data
        skipSearchRef.current = true
        if (debounceRef.current) clearTimeout(debounceRef.current)
        setQuery(hit.name)
        setResults([hit])
        setSearching(false)
        return
      }

      // 2. eBay title fallback for products not yet in the catalog
      const res = await fetch(`/api/ebay/search?q=${encodeURIComponent(upc)}`)
      const json = await res.json()
      const rawTitle: string = json.data?.[0]?.name || ''
      if (!rawTitle) {
        setSearchError('UPC not found — try searching by title.')
        setSearching(false)
        return
      }
      const noisePattern = /\b(NEW|SEALED|FREE\s+SHIP|SHIPPING|FACTORY\s+SEALED|IN\s+HAND|FAST\s+SHIP|SAME\s+DAY|UNOPENED|FREE\s+RETURN|AUTHENTIC|GENUINE|OFFICIAL|SHIPS\s+FAST)\b.*/i
      const cleaned = rawTitle
        .replace(/^\s*[\[\(][^\]\)]*[\]\)]\s*/g, '')
        .replace(noisePattern, '')
        .replace(/\s{2,}/g, ' ')
        .trim()
      setQuery(cleaned)
      if (debounceRef.current) clearTimeout(debounceRef.current)
      await searchTcg(cleaned)
    } catch {
      setSearchError('UPC lookup failed.')
      setSearching(false)
    }
  }

  // Photo mode: open camera for still capture
  useEffect(() => {
    if (!photoMode) {
      photoStreamRef.current?.getTracks().forEach(t => t.stop())
      photoStreamRef.current = null
      return
    }
    let cancelled = false
    navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 } },
    }).then(stream => {
      if (cancelled) { stream.getTracks().forEach(t => t.stop()); return }
      photoStreamRef.current = stream
      if (photoVideoRef.current) {
        photoVideoRef.current.srcObject = stream
        photoVideoRef.current.play()
      }
    }).catch(() => {
      if (!cancelled) setPhotoError('Camera access denied.')
    })
    return () => { cancelled = true }
  }, [photoMode])

  async function captureAndIdentify() {
    if (!photoVideoRef.current || !canvasRef.current) return
    const video = photoVideoRef.current
    const canvas = canvasRef.current
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    canvas.getContext('2d')?.drawImage(video, 0, 0)
    const dataUrl = canvas.toDataURL('image/jpeg', 0.85)
    const base64 = dataUrl.split(',')[1]

    setPhotoMode(false)
    setIdentifying(true)
    setSearchError(null)

    try {
      const res = await fetch('/api/sealed/identify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: base64, mime: 'image/jpeg' }),
      })
      const json = await res.json()
      if (!json.name) {
        setSearchError("Couldn't identify a product — try searching by title.")
        setIdentifying(false)
        return
      }
      setQuery(json.name)
      if (debounceRef.current) clearTimeout(debounceRef.current)
      setIdentifying(false)
      await searchTcg(json.name)
    } catch {
      setSearchError('Photo identification failed.')
      setIdentifying(false)
    }
  }

  function selectResult(r: TcgResult) {
    setSelected(r)
    setGame(detectGame(r.name))
    setProductType(detectProductType(r.name))
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
        {/* Header */}
        <div className="flex-shrink-0 flex items-center justify-between p-5 border-b border-white/8">
          <h2 className="font-heading font-semibold text-white text-lg">Add Sealed Product</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white p-1 transition-colors">
            <X size={20} />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto overscroll-contain p-5 space-y-4">

          {/* Context toggle */}
          <div className="flex gap-2">
            {(['inventory', 'collection'] as const).map((c) => (
              <button
                key={c}
                onClick={() => setContext(c)}
                className={`flex-1 py-2 rounded-xl text-sm font-medium transition-colors ${
                  context === c ? 'bg-gold text-navy-900' : 'border border-white/10 text-gray-400 hover:text-white'
                }`}
              >
                {c === 'inventory' ? 'Inventory (Reseller)' : 'Collection (Portfolio)'}
              </button>
            ))}
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

          {/* Search bar + UPC scan + Photo */}
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search by title…"
                style={{ fontSize: 16 }}
                className="w-full bg-[#111113] border border-white/10 rounded-xl pl-9 pr-4 py-2.5 text-white placeholder-gray-600 focus:outline-none focus:border-gold/50"
              />
            </div>
            <button
              onClick={() => { setScanError(null); setScanning(true) }}
              title="Scan UPC barcode"
              className="flex-shrink-0 w-10 h-10 flex items-center justify-center rounded-xl border border-white/10 text-gray-400 hover:text-gold hover:border-gold/40 transition-colors"
            >
              <Barcode size={17} />
            </button>
            <button
              onClick={() => { setPhotoError(null); setPhotoMode(true) }}
              title="Take photo to identify"
              className="flex-shrink-0 w-10 h-10 flex items-center justify-center rounded-xl border border-white/10 text-gray-400 hover:text-gold hover:border-gold/40 transition-colors"
            >
              <Camera size={17} />
            </button>
          </div>

          {/* Status / errors */}
          {identifying && (
            <div className="flex items-center gap-2 text-gray-400 text-xs">
              <Loader2 size={13} className="animate-spin" />
              Identifying product with Gemini…
            </div>
          )}
          {searchError && (
            <div className="flex items-center gap-2 p-3 bg-red-900/20 border border-red-500/30 rounded-xl text-red-400 text-xs">
              <AlertCircle size={13} className="flex-shrink-0" />
              {searchError}
            </div>
          )}
          {photoError && (
            <div className="flex items-center gap-2 p-3 bg-red-900/20 border border-red-500/30 rounded-xl text-red-400 text-xs">
              <AlertCircle size={13} className="flex-shrink-0" />
              {photoError}
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
                    {r.set_name && <p className="text-gray-500 text-xs mt-0.5">{r.set_name}</p>}
                    {r.market_price != null && (
                      <p className="text-gold text-xs mt-1">${r.market_price.toFixed(2)} <span className="text-gray-600">· TCGPlayer market</span></p>
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
                {selected.set_name && <p className="text-gray-500 text-xs mt-0.5">{selected.set_name}</p>}
                {selected.market_price != null && (
                  <p className="text-gold text-xs mt-0.5">
                    ${selected.market_price.toFixed(2)}
                    <span className="text-gray-600 ml-1">· TCGPlayer market</span>
                  </p>
                )}
              </div>
              <button onClick={() => setSelected(null)} className="text-gray-500 hover:text-white flex-shrink-0 p-1">
                <X size={14} />
              </button>
            </div>
          )}

          {/* Manual fallback hint */}
          {!searching && !identifying && results.length === 0 && query.length >= 2 && !selected && !searchError && (
            <p className="text-xs text-gray-500 text-center">
              No TCGPlayer results — you can still add manually using the fields below.
            </p>
          )}

          {/* Game + Product type — only for manual adds */}
          {!selected && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-gray-400 mb-1.5">Game</label>
                <select
                  value={game}
                  onChange={(e) => setGame(e.target.value)}
                  className="w-full bg-[#111113] border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm focus:outline-none focus:border-gold/50"
                >
                  {[
                    { id: 'pokemon', label: 'Pokémon' },
                    { id: 'japanesetcg', label: 'Pokémon Japan' },
                    { id: 'magicthegathering', label: 'MTG' },
                    { id: 'yugioh', label: 'Yu-Gi-Oh!' },
                    { id: 'onepiece', label: 'One Piece' },
                    { id: 'lorcana', label: 'Lorcana' },
                    { id: 'other', label: 'Other' },
                  ].map((g) => <option key={g.id} value={g.id}>{g.label}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1.5">Product Type</label>
                <select
                  value={productType}
                  onChange={(e) => setProductType(e.target.value)}
                  className="w-full bg-[#111113] border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm focus:outline-none focus:border-gold/50"
                >
                  {[
                    { id: 'booster_box', label: 'Booster Box' },
                    { id: 'etb', label: 'ETB' },
                    { id: 'pack', label: 'Pack' },
                    { id: 'tin', label: 'Tin' },
                    { id: 'bundle', label: 'Bundle' },
                    { id: 'case', label: 'Case' },
                    { id: 'other', label: 'Other' },
                  ].map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
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
                  type="number" min="0" step="0.01"
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
              {submitting ? 'Adding…' : selected ? `Add to ${context === 'inventory' ? 'Inventory' : 'Collection'}` : 'Add Manually'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )

  // UPC barcode scanner overlay
  const scanOverlay = (
    <div
      className="fixed inset-0 z-[200] bg-black/95 flex flex-col items-center"
      style={{ padding: '1.5rem', paddingTop: 'max(1.5rem, env(safe-area-inset-top))', paddingBottom: 'max(2rem, env(safe-area-inset-bottom))' }}
    >
      <p className="text-white font-semibold text-lg mt-2">Scan UPC Barcode</p>
      <p className="text-gray-500 text-xs mt-1 mb-4">Instant catalog lookup · eBay fallback for new products</p>

      {/* Video fills all space between header and footer — no jump when camera loads */}
      <div className="relative flex-1 w-full max-w-sm overflow-hidden rounded-2xl bg-black">
        <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
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

      <div className="h-8 flex items-center my-3">
        {scanError
          ? <p className="text-red-400 text-sm text-center">{scanError}</p>
          : <p className="text-gray-500 text-xs">Auto-detects UPC · EAN · Code-128</p>
        }
      </div>
      <button
        onClick={() => setScanning(false)}
        className="px-8 py-3 border border-white/20 text-white rounded-xl hover:border-white/40 transition-colors text-sm"
      >
        Cancel
      </button>
    </div>
  )

  // Photo capture overlay
  const photoOverlay = (
    <div
      className="fixed inset-0 z-[200] bg-black/95 flex flex-col items-center"
      style={{ padding: '1.5rem', paddingTop: 'max(1.5rem, env(safe-area-inset-top))', paddingBottom: 'max(2rem, env(safe-area-inset-bottom))' }}
    >
      <p className="text-white font-semibold text-lg mt-2">Point at the product</p>
      <p className="text-gray-500 text-xs mt-1 mb-4">Gemini identifies it → TCGPlayer pulls the price</p>

      {/* Video fills all space between header and footer */}
      <div className="relative flex-1 w-full max-w-sm overflow-hidden rounded-2xl bg-black">
        <video ref={photoVideoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
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

      <canvas ref={canvasRef} className="hidden" />
      <div className="h-8 flex items-center my-3">
        {photoError && <p className="text-red-400 text-sm text-center">{photoError}</p>}
      </div>
      <div className="flex gap-4">
        <button
          onClick={() => setPhotoMode(false)}
          className="px-6 py-3 border border-white/20 text-white rounded-xl hover:border-white/40 transition-colors text-sm"
        >
          Cancel
        </button>
        <button
          onClick={captureAndIdentify}
          className="px-8 py-3 bg-gold text-navy-900 font-semibold rounded-xl hover:opacity-90 transition-opacity text-sm"
        >
          Identify
        </button>
      </div>
    </div>
  )

  return (
    <>
      {createPortal(mainDialog, document.body)}
      {scanning && createPortal(scanOverlay, document.body)}
      {photoMode && createPortal(photoOverlay, document.body)}
    </>
  )
}
