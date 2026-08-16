import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { X, ExternalLink, AlertTriangle } from 'lucide-react'
import {
  getCardPrices,
  getCardSales,
  getCardHistory,
  getCardPop,
  getCardImageUrl,
  ScrydexPrices,
  ScrydexSale,
  PopReport,
  PricePoint,
  TrendWindow,
} from '../lib/scrydex'
import { PriceHistoryChart } from './PriceHistoryChart'
import { GameIcon } from './GameIcon'
import { GRADER_GRADES, RAW_KEYS, type Grader } from '../lib/grading'
import CardGrader from './CardGrader'

const GAME_LABELS: Record<string, string> = {
  pokemon: 'Pokémon',
  onepiece: 'One Piece',
  magicthegathering: 'Magic',
  lorcana: 'Lorcana',
  gundam: 'Gundam',
  riftbound: 'Riftbound',
}

interface Card {
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
  variant?: string
  estimated_value?: number
  price_change_pct?: number
  game?: string
}

function variantBadge(v: string | undefined): string | null {
  if (!v) return null
  const n = v.toLowerCase().replace(/[^a-z]/g, '')
  if (n.includes('masterball')) return 'Master Ball'
  if (n.includes('pokeball')) return 'Poké Ball'
  if (n.includes('friendball')) return 'Friend Ball'
  if (n.includes('reverseholo')) return 'Reverse Holo'
  if (n === 'holofoil' || n === 'holo') return null
  return null
}

interface CardDetailDialogProps {
  card: Card
  onClose: () => void
  onSell?: () => void
}

type BottomTab = 'buy' | 'sales' | 'pop' | 'grade'

const RAW_LABELS: { label: string; key: keyof ScrydexPrices['raw'] }[] = [
  { label: 'NM', key: 'nm' },
  { label: 'LP', key: 'lp' },
  { label: 'MP', key: 'mp' },
  { label: 'HP', key: 'hp' },
  { label: 'DM', key: 'dm' },
]

function trendColor(pct: number | null | undefined): string {
  if (pct == null) return 'text-white'
  return pct >= 0 ? 'text-green-400' : 'text-red-400'
}

function TrendDelta({ label, trend }: { label: string; trend: TrendWindow | null | undefined }) {
  if (!trend) return null
  const up = trend.percent_change >= 0
  return (
    <div>
      <p className={`text-xs font-medium ${trendColor(trend.percent_change)}`}>
        {up ? '▲' : '▼'} ${Math.abs(trend.price_change).toFixed(2)} ({Math.abs(trend.percent_change).toFixed(2)}%)
      </p>
      <p className="text-gray-500 text-[11px] mt-0.5">{label}</p>
    </div>
  )
}

// Only allow http(s) links — external URLs come from third-party (Scrydex
// marketplace) data, and React does NOT sanitize href, so a "javascript:" URL
// would execute on click.
const safeHref = (url?: string | null): string | undefined =>
  url && /^https?:\/\//i.test(url) ? url : undefined

