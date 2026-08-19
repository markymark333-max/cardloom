import { useState, useEffect } from 'react'
import { Package, Plus, TrendingUp, TrendingDown, DollarSign, Archive, Trash2, CheckCircle2, X } from 'lucide-react'
import { createPortal } from 'react-dom'
import { useNavigate } from '@tanstack/react-router'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { AddSealedDialog } from '../components/AddSealedDialog'

const GAMES = ['All', 'pokemon', 'magicthegathering', 'yugioh', 'onepiece', 'lorcana']
const GAME_LABELS: Record<string, string> = {
  pokemon: 'Pokémon', magicthegathering: 'MTG', yugioh: 'Yu-Gi-Oh!',
  onepiece: 'One Piece', lorcana: 'Lorcana',
}
const TYPE_LABELS: Record<string, string> = {
  booster_box: 'Booster Box', etb: 'ETB', pack: 'Pack',
  tin: 'Tin', bundle: 'Bundle', case: 'Case', other: 'Other', sealed: 'Sealed',
}

interface SealedProduct {
  id: string
  name: string
  set_name: string | null
  game: string
  product_type: string
  image_url: string | null
  quantity: number
  purchase_price: number | null
  market_price: number | null
  status: string
  sold_price: number | null
  created_at: string
}

interface SoldModalState {
  product: SealedProduct
  soldPrice: string
}

