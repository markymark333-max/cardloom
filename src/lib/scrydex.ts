export interface TrendWindow {
  price_change: number
  percent_change: number
}

export interface BuyLink {
  marketplace: string
  url: string
}

export interface ScrydexPrices {
  raw: { nm: number; lp: number; mp: number; hp: number; dm: number }
  psa: Record<string, number>
  cgc: Record<string, number>
  bgs: Record<string, number>
  tag: Record<string, number>
  ace: Record<string, number>
  sgc: Record<string, number>
  price_change_pct?: number | null
  trends?: { days_7: TrendWindow | null; days_14: TrendWindow | null; days_30: TrendWindow | null } | null
  buy_links?: BuyLink[]
}

export interface ScrydexSale {
  platform: string
  date: string
  grade: string
  grader: string
  price: number
  url?: string
}

export interface PricePoint {
  date: string
  price: number
}

export interface PopReport {
  company: string
  total: number
  grades: { grade: string; count: number }[]
}

export interface Game {
  id: string
  label: string
}

export interface Expansion {
  id: string
  name: string
  series?: string
  release_date?: string
  logo?: string
  total?: number
}

export interface BrowseCard {
  scrydex_id: string
  name: string
  number?: string
  image_url?: string
}

// Resolve the price for a card's stored condition. `condition` is either a raw
// grade ("NM"/"LP"/…) or a graded string ("PSA 10", "CGC 9.5"). Returns null if
// no matching price — callers must NOT overwrite a good value with null.
export function priceForCondition(prices: ScrydexPrices | null, condition?: string | null): number | null {
  if (!prices || !condition) return null
  const rawKeys: Record<string, keyof ScrydexPrices['raw']> = { NM: 'nm', LP: 'lp', MP: 'mp', HP: 'hp', DM: 'dm' }
  const c = condition.trim()
  if (rawKeys[c]) return prices.raw?.[rawKeys[c]] ?? null
  const [company, grade] = c.split(/\s+/)
  const bucket = prices[company?.toLowerCase() as keyof ScrydexPrices] as Record<string, number> | undefined
  return grade ? bucket?.[grade] ?? null : null
}

export async function getCardPrices(
  scrydexId: string,
  game = 'pokemon',
  variant?: string | null
): Promise<ScrydexPrices | null> {
  try {
    const params = new URLSearchParams({ game })
    if (variant) params.set('variant', variant)
    const res = await fetch(`/api/scrydex/prices/${scrydexId}?${params}`)
    if (!res.ok) return null
    return res.json()
  } catch {
    return null
  }
}

export async function getCardSales(scrydexId: string, game = 'pokemon'): Promise<ScrydexSale[]> {
  try {
    const res = await fetch(`/api/scrydex/sales/${scrydexId}?game=${game}`)
    if (!res.ok) return []
    return res.json()
  } catch {
    return []
  }
}

export async function getCardPop(scrydexId: string, game = 'pokemon'): Promise<PopReport[]> {
  try {
    const res = await fetch(`/api/scrydex/pop/${scrydexId}?game=${game}`)
    if (!res.ok) return []
    return res.json()
  } catch {
    return []
  }
}

export async function getCardHistory(scrydexId: string, days = 90, game = 'pokemon'): Promise<PricePoint[]> {
  try {
    const res = await fetch(`/api/scrydex/history/${scrydexId}?days=${days}&game=${game}`)
    if (!res.ok) return []
    const data = await res.json()
    return data.points ?? []
  } catch {
    return []
  }
}

export async function getGames(): Promise<Game[]> {
  try {
    const res = await fetch('/api/scrydex/games')
    if (!res.ok) return []
    return res.json()
  } catch {
    return []
  }
}

export async function getExpansions(game: string, q?: string): Promise<Expansion[]> {
  try {
    const params = new URLSearchParams({ game })
    if (q) params.set('q', q)
    const res = await fetch(`/api/scrydex/expansions?${params}`)
    if (!res.ok) return []
    return res.json()
  } catch {
    return []
  }
}

export async function browseCards(
  game: string,
  expansion: string,
  q?: string,
  page = 1
): Promise<{ cards: BrowseCard[]; page: number; total_count: number }> {
  try {
    const params = new URLSearchParams({ game, expansion, page: String(page) })
    if (q) params.set('q', q)
    const res = await fetch(`/api/scrydex/browse?${params}`)
    if (!res.ok) return { cards: [], page: 1, total_count: 0 }
    return res.json()
  } catch {
    return { cards: [], page: 1, total_count: 0 }
  }
}

export function getCardImageUrl(scrydexId: string, game = 'pokemon'): string {
  return `https://images.scrydex.com/${game}/${scrydexId}/large`
}