export function CardDetailDialog({ card, onClose, onSell }: CardDetailDialogProps) {
  const [grader, setGrader] = useState<Grader>('RAW')
  const [grade, setGrade] = useState<string>('NM')
  const [prices, setPrices] = useState<ScrydexPrices | null>(null)
  const [history, setHistory] = useState<PricePoint[]>([])
  const [sales, setSales] = useState<ScrydexSale[]>([])
  const [pop, setPop] = useState<PopReport[]>([])
  const [loadingPrices, setLoadingPrices] = useState(false)
  const [loadingSales, setLoadingSales] = useState(false)
  const [loadingPop, setLoadingPop] = useState(false)
  const [bottomTab, setBottomTab] = useState<BottomTab>('buy')

  useEffect(() => {
    if (!card.scrydex_id) return
    setLoadingPrices(true)
    Promise.all([getCardPrices(card.scrydex_id, card.game), getCardHistory(card.scrydex_id, 90, card.game)]).then(
      ([p, h]) => {
        setPrices(p)
        setHistory(h)
        setLoadingPrices(false)
      }
    )
  }, [card.scrydex_id, card.game])

  useEffect(() => {
    if (bottomTab !== 'sales' || !card.scrydex_id) return
    setLoadingSales(true)
    getCardSales(card.scrydex_id, card.game).then((data) => {
      setSales(data)
      setLoadingSales(false)
    })
  }, [bottomTab, card.scrydex_id, card.game])

  useEffect(() => {
    if (bottomTab !== 'pop' || !card.scrydex_id) return
    setLoadingPop(true)
    getCardPop(card.scrydex_id, card.game).then((data) => {
      setPop(data)
      setLoadingPop(false)
    })
  }, [bottomTab, card.scrydex_id, card.game])

  const handleGraderChange = (g: Grader) => {
    setGrader(g)
    setGrade(GRADER_GRADES[g][0])
  }

  const getSelectedPrice = (): number | null => {
    if (!prices) return null
    if (grader === 'RAW') {
      const key = RAW_KEYS[grade]
      return key ? prices.raw[key] ?? null : null
    }
    const graderKey = grader.toLowerCase() as keyof ScrydexPrices
    const graderData = prices[graderKey] as Record<string, number> | undefined
    return graderData?.[grade] ?? null
  }

  const game = card.game || 'pokemon'
  const scrydexImageUrl = card.scrydex_id ? getCardImageUrl(card.scrydex_id, game) : null
  const imageUrl = card.tcg_image_url || scrydexImageUrl || card.image_url || null
  const selectedPrice = getSelectedPrice()
  const primaryTrendPct = prices?.trends?.days_7?.percent_change ?? prices?.price_change_pct ?? null
  const buyLink = safeHref(prices?.buy_links?.[0]?.url) || (card.scrydex_id ? `https://scrydex.com/${game}/cards/${card.scrydex_id}` : null)

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-navy-800 rounded-2xl border border-white/10 w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex justify-end p-4 pb-0">
          <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">
            <X size={20} />
          </button>
        </div>

        {/* Hero */}
        <div className="px-6 pb-4 text-center">
          {imageUrl && (
            <div className="relative inline-block mb-4">
              <div className="absolute inset-0 bg-gold/25 blur-3xl rounded-full" />
              <img
                src={imageUrl}
                alt={card.name}
                className="relative w-48 mx-auto rounded-xl object-contain"
                style={{ filter: 'drop-shadow(0 0 32px rgba(201,149,106,0.35))' }}
                onError={(e) => {
                  const el = e.currentTarget
                  if (scrydexImageUrl && el.src !== scrydexImageUrl) el.src = scrydexImageUrl
                }}
              />
            </div>
          )}

          <div className="flex flex-wrap justify-center gap-1.5 mb-3">
            <span className="flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-1 rounded-full bg-white/5 text-gray-300 border border-white/10">
              <GameIcon game={game} size={13} />
              {GAME_LABELS[game] || 'Card'}
            </span>
            {card.card_set && (
              <span className="text-[11px] font-medium px-2.5 py-1 rounded-full bg-white/5 text-gray-300 border border-white/10">
                {card.card_set}
              </span>
            )}
            {card.year && (
              <span className="text-[11px] font-medium px-2.5 py-1 rounded-full bg-white/5 text-gray-300 border border-white/10">
                {card.year}
              </span>
            )}
            {card.condition && (
              <span className="text-[11px] font-medium px-2.5 py-1 rounded-full bg-white/5 text-gray-300 border border-white/10">
                {card.condition}
              </span>
            )}
          </div>

          <h2 className="font-heading text-xl font-bold text-white">
            {card.name}
            {(() => {
              const badge = variantBadge(card.variant)
              return badge ? <span className="text-gray-400 font-normal text-base"> · {badge}</span> : null
            })()}
            {card.card_number && <span className="text-gray-500 font-normal"> #{card.card_number}</span>}
          </h2>

          <div className="flex gap-3 mt-4">
            {onSell && (
              <button
                onClick={onSell}
                className="flex-1 py-3 rounded-xl bg-white/10 text-white font-semibold text-sm hover:bg-white/15 transition-colors"
              >
                List for Sale
              </button>
            )}
            {buyLink && (
              <a
                href={buyLink}
                target="_blank"
                rel="noreferrer"
                className="flex-1 py-3 rounded-xl bg-gold text-navy-900 font-semibold text-sm hover:opacity-90 transition-opacity"
              >
                See Buying Options
              </a>
            )}
          </div>
        </div>

        <div className="px-6 pb-6">
          {!card.scrydex_id ? (
            <p className="text-gray-500 text-sm text-center py-6">No Scrydex ID linked to this card.</p>
          ) : (
            <>
              <p className="text-white font-semibold mb-3">Market value</p>

              {/* Grader + grade selectors */}
              <div className="flex flex-wrap gap-1.5 mb-2">
                {(Object.keys(GRADER_GRADES) as Grader[]).map((g) => (
                  <button
                    key={g}
                    onClick={() => handleGraderChange(g)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold tracking-wider transition-colors ${
                      grader === g ? 'bg-gold text-navy-900' : 'bg-navy-900 text-gray-400 hover:text-white'
                    }`}
                  >
                    {g}
                  </button>
                ))}
              </div>
              <div className="flex flex-wrap gap-1.5 mb-4">
                {GRADER_GRADES[grader].map((g) => (
                  <button
                    key={g}
                    onClick={() => setGrade(g)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                      grade === g ? 'bg-white/10 text-white border border-white/20' : 'text-gray-500 hover:text-gray-300'
                    }`}
                  >
                    {g}
                  </button>
                ))}
              </div>

              {loadingPrices ? (
                <div className="flex justify-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gold" />
                </div>
              ) : selectedPrice != null ? (
                <>
                  <p className={`text-4xl font-bold font-body tracking-tight mb-1 ${trendColor(grader === 'RAW' ? primaryTrendPct : null)}`}>
                    ${selectedPrice.toFixed(2)}
                  </p>

                  {grader === 'RAW' && prices?.trends && (
                    <div className="flex gap-5 mb-5">
                      <TrendDelta label="This week" trend={prices.trends.days_7} />
                      <TrendDelta label="Last 2 weeks" trend={prices.trends.days_14} />
                      <TrendDelta label="Last month" trend={prices.trends.days_30} />
                    </div>
                  )}

                  {grader === 'RAW' && history.length > 0 && (
                    <div className="mb-5">
                      <PriceHistoryChart points={history} />
                    </div>
                  )}

                  {grader === 'RAW' && (
                    <div className="flex gap-2 overflow-x-auto pb-1 mb-5">
                      {RAW_LABELS.map(({ label, key }) =>
                        prices!.raw[key] != null ? (
                          <div
                            key={label}
                            className="flex-shrink-0 bg-navy-900 border border-white/10 rounded-xl px-4 py-2 text-center"
                          >
                            <p className="text-gray-500 text-[10px] tracking-wide">{label}</p>
                            <p className="text-white font-semibold text-sm">${prices!.raw[key].toFixed(2)}</p>
                          </div>
                        ) : null
                      )}
                    </div>
                  )}

                  <div className="flex items-center justify-between text-[11px] text-gray-600 mb-5">
                    <span>Insights by Scrydex</span>
                    <a
                      href="mailto:support@cardloom.app?subject=Price%20data%20issue"
                      className="flex items-center gap-1 hover:text-gray-400 transition-colors"
                    >
                      <AlertTriangle size={11} />
                      Report an error
                    </a>
                  </div>
                </>
              ) : (
                <div className="bg-navy-900 rounded-xl p-6 text-center text-gray-500 mb-5">
                  No price data available for this grade.
                </div>
              )}

              {/* Buy Now / Past Sales / Pop / AI Grade */}
              <div className="flex gap-1 mb-4 bg-navy-900 rounded-xl p-1">
                {([
                  ['buy', 'Buy Now'],
                  ['sales', 'Past Sales'],
                  ['pop', 'Pop Report'],
                  ['grade', 'AI Grade'],
                ] as [BottomTab, string][]).map(([key, label]) => (
                  <button
                    key={key}
                    onClick={() => setBottomTab(key)}
                    className={`flex-1 py-2 text-sm rounded-lg font-medium transition-colors ${
                      bottomTab === key ? 'bg-navy-800 text-white' : 'text-gray-500 hover:text-gray-300'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {bottomTab === 'buy' &&
                (prices?.buy_links && prices.buy_links.length > 0 ? (
                  <div className="space-y-2">
                    {prices.buy_links.map((l) => (
                      <a
                        key={l.marketplace}
                        href={safeHref(l.url)}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center justify-between bg-navy-900 border border-transparent hover:border-gold/30 rounded-xl p-3 transition-colors"
                      >
                        <span className="text-white text-sm capitalize">{l.marketplace}</span>
                        <ExternalLink size={14} className="text-gray-500" />
                      </a>
                    ))}
                  </div>
                ) : (
                  <div className="bg-navy-900 rounded-xl p-8 text-center text-gray-500 text-sm">
                    No listings found. Check back soon!
                  </div>
                ))}

              {bottomTab === 'sales' &&
                (loadingSales ? (
                  <div className="flex justify-center py-8">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gold" />
                  </div>
                ) : sales.length === 0 ? (
                  <div className="bg-navy-900 rounded-xl p-8 text-center text-gray-500 text-sm">
                    No sales data available.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {sales.map((sale, i) => {
                      const href = safeHref(sale.url)
                      const Row = href ? 'a' : 'div'
                      return (
                        <Row
                          key={i}
                          {...(href ? { href, target: '_blank', rel: 'noreferrer' } : {})}
                          className={`bg-navy-900 rounded-xl p-3 flex items-center justify-between ${
                            href ? 'border border-transparent hover:border-gold/30 transition-colors' : ''
                          }`}
                        >
                          <div className="min-w-0">
                            <span className="text-xs text-gray-400 capitalize">{sale.platform}</span>
                            <span className="text-gray-600 mx-2">·</span>
                            <span className="text-xs text-gray-500">{sale.date}</span>
                            {sale.grader && (
                              <>
                                <span className="text-gray-600 mx-2">·</span>
                                <span className="text-xs text-gray-400">
                                  {sale.grader} {sale.grade}
                                </span>
                              </>
                            )}
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            <span className="text-gold font-semibold text-sm">${Number(sale.price).toFixed(2)}</span>
                            {href && <ExternalLink size={13} className="text-gray-500" />}
                          </div>
                        </Row>
                      )
                    })}
                  </div>
                ))}

              {bottomTab === 'grade' && (
                <CardGrader
                  cardName={card.name}
                  existingFrontUrl={card.image_url || undefined}
                  existingBackUrl={card.back_image_url || undefined}
                />
              )}

              {bottomTab === 'pop' &&
                (loadingPop ? (
                  <div className="flex justify-center py-8">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gold" />
                  </div>
                ) : pop.length === 0 ? (
                  <div className="bg-navy-900 rounded-xl p-8 text-center text-gray-500 text-sm">
                    No population data available for this card.
                    <span className="block text-gray-600 text-xs mt-1">
                      Census data currently covers PSA-graded English Pokémon cards.
                    </span>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {pop.map((report) => {
                      const maxCount = Math.max(...report.grades.map((g) => g.count), 1)
                      return (
                        <div key={report.company} className="bg-navy-900 rounded-xl p-4">
                          <div className="flex items-center justify-between mb-3">
                            <span className="text-white font-semibold text-sm tracking-wider">{report.company}</span>
                            <span className="text-gray-500 text-xs">
                              {report.total.toLocaleString()} graded
                            </span>
                          </div>
                          <div className="space-y-1.5">
                            {report.grades.map((g) => (
                              <div key={g.grade} className="flex items-center gap-2">
                                <span className="w-10 text-right text-xs text-gray-400 flex-shrink-0">
                                  {report.company} {g.grade}
                                </span>
                                <div className="flex-1 h-4 bg-white/5 rounded overflow-hidden">
                                  <div
                                    className="h-full bg-gold/70 rounded"
                                    style={{ width: `${Math.max(2, (g.count / maxCount) * 100)}%` }}
                                  />
                                </div>
                                <span className="w-12 text-right text-xs text-white font-medium flex-shrink-0">
                                  {g.count.toLocaleString()}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                ))}
            </>
          )}
        </div>
      </div>
    </div>,
    document.body
  )
}
