import { supabase } from './supabase'
import { dataUrlToFile, uploadCardImage } from './storage'

export interface ScannedCardData {
  name: string
  set_name?: string
  year?: number
  image?: string
  backImage?: string
  scrydex_id?: string
  card_number?: string
  estimated_value?: number
  price_change_pct?: number
  /** How many of this card to add (defaults to 1). Used by batch scan. */
  quantity?: number
}

export async function insertScannedCard(
  userId: string,
  portfolioId: string,
  data: ScannedCardData
): Promise<boolean> {
  const addQty = Math.max(1, data.quantity ?? 1)

  // Dedupe: same print (NM) already in this portfolio → bump quantity instead
  // of creating a duplicate row (mirrors the in-portfolio scan behaviour).
  if (data.scrydex_id) {
    const { data: existing } = await supabase
      .from('cards')
      .select('id, quantity')
      .eq('portfolio_id', portfolioId)
      .eq('scrydex_id', data.scrydex_id)
      .eq('condition', 'NM')
      .limit(1)
    if (existing && existing.length) {
      const { error } = await supabase
        .from('cards')
        .update({ quantity: (existing[0].quantity ?? 1) + addQty })
        .eq('id', existing[0].id)
      if (error) console.error('Bump scanned card quantity failed:', error.message)
      return !error
    }
  }

  let frontUrl: string | null = null
  if (data.image) {
    const file = dataUrlToFile(data.image, `${Date.now()}_scan_front.jpg`)
    frontUrl = await uploadCardImage(file, `${userId}/${portfolioId}/${Date.now()}_scan_front.jpg`)
  }
  let backUrl: string | null = null
  if (data.backImage) {
    const file = dataUrlToFile(data.backImage, `${Date.now()}_scan_back.jpg`)
    backUrl = await uploadCardImage(file, `${userId}/${portfolioId}/${Date.now()}_scan_back.jpg`)
  }

  const { error } = await supabase.from('cards').insert({
    portfolio_id: portfolioId,
    user_id: userId,
    name: data.name,
    card_set: data.set_name || null,
    year: data.year || null,
    condition: 'NM',
    image_url: frontUrl,
    back_image_url: backUrl,
    scrydex_id: data.scrydex_id || null,
    card_number: data.card_number || null,
    estimated_value: data.estimated_value ?? null,
    price_change_pct: data.price_change_pct ?? null,
    quantity: addQty,
    game: 'pokemon',
  })

  if (error) console.error('Add scanned card failed:', error.message)
  return !error
}
