import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { X, Printer, Download, CheckCircle, AlertCircle, Loader2, RefreshCw } from 'lucide-react'
import QRCode from 'qrcode'

interface Card {
  id: string
  name: string
  card_set?: string
  card_number?: string
  year?: number
  condition?: string
  scrydex_id?: string
  estimated_value?: number
  game?: string
}

interface PrintLabelDialogProps {
  card: Card
  onClose: () => void
}

interface ZebraDevice {
  name: string
  uid: string
  connection: string
  deviceType?: string
}

function buildZpl(card: Card, buyUrl: string): string {
  const name = (card.name ?? '').toUpperCase()
  const setLine = [card.card_set, card.card_number].filter(Boolean).join(' #')
  const condLine = [card.condition, card.year].filter(Boolean).join(' · ')
  const price = card.estimated_value != null ? `$${card.estimated_value.toFixed(2)}` : 'NO PRICE'
  const game = (card.game ?? 'pokemon').toUpperCase() + ' TCG'

  // 2" wide x 1" tall at 203 dpi = 406 x 203 dots
  // Card info top, CARDLOOM badge centered in middle, big price + QR bottom
  return [
    '^XA',
    '^PW406',
    '^LL203',
    '^CI28',
    '^LH0,0',
    // ── Card name ─────────────────────────────────────────────
    '^FO8,12',
    '^FB390,1,0,L,0',
    '^A0N,22,20',
    `^FD${name}^FS`,
    // ── Set / number ──────────────────────────────────────────
    ...(setLine
      ? ['^FO8,38', '^FB390,1,0,L,0', '^A0N,13,10', `^FD${setLine}^FS`]
      : []),
    // ── Condition · year ──────────────────────────────────────
    ...(condLine
      ? ['^FO8,55', '^FB390,1,0,L,0', '^A0N,13,10', `^FD${condLine}^FS`]
      : []),
    // ── CARDLOOM badge centered (badge=144 wide, text=128, x=131 centers on 406) ─
    '^FO131,76',
    '^GB144,26,26^FS',
    '^FO139,80',
    '^FR',
    '^A0N,18,16',
    '^FDCARDLOOM^FS',
    // ── Divider ───────────────────────────────────────────────
    '^FO6,108',
    '^GB394,1,2^FS',
    // ── Price (big) ───────────────────────────────────────────
    '^FO8,114',
    '^FB290,1,0,L,0',
    '^A0N,44,38',
    `^FD${price}^FS`,
    // ── Game label ────────────────────────────────────────────
    '^FO8,180',
    '^A0N,12,11',
    `^FD${game}^FS`,
    // ── QR code (starts just below divider, mag 2 = ~66 dots tall) ─
    '^FO308,112',
    '^BQN,2,2',
    `^FDQA,${buyUrl}^FS`,
    '^XZ',
  ].join('\n')
}

function fallbackQrUrl(card: Card): string {
  if (card.scrydex_id) return `https://scrydex.com/cards/${card.scrydex_id}`
  const q = encodeURIComponent(card.name ?? '')
  return `https://www.tcgplayer.com/search/pokemon/product?q=${q}&view=grid`
}

async function fetchBuyUrl(card: Card): Promise<string> {
  if (!card.scrydex_id) return fallbackQrUrl(card)
  try {
    const res = await fetch(`/api/scrydex/prices/${card.scrydex_id}`, { signal: AbortSignal.timeout(5000) })
    const data = await res.json()
    return data.buy_links?.[0]?.url || fallbackQrUrl(card)
  } catch {
    return fallbackQrUrl(card)
  }
}

async function genQrDataUrl(url: string): Promise<string> {
  return QRCode.toDataURL(url, { width: 120, margin: 1, color: { dark: '#000', light: '#fff' } })
}

// Browser Print exposes https://localhost:9101 for HTTPS origins (avoids mixed-content block)
// and http://localhost:9100 for HTTP origins. Try secure first, fall back to plain.
async function bpFetch(path: string, init?: RequestInit): Promise<Response> {
  const urls = ['https://localhost:9101', 'http://localhost:9100']
  let lastErr: unknown
  for (const base of urls) {
    try {
      const res = await fetch(`${base}${path}`, { ...init, signal: AbortSignal.timeout(3000) })
      return res
    } catch (e) {
      lastErr = e
    }
  }
  throw lastErr
}

async function getZebraDevices(): Promise<ZebraDevice[]> {
  const res = await bpFetch('/available')
  const data = await res.json()
  return (data.printer ?? []) as ZebraDevice[]
}

