const express = require('express')
const path = require('path')
const https = require('https')

const app = express()
const PORT = process.env.PORT || 3000

// Force HTTPS — Railway terminates TLS but doesn't redirect HTTP automatically.
app.use((req, res, next) => {
  if (req.headers['x-forwarded-proto'] === 'http') {
    res.redirect(301, `https://${req.headers.host}${req.originalUrl}`)
    return
  }
  next()
})

// Canonical domain is the bare apex — redirect www to it.
app.use((req, res, next) => {
  if (req.hostname === 'www.cardloom.ai') {
    res.redirect(301, `https://cardloom.ai${req.originalUrl}`)
    return
  }
  next()
})

// Serve static files from dist/
app.use(express.static(path.join(__dirname, 'dist')))
app.use(express.json({ limit: '6mb' }))

// Best-effort in-memory per-IP rate limiter for the /api proxy routes, which
// forward to PAID Gemini/Scrydex APIs. Prevents a scripted client from running
// up the bill. (Single-instance approximation; no external dependency.)
// Each call gets its OWN counter map so limits on different routes don't share
// a budget (e.g. heavy Scrydex browsing must not lock a user out of scanning).
function rateLimit(maxPerMin) {
  const hits = new Map()
  return (req, res, next) => {
    const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket.remoteAddress || 'unknown'
    const cutoff = Date.now() - 60_000
    const recent = (hits.get(ip) || []).filter((t) => t > cutoff)
    if (recent.length >= maxPerMin) {
      res.status(429).json({ error: 'Too many requests — slow down.' })
      return
    }
    recent.push(Date.now())
    hits.set(ip, recent)
    // Opportunistic cleanup so idle IPs don't accumulate forever.
    if (hits.size > 5000) {
      for (const [k, v] of hits) if (v.every((t) => t <= cutoff)) hits.delete(k)
    }
    next()
  }
}

// Cap scans at 60/min so a scripted client can't hammer TCG Tracking or rack
// up Scrydex lookups. The read-only Scrydex proxy can run looser.
app.use('/api/scan', rateLimit(60))
app.use('/api/scrydex', rateLimit(150))
app.use('/api/tcg', rateLimit(120))

// Trading card games Scrydex supports, and the API path segment for each.
const GAMES = {
  pokemon: 'Pokémon',
  onepiece: 'One Piece',
  magicthegathering: 'Magic: The Gathering',
  lorcana: 'Disney Lorcana',
  gundam: 'Gundam',
  riftbound: 'Riftbound',
}

function gameParam(req) {
  const g = req.query.game
  return typeof g === 'string' && GAMES[g] ? g : 'pokemon'
}

const GEMINI_MODEL = 'gemini-3.6-flash'
const CARD_SCHEMA = {
  type: 'OBJECT',
  properties: {
    name: { type: 'STRING' },
    // English name — critical for Japanese/foreign prints (Scrydex is indexed in English).
    name_en: { type: 'STRING' },
    set_name: { type: 'STRING' },
    year: { type: 'INTEGER' },
    card_number: { type: 'STRING' },
    // Foil pattern read from the BACKGROUND: master_ball | poke_ball | reverse_holo | holo | normal
    variant: { type: 'STRING' },
  },
  required: ['name', 'set_name', 'year'],
}

// POST /api/scan — identify a trading card via Gemini vision OCR, enrich with
const GRADE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    grade: { type: 'NUMBER' },
    gradeName: { type: 'STRING' },
    centering: { type: 'OBJECT', properties: { score: { type: 'NUMBER' }, notes: { type: 'STRING' } }, required: ['score', 'notes'] },
    corners:   { type: 'OBJECT', properties: { score: { type: 'NUMBER' }, notes: { type: 'STRING' } }, required: ['score', 'notes'] },
    edges:     { type: 'OBJECT', properties: { score: { type: 'NUMBER' }, notes: { type: 'STRING' } }, required: ['score', 'notes'] },
    surface:   { type: 'OBJECT', properties: { score: { type: 'NUMBER' }, notes: { type: 'STRING' } }, required: ['score', 'notes'] },
    overallNotes: { type: 'STRING' },
    confidence: { type: 'STRING', enum: ['high', 'medium', 'low'] },
    confidenceReason: { type: 'STRING' },
  },
  required: ['grade', 'gradeName', 'centering', 'corners', 'edges', 'surface', 'overallNotes', 'confidence'],
}

app.post('/api/grade-card', async (req, res) => {
  const { frontImageBase64, backImageBase64, mimeType } = req.body || {}
  if (!frontImageBase64) {
    res.status(400).json({ error: 'frontImageBase64 is required' })
    return
  }
  const mime = mimeType || 'image/jpeg'
  const parts = [
    {
      text:
        'You are a professional trading card grader using PSA standards. ' +
        'Examine this card photo and grade it on a 1–10 scale. ' +
        'Score each category (centering, corners, edges, surface) from 1–10, ' +
        'then assign a final overall grade and its PSA grade name ' +
        '(Gem Mint = 10, Mint = 9, Near Mint-Mint = 8, Near Mint = 7, Excellent-Mint = 6, ' +
        'Excellent = 5, Very Good-Excellent = 4, Very Good = 3, Good = 2, Poor = 1). ' +
        'Be honest and precise — slightly off-centre or a faint scratch drops the score. ' +
        'Set confidence to "high" if both sides are clearly visible and well-lit, ' +
        '"medium" if one side is missing or lighting is average, "low" if the photo is blurry or dark. ' +
        'Include a confidenceReason when confidence is medium or low.',
    },
    { inline_data: { mime_type: mime, data: frontImageBase64 } },
  ]
  if (backImageBase64) {
    parts.push({ inline_data: { mime_type: mime, data: backImageBase64 } })
  }

  try {
    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${process.env.GEMINI_API_KEY || ''}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts }],
          generationConfig: { responseMimeType: 'application/json', responseSchema: GRADE_SCHEMA },
        }),
      }
    )
    const json = await geminiRes.json()
    if (!geminiRes.ok) {
      console.error('Gemini grade error:', json)
      res.status(502).json({ error: 'Grading failed' })
      return
    }
    const text = json.candidates?.[0]?.content?.parts?.[0]?.text || ''
    res.json(JSON.parse(text))
  } catch (err) {
    console.error('grade-card error:', err)
    res.status(500).json({ error: 'Internal error' })
  }
})