export function InventoryPage() {
  const { user, loading: authLoading } = useAuth()
  const navigate = useNavigate()
  const [items, setItems] = useState<SealedProduct[]>([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [gameFilter, setGameFilter] = useState('All')
  const [statusFilter, setStatusFilter] = useState<'all' | 'in_stock' | 'sold'>('all')
  const [soldModal, setSoldModal] = useState<SoldModalState | null>(null)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (user) fetchItems()
  }, [user])

  async function fetchItems() {
    setLoading(true)
    const { data } = await supabase
      .from('sealed_products')
      .select('*')
      .eq('user_id', user!.id)
      .eq('context', 'inventory')
      .order('created_at', { ascending: false })
    setItems(data ?? [])
    setLoading(false)
  }

  async function markSold(product: SealedProduct, soldPriceStr: string) {
    const soldPrice = parseFloat(soldPriceStr)
    if (isNaN(soldPrice) || soldPrice <= 0) return
    setSubmitting(true)
    await supabase
      .from('sealed_products')
      .update({ status: 'sold', sold_price: soldPrice, updated_at: new Date().toISOString() })
      .eq('id', product.id)
    setSubmitting(false)
    setSoldModal(null)
    fetchItems()
  }

  async function handleDelete(id: string) {
    await supabase.from('sealed_products').delete().eq('id', id)
    setDeleteId(null)
    fetchItems()
  }

  const filtered = items.filter((item) => {
    if (gameFilter !== 'All' && item.game !== gameFilter) return false
    if (statusFilter !== 'all' && item.status !== statusFilter) return false
    return true
  })

  // Summary stats — inventory items only (in_stock + sold)
  const inStock = items.filter((i) => i.status === 'in_stock')
  const sold = items.filter((i) => i.status === 'sold')
  const totalInvested = inStock.reduce((s, i) => s + (i.purchase_price ?? 0) * i.quantity, 0)
  const totalMarket = inStock.reduce((s, i) => s + (i.market_price ?? i.purchase_price ?? 0) * i.quantity, 0)
  const unrealizedPL = totalMarket - totalInvested
  const realizedPL = sold.reduce((s, i) => s + ((i.sold_price ?? 0) - (i.purchase_price ?? 0)) * i.quantity, 0)

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
          <p className="text-gray-400 text-sm">Sign in to manage your inventory.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-7xl mx-auto px-6 py-10">
      {/* Page header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="font-heading text-4xl font-bold text-white">Inventory</h1>
          <p className="text-gray-500 text-sm mt-1">Sealed product — reseller view</p>
        </div>
        <button
          onClick={() => setShowAdd(true)}
          className="flex items-center gap-2 bg-gold text-navy-900 font-semibold px-4 py-2.5 rounded-xl text-sm hover:opacity-90 transition-opacity"
        >
          <Plus size={15} />
          Add Product
        </button>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {[
          {
            label: 'Invested',
            value: `$${totalInvested.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
            icon: DollarSign,
            color: 'text-gray-400',
          },
          {
            label: 'Market Value',
            value: `$${totalMarket.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
            icon: Archive,
            color: 'text-blue-400',
          },
          {
            label: 'Unrealized P&L',
            value: `${unrealizedPL >= 0 ? '+' : ''}$${unrealizedPL.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
            icon: unrealizedPL >= 0 ? TrendingUp : TrendingDown,
            color: unrealizedPL >= 0 ? 'text-green-400' : 'text-red-400',
          },
          {
            label: 'Realized P&L',
            value: `${realizedPL >= 0 ? '+' : ''}$${realizedPL.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
            icon: CheckCircle2,
            color: realizedPL >= 0 ? 'text-green-400' : 'text-red-400',
          },
        ].map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="bg-navy-800 rounded-2xl border border-white/5 p-5">
            <div className="flex items-center gap-2 mb-2">
              <Icon size={15} className={color} />
              <span className="text-xs text-gray-500 uppercase tracking-widest">{label}</span>
            </div>
            <p className={`font-heading text-2xl font-bold ${color}`}>{value}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2 mb-6">
        {GAMES.map((g) => (
          <button
            key={g}
            onClick={() => setGameFilter(g)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              gameFilter === g
                ? 'bg-gold/15 border border-gold/40 text-gold'
                : 'border border-white/10 text-gray-400 hover:text-white'
            }`}
          >
            {g === 'All' ? 'All Games' : GAME_LABELS[g] ?? g}
          </button>
        ))}
        <div className="w-px h-5 bg-white/10 mx-1" />
        {(['all', 'in_stock', 'sold'] as const).map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              statusFilter === s
                ? 'bg-white/10 border border-white/20 text-white'
                : 'border border-white/5 text-gray-500 hover:text-white'
            }`}
          >
            {s === 'all' ? 'All Status' : s === 'in_stock' ? 'In Stock' : 'Sold'}
          </button>
        ))}
      </div>

      {/* Empty state */}
      {filtered.length === 0 ? (
        <div className="text-center py-24">
          <Package size={44} className="text-gray-700 mx-auto mb-4" />
          <p className="text-gray-500 text-sm">
            {items.length === 0 ? 'No inventory yet. Add your first sealed product above.' : 'No items match these filters.'}
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm" style={{ minWidth: 640 }}>
            <thead>
              <tr className="text-left text-xs text-gray-500 uppercase tracking-widest border-b border-white/5">
                <th className="pb-3 pr-4">Product</th>
                <th className="pb-3 pr-4">Type</th>
                <th className="pb-3 pr-4 text-right">Qty</th>
                <th className="pb-3 pr-4 text-right">Cost</th>
                <th className="pb-3 pr-4 text-right">Market</th>
                <th className="pb-3 pr-4 text-right">P&L</th>
                <th className="pb-3 text-right">Status</th>
                <th className="pb-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {filtered.map((item) => {
                const cost = (item.purchase_price ?? 0) * item.quantity
                const market = (item.market_price ?? item.purchase_price ?? 0) * item.quantity
                const pl = item.status === 'sold'
                  ? ((item.sold_price ?? 0) - (item.purchase_price ?? 0)) * item.quantity
                  : market - cost
                const plPositive = pl >= 0

                return (
                  <tr
                    key={item.id}
                    className="group cursor-pointer hover:bg-white/[0.02] transition-colors"
                    onClick={() => navigate({ to: '/inventory/$productId', params: { productId: item.id } })}
                  >
                    <td className="py-3.5 pr-4">
                      <div className="flex items-center gap-3">
                        {item.image_url ? (
                          <img src={item.image_url} alt={item.name} className="w-9 h-12 object-contain rounded flex-shrink-0" loading="lazy" />
                        ) : (
                          <div className="w-9 h-12 bg-white/5 rounded flex-shrink-0 flex items-center justify-center">
                            <Package size={14} className="text-gray-600" />
                          </div>
                        )}
                        <div className="min-w-0">
                          <p className="text-white font-medium truncate max-w-[200px]">{item.name}</p>
                          {item.set_name && <p className="text-gray-500 text-xs truncate">{item.set_name}</p>}
                          <p className="text-gray-600 text-xs">{GAME_LABELS[item.game] ?? item.game}</p>
                        </div>
                      </div>
                    </td>
                    <td className="py-3.5 pr-4 text-gray-400">{TYPE_LABELS[item.product_type] ?? item.product_type}</td>
                    <td className="py-3.5 pr-4 text-right text-white font-mono">{item.quantity}</td>
                    <td className="py-3.5 pr-4 text-right text-gray-300 font-mono tabular-nums">
                      {item.purchase_price != null ? `$${cost.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—'}
                    </td>
                    <td className="py-3.5 pr-4 text-right text-gray-300 font-mono tabular-nums">
                      {item.market_price != null ? `$${market.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—'}
                    </td>
                    <td className={`py-3.5 pr-4 text-right font-mono tabular-nums font-semibold ${plPositive ? 'text-green-400' : 'text-red-400'}`}>
                      {item.purchase_price != null ? `${plPositive ? '+' : ''}$${pl.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—'}
                    </td>
                    <td className="py-3.5 text-right">
                      {item.status === 'sold' ? (
                        <span className="px-2 py-0.5 rounded-md bg-gray-800 border border-white/10 text-gray-400 text-xs">Sold</span>
                      ) : (
                        <span className="px-2 py-0.5 rounded-md bg-green-900/30 border border-green-500/20 text-green-400 text-xs">In Stock</span>
                      )}
                    </td>
                    <td className="py-3.5 pl-3" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity justify-end">
                        {item.status === 'in_stock' && (
                          <button
                            onClick={() => setSoldModal({ product: item, soldPrice: item.market_price?.toFixed(2) ?? '' })}
                            className="px-2.5 py-1.5 rounded-lg bg-green-900/30 border border-green-500/20 text-green-400 text-xs hover:bg-green-900/50 transition-colors"
                            title="Mark as sold"
                          >
                            Mark Sold
                          </button>
                        )}
                        <button
                          onClick={() => setDeleteId(item.id)}
                          className="p-1.5 rounded-lg text-gray-500 hover:text-red-400 transition-colors"
                          title="Delete"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Add sealed dialog */}
      {showAdd && (
        <AddSealedDialog
          defaultContext="inventory"
          onClose={() => setShowAdd(false)}
          onAdded={fetchItems}
        />
      )}

      {/* Mark sold modal */}
      {soldModal && createPortal(
        <div
          className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
          onClick={(e) => e.target === e.currentTarget && setSoldModal(null)}
        >
          <div className="bg-[#1a1a1d] rounded-2xl border border-white/10 p-6 w-full max-w-sm">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-heading font-semibold text-white">Mark as Sold</h3>
              <button onClick={() => setSoldModal(null)} className="text-gray-400 hover:text-white p-1">
                <X size={18} />
              </button>
            </div>
            <p className="text-gray-400 text-sm mb-4 truncate">{soldModal.product.name}</p>
            <label className="block text-xs text-gray-400 mb-1.5">Sold Price (total)</label>
            <div className="relative mb-5">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm">$</span>
              <input
                type="number"
                min="0"
                step="0.01"
                value={soldModal.soldPrice}
                onChange={(e) => setSoldModal((prev) => prev ? { ...prev, soldPrice: e.target.value } : null)}
                className="w-full bg-[#111113] border border-white/10 rounded-xl pl-7 pr-3 py-2.5 text-white text-sm focus:outline-none focus:border-gold/50"
                autoFocus
              />
            </div>
            <div className="flex gap-3">
              <button onClick={() => setSoldModal(null)} className="flex-1 py-2.5 rounded-xl border border-white/10 text-gray-400 hover:text-white text-sm">
                Cancel
              </button>
              <button
                onClick={() => markSold(soldModal.product, soldModal.soldPrice)}
                disabled={submitting || !soldModal.soldPrice}
                className="flex-1 py-2.5 rounded-xl bg-green-600 text-white font-semibold text-sm hover:bg-green-500 disabled:opacity-40 transition-colors"
              >
                {submitting ? 'Saving…' : 'Confirm Sale'}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Delete confirm */}
      {deleteId && createPortal(
        <div
          className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
          onClick={(e) => e.target === e.currentTarget && setDeleteId(null)}
        >
          <div className="bg-[#1a1a1d] rounded-2xl border border-white/10 p-6 w-full max-w-sm text-center">
            <p className="text-white font-semibold mb-2">Delete item?</p>
            <p className="text-gray-400 text-sm mb-5">This cannot be undone.</p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteId(null)} className="flex-1 py-2.5 rounded-xl border border-white/10 text-gray-400 hover:text-white text-sm">
                Cancel
              </button>
              <button
                onClick={() => handleDelete(deleteId)}
                className="flex-1 py-2.5 rounded-xl bg-red-600 text-white font-semibold text-sm hover:bg-red-500 transition-colors"
              >
                Delete
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  )
}
