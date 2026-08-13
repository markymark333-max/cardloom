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

function buildZpl(card: Card, qrUrl: string): string {
  const name = (card.name ?? '').slice(0, 28).toUpperCase()
  const setLine = [card.card_set, card.card_number].filter(Boolean).join(' #').slice(0, 30)
  const condLine = [card.condition, card.year].filter(Boolean).join(' · ').slice(0, 20)
  const price = card.estimated_value != null ? `$${card.estimated_value.toFixed(2)}` : 'NO PRICE'
  const game = (card.game ?? 'pokemon').toUpperCase().slice(0, 12)

  // Label: 2" wide × 1" tall at 203 dpi = 406 × 203 dots
  // QR block on the left, text on the right.
  return [
    '^XA',
    '^PW406',          // print width: 2"
    '^LL203',          // label length: 1"
    '^CI28',           // UTF-8
    '^LH0,0',
    // ── QR code ──────────────────────────────────────────────
    '^FO8,8',
    '^BQN,2,4',
    `^FDQA,${qrUrl}^FS`,
    // ── Branding ─────────────────────────────────────────────
    '^FO130,6',
    '^A0N,10,10',
    '^FDCARDLOOM^FS',
    // ── Card name ────────────────────────────────────────────
    '^FO130,22',
    '^A0N,16,14',
    `^FD${name}^FS`,
    // ── Set / number ─────────────────────────────────────────
    ...(setLine
      ? ['^FO130,44', '^A0N,11,10', `^FD${setLine}^FS`]
      : []),
    // ── Condition / year ─────────────────────────────────────
    ...(condLine
      ? ['^FO130,60', '^A0N,11,10', `^FD${condLine}^FS`]
      : []),
    // ── Game label ───────────────────────────────────────────
    '^FO130,76',
    '^A0N,10,10',
    `^FD${game}^FS`,
    // ── Price ────────────────────────────────────────────────
    '^FO268,50',
    '^A0N,28,28',
    `^FD${price}^FS`,
    '^XZ',
  ].join('\n')
}

function qrUrl(card: Card): string {
  if (card.scrydex_id) return `https://scrydex.com/cards/${card.scrydex_id}`
  const q = encodeURIComponent(card.name ?? '')
  return `https://www.tcgplayer.com/search/pokemon/product?q=${q}&view=grid`
}

async function genQrDataUrl(url: string): Promise<string> {
  return QRCode.toDataURL(url, { width: 120, margin: 1, color: { dark: '#000', light: '#fff' } })
}

const BP_URL = 'http://localhost:9100'

async function getZebraDevices(): Promise<ZebraDevice[]> {
  const res = await fetch(`${BP_URL}/available`, { signal: AbortSignal.timeout(3000) })
  const data = await res.json()
  return (data.printer ?? []) as ZebraDevice[]
}

async function sendZpl(device: ZebraDevice, zpl: string): Promise<void> {
  const res = await fetch(`${BP_URL}/write`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ device: { name: device.name, uid: device.uid, connection: device.connection }, data: zpl }),
    signal: AbortSignal.timeout(5000),
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
  const zpl = buildZpl(card, qrUrl(card))
  const hasBeenMounted = useRef(false)

  useEffect(() => {
    if (hasBeenMounted.current) return
    hasBeenMounted.current = true

    genQrDataUrl(qrUrl(card)).then(setQrDataUrl)

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
            <div
              className="bg-white rounded-lg overflow-hidden"
              style={{ width: '100%', aspectRatio: '2 / 1', maxWidth: 320, margin: '0 auto' }}
            >
              <div className="flex h-full p-2 gap-2">
                {/* QR preview */}
                <div className="flex-shrink-0 flex items-center justify-center" style={{ width: 72, height: 72, marginTop: 4 }}>
                  {qrDataUrl ? (
                    <img src={qrDataUrl} alt="QR code" className="w-full h-full object-contain" />
                  ) : (
                    <div className="w-16 h-16 bg-gray-200 rounded animate-pulse" />
                  )}
                </div>
                {/* Text preview */}
                <div className="flex-1 flex flex-col justify-between text-black overflow-hidden py-0.5">
                  <div>
                    <p className="text-[6px] text-gray-400 font-medium tracking-widest leading-none">CARDLOOM</p>
                    <p className="text-[10px] font-bold leading-tight mt-0.5 truncate">{card.name.toUpperCase()}</p>
                    {setLine && <p className="text-[7px] text-gray-600 leading-tight truncate">{setLine}</p>}
                    {(card.condition || card.year) && (
                      <p className="text-[7px] text-gray-600 leading-tight">
                        {[card.condition, card.year].filter(Boolean).join(' · ')}
                      </p>
                    )}
                    <p className="text-[7px] text-gray-400 leading-tight">{(card.game ?? 'POKEMON').toUpperCase()}</p>
                  </div>
                  <p className="text-[16px] font-bold text-black leading-none">{price}</p>
                </div>
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