// Scrydex graded/pop/eBay/trend data, and fill in missing images from TCG
// Tracking's CDN (Master Ball / Poké Ball variants, promos, regional sets).
app.post('/api/scan', async (req, res) => {
  const match = /^data:(image\/\w+);base64,(.+)$/.exec(req.body?.image || '')
  if (!match) {
    res.status(400).json({ error: 'Missing or invalid image data' })
    return
  }
  const [, mimeType, data] = match

  const body = {
    contents: [
      {
        parts: [
          {
            text:
              'Identify this trading card (Pokemon, sports, or other TCG) from the photo. ' +
              'Read the card name, set name, and any copyright/year text visible on the card. ' +
              'Read the collector number printed on the card (usually a small number like "143/236" ' +
              'near a corner) into card_number. ' +
              'If the card is Japanese or any non-English language, put the printed name in "name" ' +
              'and the official English translation in "name_en" — name_en MUST be in English, never ' +
              'leave it blank or repeat the foreign text. For English cards, name_en equals name. ' +
              'Look closely at the BACKGROUND behind the artwork and set "variant": if it shows a ' +
              'repeating Master Ball symbol pattern, use "master_ball"; a repeating Poké Ball pattern, ' +
              '"poke_ball"; a mirror/holo shine on the border, "reverse_holo"; a holo artwork, "holo"; ' +
              'otherwise "normal". These patterns change the card\'s value a lot, so look carefully. ' +
              'Give your best guess even if unsure; use an empty string or 0 for fields you cannot determine.',
          },
          { inline_data: { mime_type: mimeType, data } },
        ],
      },
    ],
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: CARD_SCHEMA,
    },
  }

  try {
    const t0 = Date.now()
    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${process.env.GEMINI_API_KEY || ''}`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
    )
    const json = await geminiRes.json()
    const tGemini = Date.now()

    if (!geminiRes.ok) {
      console.error('Gemini scan error:', json)
      res.status(502).json({ error: 'Scan failed' })
      return
    }

    const text = json?.candidates?.[0]?.content?.parts?.[0]?.text
    const card = JSON.parse(text)
    const identified = {
      name: card.name || 'Unknown card',
      name_en: card.name_en || undefined,
      set_name: card.set_name || undefined,
      year: card.year || undefined,
      card_number: card.card_number || undefined,
      variant: card.variant || undefined,
    }

    // Run Scrydex first so we get the confirmed set name + number to pass to
    // TCG Tracking. Gemini sometimes misreads the set (e.g. "Forbidden Light"
    // instead of "Prismatic Evolutions"), which would make TCG Tracking return
    // a completely wrong card image. Using Scrydex's match as the source of
    // truth avoids that class of bug.
    const priced = await matchAndPriceCard(identified)
    const tcgSet = priced.matches?.[0]?.set_name || identified.set_name
    const tcgNum  = priced.card_number || identified.card_number
    const tcgVariants = await findTcgTrackingVariants(identified.name, identified.name_en, tcgSet, tcgNum, identified.variant)
    const tMatch = Date.now()

    // English name priority: Gemini translation → TCG Tracking (always English,
    // even for Japanese-category products) → Scrydex match → raw printed name.
    const displayName = identified.name_en || tcgVariants.name || priced.matches?.[0]?.name || identified.name
    const normV = (s) => String(s || '').toLowerCase().replace(/[^a-z]/g, '')

    // TCG Tracking is the primary source for variant options (has all variants
    // including Japanese-exclusive MB/PB). Fall back to Scrydex variants only
    // when TCG Tracking returned no products for this card.
    let enrichedVariants
    if (tcgVariants.products?.length) {
      // Use TCG Tracking products directly; supplement price from Scrydex when
      // TCG Tracking has no price for a given variant.
      const scrydexByKey = {}
      for (const v of (priced.variants || [])) scrydexByKey[v.name] = v.nm
      enrichedVariants = tcgVariants.products
        .map((p) => ({ ...p, nm: p.nm ?? scrydexByKey[p.name] ?? null,
          image: p.image || priced.scrydex_image_url || null }))
    } else {
      // Scrydex fallback: enrich with any TCG Tracking images we got.
      enrichedVariants = (priced.variants || []).map((v) => {
        const n = normV(v.name)
        let img = null
        if (n.includes('masterball')) img = tcgVariants.master_ball
        else if (n.includes('pokeball')) img = tcgVariants.poke_ball
        else img = tcgVariants.normal
        return { ...v, image: img || priced.scrydex_image_url || null }
      })
    }

    // Main displayed image: Scrydex art first (always loads); TCG Tracking CDN
    // images are product-specific and may be missing even when the URL is present.
    const detectedKey = identified.variant === 'master_ball' ? 'master_ball'
                      : identified.variant === 'poke_ball'   ? 'poke_ball'
                      : 'normal'
    const imageUrl = priced.scrydex_image_url || tcgVariants.normal || tcgVariants[detectedKey]

    // Main displayed price: use the TCG Tracking price for the detected variant
    // when available (it's what drives the variant picker). Fall back to Scrydex.
    const detectedVariantRow = enrichedVariants.find((v) => {
      const n = normV(v.name)
      if (identified.variant === 'master_ball') return n.includes('masterball')
      if (identified.variant === 'poke_ball')   return n.includes('pokeball')
      if (identified.variant === 'reverse_holo') return n.includes('reverseholo')
      if (identified.variant === 'holo')         return n.includes('holo') && !n.includes('reverseholo')
      return n === 'normal'
    })
    let estimated_value = detectedVariantRow?.nm ?? priced.estimated_value

    console.log(
      `[scan] "${displayName}" #${identified.card_number || '?'} ` +
        `-> ${priced.scrydex_id || '—'} detected:${identified.variant || '-'} ` +
        `priced:${priced.variant || '-'} $${estimated_value ?? '-'} ` +
        `tcg_mb:${tcgVariants.price_master_ball ?? '-'} | gemini ${tGemini - t0}ms match ${tMatch - tGemini}ms`
    )

    res.json({
      ...identified,
      name: displayName,
      ...priced,
      estimated_value,
      variants: enrichedVariants,
      scrydex_image_url: imageUrl,
      tcg_image_url: tcgVariants[detectedKey] || null,
    })
  } catch (err) {
    console.error('Scan endpoint error:', err.message)
    res.status(502).json({ error: 'Scan failed' })
  }
})

// Per-set product cache: { ts, products } keyed by `${cat}/${setId}`.
// Avoids re-fetching 500+ product payloads for every card in the same set.
const tcgSetCache = new Map()
const TCG_SET_CACHE_TTL = 6 * 60 * 60 * 1000  // 6 h (TCG Tracking updates daily)

async function tcgFetchSetProducts(cat, setId) {
  const key = `${cat}/${setId}`
  const hit = tcgSetCache.get(key)
  if (hit?.products && Date.now() - hit.ts < TCG_SET_CACHE_TTL) return hit.products
  const res = await fetch(`https://openapi.tcgtracking.com/v1/${cat}/sets/${setId}/cards`, { signal: AbortSignal.timeout(12000) })
  if (!res.ok) return null
  const data = await res.json()
  const products = data.products || []
  tcgSetCache.set(key, { ...(hit || {}), ts: Date.now(), products })
  return products
}

async function tcgFetchSetPricing(cat, setId) {
  const key = `${cat}/${setId}`
  const hit = tcgSetCache.get(key)
  if (hit?.pricing && Date.now() - hit.pricingTs < 60 * 60 * 1000) return hit.pricing
  const res = await fetch(`https://openapi.tcgtracking.com/v1/${cat}/sets/${setId}/pricing`, { signal: AbortSignal.timeout(10000) })
  if (!res.ok) return null
  const data = await res.json()
  const pricing = data.prices || {}
  tcgSetCache.set(key, { ...(hit || {}), pricingTs: Date.now(), pricing })
  return pricing
}

