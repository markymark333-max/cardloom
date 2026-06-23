export interface ScrydexPrices {
  raw: { nm: number; lp: number; mp: number; hp: number; dm: number }
  psa: Record<string, number>
  cgc: Record<string, number>
  bgs: Record<string, number>
  tag: Record<string, number>
  ace: Record<string, number>
  sgc: Record<string, number>
}

export interface ScrydexSale {
  platform: string
  date: string
  grade: string
  grader: string
  price: number
}

export async function getCardPrices(scrydexId: string): Promise<ScrydexPrices | null> {
  try {
    const res = await fetch(`/api/scrydex/prices/${scrydexId}`)
    if (!res.ok) return null
    return res.json()
  } catch {
    return null
  }
}

export async function getCardSales(scrydexId: string): Promise<ScrydexSale[]> {
  try {
    const res = await fetch(`/api/scrydex/sales/${scrydexId}`)
    if (!res.ok) return []
    return res.json()
  } catch {
    return []
  }
}

export function getCardImageUrl(scrydexId: string): string {
  return `https://images.scrydex.com/pokemon/${scrydexId}/large`
}
