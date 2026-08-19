#!/usr/bin/env node
'use strict'

// Syncs sealed products from TCGCSV.com into the Supabase tcg_catalog table.
// Run once to bootstrap, then nightly via Railway cron or manual trigger.
//
// Required env vars:
//   SUPABASE_URL              (e.g. https://wmwrwxbspnpsnlshpozz.supabase.co)
//   SUPABASE_SERVICE_ROLE_KEY (Supabase Dashboard → Settings → API → service_role)

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || ''
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
const BATCH_SIZE   = 500
const DELAY_MS     = 80  // polite delay between group fetches

// TCGPlayer category IDs (TCGCSV uses these)
const CATEGORIES = [
  { id: 3, game: 'pokemon' },
]

// Products matching any of these (in name/cleanName) are kept as sealed products.
// The rest (individual card singles) are skipped.
const SEALED_KEYWORDS = [
  'booster box', 'booster bundle', 'booster pack', 'elite trainer box', ' etb',
  ' tin', 'mini tin', 'blister', 'collection box', 'collection set', 'display',
  'theme deck', 'battle deck', 'starter deck', 'gift set', 'premium collection',
  'prerelease kit', 'build & battle', 'treasure chest', 'bundle', ' case ',
  'sealed case',
]

function isSealed(name, extendedData) {
  if (Array.isArray(extendedData) && extendedData.some(e => e.name === 'UPC' && e.value)) return true
  const n = (name || '').toLowerCase()
  return SEALED_KEYWORDS.some(kw => n.includes(kw))
}

function extractUpc(extendedData) {
  const entry = Array.isArray(extendedData) && extendedData.find(e => e.name === 'UPC' && e.value)
  return entry ? String(entry.value).replace(/\D/g, '') || null : null
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }

async function fetchJson(url, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      const r = await fetch(url, { headers: { Accept: 'application/json' } })
      if (!r.ok) throw new Error(`HTTP ${r.status} from ${url}`)
      return await r.json()
    } catch (e) {
      if (i === retries - 1) throw e
      await sleep(400 * (i + 1))
    }
  }
}

async function upsertBatch(rows) {
  if (!rows.length) return
  const r = await fetch(`${SUPABASE_URL}/rest/v1/tcg_catalog`, {
    method: 'POST',
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=minimal',
    },
    body: JSON.stringify(rows),
  })
  if (!r.ok) throw new Error(`Upsert failed ${r.status}: ${await r.text()}`)
}

async function syncCategory(categoryId, gameName) {
  console.log(`\n[sync] Category ${categoryId} (${gameName}) — fetching groups…`)
  const groupsData = await fetchJson(`https://tcgcsv.com/tcgplayer/${categoryId}/groups`)
  const groups = groupsData.results || groupsData || []
  console.log(`[sync] ${groups.length} groups found`)

  let imported = 0, skipped = 0, errors = 0

  for (let i = 0; i < groups.length; i++) {
    const { groupId, name: groupName = '' } = groups[i]
    const label = groupName.substring(0, 38).padEnd(38)
    process.stdout.write(`\r[sync] ${i + 1}/${groups.length} ${label}  imported=${imported}  `)

    try {
      const [productsData, pricesData] = await Promise.all([
        fetchJson(`https://tcgcsv.com/tcgplayer/${categoryId}/${groupId}/products`),
        fetchJson(`https://tcgcsv.com/tcgplayer/${categoryId}/${groupId}/prices`),
      ])

      const products = productsData.results || []
      const prices   = pricesData.results   || []

      // Build price map — prefer Normal subtype, keep first entry otherwise
      const priceMap = new Map()
      for (const p of prices) {
        if (!priceMap.has(p.productId) || p.subTypeName === 'Normal') {
          priceMap.set(p.productId, p)
        }
      }

      const rows = []
      for (const product of products) {
        const displayName = product.cleanName || product.name || ''
        if (!isSealed(displayName, product.extendedData)) { skipped++; continue }

        const price = priceMap.get(product.productId)
        rows.push({
          tcgplayer_id: product.productId,
          name:         product.name || product.cleanName,
          clean_name:   product.cleanName || product.name,
          image_url:    product.imageUrl || null,
          group_id:     groupId,
          group_name:   groupName,
          game:         gameName,
          upc:          extractUpc(product.extendedData),
          market_price: price?.marketPrice ?? null,
          low_price:    price?.lowPrice    ?? null,
          mid_price:    price?.midPrice    ?? null,
          high_price:   price?.highPrice   ?? null,
          synced_at:    new Date().toISOString(),
        })
      }

      for (let b = 0; b < rows.length; b += BATCH_SIZE) {
        await upsertBatch(rows.slice(b, b + BATCH_SIZE))
      }
      imported += rows.length

    } catch (e) {
      errors++
      process.stdout.write(`\n[sync] Error group ${groupId} (${groupName}): ${e.message}\n`)
    }

    await sleep(DELAY_MS)
  }

  console.log(`\n[sync] Done: ${imported} imported, ${skipped} singles skipped, ${errors} errors`)
}

async function main() {
  if (!SUPABASE_URL) { console.error('Missing SUPABASE_URL'); process.exit(1) }
  if (!SERVICE_KEY)  {
    console.error('Missing SUPABASE_SERVICE_ROLE_KEY')
    console.error('Get it: Supabase Dashboard → Project → Settings → API → service_role key')
    process.exit(1)
  }

  console.log(`[sync] TCGCSV → Supabase  (${SUPABASE_URL})`)
  const start = Date.now()

  for (const { id, game } of CATEGORIES) {
    await syncCategory(id, game)
  }

  const elapsed = Math.round((Date.now() - start) / 1000)
  console.log(`\n[sync] Completed in ${elapsed}s`)
}

main().catch(e => { console.error('[sync] Fatal:', e); process.exit(1) })