// Find all TCG Tracking variant products for a scanned card (normal, MB, PB).
// Returns { normal, master_ball, poke_ball, price_master_ball, price_poke_ball }
// where image values are CDN URLs and price values are TCGPlayer NM market prices.
//
// Strategy: search TCG Tracking for the set by name, fetch & cache its full
// card listing, then filter by collector number.
// Japanese cards search BOTH cat 85 (Pokemon Japan) and cat 3 (English) and
// merge the results — MB/PB variants are Japan-exclusive so cat 85 is needed,
// but pricing and base images often live in cat 3.
async function findTcgTrackingVariants(name, name_en, set_name, card_number, variant) {
  if (!set_name && !name) return {}
  try {
    // Search both categories when: (a) name vs name_en differ (foreign card), or
    // (b) Gemini detected a MB/PB background — those variants are Japan-exclusive
    // even when Gemini returns the English name for both name and name_en fields.
    const isJapanese = (name && name_en && name.trim() !== name_en.trim()) ||
      variant === 'master_ball' || variant === 'poke_ball'
    const q = (set_name || '').trim() || (name_en || name || '')
    const normNum = (n) => String(n || '').split('/')[0].replace(/^0+(\d)/, '$1')
    const wantNum = card_number ? normNum(card_number) : null

    // Search one category: returns { cat, setId, matching } or null.
    async function searchCat(cat) {
      try {
        const sRes = await fetch(
          `https://openapi.tcgtracking.com/v1/${cat}/search?q=${encodeURIComponent(q)}`,
          { signal: AbortSignal.timeout(5000) }
        )
        if (!sRes.ok) return null
        const sData = await sRes.json()
        if (!sData.sets?.length) return null
        const setId = sData.sets[0].id
        const products = await tcgFetchSetProducts(cat, setId)
        if (!products?.length) return null
        const matching = wantNum
          ? products.filter((p) => normNum(String(p.number || '').split('/')[0]) === wantNum)
          : []
        return matching.length ? { cat, setId, matching } : null
      } catch { return null }
    }

    // Always search both cats in parallel — Gemini's variant detection is unreliable
    // so we can't gate the Japanese (cat=85) search on it. Japanese cat=85 adds MB/PB
    // variants that cat=3 never has. Cat=85 wins dedup so Japanese art/pricing takes priority.
    const [ja, en] = await Promise.all([searchCat(85), searchCat(3)])
    const catResults = [ja, en].filter(Boolean)

    if (!catResults.length) return {}

    // Classify a TCG Tracking product name into a Scrydex-compatible variant key.
    function classifyProduct(pn) {
      if (pn.includes('master ball'))                            return { key: 'masterBallReverseHolofoil', label: 'Master Ball' }
      if (pn.includes('poke ball') || pn.includes('poké ball')) return { key: 'pokeBallReverseHolofoil',   label: 'Poké Ball'   }
      if (pn.includes('reverse holo') || pn.includes('reverse-holo')) return { key: 'reverseHolofoil',    label: 'Reverse Holo' }
      if (pn.includes('holo rare') || pn.includes('holo foil') || /\bholo\b/.test(pn)) return { key: 'holofoil', label: 'Holo' }
      return { key: 'normal', label: 'Normal' }
    }

    // Fetch pricing for each result set (cached).
    const pricingBySet = {}
    for (const { cat, setId } of catResults) {
      const k = `${cat}/${setId}`
      if (!pricingBySet[k]) pricingBySet[k] = await tcgFetchSetPricing(cat, setId)
    }

    // Build one row per product; dedupe by variant key (Japanese cat=85 wins over English for
    // the picker, but image slots are filled from any cat so English art can back-fill when
    // Japanese products have no image_url on TCGPlayer).
    const seen = new Set()
    const products = []
    // Backward-compat image slots still used by detectedKey logic in the scan endpoint.
    const imageMap = { name: null }

    for (const { cat, setId, matching } of catResults) {
      const pricing = pricingBySet[`${cat}/${setId}`]
      for (const p of matching) {
        const pn = (p.name || '').toLowerCase()
        const { key, label } = classifyProduct(pn)
        const img = p.image_url || null

        // Fill image slots eagerly — runs even for duplicate keys so English art can
        // back-fill when the Japanese product has no image_url.
        if (img) {
          if (key === 'masterBallReverseHolofoil' && !imageMap.master_ball) imageMap.master_ball = img
          else if (key === 'pokeBallReverseHolofoil' && !imageMap.poke_ball) imageMap.poke_ball = img
          else if (key !== 'masterBallReverseHolofoil' && key !== 'pokeBallReverseHolofoil' && !imageMap.normal) imageMap.normal = img
        }
        if (img && !imageMap.name) {
          imageMap.name = p.name.replace(/\s*-\s*\d{1,3}\/\d{1,3}.*$/, '').replace(/\s*\([^)]+\)\s*$/, '').trim()
        }

        if (seen.has(key)) continue
        seen.add(key)

        const tcgPrices = pricing?.[String(p.id)]?.tcg
        const bucket = tcgPrices ? Object.values(tcgPrices)[0] : null
        const nm = bucket?.market ?? bucket?.low ?? null

        products.push({ name: key, label, nm, image: img })

        // Populate price map slots for backward compat.
        if (key === 'masterBallReverseHolofoil' && nm != null) imageMap.price_master_ball = nm
        else if (key === 'pokeBallReverseHolofoil' && nm != null) imageMap.price_poke_ball = nm
      }
    }

    return { ...imageMap, products }
  } catch {
    return {}
  }
}

async function searchScrydexCards(q) {
  const url = new URL('https://api.scrydex.com/pokemon/v1/cards')
  url.searchParams.set('q', q)
  url.searchParams.set('include', 'prices')
  url.searchParams.set('page_size', '50')
  const json = await fetchScrydex(url.toString())
  return Array.isArray(json?.data) ? json.data : []
}

// Search Scrydex for the identified card, score candidates against the
// scanned name/set/year, and return pricing for the top matches so the
// user can visually confirm (or pick a different print) instead of us
// silently guessing.
async function matchAndPriceCard({ name, name_en, set_name, year, card_number, variant }) {
  try {
    // Prefer the English name — Scrydex is indexed in English, so a Japanese
    // print only matches through its English equivalent.
    const primary = (name_en || name || '').trim()
    const numOnly = card_number
      ? String(card_number).split('/')[0].replace(/[^0-9A-Za-z]/g, '').trim()
      : ''
    const clean = (s) => s.replace(/"/g, ' ').trim()
    const token = (primary.match(/[A-Za-z]{3,}/) || [])[0]

    // Try progressively looser queries; stop at the first that returns anything.
    // Number + name is the most specific anchor — put it first so promo cards
    // (and any card where Gemini misreads the year/set) don't get displaced by
    // a date-filtered query that returns the wrong set's prints.
    const attempts = []
    if (numOnly && token) attempts.push(`number:${numOnly} name:${token}*`)
    if (year && primary) {
      attempts.push(`name:"${clean(primary)}" expansion.release_date:[${year - 1}-01-01 TO ${year + 1}-12-31]`)
    }
    if (primary) attempts.push(`name:"${clean(primary)}"`)
    if (name_en && name && name_en !== name) attempts.push(`name:"${clean(name)}"`)
    // Loose prefix fallback: survives punctuation (& , -GX), OCR noise, and
    // slightly-wrong names by matching on the first significant word.
    if (token) attempts.push(`name:${token}*`)

    let candidates = []
    for (const attempt of attempts) {
      candidates = await searchScrydexCards(attempt)
      if (candidates.length > 0) break
    }
    if (candidates.length === 0) return {}

    const scored = candidates
      .map((card) => ({ card, score: scoreCardMatch(card, { name: primary, set_name, year, card_number: numOnly }) }))
      .filter((s) => s.score > 0)
      .sort((a, b) => b.score - a.score)

    // When any candidate has an exact number match, keep only those —
    // avoids listing every Espeon print when the user scanned Espeon 033/131.
    let filtered = scored
    if (numOnly) {
      const exact = scored.filter((s) => {
        const cn = normNumber(String(s.card.number ?? ''))
        const pn = normNumber(String(s.card.printed_number ?? ''))
        return cn === numOnly || pn === numOnly
      })
      if (exact.length > 0) filtered = exact
    }

    const matches = []
    const seen = new Set()
    for (const { card } of filtered) {
      if (seen.has(card.id)) continue
      seen.add(card.id)

      // Price by the scanned foil pattern (master_ball / poke_ball / ...) so a
      // special print isn't valued as the cheap base card.
      const prices = buildPricesPayload(card, variant)
      const estimatedValue = prices.raw.nm ?? Object.values(prices.raw)[0] ?? null

      matches.push({
        scrydex_id: card.id,
        name: card.name,
        set_name: card.expansion?.name || undefined,
        year: card.expansion?.release_date ? parseInt(card.expansion.release_date.slice(0, 4), 10) : undefined,
        number: card.printed_number || (card.number && card.expansion?.total ? `${card.number}/${card.expansion.total}` : card.number) || undefined,
        image_url: `https://images.scrydex.com/pokemon/${card.id}/large`,
        estimated_value: estimatedValue ?? undefined,
        price_change_pct: prices.price_change_pct ?? undefined,
        variant: prices.variant || undefined,
        // All known foil types for this card — unpriced ones show "$—" in
        // the picker so the user can still select the right finish.
        variants: prices.variants_available || [],
      })
      if (matches.length >= 6) break
    }

    if (matches.length === 0) return {}
    const best = matches[0]

    // Only show alternates from the same set as the best match — stops
    // Sun & Moon Espeons appearing alongside a 2025 Prismatic Espeon.
    const sameSetMatches = best.set_name
      ? matches.filter((m) => m.set_name === best.set_name)
      : matches
    const finalMatches = sameSetMatches.length > 0 ? sameSetMatches : matches

    return {
      scrydex_id: best.scrydex_id,
      scrydex_image_url: best.image_url,
      card_number: best.number,
      estimated_value: best.estimated_value,
      price_change_pct: best.price_change_pct,
      variant: best.variant,
      variants: best.variants,
      matches: finalMatches,
    }
  } catch (err) {
    console.error('Scrydex match error:', err.error || err.message || err)
    return {}
  }
}

// Strip a collector number to its bare comparable form: take the part before a
// "/", drop non-alphanumerics, lowercase, and remove leading zeros so "010",
// "10", and "010/131" all compare equal (the #1 cause of promo mismatches).
function normNumber(n) {
  return String(n ?? '')
    .split('/')[0]
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .replace(/^0+(?=\d)/, '')
}
// Punctuation/space-insensitive name key so "N's Zekrom" == "Ns Zekrom".
function normName(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '')
}

