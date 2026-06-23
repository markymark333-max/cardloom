import { useState, useEffect } from 'react'
import { X } from 'lucide-react'
import { getCardPrices, getCardSales, getCardImageUrl, ScrydexPrices, ScrydexSale } from '../lib/scrydex'

interface Card {
  id: string
  name: string
  set_name?: string
  year?: number
  condition?: string
  scrydex_id?: string
  front_image_url?: string
  market_price?: number
  price_change_pct?: number
}

interface CardDetailDialogProps {
  card: Card
  onClose: () => void
}

type Tab = 'prices' | 'history' | 'sales' | 'pop'
type Grader = 'RAW' | 'PSA' | 'CGC' | 'BGS' | 'TAG' | 'ACE' | 'SGC'

const GRADER_GRADES: Record<Grader, string[]> = {
  RAW: ['NM', 'LP', 'MP', 'HP', 'DM'],
  PSA: ['10', '9', '8.5', '8', '7', '6', '5', '4', '3', '2', '1'],
  CGC: ['10', '9.5', '9', '8.5', '8', '7', '6.5', '6', '5.5', '5', '4.5', '4', '3', '2', '1.5', '1'],
  BGS: ['10', '9.5', '9', '8.5', '8'],
  TAG: ['10', '9', '8.5', '5.5', '1'],
  ACE: ['10'],
  SGC: ['10', '9.5', '9', '8', '7', '6', '5', '4', '3', '2', '1'],
}

const RAW_KEYS: Record<string, keyof ScrydexPrices['raw']> = {
  NM: 'nm', LP: 'lp', MP: 'mp', HP: 'hp', DM: 'dm',
}

