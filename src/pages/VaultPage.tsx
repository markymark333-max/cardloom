import { useState, useEffect } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { FolderOpen, Plus, Trash2, Bell, Search, X } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { ScanCardsDialog } from '../components/ScanCardsDialog'

interface Portfolio {
  id: string
  name: string
  description?: string
  user_id: string
  created_at: string
  card_count?: number
  est_value?: number
}

export function VaultPage() {
  const { user, loading: authLoading } = useAuth()
  const navigate = useNavigate()

  const [portfolios, setPortfolios] = useState<Portfolio[]>([])
  const [loading, setLoading] = useState(true)
  const [showNewForm, setShowNewForm] = useState(false)
  const [newName, setNewName] = useState('')
  const [newDesc, setNewDesc] = useState('')
  const [creating, setCreating] = useState(false)
  const [showScan, setShowScan] = useState(false)
  const [deleteId, setDeleteId] = useState<string | null>(null)

  useEffect(() => {
    if (!user) return
    fetchPortfolios()
  }, [user])

  async function fetchPortfolios() {
    if (!user) return
    setLoading(true)

    const { data: portfolioData, error } = await supabase
      .from('portfolios')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })

    if (error || !portfolioData) {
      setLoading(false)
      return
    }

    // Fetch card counts and estimated values
    const enriched = await Promise.all(
      portfolioData.map(async (p) => {
        const { data: cards } = await supabase
          .from('cards')
          .select('market_price')
          .eq('portfolio_id', p.id)

        const card_count = cards?.length ?? 0
        const est_value = cards?.reduce((sum, c) => sum + (c.market_price ?? 0), 0) ?? 0
        return { ...p, card_count, est_value }
      })
    )

    setPortfolios(enriched)
    setLoading(false)
  }

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!user || !newName.trim()) return
    setCreating(true)
    const { error } = await supabase.from('portfolios').insert({
      name: newName.trim(),
      description: newDesc.trim() || null,
      user_id: user.id,
    })
    if (!error) {
      setNewName('')
      setNewDesc('')
      setShowNewForm(false)
      fetchPortfolios()
    }
    setCreating(false)
  }

  const handleDelete = async (id: string) => {
    await supabase.from('portfolios').delete().eq('id', id)
    setDeleteId(null)
    fetchPortfolios()
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
          <FolderOpen size={40} className="text-gold mx-auto mb-4" />
          <h2 className="font-heading text-2xl font-bold text-white mb-2">Your Vault</h2>
          <p className="text-gray-400 text-sm mb-6">Sign in to access your vault and portfolios.</p>
          <p className="text-gray-500 text-xs">Use the Sign In button in the header to get started.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-7xl mx-auto px-6 py-12">
      {/* Header */}
      <div className="flex items-start justify-between mb-10">
        <div>
          <p className="text-gold text-xs font-semibold tracking-widest mb-2">COLLECTOR PORTAL</p>
          <h1 className="font-heading text-4xl md:text-5xl font-bold text-white mb-2">
            Your Vault
          </h1>
          <p className="text-gray-400">Organize your collection into portfolios.</p>
        </div>
        <button
          onClick={() => setShowNewForm(true)}
          className="flex items-center gap-2 bg-gold text-navy-900 font-semibold px-5 py-3 rounded-xl hover:opacity-90 transition-opacity text-sm"
        >
          <Plus size={16} />
          New Portfolio
        </button>
      </div>

      {/* New Portfolio Form */}
      {showNewForm && (
        <div className="bg-navy-800 rounded-2xl border border-gold/20 p-6 mb-8">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-heading font-semibold text-white">New Portfolio</h3>
            <button onClick={() => setShowNewForm(false)} className="text-gray-400 hover:text-white">
              <X size={18} />
            </button>
          </div>
          <form onSubmit={handleCreate} className="space-y-4">
            <div>
              <label className="block text-sm text-gray-400 mb-1.5">Portfolio Name</label>
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                required
                className="w-full bg-navy-900 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-gray-600 focus:outline-none focus:border-gold/50"
                placeholder="e.g. Vintage Holos, Modern Pulls..."
              />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1.5">
                Description <span className="text-gray-600">(optional)</span>
              </label>
              <input
                type="text"
                value={newDesc}
                onChange={(e) => setNewDesc(e.target.value)}
                className="w-full bg-navy-900 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-gray-600 focus:outline-none focus:border-gold/50"
                placeholder="Brief description..."
              />
            </div>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setShowNewForm(false)}
                className="flex-1 py-3 rounded-xl border border-white/10 text-gray-400 hover:text-white text-sm transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={creating}
                className="flex-1 py-3 rounded-xl bg-gold text-navy-900 font-semibold text-sm hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                {creating ? 'Creating...' : 'Create Portfolio'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Portfolios */}
      {loading ? (
        <div className="flex justify-center py-20">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gold" />
        </div>
      ) : portfolios.length === 0 ? (
        <div className="text-center py-20">
          <FolderOpen size={40} className="text-gray-600 mx-auto mb-4" />
          <p className="text-gray-500">No portfolios yet. Create your first one above.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 mb-16">
          {portfolios.map((p) => (
            <div
              key={p.id}
              className="bg-navy-800 rounded-2xl border border-white/5 p-6 hover:border-gold/20 transition-colors"
            >
              <div className="flex items-start justify-between mb-4">
                <div className="w-10 h-10 bg-gold/10 rounded-xl flex items-center justify-center">
                  <FolderOpen size={20} className="text-gold" />
                </div>
                <button
                  onClick={() => setDeleteId(p.id)}
                  className="text-gray-600 hover:text-red-400 transition-colors p-1"
                >
                  <Trash2 size={16} />
                </button>
              </div>
              <h3 className="font-heading font-bold text-white text-lg mb-1">{p.name}</h3>
              {p.description && (
                <p className="text-gray-500 text-xs mb-3 line-clamp-1">{p.description}</p>
              )}
              <div className="flex items-center gap-4 mb-4">
                <span className="text-gray-500 text-xs tracking-wide">
                  {p.card_count ?? 0} CARDS
                </span>
                <span className="text-gold text-sm font-semibold">
                  EST. VALUE ${(p.est_value ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => navigate({ to: '/vault/$id', params: { id: p.id } })}
                  className="flex-1 bg-gold text-navy-900 font-semibold py-2.5 rounded-xl text-xs hover:opacity-90 transition-opacity"
                >
                  Open portfolio →
                </button>
                <button
                  onClick={() => setShowScan(true)}
                  className="flex-1 border border-white/10 text-gray-300 py-2.5 rounded-xl text-xs hover:border-white/20 transition-colors"
                >
                  Scan with AI
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Coming Soon */}
      <div className="border-t border-white/5 pt-10">
        <p className="text-gray-600 text-xs font-semibold tracking-widest mb-4">COMING SOON · ON THE ROADMAP</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="bg-navy-800/50 rounded-2xl border border-white/5 p-5 opacity-60">
            <Bell size={18} className="text-gray-500 mb-2" />
            <h4 className="text-gray-400 font-medium text-sm">Price Alerts</h4>
            <p className="text-gray-600 text-xs mt-1">Get notified when a card hits your target price.</p>
          </div>
          <div className="bg-navy-800/50 rounded-2xl border border-white/5 p-5 opacity-60">
            <Search size={18} className="text-gray-500 mb-2" />
            <h4 className="text-gray-400 font-medium text-sm">eBay Sold Lookup</h4>
            <p className="text-gray-600 text-xs mt-1">Cross-reference real eBay sold prices.</p>
          </div>
        </div>
      </div>

      {/* Delete Confirm */}
      {deleteId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="bg-navy-800 rounded-2xl border border-white/10 p-8 max-w-sm w-full text-center">
            <h3 className="font-heading text-xl font-bold text-white mb-2">Delete Portfolio?</h3>
            <p className="text-gray-400 text-sm mb-6">
              This will permanently delete the portfolio and all its cards.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setDeleteId(null)}
                className="flex-1 py-3 rounded-xl border border-white/10 text-gray-400 hover:text-white text-sm"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDelete(deleteId)}
                className="flex-1 py-3 rounded-xl bg-red-600 text-white font-semibold text-sm hover:bg-red-500"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {showScan && <ScanCardsDialog onClose={() => setShowScan(false)} />}
    </div>
  )
}