function scoreCardMatch(card, { name, set_name, year, card_number }) {
  let score = 0
  const cardName = normName(card.name)
  const wantName = normName(name)
  if (cardName && cardName === wantName) score += 3
  else if (cardName && wantName && (cardName.includes(wantName) || wantName.includes(cardName))) score += 1

  // Collector number is the most reliable signal when we have it.
  if (card_number) {
    const want = normNumber(card_number)
    const cn = normNumber(card.number)
    const pn = normNumber(card.printed_number)
    if (want && (cn === want || pn === want)) score += 4
  }

  if (set_name && card.expansion?.name) {
    const a = card.expansion.name.toLowerCase()
    const b = set_name.toLowerCase()
    if (a === b) score += 3
    else if (a.includes(b) || b.includes(a)) score += 1
  }

  if (year && card.expansion?.release_date) {
    const cardYear = parseInt(card.expansion.release_date.slice(0, 4), 10)
    if (cardYear === year) score += 2
    else if (Math.abs(cardYear - year) <= 1) score += 1
  }

  // Physical scans should not resolve to digital-only Pokémon TCG Pocket cards
  // (Scrydex ids prefixed "tcgp-"); nudge them down so a real print wins ties.
  if (typeof card.id === 'string' && card.id.startsWith('tcgp-')) score -= 2

  return score
}

// Helper to call the Scrydex API and return the parsed JSON body
function fetchScrydex(targetUrl) {
  return new Promise((resolve, reject) => {
    const options = new URL(targetUrl)
    const reqOptions = {
      hostname: options.hostname,
      path: options.pathname + options.search,
      method: 'GET',
      headers: {
        'X-Api-Key': process.env.SCRYDEX_API_KEY || '',
        'X-Team-ID': process.env.SCRYDEX_TEAM_ID || '',
        'Accept': 'application/json',
      },
    }

    const proxyReq = https.request(reqOptions, (proxyRes) => {
      let body = ''
      proxyRes.on('data', (chunk) => (body += chunk))
      proxyRes.on('end', () => {
        let json
        try {
          json = JSON.parse(body)
        } catch {
          reject({ status: 502, error: 'Invalid JSON from Scrydex' })
          return
        }
        if (proxyRes.statusCode >= 400) {
          reject({ status: proxyRes.statusCode, error: json })
          return
        }
        resolve(json)
      })
    })

    proxyReq.on('error', (err) => reject({ status: 502, error: err.message }))
    proxyReq.end()
  })
}

// Scrydex nests raw/graded prices per card variant (normal, holofoil, etc.) —
// flatten them into the {raw, psa, cgc, ...} shape the frontend expects.
// Also surfaces the NM raw price's trend windows and any real marketplace
// buy links, so the UI can show movers and "buy now" options without a
// separate manual refresh.
function buildPricesPayload(card, preferVariant) {
  const result = {
    raw: {}, psa: {}, cgc: {}, bgs: {}, tag: {}, ace: {}, sgc: {},
    price_change_pct: null,
    trends: null,
    buy_links: [],
    variant: null,
    variants_available: [],
  }
  const variants = Array.isArray(card?.variants) ? card.variants : []
  let trendSource = null
  const buyLinks = []
  const seenMarketplaces = new Set()

  const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '')

  // NM raw price for a variant — used both for the available-variants summary
  // and to let the UI show a "Master Ball $X vs Normal $Y" picker later.
  const variantNm = (v) => {
    const ps = Array.isArray(v?.prices) ? v.prices : []
    const pick = ps.find((p) => p.type === 'raw' && p.condition === 'NM' && (!p.currency || p.currency === 'USD'))
      || ps.find((p) => p.type === 'raw' && (!p.currency || p.currency === 'USD'))
    return pick ? (pick.market ?? pick.mid ?? pick.low ?? null) : null
  }
  const variantImage = (v) => {
    const imgs = Array.isArray(v?.images) ? v.images : v?.images ? [v.images] : []
    const first = imgs[0]
    return first?.large || first?.medium || first?.small || (typeof first === 'string' ? first : null) || v?.image || null
  }
  result.variants_available = variants.map((v) => ({ name: v.name, nm: variantNm(v), image: variantImage(v) }))

  // Pick the variant to price. Honor an explicit pattern hint (e.g. the scan
  // detected a "master ball" / "poke ball" foil) so those special prints get
  // their real value; otherwise fall back to a SINGLE base print. A card can
  // carry rare parallels (stamps, master/poke ball) whose NM runs 50-100x the
  // normal card — looping every variant let those clobber the base and inflated
  // the estimate (Pikachu VMAX read $675 instead of $13), so the default stays
  // the standard print unless we know the physical card is a special foil.
  const BASE = ['normal', 'holofoil', 'reverseholofoil', 'unlimited', 'unlimitedholofoil']
  let variant = null
  const hint = norm(preferVariant)
  if (hint) {
    variant = variants.find((v) => {
      const n = norm(v.name)
      return n.includes(hint) || hint.includes(n)
    })
  }
  if (!variant) variant = variants.find((v) => BASE.includes(norm(v.name))) || variants[0]
  result.variant = variant?.name ?? null

  if (variant) {
    const prices = Array.isArray(variant.prices) ? variant.prices : []
    for (const p of prices) {
      // Skip non-USD entries (every price shown is a bare "$" figure).
      if (p.currency && p.currency !== 'USD') continue

      const value = p.market ?? p.mid ?? p.low ?? null
      if (value == null) continue

      if (p.type === 'raw' && p.condition) {
        result.raw[p.condition.toLowerCase()] = value
        if (p.condition === 'NM' || !trendSource) trendSource = p
      } else if (p.type === 'graded' && p.company && p.grade) {
        const bucket = result[p.company.toLowerCase()]
        // Keep the first (aggregated market) entry per grade — Scrydex also
        // lists individual sale listings that would otherwise overwrite it.
        if (bucket && bucket[p.grade] == null) bucket[p.grade] = value
      }
    }

    for (const m of Array.isArray(variant.marketplaces) ? variant.marketplaces : []) {
      if (!m.purchase_url || seenMarketplaces.has(m.name)) continue
      seenMarketplaces.add(m.name)
      buyLinks.push({ marketplace: m.name, url: m.purchase_url })
    }
  }

  if (trendSource?.trends) {
    result.trends = {
      days_7: trendSource.trends.days_7 ?? null,
      days_14: trendSource.trends.days_14 ?? null,
      days_30: trendSource.trends.days_30 ?? null,
    }
    const trend = trendSource.trends.days_30 ?? trendSource.trends.days_7
    if (trend?.percent_change != null) result.price_change_pct = trend.percent_change
  }
  result.buy_links = buyLinks

  return result
}

