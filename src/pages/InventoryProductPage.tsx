import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { Link, useParams } from '@tanstack/react-router'
import {
  ArrowLeft, Package, RefreshCw, DollarSign, TrendingUp, TrendingDown,
  Trash2, CheckCircle2, X, Pencil, ExternalLink, ShoppingBag, Info, Gavel,
} from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'

interface EbaySale {
  title: string
  price: number
  end_time: string
  url: string
}

const GAME_LABELS: Record<string, string> = {
  pokemon: 'Pokémon', magicthegathering: 'MTG', yugioh: 'Yu-Gi-Oh!',
  onepiece: 'One Piece', lorcana: 'Lorcana', other: 'Other',
}
const TYPE_LABELS: Record<string, string> = {
  booster_box: 'Booster Box', etb: 'ETB', pack: 'Pack',
  tin: 'Tin', bundle: 'Bundle', case: 'Case', other: 'Other',
}

interface SealedProduct {
  id: string
  name: string
  game: string
  product_type: string
  image_url: string | null
  quantity: number
  purchase_price: number | null
  market_price: number | null
  status: string
  sold_price: number | null
  context: string
  created_at: string
}

export function InventoryProductPage() {
  const { productId } = useParams({ strict: false }) as { productId: string }
  const { user } = useAuth()
  const [product, setProduct] = useState<SealedProduct | null>(null)
  const [loading, setLoading] = useState(true)

  // Edit state
  const [editing, setEditing] = useState(false)
  const [editQty, setEditQty] = useState('')
  const [editCost, setEditCost] = useState('')
  const [editName, setEditName] = useState('')
  const [saving, setSaving] = useState(false)

  // Market price refresh
  const [refreshing, setRefreshing] = useState(false)
  const [refreshMsg, setRefreshMsg] = useState<string | null>(null)

  // Modals
  const [showSold, setShowSold] = useState(false)
  const [soldPrice, setSoldPrice] = useState('')
  const [submittingSold, setSubmittingSold] = useState(false)
  const [showDelete, setShowDelete] = useState(false)

  // eBay listing draft
  const [listPrice, setListPrice] = useState('')

  // eBay completed sales
  const [ebaySales, setEbaySales] = useState<EbaySale[]>([])
  const [ebayAvg, setEbayAvg] = useState<number | null>(null)
  const [loadingSales, setLoadingSales] = useState(false)

  useEffect(() => {
    if (user && productId) fetchProduct()
  }, [user, productId])

  async function fetchProduct() {
    setLoading(true)
    const { data } = await supabase
      .from('sealed_products')
      .select('*')
      .eq('id', productId)
      .eq('user_id', user!.id)
      .single()
    if (data) {
      setProduct(data)
      setEditQty(String(data.quantity))
      setEditCost(data.purchase_price != null ? String(data.purchase_price) : '')
      setEditName(data.name)
      setListPrice(data.market_price != null ? data.market_price.toFixed(2) : '')
      fetchEbaySales(data.name)
    }
    setLoading(false)
  }

  async function fetchEbaySales(name: string) {
    setLoadingSales(true)
    try {
      const res = await fetch(`/api/ebay/sold?q=${encodeURIComponent(name)}&limit=8`)
      const json = await res.json()
      if (json.sales) {
        setEbaySales(json.sales)
        setEbayAvg(json.avg ?? null)
      }
    } catch {}
    setLoadingSales(false)
  }

  async function saveEdits() {
    if (!product) return
    setSaving(true)
    const qty = parseInt(editQty) || product.quantity
    const cost = editCost ? parseFloat(editCost) : null
    await supabase.from('sealed_products').update({
      name: editName.trim() || product.name,
      quantity: qty,
      purchase_price: cost,
      updated_at: new Date().toISOString(),
    }).eq('id', product.id)
    setSaving(false)
    setEditing(false)
    fetchProduct()
  }

  async function refreshMarketPrice() {
    if (!product) return
    setRefreshing(true)
    setRefreshMsg(null)
    try {
      // Try TCGPlayer market price first (real aggregated market data)
      const tcgRes = await fetch(`/api/tcg/search?q=${encodeURIComponent(product.name)}&game=${product.game}`)
      const tcgJson = await tcgRes.json()
      const tcgFirst = tcgJson.data?.[0]
      if (tcgFirst?.market_price != null) {
        await supabase.from('sealed_products').update({
          market_price: tcgFirst.market_price,
          updated_at: new Date().toISOString(),
        }).eq('id', product.id)
        setRefreshMsg(`Updated to $${tcgFirst.market_price.toFixed(2)} via TCGPlayer market`)
        fetchProduct()
        setRefreshing(false)
        return
      }
      // Fallback: eBay listing price
      const ebayRes = await fetch(`/api/ebay/search?q=${encodeURIComponent(product.name)}`)
      const ebayJson = await ebayRes.json()
      const ebayFirst = ebayJson.data?.[0]
      if (ebayFirst?.price != null) {
        await supabase.from('sealed_products').update({
          market_price: ebayFirst.price,
          updated_at: new Date().toISOString(),
        }).eq('id', product.id)
        setRefreshMsg(`Updated to $${ebayFirst.price.toFixed(2)} from eBay listing`)
        fetchProduct()
      } else {
        setRefreshMsg('No price found — try again later.')
      }
    } catch {
      setRefreshMsg('Refresh failed — check connection.')
    }
    setRefreshing(false)
  }

  async function markSold() {
    if (!product) return
    const price = parseFloat(soldPrice)
    if (isNaN(price) || price <= 0) return
    setSubmittingSold(true)
    await supabase.from('sealed_products').update({
      status: 'sold', sold_price: price, updated_at: new Date().toISOString(),
    }).eq('id', product.id)
    setSubmittingSold(false)
    setShowSold(false)
    fetchProduct()
  }

  async function deleteProduct() {
    if (!product) return
    await supabase.from('sealed_products').delete().eq('id', product.id)
    window.history.back()
  }

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-[60vh]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gold" />
      </div>
    )
  }

  if (!product) {
    return (
      <div className="max-w-3xl mx-auto px-6 py-16 text-center">
        <p className="text-gray-500">Product not found.</p>
        <Link to="/inventory" className="text-gold text-sm mt-3 inline-block hover:underline">← Back to inventory</Link>
      </div>
    )
  }

  const cost = (product.purchase_price ?? 0) * product.quantity
  const market = (product.market_price ?? product.purchase_price ?? 0) * product.quantity
  const pl = product.status === 'sold'
    ? ((product.sold_price ?? 0) - (product.purchase_price ?? 0)) * product.quantity
    : market - cost
  const plPositive = pl >= 0

  return (
    <div className="max-w-4xl mx-auto px-6 py-10">
      {/* Back */}
      <Link
        to="/inventory"
        className="inline-flex items-center gap-2 text-gray-400 hover:text-white text-sm transition-colors mb-8"
      >
        <ArrowLeft size={15} />
        Inventory
      </Link>

      <div className="grid grid-cols-1 md:grid-cols-[1fr_2fr] gap-8">
        {/* Left — image */}
        <div className="flex flex-col gap-4">
          <div className="bg-navy-800 rounded-2xl border border-white/5 p-6 flex items-center justify-center min-h-[220px]">
            {product.image_url ? (
              <img src={product.image_url} alt={product.name} className="max-h-56 object-contain rounded" />
            ) : (
              <Package size={48} className="text-gray-700" />
            )}
          </div>

          {/* Badges */}
          <div className="flex flex-wrap gap-2 justify-center">
            <span className="px-3 py-1 rounded-full bg-gold/10 border border-gold/30 text-gold text-xs font-medium">
              {GAME_LABELS[product.game] ?? product.game}
            </span>
            <span className="px-3 py-1 rounded-full bg-white/5 border border-white/10 text-gray-400 text-xs">
              {TYPE_LABELS[product.product_type] ?? product.product_type}
            </span>
            {product.status === 'sold' ? (
              <span className="px-3 py-1 rounded-full bg-gray-800 border border-white/10 text-gray-400 text-xs">Sold</span>
            ) : (
              <span className="px-3 py-1 rounded-full bg-green-900/30 border border-green-500/20 text-green-400 text-xs">In Stock</span>
            )}
          </div>
        </div>

        {/* Right — details */}
        <div className="flex flex-col gap-6">
          {/* Name + edit */}
          <div>
            {editing ? (
              <input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className="w-full bg-[#111113] border border-gold/40 rounded-xl px-4 py-2.5 text-white font-heading text-2xl font-bold focus:outline-none mb-1"
              />
            ) : (
              <h1 className="font-heading text-2xl md:text-3xl font-bold text-white mb-1 leading-snug">
                {product.name}
              </h1>
            )}
            <p className="text-gray-500 text-xs">
              Added {new Date(product.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
            </p>
          </div>

          {/* Metrics grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {/* Quantity */}
            <div className="bg-navy-800 rounded-xl border border-white/5 p-4">
              <p className="text-xs text-gray-500 uppercase tracking-widest mb-1">Qty</p>
              {editing ? (
                <input
                  type="number"
                  min="1"
                  value={editQty}
                  onChange={(e) => setEditQty(e.target.value)}
                  className="w-full bg-[#111113] border border-gold/40 rounded-lg px-2 py-1 text-white font-bold text-lg focus:outline-none"
                />
              ) : (
                <p className="text-white font-bold text-2xl">{product.quantity}</p>
              )}
            </div>

            {/* Cost */}
            <div className="bg-navy-800 rounded-xl border border-white/5 p-4">
              <p className="text-xs text-gray-500 uppercase tracking-widest mb-1">Cost</p>
              {editing ? (
                <div className="relative">
                  <span className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-500 text-sm">$</span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={editCost}
                    onChange={(e) => setEditCost(e.target.value)}
                    placeholder="0.00"
                    className="w-full bg-[#111113] border border-gold/40 rounded-lg pl-5 pr-2 py-1 text-white font-bold text-lg focus:outline-none"
                  />
                </div>
              ) : (
                <p className="text-white font-bold text-2xl font-mono">
                  {product.purchase_price != null
                    ? `$${cost.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                    : '—'}
                </p>
              )}
            </div>

            {/* Market price */}
            <div className="bg-navy-800 rounded-xl border border-white/5 p-4 sm:col-span-2">
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-1">
                  <p className="text-xs text-gray-500 uppercase tracking-widest">Market</p>
                  <div className="group relative">
                    <Info size={11} className="text-gray-600 cursor-help" />
                    <div className="absolute bottom-5 left-0 w-52 bg-navy-900 border border-white/10 rounded-lg p-2 text-xs text-gray-400 opacity-0 group-hover:opacity-100 pointer-events-none z-10 transition-opacity">
                      TCGPlayer market price (aggregated from real sales). Hit Refresh to update from TCGPlayer, falls back to eBay.
                    </div>
                  </div>
                </div>
                <button
                  onClick={refreshMarketPrice}
                  disabled={refreshing}
                  className="flex items-center gap-1 text-xs text-gray-500 hover:text-gold transition-colors"
                  title="Refresh from eBay"
                >
                  <RefreshCw size={11} className={refreshing ? 'animate-spin' : ''} />
                  Refresh
                </button>
              </div>
              <p className="text-blue-400 font-bold text-2xl font-mono">
                {product.market_price != null
                  ? `$${market.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                  : '—'}
              </p>
              {refreshMsg && (
                <p className="text-xs text-gray-500 mt-1">{refreshMsg}</p>
              )}
            </div>
          </div>

          {/* P&L bar */}
          <div className={`rounded-xl border p-4 flex items-center gap-3 ${plPositive ? 'bg-green-900/10 border-green-500/20' : 'bg-red-900/10 border-red-500/20'}`}>
            {plPositive ? <TrendingUp size={18} className="text-green-400 flex-shrink-0" /> : <TrendingDown size={18} className="text-red-400 flex-shrink-0" />}
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-widest">
                {product.status === 'sold' ? 'Realized P&L' : 'Unrealized P&L'}
              </p>
              <p className={`font-bold text-xl font-mono ${plPositive ? 'text-green-400' : 'text-red-400'}`}>
                {product.purchase_price != null
                  ? `${plPositive ? '+' : ''}$${pl.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                  : '—'}
              </p>
            </div>
          </div>

          {/* Actions */}
          <div className="flex flex-wrap gap-2">
            {editing ? (
              <>
                <button
                  onClick={saveEdits}
                  disabled={saving}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gold text-navy-900 font-semibold text-sm hover:opacity-90 disabled:opacity-50 transition-opacity"
                >
                  <CheckCircle2 size={14} />
                  {saving ? 'Saving…' : 'Save'}
                </button>
                <button
                  onClick={() => { setEditing(false); setEditQty(String(product.quantity)); setEditCost(product.purchase_price != null ? String(product.purchase_price) : ''); setEditName(product.name) }}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl border border-white/10 text-gray-400 hover:text-white text-sm transition-colors"
                >
                  <X size={14} /> Cancel
                </button>
              </>
            ) : (
              <button
                onClick={() => setEditing(true)}
                className="flex items-center gap-2 px-4 py-2 rounded-xl border border-white/10 text-gray-400 hover:text-white text-sm transition-colors"
              >
                <Pencil size={14} /> Edit
              </button>
            )}
            {product.status === 'in_stock' && (
              <button
                onClick={() => { setSoldPrice(product.market_price?.toFixed(2) ?? ''); setShowSold(true) }}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-green-900/30 border border-green-500/20 text-green-400 text-sm hover:bg-green-900/50 transition-colors"
              >
                <DollarSign size={14} /> Mark Sold
              </button>
            )}
            <button
              onClick={() => setShowDelete(true)}
              className="flex items-center gap-2 px-4 py-2 rounded-xl border border-red-500/20 text-red-400 text-sm hover:bg-red-900/20 transition-colors"
            >
              <Trash2 size={14} /> Delete
            </button>
          </div>
        </div>
      </div>

      {/* eBay completed sales */}
      <div className="mt-10 bg-navy-800 rounded-2xl border border-white/5 p-6">
        <div className="flex items-center gap-3 mb-5">
          <div className="w-9 h-9 bg-[#0064d2]/10 rounded-xl flex items-center justify-center">
            <Gavel size={18} className="text-[#0064d2]" />
          </div>
          <div className="flex-1">
            <h2 className="font-heading font-semibold text-white text-lg">eBay Completed Sales</h2>
            <p className="text-gray-500 text-xs">Real transaction prices — not asking prices</p>
          </div>
          {ebayAvg != null && (
            <div className="text-right">
              <p className="text-xs text-gray-500 uppercase tracking-widest">Avg sold</p>
              <p className="text-[#0064d2] font-bold text-xl font-mono">${ebayAvg.toFixed(2)}</p>
            </div>
          )}
        </div>

        {loadingSales ? (
          <div className="flex justify-center py-6">
            <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-gold" />
          </div>
        ) : ebaySales.length === 0 ? (
          <p className="text-gray-600 text-sm text-center py-4">No completed eBay sales found for this product.</p>
        ) : (
          <div className="overflow-x-auto -mx-2 px-2">
            <table className="w-full text-sm min-w-[400px]">
              <thead>
                <tr className="border-b border-white/5">
                  <th className="text-left text-xs text-gray-500 font-normal pb-2">Title</th>
                  <th className="text-right text-xs text-gray-500 font-normal pb-2 pl-4">Sold for</th>
                  <th className="text-right text-xs text-gray-500 font-normal pb-2 pl-4">Date</th>
                </tr>
              </thead>
              <tbody>
                {ebaySales.map((sale, i) => (
                  <tr key={i} className="border-b border-white/[0.03] hover:bg-white/[0.02]">
                    <td className="py-2.5 pr-2">
                      <a
                        href={sale.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-gray-300 hover:text-gold transition-colors line-clamp-1 flex items-center gap-1"
                      >
                        {sale.title}
                        <ExternalLink size={10} className="flex-shrink-0 opacity-50" />
                      </a>
                    </td>
                    <td className="py-2.5 pl-4 text-right font-mono text-green-400 whitespace-nowrap font-semibold">
                      ${sale.price.toFixed(2)}
                    </td>
                    <td className="py-2.5 pl-4 text-right text-gray-500 whitespace-nowrap">
                      {new Date(sale.end_time).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* eBay listing section */}
      {product.status === 'in_stock' && (
        <div className="mt-10 bg-navy-800 rounded-2xl border border-white/5 p-6">
          <div className="flex items-center gap-3 mb-5">
            <div className="w-9 h-9 bg-[#e53238]/10 rounded-xl flex items-center justify-center">
              <ShoppingBag size={18} className="text-[#e53238]" />
            </div>
            <div>
              <h2 className="font-heading font-semibold text-white text-lg">List on eBay</h2>
              <p className="text-gray-500 text-xs">Push this item as an eBay listing from your BamDealz account</p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-5">
            <div>
              <label className="block text-xs text-gray-400 mb-1.5">Listing title</label>
              <input
                value={editName || product.name}
                onChange={(e) => setEditName(e.target.value)}
                className="w-full bg-[#111113] border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm focus:outline-none focus:border-gold/50"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1.5">List price (per unit)</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm">$</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={listPrice}
                  onChange={(e) => setListPrice(e.target.value)}
                  placeholder={product.market_price?.toFixed(2) ?? '0.00'}
                  className="w-full bg-[#111113] border border-white/10 rounded-xl pl-7 pr-3 py-2.5 text-white text-sm focus:outline-none focus:border-gold/50"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1.5">Quantity to list</label>
              <input
                type="number"
                min="1"
                max={product.quantity}
                defaultValue={product.quantity}
                className="w-full bg-[#111113] border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm focus:outline-none focus:border-gold/50"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1.5">Condition</label>
              <select className="w-full bg-[#111113] border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm focus:outline-none focus:border-gold/50">
                <option value="NEW">New</option>
                <option value="NEW_OTHER">New — other (open box)</option>
                <option value="USED_EXCELLENT">Used — excellent</option>
              </select>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#e53238] text-white font-semibold text-sm hover:opacity-90 transition-opacity"
              onClick={() => alert('eBay OAuth listing — coming soon. Needs BamDealz seller token.')}
            >
              <ExternalLink size={14} />
              Push to eBay
            </button>
            <p className="text-gray-600 text-xs">eBay seller OAuth required — coming soon</p>
          </div>
        </div>
      )}

      {/* Mark sold modal */}
      {showSold && createPortal(
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
          onClick={(e) => e.target === e.currentTarget && setShowSold(false)}>
          <div className="bg-[#1a1a1d] rounded-2xl border border-white/10 p-6 w-full max-w-sm">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-heading font-semibold text-white">Mark as Sold</h3>
              <button onClick={() => setShowSold(false)} className="text-gray-400 hover:text-white p-1"><X size={18} /></button>
            </div>
            <p className="text-gray-400 text-sm mb-4 truncate">{product.name}</p>
            <label className="block text-xs text-gray-400 mb-1.5">Sold Price (total for all units)</label>
            <div className="relative mb-5">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm">$</span>
              <input
                type="number" min="0" step="0.01"
                value={soldPrice}
                onChange={(e) => setSoldPrice(e.target.value)}
                className="w-full bg-[#111113] border border-white/10 rounded-xl pl-7 pr-3 py-2.5 text-white text-sm focus:outline-none focus:border-gold/50"
                autoFocus
              />
            </div>
            <div className="flex gap-3">
              <button onClick={() => setShowSold(false)} className="flex-1 py-2.5 rounded-xl border border-white/10 text-gray-400 hover:text-white text-sm">Cancel</button>
              <button
                onClick={markSold}
                disabled={submittingSold || !soldPrice}
                className="flex-1 py-2.5 rounded-xl bg-green-600 text-white font-semibold text-sm hover:bg-green-500 disabled:opacity-40 transition-colors"
              >
                {submittingSold ? 'Saving…' : 'Confirm Sale'}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Delete modal */}
      {showDelete && createPortal(
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
          onClick={(e) => e.target === e.currentTarget && setShowDelete(false)}>
          <div className="bg-[#1a1a1d] rounded-2xl border border-white/10 p-6 w-full max-w-sm text-center">
            <p className="text-white font-semibold mb-2">Delete this product?</p>
            <p className="text-gray-400 text-sm mb-5">This cannot be undone.</p>
            <div className="flex gap-3">
              <button onClick={() => setShowDelete(false)} className="flex-1 py-2.5 rounded-xl border border-white/10 text-gray-400 hover:text-white text-sm">Cancel</button>
              <button onClick={deleteProduct} className="flex-1 py-2.5 rounded-xl bg-red-600 text-white font-semibold text-sm hover:bg-red-500 transition-colors">Delete</button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  )
}
