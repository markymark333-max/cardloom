import { useState, useEffect, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from '@tanstack/react-router'
import { Plus, Trash2, Bell, Search, X } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { getCardImageUrl } from '../lib/scrydex'

// A 9-pocket ring-binder — the icon every card collector recognizes.
function BinderIcon({ size = 20, className = '' }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      {/* binder cover + spine */}
      <rect x="3.5" y="3" width="17" height="18" rx="1.8" />
      <line x1="7.5" y1="3" x2="7.5" y2="21" />
      {/* three rings on the spine */}
      <circle cx="7.5" cy="8" r="0.7" fill="currentColor" stroke="none" />
      <circle cx="7.5" cy="12" r="0.7" fill="currentColor" stroke="none" />
      <circle cx="7.5" cy="16" r="0.7" fill="currentColor" stroke="none" />
      {/* 3×3 card pockets */}
      <line x1="11.8" y1="3.4" x2="11.8" y2="20.6" />
      <line x1="16.1" y1="3.4" x2="16.1" y2="20.6" />
      <line x1="7.5" y1="9" x2="20.5" y2="9" />
      <line x1="7.5" y1="15" x2="20.5" y2="15" />
    </svg>
  )
}

// A round bank-vault door — rim, 6-spoke wheel handle, side latch + hinges.
function VaultIcon({ size = 24, className = '' }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      {/* door + inner rim */}
      <circle cx="12" cy="12" r="8.3" />
      <circle cx="12" cy="12" r="5.6" />
      {/* hub */}
      <circle cx="12" cy="12" r="1.05" fill="currentColor" stroke="none" />
      {/* 6-spoke wheel (three lines through the hub) */}
      <line x1="12" y1="7.2" x2="12" y2="16.8" />
      <line x1="7.9" y1="9.6" x2="16.1" y2="14.4" />
      <line x1="7.9" y1="14.4" x2="16.1" y2="9.6" />
      {/* latch handle */}
      <line x1="20.3" y1="12" x2="22" y2="12" />
      {/* hinges */}
      <line x1="2" y1="9.2" x2="3.9" y2="9.2" />
      <line x1="2" y1="14.8" x2="3.9" y2="14.8" />
    </svg>
  )
}

interface Portfolio {
  id: string
  name: string
  description?: string
  user_id: string
  created_at: string
  card_count?: number
  est_value?: number
  change_pct?: number
  preview_images?: string[]
}

// A single card hit from the cross-portfolio search.
interface GlobalCard {
  id: string
  name: string
  card_set?: string
  card_number?: string
  scrydex_id?: string
  game?: string
  quantity?: number
  estimated_value?: number
  image_url?: string
  portfolio_id: string
}

// Small trading-card icon.
function CardIcon({ size = 15, className = '' }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <rect x="6" y="3" width="12" height="18" rx="2.2" />
      <circle cx="12" cy="9" r="2.1" />
      <path d="M8.5 17.2c.7-1.9 2-2.9 3.5-2.9s2.8 1 3.5 2.9" />
    </svg>
  )
}