// Aggregate a card's daily price history into one market-price point per day
// (averaged across variants) for charting.
async function fetchPriceHistory(game, scrydexId, days) {
  const url = new URL(`https://api.scrydex.com/${game}/v1/cards/${encodeURIComponent(scrydexId)}/price_history`)
  url.searchParams.set('condition', 'NM')
  url.searchParams.set('days', String(days))
  const json = await fetchScrydex(url.toString())
  const days_data = Array.isArray(json?.data) ? json.data : []

  const points = days_data
    .map((d) => {
      const prices = Array.isArray(d.prices) ? d.prices : []
      const markets = prices
        .filter(
          (p) =>
            p.type === 'raw' &&
            p.condition === 'NM' &&
            p.market != null &&
            (!p.currency || p.currency === 'USD')
        )
        .map((p) => p.market)
      if (markets.length === 0) return null
      const avg = markets.reduce((sum, v) => sum + v, 0) / markets.length
      return { date: d.date.replace(/\//g, '-'), price: Math.round(avg * 100) / 100 }
    })
    .filter(Boolean)
    .sort((a, b) => a.date.localeCompare(b.date))

  return points
}

function buildSalesPayload(listings) {
  return listings.map((l) => ({
    platform: l.source || 'unknown',
    date: l.sold_at || '',
    grade: l.grade || '',
    grader: l.company || '',
    price: l.price ?? 0,
    // Surface the marketplace listing link so the row is clickable.
    url: l.url || l.listing_url || l.link || l.purchase_url || '',
    title: l.title || '',
  }))
}

// Scrydex nests PSA population data inside each card variant's `pop_reports`.
// Merge them by grading company so the UI gets one census per company with a
// per-grade count breakdown. (Currently Pokémon PSA English only.)
function buildPopPayload(card) {
  const variants = Array.isArray(card?.variants) ? card.variants : []
  const byCompany = new Map()
  for (const variant of variants) {
    const reports = Array.isArray(variant.pop_reports)
      ? variant.pop_reports
      : variant.pop_reports
      ? [variant.pop_reports]
      : []
    for (const r of reports) {
      if (!r || !r.company) continue
      const entry = byCompany.get(r.company) || { company: r.company, total: 0, grades: new Map() }
      entry.total += r.total || 0
      for (const g of Array.isArray(r.grades) ? r.grades : []) {
        if (g == null || g.grade == null) continue
        const label = String(g.grade)
        entry.grades.set(label, (entry.grades.get(label) || 0) + (g.count || 0))
      }
      byCompany.set(r.company, entry)
    }
  }
  return Array.from(byCompany.values()).map((c) => ({
    company: c.company,
    total: c.total,
    grades: Array.from(c.grades.entries())
      .map(([grade, count]) => ({ grade, count }))
      .sort((a, b) => (parseFloat(b.grade) || 0) - (parseFloat(a.grade) || 0)),
  }))
}

// GET /api/scrydex/prices/:id?game=pokemon
app.get('/api/scrydex/prices/:id', async (req, res) => {
  const { id } = req.params
  const game = gameParam(req)
  const targetUrl = `https://api.scrydex.com/${game}/v1/cards/${encodeURIComponent(id)}?include=prices`
  try {
    const json = await fetchScrydex(targetUrl)
    const card = json?.data ?? json
    res.json(buildPricesPayload(card, req.query.variant))
  } catch (err) {
    console.error('Scrydex prices proxy error:', err.error || err)
    res.status(err.status || 502).json({ error: 'Bad gateway', message: err.error })
  }
})

// GET /r/:id — QR code redirect: resolves Scrydex ID → TCGPlayer buy link
app.get('/r/:id', async (req, res) => {
  const { id } = req.params
  const game = req.query.game || 'pokemon'
  try {
    const targetUrl = `https://api.scrydex.com/${game}/v1/cards/${encodeURIComponent(id)}?include=prices`
    const json = await fetchScrydex(targetUrl)
    const card = json?.data ?? json
    const payload = buildPricesPayload(card, null)
    const buyUrl = payload.buy_links?.[0]?.url
    if (buyUrl) return res.redirect(302, buyUrl)
  } catch {}
  res.redirect(302, `https://www.tcgplayer.com/search/pokemon/product?q=${encodeURIComponent(id)}`)
})

// GET /api/scrydex/history/:id?game=pokemon
app.get('/api/scrydex/history/:id', async (req, res) => {
  const { id } = req.params
  const game = gameParam(req)
  const days = Math.min(parseInt(req.query.days, 10) || 90, 365)
  try {
    const points = await fetchPriceHistory(game, id, days)
    res.json({ points })
  } catch (err) {
    console.error('Scrydex history proxy error:', err.error || err)
    res.status(err.status || 502).json({ error: 'Bad gateway', message: err.error })
  }
})

// GET /api/scrydex/sales/:id?game=pokemon
app.get('/api/scrydex/sales/:id', async (req, res) => {
  const { id } = req.params
  const game = gameParam(req)
  const targetUrl = `https://api.scrydex.com/${game}/v1/cards/${encodeURIComponent(id)}/listings`
  try {
    const json = await fetchScrydex(targetUrl)
    const listings = Array.isArray(json?.data) ? json.data : Array.isArray(json) ? json : []
    res.json(buildSalesPayload(listings))
  } catch (err) {
    console.error('Scrydex sales proxy error:', err.error || err)
    res.status(err.status || 502).json({ error: 'Bad gateway', message: err.error })
  }
})

// GET /api/scrydex/meta/:id?game=pokemon — raw card metadata (rarity, HP, attacks, etc.)
app.get('/api/scrydex/meta/:id', async (req, res) => {
  const { id } = req.params
  const game = gameParam(req)
  const targetUrl = `https://api.scrydex.com/${game}/v1/cards/${encodeURIComponent(id)}`
  try {
    const json = await fetchScrydex(targetUrl)
    const card = json?.data ?? json
    // Pass through the metadata fields the UI needs; strip variants/prices to keep payload small.
    const { variants: _v, ...rest } = card ?? {}
    res.json(rest)
  } catch (err) {
    console.error('Scrydex meta proxy error:', err.error || err)
    res.status(err.status || 502).json({ error: 'Bad gateway', message: err.error })
  }
})

// GET /api/scrydex/pop/:id?game=pokemon — PSA population / census report
app.get('/api/scrydex/pop/:id', async (req, res) => {
  const { id } = req.params
  const game = gameParam(req)
  const targetUrl = `https://api.scrydex.com/${game}/v1/cards/${encodeURIComponent(id)}?include=pop_reports`
  try {
    const json = await fetchScrydex(targetUrl)
    const card = json?.data ?? json
    res.json(buildPopPayload(card))
  } catch (err) {
    console.error('Scrydex pop proxy error:', err.error || err)
    res.status(err.status || 502).json({ error: 'Bad gateway', message: err.error })
  }
})

// GET /api/scrydex/games — list supported brands
app.get('/api/scrydex/games', (_req, res) => {
  res.json(Object.entries(GAMES).map(([id, label]) => ({ id, label })))
})

// GET /api/scrydex/expansions?game=pokemon&q=search
app.get('/api/scrydex/expansions', async (req, res) => {
  const game = gameParam(req)
  const url = new URL(`https://api.scrydex.com/${game}/v1/expansions`)
  if (req.query.q) url.searchParams.set('q', `name:${req.query.q}*`)
  url.searchParams.set('page_size', '100')
  try {
    const json = await fetchScrydex(url.toString())
    const expansions = (Array.isArray(json?.data) ? json.data : [])
      .map((e) => ({
        id: e.id,
        name: e.name,
        series: e.series || undefined,
        release_date: e.release_date || undefined,
        logo: e.logo || undefined,
        total: e.total ?? undefined,
      }))
      .sort((a, b) => (b.release_date || '').localeCompare(a.release_date || ''))
    res.json(expansions)
  } catch (err) {
    console.error('Scrydex expansions proxy error:', err.error || err)
    res.status(err.status || 502).json({ error: 'Bad gateway', message: err.error })
  }
})

// GET /api/scrydex/browse?game=pokemon&expansion=base1&q=search&page=1 — lightweight card list for browsing
app.get('/api/scrydex/browse', async (req, res) => {
  const game = gameParam(req)
  const { expansion, q } = req.query
  if (!expansion) {
    res.status(400).json({ error: 'Missing expansion' })
    return
  }
  const url = new URL(`https://api.scrydex.com/${game}/v1/cards`)
  let query = `expansion.id:${expansion}`
  if (q) query += ` name:${q}*`
  url.searchParams.set('q', query)
  url.searchParams.set('select', 'id,name,number,printed_number,images,expansion')
  url.searchParams.set('page_size', '60')
  url.searchParams.set('page', String(parseInt(req.query.page, 10) || 1))
  try {
    const json = await fetchScrydex(url.toString())
    const cards = (Array.isArray(json?.data) ? json.data : []).map((c) => ({
      scrydex_id: c.id,
      name: c.name,
      number: c.printed_number || c.number || undefined,
      image_url: c.images?.[0]?.small || c.images?.[0]?.large || undefined,
    }))
    res.json({ cards, page: json.page, page_size: json.page_size, total_count: json.total_count })
  } catch (err) {
    console.error('Scrydex browse proxy error:', err.error || err)
    res.status(err.status || 502).json({ error: 'Bad gateway', message: err.error })
  }
})

// GET /api/scrydex/search?game=pokemon&q=Riolu — name search across all sets
// (diagnostic + future name-based add). Returns set, number, and variant names
// so we can see promos / special prints.
app.get('/api/scrydex/search', async (req, res) => {
  const game = gameParam(req)
  const q = (req.query.q || '').toString().trim()
  if (!q) {
    res.status(400).json({ error: 'Missing q' })
    return
  }
  const url = new URL(`https://api.scrydex.com/${game}/v1/cards`)
  url.searchParams.set('q', `name:"${q.replace(/"/g, ' ')}"`)
  url.searchParams.set('include', 'prices')
  url.searchParams.set('page_size', '40')
  try {
    const json = await fetchScrydex(url.toString())
    const cards = (Array.isArray(json?.data) ? json.data : []).map((c) => ({
      scrydex_id: c.id,
      name: c.name,
      set_name: c.expansion?.name || undefined,
      number: c.printed_number || c.number || undefined,
      variants: (Array.isArray(c.variants) ? c.variants : []).map((v) => v.name),
      image_url: c.images?.[0]?.small || undefined,
    }))
    res.json({ cards, total_count: json?.total_count })
  } catch (err) {
    console.error('Scrydex search proxy error:', err.error || err)
    res.status(err.status || 502).json({ error: 'Bad gateway', message: err.error })
  }
})

// ─── Supabase-backed TCG catalog ─────────────────────────────────────────────
// Catalog is populated by scripts/sync-catalog.cjs (run nightly).
// Server only reads via anon key — all writes use the service role key offline.

const SB_URL  = process.env.SUPABASE_URL  || process.env.VITE_SUPABASE_URL  || ''
const SB_ANON = process.env.VITE_SUPABASE_ANON_KEY || ''

async function sbFetch(path, opts = {}) {
  const r = await fetch(`${SB_URL}${path}`, {
    ...opts,
    headers: {
      apikey: SB_ANON,
      Authorization: `Bearer ${SB_ANON}`,
      'Content-Type': 'application/json',
      ...(opts.headers || {}),
    },
  })
  if (!r.ok) throw new Error(`Supabase ${r.status}: ${await r.text()}`)
  return r.json()
}

function rowToResult(r) {
  return {
    id:           String(r.tcgplayer_id),
    name:         r.name,
    set_name:     r.group_name || null,
    image_url:    r.image_url ? `/api/tcg/image/${r.tcgplayer_id}` : null,
    market_price: r.market_price != null ? parseFloat(r.market_price) : null,
  }
}

// Image proxy — TCGPlayer CDN blocks hotlinking; we forward with the right Referer
app.get('/api/tcg/image/:id', async (req, res) => {
  const id = String(req.params.id).replace(/\D/g, '')
  if (!id) { res.status(400).end(); return }
  try {
    const r = await fetch(`https://tcgplayer-cdn.tcgplayer.com/product/${id}_200w.jpg`, {
      headers: {
        Referer: 'https://www.tcgplayer.com/',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
      },
    })
    if (!r.ok) { res.status(404).end(); return }
    res.set('Content-Type', r.headers.get('content-type') || 'image/jpeg')
    res.set('Cache-Control', 'public, max-age=86400')
    r.body.pipe(res)
  } catch (e) {
    console.error('[tcg-image]', e.message)
    res.status(502).end()
  }
})

const UPC_NOISE = /\b(NEW|SEALED|FACTORY\s+SEALED|FREE\s+SHIP(?:PING)?|IN\s+HAND|FAST\s+SHIP|SAME\s+DAY|UNOPENED|FREE\s+RETURN|AUTHENTIC|GENUINE|OFFICIAL|SHIPS\s+FAST)\b.*/i

function cleanEbayTitle(t) {
  return t.replace(/^\s*[\[\(][^\]\)]*[\]\)]\s*/g, '').replace(UPC_NOISE, '').replace(/\s{2,}/g, ' ').trim()
}