async function sendZpl(device: ZebraDevice, zpl: string): Promise<void> {
  // text/plain avoids CORS preflight; Browser Print parses the body as JSON regardless
  const res = await bpFetch('/write', {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
    body: JSON.stringify({ device, data: zpl }),
  })
  if (!res.ok) throw new Error(`Browser Print error ${res.status}`)
}

export function PrintLabelDialog({ card, onClose }: PrintLabelDialogProps) {
  const [devices, setDevices] = useState<ZebraDevice[]>([])
  const [selectedUid, setSelectedUid] = useState<string>('')
  const [bpStatus, setBpStatus] = useState<'checking' | 'connected' | 'unavailable'>('checking')
  const [printing, setPrinting] = useState(false)
  const [printResult, setPrintResult] = useState<'success' | 'error' | null>(null)
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null)
  const [buyUrl, setBuyUrl] = useState<string>(fallbackQrUrl(card))
  const hasBeenMounted = useRef(false)

  const zpl = buildZpl(card, buyUrl)

  useEffect(() => {
    if (hasBeenMounted.current) return
    hasBeenMounted.current = true

    fetchBuyUrl(card).then((url) => {
      setBuyUrl(url)
      genQrDataUrl(url).then(setQrDataUrl)
    })

    getZebraDevices()
      .then((devs) => {
        setDevices(devs)
        if (devs.length) setSelectedUid(devs[0].uid)
        setBpStatus(devs.length ? 'connected' : 'unavailable')
      })
      .catch(() => setBpStatus('unavailable'))
  }, [])

  async function handlePrint() {
    const device = devices.find((d) => d.uid === selectedUid)
    if (!device) return
    setPrinting(true)
    setPrintResult(null)
    try {
      await sendZpl(device, zpl)
      setPrintResult('success')
    } catch {
      setPrintResult('error')
    } finally {
      setPrinting(false)
    }
  }

  function handleDownloadZpl() {
    const blob = new Blob([zpl], { type: 'text/plain' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `${(card.name ?? 'card').replace(/[^a-z0-9]/gi, '_')}_label.zpl`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  async function handleRefreshDevices() {
    setBpStatus('checking')
    try {
      const devs = await getZebraDevices()
      setDevices(devs)
      if (devs.length && !devs.find((d) => d.uid === selectedUid)) setSelectedUid(devs[0].uid)
      setBpStatus(devs.length ? 'connected' : 'unavailable')
    } catch {
      setBpStatus('unavailable')
    }
  }

  const selectedDevice = devices.find((d) => d.uid === selectedUid)
  const price = card.estimated_value != null ? `$${card.estimated_value.toFixed(2)}` : '—'
  const setLine = [card.card_set, card.card_number].filter(Boolean).join(' #')

  return createPortal(
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-navy-800 rounded-2xl border border-white/10 w-full max-w-md shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-white/5">
          <div className="flex items-center gap-2">
            <Printer size={18} className="text-gold" />
            <h2 className="font-heading font-semibold text-white">Print Label</h2>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-white transition-colors">
            <X size={18} />
          </button>
        </div>

        <div className="p-5 space-y-5">
          {/* Label preview */}
          <div>
            <p className="text-xs text-gray-500 uppercase tracking-widest mb-2">Preview · 2″ × 1″</p>
            {/* 2:1 aspect ratio, 320px wide = ~160px tall */}
            <div
              className="bg-white rounded-lg overflow-hidden relative"
              style={{ width: '100%', aspectRatio: '2 / 1', maxWidth: 320, margin: '0 auto', fontFamily: "'Courier New', monospace" }}
            >
              {/* ── Card name ── */}
              <p className="absolute text-black truncate"
                style={{ left: 6, top: 9, right: 6, fontSize: 13, lineHeight: 1.1, fontWeight: 600 }}>
                {card.name.toUpperCase()}
              </p>

              {/* ── Set / number ── */}
              {setLine && (
                <p className="absolute truncate" style={{ left: 6, top: 28, right: 6, fontSize: 8, color: '#666' }}>
                  {setLine}
                </p>
              )}

              {/* ── Condition · year ── */}
              {(card.condition || card.year) && (
                <p className="absolute truncate" style={{ left: 6, top: 40, right: 6, fontSize: 8, color: '#666' }}>
                  {[card.condition, card.year].filter(Boolean).join(' · ')}
                </p>
              )}

              {/* ── CARDLOOM badge centered ── */}
              <div className="absolute flex items-center justify-center"
                style={{ left: '50%', transform: 'translateX(-50%)', top: 54, background: '#000', padding: '2px 10px', borderRadius: 2, whiteSpace: 'nowrap' }}>
                <span style={{ fontSize: 10, color: '#fff', fontWeight: 700, letterSpacing: '0.1em' }}>CARDLOOM</span>
              </div>

              {/* ── Divider ── */}
              <div className="absolute bg-gray-300" style={{ left: 4, right: 4, top: 76, height: 0.5 }} />

              {/* ── Price ── */}
              <p className="absolute font-bold text-black"
                style={{ left: 6, top: 80, fontSize: 30, lineHeight: 1, letterSpacing: '-0.5px' }}>
                {price}
              </p>

              {/* ── Game label ── */}
              <p className="absolute" style={{ left: 6, bottom: 4, fontSize: 7, color: '#888', letterSpacing: '0.08em' }}>
                {(card.game ?? 'POKEMON').toUpperCase()} TCG
              </p>

              {/* ── QR code ── */}
              <div className="absolute" style={{ right: 6, top: 76, width: 52, height: 52 }}>
                {qrDataUrl ? (
                  <img src={qrDataUrl} alt="QR code" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                ) : (
                  <div style={{ width: '100%', height: '100%', background: '#eee', borderRadius: 2 }} />
                )}
              </div>
            </div>
          </div>

          {/* Printer status */}
          <div className="bg-navy-900 rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {bpStatus === 'checking' && <Loader2 size={14} className="text-gray-400 animate-spin" />}
                {bpStatus === 'connected' && <CheckCircle size={14} className="text-green-400" />}
                {bpStatus === 'unavailable' && <AlertCircle size={14} className="text-yellow-400" />}
                <span className="text-sm text-gray-300">
                  {bpStatus === 'checking' && 'Detecting printer…'}
                  {bpStatus === 'connected' && `${devices.length} printer${devices.length !== 1 ? 's' : ''} found`}
                  {bpStatus === 'unavailable' && 'Zebra Browser Print not detected'}
                </span>
              </div>
              {bpStatus !== 'checking' && (
                <button
                  onClick={handleRefreshDevices}
                  className="text-gray-500 hover:text-white transition-colors"
                  title="Refresh"
                >
                  <RefreshCw size={14} />
                </button>
              )}
            </div>

            {bpStatus === 'connected' && devices.length > 1 && (
              <select
                value={selectedUid}
                onChange={(e) => setSelectedUid(e.target.value)}
                className="w-full bg-navy-800 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-gold/50"
              >
                {devices.map((d) => (
                  <option key={d.uid} value={d.uid}>{d.name}</option>
                ))}
              </select>
            )}

            {bpStatus === 'connected' && devices.length === 1 && (
              <p className="text-xs text-gray-500 truncate">{selectedDevice?.name}</p>
            )}

            {bpStatus === 'unavailable' && (
              <p className="text-xs text-gray-500 leading-relaxed">
                Install{' '}
                <a
                  href="https://www.zebra.com/us/en/support-downloads/printer-software/browser-print.html"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-gold underline"
                >
                  Zebra Browser Print
                </a>{' '}
                and make sure it's running, then refresh. Or download the ZPL file and send it directly to your ZD410.
              </p>
            )}
          </div>

          {/* Print result */}
          {printResult === 'success' && (
            <div className="flex items-center gap-2 text-green-400 text-sm bg-green-900/20 rounded-xl px-4 py-3">
              <CheckCircle size={16} />
              Label sent to printer.
            </div>
          )}
          {printResult === 'error' && (
            <div className="flex items-center gap-2 text-red-400 text-sm bg-red-900/20 rounded-xl px-4 py-3">
              <AlertCircle size={16} />
              Print failed. Check that the printer is on and loaded.
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3">
            <button
              onClick={handleDownloadZpl}
              className="flex items-center gap-2 border border-white/10 text-gray-300 px-4 py-2.5 rounded-xl text-sm hover:border-white/20 transition-colors"
            >
              <Download size={14} />
              Download ZPL
            </button>
            <button
              onClick={handlePrint}
              disabled={bpStatus !== 'connected' || !selectedDevice || printing}
              className="flex-1 flex items-center justify-center gap-2 bg-gold text-navy-900 font-semibold px-4 py-2.5 rounded-xl text-sm hover:opacity-90 disabled:opacity-40 transition-opacity"
            >
              {printing ? (
                <><Loader2 size={14} className="animate-spin" /> Printing…</>
              ) : (
                <><Printer size={14} /> Print to ZD410</>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  )
}
