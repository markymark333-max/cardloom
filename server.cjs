const express = require('express')
const path = require('path')
const https = require('https')

const app = express()
const PORT = process.env.PORT || 3000

// Serve static files from dist/
app.use(express.static(path.join(__dirname, 'dist')))

// Helper to proxy a request to Scrydex
function proxyScrydex(targetUrl, req, res) {
  const options = new URL(targetUrl)
  const reqOptions = {
    hostname: options.hostname,
    path: options.pathname + options.search,
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${process.env.SCRYDEX_API_KEY || ''}`,
      'X-Team-ID': process.env.SCRYDEX_TEAM_ID || '',
      'Accept': 'application/json',
    },
  }

  const proxyReq = https.request(reqOptions, (proxyRes) => {
    res.status(proxyRes.statusCode || 200)
    res.set('Content-Type', 'application/json')
    proxyRes.pipe(res)
  })

  proxyReq.on('error', (err) => {
    console.error('Scrydex proxy error:', err.message)
    res.status(502).json({ error: 'Bad gateway', message: err.message })
  })

  proxyReq.end()
}

// GET /api/scrydex/prices/:id
app.get('/api/scrydex/prices/:id', (req, res) => {
  const { id } = req.params
  const targetUrl = `https://api.scrydex.com/v1/cards/${encodeURIComponent(id)}/prices`
  proxyScrydex(targetUrl, req, res)
})

// GET /api/scrydex/sales/:id
app.get('/api/scrydex/sales/:id', (req, res) => {
  const { id } = req.params
  const targetUrl = `https://api.scrydex.com/v1/cards/${encodeURIComponent(id)}/sales`
  proxyScrydex(targetUrl, req, res)
})

// Fallback: serve index.html for SPA routing
app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'))
})

app.listen(PORT, () => {
  console.log(`CardLoom server running on port ${PORT}`)
})