// GET /api/tcg/upc/:upc — catalog → upcitemdb → eBay GTIN fallback
// Handles both 12-digit UPC-A (ZXing) and 13-digit EAN-13 (TCGCSV)
// No-store: barcode results must never be served stale from browser cache
app.get('/api/tcg/upc/:upc', async (req, res) => {
  res.set('Cache-Control', 'no-store')
  const upc = String(req.params.upc).replace(/\D/g, '')
  if (upc.length < 8) { res.status(400).json({ error: 'Invalid UPC' }); return }

  // 1. Catalog lookup — try both 12- and 13-digit variants
  const variants = new Set([upc])
  if (upc.length === 12) variants.add('0' + upc)
  if (upc.length === 13 && upc[0] === '0') variants.add(upc.slice(1))
  const orClause = [...variants].map(v => `upc.eq.${v}`).join(',')
  try {
    const rows = await sbFetch(`/rest/v1/tcg_catalog?or=(${orClause})&select=*&limit=1`)
    if (Array.isArray(rows) && rows.length) {
      res.json({ data: rowToResult(rows[0]), source: 'catalog' })
      return
    }
  } catch (e) { console.error('[upc-catalog]', e.message) }

  // 2. UPCitemdb — comprehensive retail database, no API key needed, has product images
  try {
    const udbCtrl = new AbortController()
    const udbTimer = setTimeout(() => udbCtrl.abort(), 5000)
    const udbRes = await fetch(`https://api.upcitemdb.com/prod/trial/lookup?upc=${upc}`, {
      signal: udbCtrl.signal,
      headers: { 'User-Agent': 'CardLoom/1.0 (barcode lookup)' },
    })
    clearTimeout(udbTimer)
    if (udbRes.ok) {
      const udbData = await udbRes.json()
      const item = (udbData.items || [])[0]
      if (item && item.title) {
        const imgs = item.images || []
        const imageUrl = imgs.find(u => u.includes('walmart') || u.includes('target') || u.includes('indigo')) || imgs[0] || null
        res.json({ data: { id: upc, name: item.title, set_name: null, image_url: imageUrl, market_price: null }, source: 'upcitemdb' })
        return
      }
    }
  } catch (e) { console.error('[upc-upcitemdb]', e.message) }

  // 3. eBay GTIN lookup — last resort
  if (process.env.EBAY_APP_ID) {
    try {
      const token = await getEbayToken()
      const url = new URL('https://api.ebay.com/buy/browse/v1/item_summary/search')
      url.searchParams.set('q', upc)
      url.searchParams.set('limit', '1')
      url.searchParams.set('filter', `gtin:{${upc}}`)
      const ebayCtrl = new AbortController()
      const ebayTimer = setTimeout(() => ebayCtrl.abort(), 6000)
      const r = await fetch(url.toString(), {
        signal: ebayCtrl.signal,
        headers: {
          Authorization: `Bearer ${token}`,
          'X-EBAY-C-MARKETPLACE-ID': 'EBAY_US',
          'X-EBAY-C-ENDUSERCTX': 'contextualLocation=country=US',
        },
      })
      clearTimeout(ebayTimer)
      const d = await r.json()
      const item = (d.itemSummaries || [])[0]
      if (item) {
        res.json({
          data: {
            id: item.itemId,
            name: cleanEbayTitle(item.title),
            set_name: null,
            image_url: item.image?.imageUrl || item.thumbnailImages?.[0]?.imageUrl || null,
            market_price: null,
          },
          source: 'ebay',
        })
        return
      }
    } catch (e) { console.error('[upc-ebay]', e.message) }
  }

  res.json({ data: null })
})

