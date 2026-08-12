import { useState, useEffect, useCallback } from 'react'
import { X, ChevronLeft, Search, ImageIcon } from 'lucide-react'
import {
  getGames,
  getExpansions,
  browseCards,
  getCardPrices,
  getCardImageUrl,
  Game,
  Expansion,
  BrowseCard,
  ScrydexPrices,
} from '../lib/scrydex'
import { GameIcon } from './GameIcon'
import { GRADER_GRADES, RAW_KEYS, type Grader } from '../lib/grading'

interface BrowseAddCardDialogProps {
  onClose: () => void
  onAddCard: (data: {
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
  }) => void
}

type Step = 'brand' | 'set' | 'card' | 'detail'

export function BrowseAddCardDialog({ onClose, onAddCard }: BrowseAddCardDialogProps) {
  const [step, setStep] = useState<Step>('brand')

  const [games, setGames] = useState<Game[]>([])
  const [game, setGame] = useState<Game | null>(null)

  const [setQuery, setSetQuery] = useState('')
  const [expansions, setExpansions] = useState<Expansion[]>([])
  const [expansion, setExpansion] = useState<Expansion | null>(null)
  const [loadingExpansions, setLoadingExpansions] = useState(false)

  const [cardQuery, setCardQuery] = useState('')
  const [cards, setCards] = useState<BrowseCard[]>([])
  const [cardPage, setCardPage] = useState(1)
  const [cardTotal, setCardTotal] = useState(0)
  const [loadingCards, setLoadingCards] = useState(false)

  const [selectedCard, setSelectedCard] = useState<BrowseCard | null>(null)
  const [prices, setPrices] = useState<ScrydexPrices | null>(null)
  const [loadingPrices, setLoadingPrices] = useState(false)
  const [grader, setGrader] = useState<Grader>('RAW')
  const [grade, setGrade] = useState('NM')
  const [quantity, setQuantity] = useState(1)

  useEffect(() => {
    getGames().then(setGames)
  }, [])

  const loadExpansions = useCallback(
    async (q: string) => {
      if (!game) return
      setLoadingExpansions(true)
      const data = await getExpansions(game.id, q)
      setExpansions(data)
      setLoadingExpansions(false)
    },
    [game]
  )

  useEffect(() => {
    if (step === 'set') loadExpansions(setQuery)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, game])

  const loadCards = useCallback(
    async (q: string, page: number, append: boolean) => {
      if (!game || !expansion) return
      setLoadingCards(true)
      const data = await browseCards(game.id, expansion.id, q, page)
      setCards((prev) => (append ? [...prev, ...data.cards] : data.cards))
      setCardTotal(data.total_count)
      setCardPage(data.page)
      setLoadingCards(false)
    },
    [game, expansion]
  )

  useEffect(() => {
    if (step === 'card') loadCards(cardQuery, 1, false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, expansion])

  useEffect(() => {
    if (!selectedCard || !game) return
    setLoadingPrices(true)
    setGrader('RAW')
    setGrade('NM')
    getCardPrices(selectedCard.scrydex_id, game.id).then((data) => {
      setPrices(data)
      setLoadingPrices(false)
    })
  }, [selectedCard, game])

  const goBack = () => {
    if (step === 'detail') setStep('card')
    else if (step === 'card') setStep('set')
    else if (step === 'set') setStep('brand')
  }

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
    const graderData = prices[grader.toLowerCase() as keyof ScrydexPrices] as Record<string, number> | undefined
    return graderData?.[grade] ?? null
  }

  const handleConfirmAdd = () => {
    if (!selectedCard || !expansion) return
    const year = expansion.release_date ? parseInt(expansion.release_date.slice(0, 4), 10) : undefined
    onAddCard({
      name: selectedCard.name,
      set_name: expansion.name,
      year,
      card_number: selectedCard.number,
      scrydex_id: selectedCard.scrydex_id,
      condition: grader === 'RAW' ? grade : `${grader} ${grade}`,
      estimated_value: getSelectedPrice() ?? undefined,
      // Persist the exact image the picker showed (upscaled to /large) so the
      // vault renders the real card, not a reconstructed URL that can 404 to a
      // generic card back.
      image_url: selectedCard.image_url?.replace('/small', '/large'),
      quantity,
      game: game?.id,
    })
    onClose()
  }

  const selectedPrice = getSelectedPrice()
  const imageUrl = selectedCard && game ? getCardImageUrl(selectedCard.scrydex_id, game.id) : null

  const titleFor = (s: Step) => {
    if (s === 'brand') return 'Choose a brand'
    if (s === 'set') return game?.label ?? 'Choose a set'
    if (s === 'card') return expansion?.name ?? 'Choose a card'
    return selectedCard?.name ?? 'Add card'
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-[#1a1a1d] rounded-2xl border border-white/10 w-full max-w-lg max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-white/5 flex-shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            {step !== 'brand' && (
              <button onClick={goBack} className="text-gray-400 hover:text-white transition-colors flex-shrink-0">
                <ChevronLeft size={20} />
              </button>
            )}
            <h2 className="font-heading font-bold text-white truncate">{titleFor(step)}</h2>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors flex-shrink-0 ml-3">
            <X size={20} />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 p-5">
          {/* Step 1: Brand */}
          {step === 'brand' && (
            <div className="grid grid-cols-2 gap-3">
              {games.map((g) => (
                <button
                  key={g.id}
                  onClick={() => {
                    setGame(g)
                    setExpansion(null)
                    setSetQuery('')
                    setStep('set')
                  }}
                  className="bg-[#111113] border border-white/10 rounded-xl p-5 text-center hover:border-gold/40 transition-colors"
                >
                  <GameIcon game={g.id} size={40} className="mx-auto mb-2.5" />
                  <p className="text-white font-semibold text-sm">{g.label}</p>
                </button>
              ))}
              {games.length === 0 && (
                <div className="col-span-2 flex justify-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gold" />
                </div>
              )}
            </div>
          )}

          {/* Step 2: Set */}
          {step === 'set' && (
            <div>
              <div className="relative mb-4">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
                <input
                  value={setQuery}
                  onChange={(e) => {
                    setSetQuery(e.target.value)
                    loadExpansions(e.target.value)
                  }}
                  placeholder="Search sets..."
                  className="w-full bg-[#111113] border border-white/10 rounded-xl pl-9 pr-3 py-2.5 text-white text-sm placeholder-gray-600 focus:outline-none focus:border-gold/50"
                />
              </div>
              {loadingExpansions ? (
                <div className="flex justify-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gold" />
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  {expansions.map((e) => (
                    <button
                      key={e.id}
                      onClick={() => {
                        setExpansion(e)
                        setCardQuery('')
                        setStep('card')
                      }}
                      className="bg-[#111113] border border-white/10 rounded-xl p-3 text-center hover:border-gold/40 transition-colors"
                    >
                      {e.logo ? (
                        <img src={e.logo} alt={e.name} className="h-10 mx-auto object-contain mb-2" />
                      ) : (
                        <div className="h-10 mb-2" />
                      )}
                      <p className="text-white text-xs font-medium line-clamp-2">{e.name}</p>
                      {e.release_date && (
                        <p className="text-gray-500 text-[10px] mt-0.5">{e.release_date.slice(0, 4)}</p>
                      )}
                    </button>
                  ))}
                  {expansions.length === 0 && (
                    <p className="col-span-2 text-center text-gray-500 text-sm py-6">No sets found.</p>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Step 3: Card */}
          {step === 'card' && (
            <div>
              <div className="relative mb-4">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
                <input
                  value={cardQuery}
                  onChange={(e) => {
                    setCardQuery(e.target.value)
                    loadCards(e.target.value, 1, false)
                  }}
                  placeholder="Search cards in this set..."
                  className="w-full bg-[#111113] border border-white/10 rounded-xl pl-9 pr-3 py-2.5 text-white text-sm placeholder-gray-600 focus:outline-none focus:border-gold/50"
                />
              </div>
              <div className="grid grid-cols-3 gap-2">
                {cards.map((c) => (
                  <button
                    key={c.scrydex_id}
                    onClick={() => {
                      setSelectedCard(c)
                      setStep('detail')
                    }}
                    className="bg-[#111113] border border-white/10 rounded-xl p-2 text-center hover:border-gold/40 transition-colors"
                  >
                    {c.image_url ? (
                      <img src={c.image_url} alt={c.name} loading="lazy" decoding="async" className="w-full aspect-[5/7] object-contain rounded mb-1.5" />
                    ) : (
                      <div className="w-full aspect-[5/7] bg-[#1a1a1d] rounded mb-1.5 flex items-center justify-center">
                        <ImageIcon size={20} className="text-gray-700" />
                      </div>
                    )}
                    <p className="text-white text-[11px] font-medium line-clamp-2">{c.name}</p>
                    {c.number && <p className="text-gray-500 text-[10px] mt-0.5">#{c.number}</p>}
                  </button>
                ))}
              </div>
              {loadingCards && (
                <div className="flex justify-center py-6">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gold" />
                </div>
              )}
              {!loadingCards && cards.length === 0 && (
                <p className="text-center text-gray-500 text-sm py-6">No cards found.</p>
              )}
              {!loadingCards && cards.length > 0 && cards.length < cardTotal && (
                <button
                  onClick={() => loadCards(cardQuery, cardPage + 1, true)}
                  className="w-full mt-3 py-2.5 rounded-xl border border-white/10 text-gray-400 hover:text-white text-sm transition-colors"
                >
                  Load more
                </button>
              )}
            </div>
          )}

          {/* Step 4: Detail / condition + add */}
          {step === 'detail' && selectedCard && (
            <div>
              <div className="text-center mb-4">
                {imageUrl && (
                  <div className="relative inline-block mb-3">
                    <div className="absolute inset-0 bg-gold/25 blur-3xl rounded-full" />
                    <img src={imageUrl} alt={selectedCard.name} className="relative w-40 mx-auto rounded-xl object-contain" />
                  </div>
                )}
                <h3 className="font-heading text-lg font-bold text-white">
                  {selectedCard.name}
                  {selectedCard.number && <span className="text-gray-500 font-normal"> #{selectedCard.number}</span>}
                </h3>
                {expansion && <p className="text-gray-400 text-sm">{expansion.name}</p>}
              </div>

              {loadingPrices ? (
                <div className="flex justify-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gold" />
                </div>
              ) : (
                <>
                  <p className="text-gray-400 text-xs mb-2">Select the condition you own:</p>
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {(Object.keys(GRADER_GRADES) as Grader[]).map((g) => (
                      <button
                        key={g}
                        onClick={() => handleGraderChange(g)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold tracking-wider transition-colors ${
                          grader === g ? 'bg-gold text-navy-900' : 'bg-[#111113] text-gray-400 hover:text-white'
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

                  <div className="bg-[#111113] rounded-xl p-5 text-center mb-5">
                    <p className="text-gray-400 text-xs mb-1">
                      {grader} {grader !== 'RAW' ? `Grade ${grade}` : grade}
                    </p>
                    <p className="text-gold text-3xl font-bold font-body">
                      {selectedPrice != null ? `$${selectedPrice.toFixed(2)}` : '—'}
                    </p>
                  </div>

                  <div className="flex items-center justify-between mb-4">
                    <span className="text-gray-400 text-sm">Quantity</span>
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                        className="w-10 h-10 rounded-lg bg-[#111113] border border-white/10 text-white text-lg leading-none hover:border-gold/40 transition-colors disabled:opacity-40"
                        disabled={quantity <= 1}
                        aria-label="Decrease quantity"
                      >
                        −
                      </button>
                      <span className="text-white font-semibold w-6 text-center">{quantity}</span>
                      <button
                        onClick={() => setQuantity((q) => Math.min(999, q + 1))}
                        className="w-10 h-10 rounded-lg bg-[#111113] border border-white/10 text-white text-lg leading-none hover:border-gold/40 transition-colors"
                        aria-label="Increase quantity"
                      >
                        +
                      </button>
                    </div>
                  </div>

                  <button
                    onClick={handleConfirmAdd}
                    className="w-full py-3 rounded-xl bg-gold text-navy-900 font-semibold text-sm hover:opacity-90 transition-opacity"
                  >
                    Add {quantity > 1 ? `${quantity} ` : ''}to Vault
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