// Green ▲ / red ▼ percentage ticker.
function Ticker({ pct, pill = false }: { pct: number; pill?: boolean }) {
  const up = pct >= 0
  return (
    <span className={`tick ${pill ? 'pill ' : ''}${up ? 'up' : 'down'}`}>
      {up ? '▲' : '▼'} {Math.abs(pct).toFixed(1)}%
    </span>
  )
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
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [deleteText, setDeleteText] = useState('')
  // Cross-portfolio card search.
  const [q, setQ] = useState('')
  const [results, setResults] = useState<GlobalCard[] | null>(null)
  const [searching, setSearching] = useState(false)
  // "Dive": open the binder, dolly the camera in, then hand off to the route.
  const dive = (article: HTMLElement, id: string) => {
    const go = () => navigate({ to: '/vault/$id', params: { id } })
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduced || document.querySelector('.dive')) return go()

    const stage = article.querySelector('.stage') as HTMLElement | null
    const inner = article.querySelector('.inner') as HTMLElement | null
    if (!stage || !inner) return go()
    const sr = stage.getBoundingClientRect()
    const ir = inner.getBoundingClientRect()
    const vw = window.innerWidth
    const vh = window.innerHeight

    const overlay = document.createElement('div')
    overlay.className = 'dive'
    const veil = Object.assign(document.createElement('div'), { className: 'veil' })
    const glow = Object.assign(document.createElement('div'), { className: 'glow' })
    const flyer = Object.assign(document.createElement('div'), { className: 'flyer' })
    Object.assign(flyer.style, {
      left: `${sr.left}px`,
      top: `${sr.top}px`,
      width: `${sr.width}px`,
      height: `${sr.height}px`,
    })

    // Clone the whole .bndr so the CSS custom properties still resolve.
    const clone = article.cloneNode(true) as HTMLElement
    clone.style.width = `${sr.width}px`
    flyer.append(clone)
    overlay.append(veil, flyer, glow)
    document.body.append(overlay)
    stage.style.opacity = '0'

    // Scale about the centre of the open page, then bring it to screen centre.
    flyer.style.transformOrigin = `${ir.left + ir.width / 2 - sr.left}px ${ir.top + ir.height / 2 - sr.top}px`
    const s = (vh * 1.15) / ir.height
    const dx = vw / 2 - (ir.left + ir.width / 2)
    const dy = vh / 2 - (ir.top + ir.height / 2)

    // 1 — cover swings wide open
    ;(flyer.querySelector('.cover') as HTMLElement | null)?.animate(
      [{ transform: 'rotateY(-42deg) translateZ(7px)' }, { transform: 'rotateY(-134deg) translateZ(7px)' }],
      { duration: 580, easing: 'cubic-bezier(.32,.86,.28,1)', fill: 'forwards' }
    )
    // 2 — camera dollies in
    ;(flyer.querySelector('.stage') as HTMLElement | null)?.animate(
      [{ perspective: '1500px' }, { perspective: '600px' }],
      { duration: 800, delay: 300, easing: 'cubic-bezier(.5,0,.35,1)', fill: 'forwards' }
    )
    flyer.animate(
      [
        { transform: 'translate(0,0) scale(1)', filter: 'blur(0px)' },
        { transform: `translate(${dx * 0.3}px,${dy * 0.3}px) scale(${1 + (s - 1) * 0.25})`, offset: 0.45, filter: 'blur(0px)' },
        { transform: `translate(${dx}px,${dy}px) scale(${s})`, filter: 'blur(2px)' },
      ],
      { duration: 800, delay: 300, easing: 'cubic-bezier(.45,0,.3,1)', fill: 'forwards' }
    )
    glow.animate([{ opacity: 0 }, { opacity: 0.8, offset: 0.7 }, { opacity: 0.15 }], { duration: 880, delay: 300, fill: 'forwards' })
    veil.animate([{ opacity: 0 }, { opacity: 0.75, offset: 0.42 }, { opacity: 1 }], { duration: 960, delay: 300, fill: 'forwards' })

    // 3 — hand off; destination mounts with .binder-enter
    window.setTimeout(() => {
      go()
      window.setTimeout(() => {
        overlay.remove()
        stage.style.opacity = ''
      }, 440)
    }, 1040)
  }

  useEffect(() => {
    if (!user) return
    fetchPortfolios()
  }, [user])

  // Search every card the user owns, across all portfolios (RLS scopes to them).
  useEffect(() => {
    if (!user) return
    const term = q.trim()
    if (term.length < 2) {
      setResults(null)
      setSearching(false)
      return
    }
    setSearching(true)
    const t = setTimeout(async () => {
      const { data } = await supabase
        .from('cards')
        .select('id, name, card_set, card_number, scrydex_id, game, quantity, estimated_value, image_url, portfolio_id')
        .eq('user_id', user.id)
        .ilike('name', `%${term}%`)
        .order('estimated_value', { ascending: false, nullsFirst: false })
        .limit(80)
      setResults((data as GlobalCard[]) ?? [])
      setSearching(false)
    }, 250)
    return () => clearTimeout(t)
  }, [q, user])

  const portfolioName = (id: string) => portfolios.find((p) => p.id === id)?.name ?? 'Portfolio'
  const cardThumb = (c: GlobalCard) =>
    c.scrydex_id ? getCardImageUrl(c.scrydex_id, c.game) : c.image_url && c.image_url.includes('scrydex') ? c.image_url : c.image_url

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
          .select('estimated_value, image_url, scrydex_id, price_change_pct, quantity, game')
          .eq('portfolio_id', p.id)

        const qty = (c: { quantity?: number | null }) => c.quantity ?? 1
        const card_count = cards?.reduce((sum, c) => sum + qty(c), 0) ?? 0
        const est_value = cards?.reduce((sum, c) => sum + (c.estimated_value ?? 0) * qty(c), 0) ?? 0
        // Value-weighted average price change for this portfolio.
        const weighted = cards?.reduce((s, c) => s + (c.estimated_value ?? 0) * qty(c) * (c.price_change_pct ?? 0), 0) ?? 0
        const change_pct = est_value > 0 ? weighted / est_value : 0
        // Best cards face out — stock/catalog art only, never a user's scan.
        const preview_images = (cards ?? [])
          .map((c) => ({
            value: c.estimated_value ?? 0,
            stock: c.scrydex_id
              ? getCardImageUrl(c.scrydex_id, c.game)
              : c.image_url?.includes('scrydex')
              ? c.image_url
              : null,
          }))
          .filter((c): c is { value: number; stock: string } => !!c.stock)
          .sort((a, b) => b.value - a.value)
          .slice(0, 6)
          .map((c) => c.stock)
        return { ...p, card_count, est_value, change_pct, preview_images }
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

  const totalValue = portfolios.reduce((s, p) => s + (p.est_value ?? 0), 0)
  const totalCards = portfolios.reduce((s, p) => s + (p.card_count ?? 0), 0)
  const overallChange =
    totalValue > 0
      ? portfolios.reduce((s, p) => s + (p.est_value ?? 0) * (p.change_pct ?? 0), 0) / totalValue
      : 0
  const money = (n: number) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 })

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
        <div className="wcard p-10 text-center max-w-sm">
          <VaultIcon size={40} className="text-gold mx-auto mb-4" />
          <h2 className="font-heading text-2xl font-bold text-white mb-2">Your Vault</h2>
          <p className="text-gray-400 text-sm mb-6">Sign in to access your vault and portfolios.</p>
          <p className="text-gray-500 text-xs">Use the Sign In button in the header to get started.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-6xl mx-auto px-5 sm:px-6 pt-16 sm:pt-20 pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-8">
        <div>
          <p className="text-gold text-[11px] font-semibold tracking-[0.22em] mb-2.5">COLLECTOR VAULT</p>
          <h1 aria-label="Your Vault" className="mb-0.5">
            <VaultIcon size={44} className="text-gold" />
          </h1>
          <p className="text-gray-400 text-sm mt-1.5">Organize your collection into portfolios and track its value.</p>
        </div>
        <button
          onClick={() => setShowNewForm(true)}
          className="btn-gold inline-flex items-center justify-center gap-2 px-5 py-3 text-sm shrink-0"
        >
          <Plus size={16} /> New Portfolio
        </button>
      </div>

      {/* Collection summary */}
      {portfolios.length > 0 && (
        <div className="collbar">
          <div>
            <div className="lbl">Collection Value</div>
            <div className="big">
              {money(totalValue)}
              <Ticker pct={overallChange} pill />
            </div>
          </div>
          <div className="side">
            <span className="cstat">
              <CardIcon size={15} className="text-gold" />
              <b>{totalCards.toLocaleString()}</b> cards
            </span>
            <span className="cstat">
              <BinderIcon size={15} className="text-gold" />
              <b>{portfolios.length}</b> portfolio{portfolios.length !== 1 ? 's' : ''}
            </span>
          </div>
        </div>
      )}

      {/* Global card search — find any card across every portfolio */}
      {portfolios.length > 0 && (
        <div className="mb-8">
          <div className="relative max-w-xl">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search all your cards by name…"
              className="w-full bg-navy-900 border border-white/10 rounded-md pl-9 pr-9 py-3 text-white text-sm placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-gold/40 focus:border-gold/40 transition"
            />
            {q && (
              <button
                onClick={() => setQ('')}
                aria-label="Clear search"
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white p-1"
              >
                <X size={15} />
              </button>
            )}
          </div>

          {results !== null && (
            <div className="wcard mt-3 overflow-hidden">
              {searching && results.length === 0 ? (
                <div className="px-4 py-5 text-center text-gray-500 text-sm">Searching…</div>
              ) : results.length === 0 ? (
                <div className="px-4 py-6 text-center text-gray-500 text-sm">
                  No cards match “{q}” in any portfolio.
                </div>
              ) : (
                <>
                  <div className="px-4 pt-3 pb-2 text-[11px] font-semibold tracking-wide text-gray-500">
                    {results.length} match{results.length !== 1 ? 'es' : ''} across your portfolios
                  </div>
                  <div className="divide-y divide-white/[0.06] max-h-[60vh] overflow-y-auto overscroll-contain">
                    {results.map((c) => {
                      const thumb = cardThumb(c)
                      const qty = c.quantity ?? 1
                      return (
                        <button
                          key={c.id}
                          onClick={() => navigate({ to: '/vault/$id', params: { id: c.portfolio_id } })}
                          className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-white/[0.03] transition-colors"
                        >
                          {thumb ? (
                            <img src={thumb} alt="" loading="lazy" className="w-9 h-12 object-contain rounded bg-[#111113] flex-shrink-0" />
                          ) : (
                            <div className="w-9 h-12 rounded bg-[#111113] flex-shrink-0" />
                          )}
                          <div className="flex-1 min-w-0">
                            <div className="text-white text-sm font-medium truncate">
                              {c.name}
                              {qty > 1 && <span className="text-gold"> ×{qty}</span>}
                            </div>
                            {(c.card_set || c.card_number) && (
                              <div className="text-gray-500 text-xs truncate">
                                {[c.card_set, c.card_number].filter(Boolean).join(' · ')}
                              </div>
                            )}
                          </div>
                          <div className="text-right flex-shrink-0">
                            {c.estimated_value != null && (
                              <div className="text-gold text-sm font-semibold">${c.estimated_value.toFixed(2)}</div>
                            )}
                            <div className="inline-flex items-center gap-1 text-[11px] text-gray-400 mt-0.5">
                              <BinderIcon size={12} className="text-gray-500" />
                              <span className="truncate max-w-[9rem]">{portfolioName(c.portfolio_id)}</span>
                            </div>
                          </div>
                        </button>
                      )
                    })}
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      )}

      {/* New Portfolio Form */}
      {showNewForm && (
        <div className="wcard p-6 mb-8">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-heading font-semibold text-white">New Portfolio</h3>
            <button onClick={() => setShowNewForm(false)} className="text-gray-500 hover:text-white transition-colors">
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
                className="w-full bg-navy-900 border border-white/10 rounded-md px-4 py-3 text-white placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-gold/40 focus:border-gold/40 transition"
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
                className="w-full bg-navy-900 border border-white/10 rounded-md px-4 py-3 text-white placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-gold/40 focus:border-gold/40 transition"
                placeholder="Brief description..."
              />
            </div>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setShowNewForm(false)}
                className="btn-ghost flex-1 py-3 text-sm"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={creating}
                className="btn-gold flex-1 py-3 text-sm disabled:opacity-50"
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
        <div className="wcard text-center py-16 px-6">
          <div className="w-12 h-12 bg-gold/10 rounded-lg flex items-center justify-center mx-auto mb-4 ring-1 ring-gold/25">
            <BinderIcon size={24} className="text-gold" />
          </div>
          <h3 className="font-heading text-white font-bold text-lg">Start your first portfolio</h3>
          <p className="text-gray-500 text-sm mt-1 mb-5">Group your cards, then scan or add them to track value.</p>
          <button onClick={() => setShowNewForm(true)} className="btn-gold inline-flex items-center gap-2 px-5 py-2.5 text-sm">
            <Plus size={15} /> New Portfolio
          </button>
        </div>
      ) : (
        <div className="binder-grid mt-8 mb-16">
          {portfolios.map((p) => {
            const previews = p.preview_images ?? []
            const count = p.card_count ?? 0
            const pages = Math.max(1, Math.min(8, Math.ceil(count / 9)))
            const layers = pages
            const open = (e: React.MouseEvent | React.KeyboardEvent) => {
              const bndr = (e.currentTarget as HTMLElement).querySelector('.bndr') as HTMLElement | null
              if (bndr) dive(bndr, p.id)
            }
            return (
              <div
                key={p.id}
                className="badge"
                onClick={open}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && open(e)}
                aria-label={`${p.name}, ${count} cards, ${money(p.est_value ?? 0)}`}
              >
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    setDeleteId(p.id)
                    setDeleteText('')
                  }}
                  className="del"
                  aria-label="Delete portfolio"
                >
                  <Trash2 size={15} />
                </button>

                <div className="bndr" style={{ ['--layers']: layers } as unknown as CSSProperties}>
                  <div className="stage">
                    <div className="b3d">
                      <div className="pages">
                        <div className="backcover" />
                        {Array.from({ length: layers }, (_, n) => layers - n).map((i) => (
                          <div key={i} className="sheet" style={{ ['--i']: i } as unknown as CSSProperties} />
                        ))}
                        <div className="inner">
                          {Array.from({ length: 6 }).map((_, i) =>
                            previews[i] ? (
                              <div key={i} className="pocket">
                                <img src={previews[i]} alt="" loading="lazy" decoding="async" />
                              </div>
                            ) : (
                              <div key={i} className="pocket empty">
                                <span />
                              </div>
                            )
                          )}
                        </div>
                      </div>
                      <div className="cover">
                        <span className="spine" />
                        <span className="stitch" />
                        <span className="sheen" />
                        <span className="strap" />
                        <span className="snap" />
                      </div>
                    </div>
                  </div>
                </div>

                <div className="info">
                  <div className="nm">{p.name}</div>
                  <div className="money">
                    <span className="val">{money(p.est_value ?? 0)}</span>
                    <Ticker pct={p.change_pct ?? 0} />
                  </div>
                  <div className="sub">
                    {count} card{count !== 1 ? 's' : ''} · {pages} page{pages !== 1 ? 's' : ''}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Coming Soon */}
      <div className="border-t border-white/[0.06] pt-10">
        <p className="text-gray-600 text-[11px] font-semibold tracking-[0.2em] mb-4">ON THE ROADMAP</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="wcard p-5">
            <div className="flex items-center gap-2.5 mb-2">
              <Bell size={16} className="text-gray-500" />
              <h4 className="text-gray-300 font-medium text-sm">Price Alerts</h4>
              <span className="ml-auto text-[10px] font-bold tracking-wide text-gray-500 border border-white/10 rounded-full px-2 py-0.5">SOON</span>
            </div>
            <p className="text-gray-600 text-xs">Get notified when a card hits your target price.</p>
          </div>
          <div className="wcard p-5">
            <div className="flex items-center gap-2.5 mb-2">
              <Search size={16} className="text-gray-500" />
              <h4 className="text-gray-300 font-medium text-sm">eBay Sold Lookup</h4>
              <span className="ml-auto text-[10px] font-bold tracking-wide text-gray-500 border border-white/10 rounded-full px-2 py-0.5">SOON</span>
            </div>
            <p className="text-gray-600 text-xs">Cross-reference real eBay sold prices.</p>
          </div>
        </div>
      </div>

      {/* Delete Confirm — shows what will be lost; a binder with cards requires
          typing its name so a single mis-tap can't wipe a whole collection. */}
      {deleteId &&
        (() => {
          const target = portfolios.find((p) => p.id === deleteId)
          const count = target?.card_count ?? 0
          const val = target?.est_value ?? 0
          const needsType = count > 0
          const confirmed =
            !needsType || deleteText.trim().toLowerCase() === (target?.name ?? '').trim().toLowerCase()
          const close = () => {
            setDeleteId(null)
            setDeleteText('')
          }
          return createPortal(
            <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
              <div className="wcard p-7 max-w-sm w-full">
                <h3 className="font-heading text-xl font-bold text-white mb-3 text-center">
                  Delete “{target?.name}”?
                </h3>
                {count > 0 ? (
                  <>
                    <p className="text-gray-300 text-sm text-center mb-1.5">
                      This permanently deletes{' '}
                      <b className="text-red-400">
                        {count} card{count !== 1 ? 's' : ''}
                      </b>
                      {val > 0 && (
                        <>
                          {' '}
                          worth <b className="text-red-400">{money(val)}</b>
                        </>
                      )}
                      .
                    </p>
                    <p className="text-gray-500 text-xs text-center mb-4">
                      This can’t be undone. Type <b className="text-gray-300">{target?.name}</b> to confirm.
                    </p>
                    <input
                      value={deleteText}
                      onChange={(e) => setDeleteText(e.target.value)}
                      placeholder={target?.name}
                      autoFocus
                      className="w-full bg-navy-900 border border-white/10 rounded-md px-3 py-2.5 text-white text-sm mb-4 placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-red-500/40 focus:border-red-500/40"
                    />
                  </>
                ) : (
                  <p className="text-gray-400 text-sm text-center mb-5">
                    This empty binder will be removed. This can’t be undone.
                  </p>
                )}
                <div className="flex gap-3">
                  <button onClick={close} className="btn-ghost flex-1 py-3 text-sm">
                    Cancel
                  </button>
                  <button
                    onClick={() => {
                      handleDelete(deleteId)
                      setDeleteText('')
                    }}
                    disabled={!confirmed}
                    className="flex-1 py-3 rounded-md bg-red-600 text-white font-semibold text-sm hover:bg-red-500 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {count > 0 ? `Delete ${count} card${count !== 1 ? 's' : ''}` : 'Delete'}
                  </button>
                </div>
              </div>
            </div>,
            document.body
          )
        })()}
    </div>
  )
}