// GET /api/tcg/search-smart?q=...&game=...
app.get('/api/tcg/search-smart', async (req, res) => {
  const { q, game = 'pokemon' } = req.query
  if (!q) { res.status(400).json({ error: 'Missing q' }); return }
  const qStr    = String(q).trim()
  const gameStr = String(game)
  console.log(`[search-smart] q="${qStr}" game=${gameStr}`)
  try {
    const rows = await sbFetch('/rest/v1/rpc/search_tcg_catalog', {
      method: 'POST',
      body: JSON.stringify({ query: qStr, game_filter: gameStr, lim: 30 }),
    })
    const data = Array.isArray(rows) ? rows.map(rowToResult) : []
    console.log(`[search-smart] "${qStr}" → ${data.length} results`)
    res.json({ data })
  } catch (e) {
    console.error('[search-smart]', e.message)
    res.status(502).json({ error: 'Search failed' })
  }
})

// ─── eBay product search ─────────────────────────────────────────────────────
let _ebayToken = null
let _ebayTokenExpiry = 0

async function getEbayToken() {
  if (_ebayToken && Date.now() < _ebayTokenExpiry) return _ebayToken
  const appId = process.env.EBAY_APP_ID
  const certId = process.env.EBAY_CERT_ID
  if (!appId || !certId) throw Object.assign(new Error('eBay creds not configured'), { status: 401 })
  const creds = Buffer.from(`${appId}:${certId}`).toString('base64')
  const r = await fetch('https://api.ebay.com/identity/v1/oauth2/token', {
    method: 'POST',
    headers: { Authorization: `Basic ${creds}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=client_credentials&scope=https%3A%2F%2Fapi.ebay.com%2Foauth%2Fapi_scope',
  })
  const d = await r.json()
  if (!d.access_token) {
    console.error('eBay token error:', JSON.stringify(d))
    throw Object.assign(new Error('eBay auth failed: ' + (d.error_description || d.error || JSON.stringify(d))), { status: 502 })
  }
  _ebayToken = d.access_token
  _ebayTokenExpiry = Date.now() + (d.expires_in - 60) * 1000
  return _ebayToken
}

// GET /api/ebay/gtin?upc=... — eBay Catalog API product lookup by GTIN/UPC
// Returns standardized product data (not individual listings), perfect for barcode scan → pick flow
app.get('/api/ebay/gtin', async (req, res) => {
  res.set('Cache-Control', 'no-store')
  const upc = String(req.query.upc || '').replace(/\D/g, '')
  if (upc.length < 8) { res.status(400).json({ error: 'Invalid UPC' }); return }
  if (!process.env.EBAY_APP_ID) { res.status(401).json({ error: 'no_key' }); return }
  try {
    const token = await getEbayToken()
    const url = new URL('https://api.ebay.com/commerce/catalog/v1_beta/product_summary/search')
    url.searchParams.set('gtin', upc)
    url.searchParams.set('limit', '8')
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), 7000)
    const r = await fetch(url.toString(), {
      signal: ctrl.signal,
      headers: {
        Authorization: `Bearer ${token}`,
        'X-EBAY-C-MARKETPLACE-ID': 'EBAY_US',
      },
    })
    clearTimeout(timer)
    const data = await r.json()
    const products = (data.productSummaries || []).map(p => ({
      id: p.epid || upc,
      name: p.title,
      set_name: null,
      image_url: p.image?.imageUrl || null,
      market_price: null,
    }))
    res.json({ data: products })
  } catch (e) {
    console.error('[ebay-gtin]', e.message)
    res.status(502).json({ error: e.message })
  }
})

// GET /api/ebay/sold?q=... — sold price history via eBay Marketplace Insights API
// q = product title (from the selected eBay result); uses same OAuth as Browse API
app.get('/api/ebay/sold', async (req, res) => {
  res.set('Cache-Control', 'max-age=3600')
  const q = String(req.query.q || '').trim()
  if (q.length < 3) { res.status(400).json({ error: 'Missing q' }); return }
  if (!process.env.EBAY_APP_ID) { res.status(401).json({ error: 'no_key' }); return }

  try {
    const token = await getEbayToken()
    const url = new URL('https://api.ebay.com/buy/marketplace_insights/v1_beta/item_sales/search')
    url.searchParams.set('q', q)
    url.searchParams.set('limit', '50')

    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), 8000)
    const r = await fetch(url.toString(), {
      signal: ctrl.signal,
      headers: {
        Authorization: `Bearer ${token}`,
        'X-EBAY-C-MARKETPLACE-ID': 'EBAY_US',
      },
    })
    clearTimeout(timer)
    const text = await r.text()
    let data
    try { data = JSON.parse(text) } catch { console.error('[ebay-sold] bad response:', r.status, text.slice(0, 300)); throw new Error('Bad JSON from eBay') }

    const items = data?.itemSales || []
    const sold = items
      .map(item => ({
        title: item.title || '',
        price: parseFloat(item.lastSoldPrice?.value || '0'),
        date: item.lastSoldDate || '',
        url: item.itemWebUrl || '',
        image: item.image?.imageUrl || item.thumbnailImages?.[0]?.imageUrl || null,
      }))
      .filter(s => s.price > 0)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())

    const avgPrice = sold.length > 0
      ? Math.round((sold.reduce((sum, s) => sum + s.price, 0) / sold.length) * 100) / 100
      : null

    console.log(`[ebay-sold] q="${q}" → ${sold.length} sales, avg $${avgPrice}`)
    res.json({ avg_price: avgPrice, count: sold.length, recent: sold.slice(0, 5) })
  } catch (e) {
    console.error('[ebay-sold]', e.message)
    res.status(502).json({ error: e.message })
  }
})

// GET /api/ebay/search?q=... — title OR UPC (8-14 digits auto-detected)
app.get('/api/ebay/search', async (req, res) => {
  const { q } = req.query
  if (!q || String(q).trim().length < 2) { res.status(400).json({ error: 'Missing q' }); return }
  if (!process.env.EBAY_APP_ID) { res.status(401).json({ error: 'no_key' }); return }
  try {
    const token = await getEbayToken()
    const qStr = String(q).trim()
    const isUpc = /^\d{8,14}$/.test(qStr)
    const url = new URL('https://api.ebay.com/buy/browse/v1/item_summary/search')
    url.searchParams.set('q', qStr)
    url.searchParams.set('limit', '12')
    if (isUpc) {
      // eBay stores UPCs as EAN-13 (13 digits). ZXing returns 12-digit UPC-A — pad it.
      const gtin = qStr.length === 12 ? '0' + qStr : qStr
      url.searchParams.set('filter', `gtin:{${gtin}}`)
    }
    const r = await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${token}`,
        'X-EBAY-C-MARKETPLACE-ID': 'EBAY_US',
        'X-EBAY-C-ENDUSERCTX': 'contextualLocation=country=US',
      },
    })
    const data = await r.json()
    let items = (data.itemSummaries || []).map(item => ({
      id: item.itemId,
      name: item.title,
      image_url: item.thumbnailImages?.[0]?.imageUrl || item.image?.imageUrl || null,
      price: item.price?.value ? parseFloat(item.price.value) : null,
      condition: item.condition || null,
    }))

    res.json({ data: items })
  } catch (err) {
    console.error('eBay search error:', err)
    res.status(err.status || 502).json({ error: err.message })
  }
})