export function CardDetailDialog({ card, onClose }: CardDetailDialogProps) {
  const [activeTab, setActiveTab] = useState<Tab>('prices')
  const [grader, setGrader] = useState<Grader>('RAW')
  const [grade, setGrade] = useState<string>('NM')
  const [prices, setPrices] = useState<ScrydexPrices | null>(null)
  const [sales, setSales] = useState<ScrydexSale[]>([])
  const [loadingPrices, setLoadingPrices] = useState(false)
  const [loadingSales, setLoadingSales] = useState(false)

  useEffect(() => {
    if (!card.scrydex_id) return
    setLoadingPrices(true)
    getCardPrices(card.scrydex_id).then((data) => {
      setPrices(data)
      setLoadingPrices(false)
    })
  }, [card.scrydex_id])

  useEffect(() => {
    if (activeTab !== 'sales' || !card.scrydex_id) return
    setLoadingSales(true)
    getCardSales(card.scrydex_id).then((data) => {
      setSales(data)
      setLoadingSales(false)
    })
  }, [activeTab, card.scrydex_id])

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

  const imageUrl = card.front_image_url || (card.scrydex_id ? getCardImageUrl(card.scrydex_id) : null)
  const selectedPrice = getSelectedPrice()

  const tabs: { key: Tab; label: string }[] = [
    { key: 'prices', label: 'Prices' },
    { key: 'history', label: 'History' },
    { key: 'sales', label: 'Sales' },
    { key: 'pop', label: 'Pop' },
  ]

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-navy-800 rounded-2xl border border-white/10 w-full max-w-3xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-start justify-between p-6 border-b border-white/5">
          <div>
            <h2 className="font-heading text-2xl font-bold text-white">{card.name}</h2>
            <p className="text-gray-400 text-sm mt-1">
              {[card.set_name, card.year, card.condition].filter(Boolean).join(' · ')}
            </p>
            {card.market_price != null && (
              <p className="text-gold text-xl font-semibold mt-1">
                ${card.market_price.toFixed(2)}
              </p>
            )}
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors ml-4">
            <X size={20} />
          </button>
        </div>

        <div className="flex flex-col md:flex-row gap-0">
          {/* Left: image */}
          <div className="md:w-64 flex-shrink-0 p-6 flex items-start justify-center">
            {imageUrl ? (
              <img
                src={imageUrl}
                alt={card.name}
                className="w-full max-w-[200px] rounded-xl object-contain"
              />
            ) : (
              <div className="w-full max-w-[200px] h-64 bg-navy-900 rounded-xl flex items-center justify-center text-gray-600 text-sm">
                No image
              </div>
            )}
          </div>

          {/* Right: tabs */}
          <div className="flex-1 p-6 pt-0 md:pt-6 md:pl-0">
            {/* Tab bar */}
            <div className="flex gap-1 mb-6 bg-navy-900 rounded-xl p-1">
              {tabs.map((t) => (
                <button
                  key={t.key}
                  onClick={() => setActiveTab(t.key)}
                  className={`flex-1 py-2 text-sm rounded-lg font-medium transition-colors ${
                    activeTab === t.key
                      ? 'bg-navy-800 text-white'
                      : 'text-gray-500 hover:text-gray-300'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {/* Prices tab */}
            {activeTab === 'prices' && (
              <div>
                {!card.scrydex_id && (
                  <p className="text-gray-500 text-sm">No Scrydex ID linked to this card.</p>
                )}
                {card.scrydex_id && (
                  <>
                    {/* Grader selector */}
                    <div className="flex flex-wrap gap-2 mb-4">
                      {(Object.keys(GRADER_GRADES) as Grader[]).map((g) => (
                        <button
                          key={g}
                          onClick={() => handleGraderChange(g)}
                          className={`px-3 py-1.5 rounded-lg text-xs font-semibold tracking-wider transition-colors ${
                            grader === g
                              ? 'bg-gold text-navy-900'
                              : 'bg-navy-900 text-gray-400 hover:text-white'
                          }`}
                        >
                          {g}
                        </button>
                      ))}
                    </div>

                    {/* Grade selector */}
                    <div className="flex flex-wrap gap-2 mb-6">
                      {GRADER_GRADES[grader].map((g) => (
                        <button
                          key={g}
                          onClick={() => setGrade(g)}
                          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                            grade === g
                              ? 'bg-white/10 text-white border border-white/20'
                              : 'text-gray-500 hover:text-gray-300'
                          }`}
                        >
                          {grader === 'RAW' ? g : `${g}`}
                        </button>
                      ))}
                    </div>

                    {/* Price display */}
                    {loadingPrices ? (
                      <div className="flex justify-center py-8">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gold" />
                      </div>
                    ) : selectedPrice != null ? (
                      <div className="bg-navy-900 rounded-xl p-6 text-center">
                        <p className="text-gray-400 text-sm mb-2">
                          {grader} {grader !== 'RAW' ? `Grade ${grade}` : grade}
                        </p>
                        <p className="text-gold text-4xl font-bold font-heading">
                          ${selectedPrice.toFixed(2)}
                        </p>
                        <p className="text-gray-500 text-xs mt-2">Market value</p>
                      </div>
                    ) : (
                      <div className="bg-navy-900 rounded-xl p-6 text-center text-gray-500">
                        No price data available for this grade.
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            {/* History tab */}
            {activeTab === 'history' && (
              <div className="bg-navy-900 rounded-xl p-8 text-center">
                <p className="text-gray-400 text-sm">Price history chart coming soon</p>
              </div>
            )}

            {/* Sales tab */}
            {activeTab === 'sales' && (
              <div>
                {!card.scrydex_id && (
                  <p className="text-gray-500 text-sm">No Scrydex ID linked to this card.</p>
                )}
                {card.scrydex_id && (
                  <>
                    {loadingSales ? (
                      <div className="flex justify-center py-8">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gold" />
                      </div>
                    ) : sales.length === 0 ? (
                      <div className="bg-navy-900 rounded-xl p-8 text-center text-gray-500 text-sm">
                        No sales data available.
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {sales.map((sale, i) => (
                          <div
                            key={i}
                            className="bg-navy-900 rounded-xl p-3 flex items-center justify-between"
                          >
                            <div>
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
                            <span className="text-gold font-semibold text-sm">
                              ${Number(sale.price).toFixed(2)}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            {/* Pop tab */}
            {activeTab === 'pop' && (
              <div className="bg-navy-900 rounded-xl p-8 text-center">
                <p className="text-gray-400 text-sm">Population report coming soon</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
