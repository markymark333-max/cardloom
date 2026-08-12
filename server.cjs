const express = require('express')
const path = require('path')
const https = require('https')

const app = express()
const PORT = process.env.PORT || 3000

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

// Gemini scan is the expensive one (vision + up to 5 Scrydex searches). 60/min
// comfortably covers batch scanning (a person captures ~1 card every few
// seconds) while still bounding a scripted client's Gemini bill. The read-only
// Scrydex proxy can run looser so public browsing works.
app.use('/api/scan', rateLimit(60))
app.use('/api/scrydex', rateLimit(150))

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
    // The English name of the card. For a Japanese/foreign print, this is the
    // official English equivalent (Scrydex is indexed in English) — critical
    // for matching cards photographed in another language.
    name_en: { type: 'STRING' },
    set_name: { type: 'STRING' },
    year: { type: 'INTEGER' },
    // The collector/card number printed on the card, e.g. "143/236" or "143".
    // This is the single strongest signal for matching a specific print.
    card_number: { type: 'STRING' },
    // The foil/parallel pattern, read from the BACKGROUND behind the artwork.
    // "master_ball" and "poke_ball" (repeating Master Ball / Poké Ball symbols)
    // are worth many times the plain print, so getting this right matters.
    variant: { type: 'STRING' },
  },
  required: ['name', 'set_name', 'year'],
}

// POST /api/scan — identify a trading card from a photo via Gemini vision
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
              'If the card is Japanese or any non-English language, still put the printed name in "name", ' +
              'and ALSO put the official English name of the exact same card in "name_en" (translate it). ' +
              'For English cards, set name_en to the same value as name. ' +
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
      res.status(502).json({ error: 'AI scan failed' })
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

    const priced = await matchAndPriceCard(identified)
    const tMatch = Date.now()
    // Timing so we can watch scan latency in the Railway logs.
    console.log(
      `[scan] "${identified.name_en || identified.name}" | gemini ${tGemini - t0}ms | ` +
        `match ${tMatch - tGemini}ms | total ${tMatch - t0}ms | ${priced.scrydex_id ? 'matched' : 'no-match'}`
    )
    // Show the English name in the UI when we have one (it's what matched).
    const displayName = identified.name_en || identified.name
    res.json({ ...identified, name: displayName, ...priced })
  } catch (err) {
    console.error('Scan endpoint error:', err.message)
    res.status(502).json({ error: 'AI scan failed' })
  }
})

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
    const attempts = []
    if (year && primary) {
      attempts.push(`name:"${clean(primary)}" expansion.release_date:[${year - 1}-01-01 TO ${year + 1}-12-31]`)
    }
    if (primary) attempts.push(`name:"${clean(primary)}"`)
    if (name_en && name && name_en !== name) attempts.push(`name:"${clean(name)}"`)
    // Collector number is the strongest anchor — pair it with a name token.
    if (numOnly && token) attempts.push(`number:${numOnly} name:${token}*`)
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

    const matches = []
    const seen = new Set()
    for (const { card } of scored) {
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
        image_url: card.images?.[0]?.large || undefined,
        estimated_value: estimatedValue ?? undefined,
        price_change_pct: prices.price_change_pct ?? undefined,
        variant: prices.variant || undefined,
      })
      if (matches.length >= 6) break
    }

    if (matches.length === 0) return {}
    const best = matches[0]

    return {
      scrydex_id: best.scrydex_id,
      scrydex_image_url: best.image_url,
      card_number: best.number,
      estimated_value: best.estimated_value,
      price_change_pct: best.price_change_pct,
      variant: best.variant,
      matches,
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
  result.variants_available = variants.map((v) => ({ name: v.name, nm: variantNm(v) }))

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

// Fallback: serve index.html for SPA routing
app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'))
})

app.listen(PORT, () => {
  console.log(`CardLoom server running on port ${PORT}`)
})