// GET /api/scrydex/sealed?game=pokemon&q=booster+box&page=1
// Proxies Scrydex's sealed products endpoint — booster boxes, ETBs, packs, etc.
app.get('/api/scrydex/sealed', async (req, res) => {
  const game = gameParam(req)
  const { q, page = '1' } = req.query
  const url = new URL(`https://api.scrydex.com/${game}/v1/sealed`)
  if (q) url.searchParams.set('q', q)
  url.searchParams.set('include', 'prices')
  url.searchParams.set('page_size', '20')
  url.searchParams.set('page', String(page))
  try {
    const json = await fetchScrydex(url.toString())
    const items = Array.isArray(json?.data) ? json.data : []
    res.json({
      data: items.map((p) => ({
        id: p.id,
        name: p.name,
        set_name: p.expansion?.name || null,
        image_url: p.image_url || p.images?.large || null,
        market_price: p.prices?.market ?? p.prices?.nm ?? null,
        low_price: p.prices?.low ?? null,
        buy_url: p.buy_links?.[0]?.url || null,
      })),
      total: json?.total ?? items.length,
    })
  } catch (err) {
    console.error('sealed proxy error:', err)
    res.status(500).json({ error: 'Failed to fetch sealed products' })
  }
})

// ─── Sealed product photo identification (Gemini) ────────────────────────────
// POST /api/sealed/identify  body: { image: base64, mime: 'image/jpeg' }
// Returns { name } — the product name to feed into TCGPlayer search
app.post('/api/sealed/identify', async (req, res) => {
  const { image, mime = 'image/jpeg' } = req.body || {}
  if (!image) { res.status(400).json({ error: 'Missing image' }); return }
  if (!process.env.GEMINI_API_KEY) { res.status(401).json({ error: 'No Gemini key' }); return }
  try {
    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [
              {
                text: 'You are identifying a trading card game sealed product from a photo. ' +
                      'Look at the box or packaging and extract the full product name exactly as printed, ' +
                      'including the game name, set name, and product type (e.g. "Pokémon Twilight Masquerade Elite Trainer Box" ' +
                      'or "Magic: The Gathering Bloomburrow Booster Box"). ' +
                      'Return ONLY a JSON object with a single field: { "name": "..." }. ' +
                      'If you cannot identify a TCG sealed product in the image, return { "name": "" }.',
              },
              { inline_data: { mime_type: mime, data: image } },
            ],
          }],
          generationConfig: { responseMimeType: 'application/json' },
        }),
      }
    )
    const json = await geminiRes.json()
    if (!geminiRes.ok) { console.error('Gemini sealed ID error:', json); res.status(502).json({ error: 'Gemini error' }); return }
    const text = json.candidates?.[0]?.content?.parts?.[0]?.text || '{}'
    const parsed = JSON.parse(text)
    res.json({ name: parsed.name || '' })
  } catch (err) {
    console.error('sealed/identify error:', err)
    res.status(500).json({ error: 'Internal error' })
  }
})

// ─── eBay completed sold listings (Finding API) ───────────────────────────────
// GET /api/ebay/sold?q=pokemon+booster+box&limit=10
// Returns real transaction prices from completed eBay sales
app.get('/api/ebay/sold', async (req, res) => {
  const { q, limit = '10' } = req.query
  if (!q || String(q).trim().length < 2) { res.status(400).json({ error: 'Missing q' }); return }
  const appId = process.env.EBAY_APP_ID
  if (!appId) { res.status(401).json({ error: 'No eBay key' }); return }
  try {
    const url = new URL('https://svcs.ebay.com/services/search/FindingService/v1')
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
    // Build query string manually — Finding API is picky about param encoding
    const params = new URLSearchParams({
      'OPERATION-NAME': 'findCompletedItems',
      'SERVICE-VERSION': '1.0.0',
      'SECURITY-APPNAME': appId,
      'RESPONSE-DATA-FORMAT': 'JSON',
      'keywords': String(q).trim(),
      'itemFilter(0).name': 'SoldItemsOnly',
      'itemFilter(0).value': 'true',
      'itemFilter(1).name': 'EndTimeFrom',
      'itemFilter(1).value': weekAgo,
      'paginationInput.entriesPerPage': String(Math.min(parseInt(limit) || 10, 20)),
      'sortOrder': 'EndTimeSoonest',
    })
    const r = await fetch(`${url.toString()}?${params.toString()}`, {
      headers: { 'User-Agent': 'CardLoom/1.0 (compatible; Node.js)' },
      signal: AbortSignal.timeout(8000),
    })
    const text = await r.text()
    let data
    try { data = JSON.parse(text) } catch {
      console.error('eBay Finding API non-JSON:', r.status, text.slice(0, 200))
      res.status(502).json({ error: 'eBay API returned unexpected response' }); return
    }
    const items = data?.findCompletedItemsResponse?.[0]?.searchResult?.[0]?.item || []
    const sales = items
      .map(i => ({
        title: i.title?.[0] || '',
        price: parseFloat(i.sellingStatus?.[0]?.currentPrice?.[0]?.['__value__'] || '0'),
        end_time: i.listingInfo?.[0]?.endTime?.[0] || null,
        url: i.viewItemURL?.[0] || null,
      }))
      .filter(i => i.price > 0)
    const avg = sales.length ? sales.reduce((s, i) => s + i.price, 0) / sales.length : null
    res.json({ sales, avg, count: sales.length })
  } catch (err) {
    console.error('eBay sold error:', err)
    res.status(502).json({ error: 'eBay sold lookup failed' })
  }
})

// Fallback: serve index.html for all non-API routes (SPA routing)
app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'))
})

app.listen(PORT, () => {
  console.log(`CardLoom server running on port ${PORT}`)
})
