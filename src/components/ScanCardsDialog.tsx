import { useState, useRef, useCallback, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { X, Camera, Upload, ScanLine, ChevronLeft, Search, Layers, Check } from 'lucide-react'
import { PriceTicker } from './PriceTicker'
import { CardDetailDialog } from './CardDetailDialog'

interface CardVariant {
  name: string
  nm: number
}

interface ScrydexMatch {
  scrydex_id: string
  name: string
  set_name?: string
  year?: number
  number?: string
  image_url?: string
  estimated_value?: number
  price_change_pct?: number
  variant?: string
  variants?: CardVariant[]
}

// Friendly label for a Scrydex variant key (e.g. masterBallReverseHolofoil).
function variantLabel(name: string): string {
  const n = name.toLowerCase().replace(/[^a-z]/g, '')
  if (n.includes('masterball')) return 'Master Ball'
  if (n.includes('pokeball')) return 'Poké Ball'
  if (n.includes('friendball')) return 'Friend Ball'
  if (n.includes('reverseholo')) return 'Reverse Holo'
  if (n.includes('holo')) return 'Holo'
  if (n === 'normal') return 'Normal'
  return name
}

interface IdentifiedCard {
  name: string
  set_name?: string
  year?: number
  scrydex_id?: string
  scrydex_image_url?: string
  card_number?: string
  estimated_value?: number
  price_change_pct?: number
  variant?: string
  variants?: CardVariant[]
  matches?: ScrydexMatch[]
}

interface ScanCardsDialogProps {
  onClose: () => void
  onCardFound?: (cardData: IdentifiedCard & { image?: string; backImage?: string }) => void
  /** Bulk add from the "Scan multiple" flow. Each entry carries everything the
      portfolio insert needs plus the user-chosen quantity. */
  onCardsFound?: (
    cards: Array<IdentifiedCard & { image?: string; quantity?: number }>
  ) => void | Promise<void>
}

type ScanMode = 'choose' | 'camera' | 'upload' | 'scanning' | 'result' | 'batch-camera' | 'batch-review'
type CaptureStep = 'front' | 'back'

// One card in the batch queue: the user's photo + its background-identification
// status/result + the quantity the user wants (default 1).
interface BatchItem {
  id: string
  frontImage: string
  status: 'scanning' | 'done' | 'error'
  result: IdentifiedCard | null
  quantity: number
}

export function ScanCardsDialog({ onClose, onCardFound, onCardsFound }: ScanCardsDialogProps) {
  const [mode, setMode] = useState<ScanMode>('choose')
  const [captureStep, setCaptureStep] = useState<CaptureStep>('front')
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null)
  const [frontImage, setFrontImage] = useState<string | null>(null)
  const [backImage, setBackImage] = useState<string | null>(null)
  const [scanResult, setScanResult] = useState<IdentifiedCard | null>(null)
  const [showDetail, setShowDetail] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [queue, setQueue] = useState<BatchItem[]>([])
  const [adding, setAdding] = useState(false)

  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const frameRef = useRef<HTMLDivElement>(null)
  const frontInputRef = useRef<HTMLInputElement>(null)
  const backInputRef = useRef<HTMLInputElement>(null)
  const streamRef = useRef<MediaStream | null>(null)

  // Always kill the camera when this dialog unmounts (nav/route change, parent
  // toggling it off) — otherwise the stream + recording light stay live.
  useEffect(() => {
    streamRef.current = cameraStream
  }, [cameraStream])
  useEffect(() => () => streamRef.current?.getTracks().forEach((t) => t.stop()), [])

  // While the scan dialog is open, lock the background page scroll and hide the
  // fixed bottom nav (see `body.overlay-open` in index.css). Without this, on
  // mobile the touch-scroll inside the result modal leaks to the portfolio page
  // behind it, and the nav bar covers the camera's "Skip back of card" button.
  useEffect(() => {
    document.body.classList.add('overlay-open')
    return () => document.body.classList.remove('overlay-open')
  }, [])

  // Synthesize a cash-register "cha-ching!" so every capture feels like money.
  const playCashRegister = () => {
    try {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      const ctx = new AudioCtx()
      const now = ctx.currentTime
      // A metallic bell = fundamental + inharmonic partials (tubular-bell ratios).
      const bell = (start: number, freq: number, dur: number, peak: number) => {
        const master = ctx.createGain()
        master.gain.setValueAtTime(0.0001, start)
        master.gain.exponentialRampToValueAtTime(peak, start + 0.006)
        master.gain.exponentialRampToValueAtTime(0.0001, start + dur)
        master.connect(ctx.destination)
        ;[1, 2.76, 5.4].forEach((ratio, i) => {
          const osc = ctx.createOscillator()
          osc.type = 'sine'
          osc.frequency.value = freq * ratio
          const g = ctx.createGain()
          g.gain.value = i === 0 ? 1 : 0.35 / i
          osc.connect(g).connect(master)
          osc.start(start)
          osc.stop(start + dur)
        })
      }
      // "cha" — short lower ding, then "ching!" — brighter, ringing.
      bell(now, 784, 0.14, 0.5)          // G5
      bell(now + 0.11, 1175, 0.55, 0.55) // D6
      setTimeout(() => ctx.close(), 900)
    } catch {
      /* audio not available — silent capture is fine */
    }
  }

  const stopCamera = useCallback(() => {
    if (cameraStream) {
      cameraStream.getTracks().forEach((t) => t.stop())
      setCameraStream(null)
    }
  }, [cameraStream])

  const startCamera = useCallback(async (target: 'camera' | 'batch-camera' = 'camera') => {
    setError(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'environment' },
          // Ask for a sharp feed — cards are small and detail-dense.
          width: { ideal: 1920 },
          height: { ideal: 1080 },
          // Continuous autofocus keeps the card sharp as the user moves in/out.
          advanced: [{ focusMode: 'continuous' }] as unknown as MediaTrackConstraintSet[],
        },
      })
      // Some phones ignore focusMode in getUserMedia but honor applyConstraints.
      const track = stream.getVideoTracks()[0]
      const caps = track?.getCapabilities?.() as { focusMode?: string[] } | undefined
      if (track && caps?.focusMode?.includes('continuous')) {
        try {
          await track.applyConstraints({ advanced: [{ focusMode: 'continuous' }] } as unknown as MediaTrackConstraints)
        } catch {
          /* focus control not supported — leave it on auto */
        }
      }
      setCameraStream(stream)
      setCaptureStep('front')
      setMode(target)
      // The <video> is attached in an effect once it's actually mounted (below).
    } catch {
      setError('Camera access denied or not available.')
    }
  }, [])

  // Reliably attach the stream and start playback once the camera view is
  // mounted. The old setTimeout approach raced the render and often left a
  // black screen (stream set before the element existed, or never played).
  useEffect(() => {
    if ((mode !== 'camera' && mode !== 'batch-camera') || !cameraStream) return
    const v = videoRef.current
    if (!v) return
    v.srcObject = cameraStream
    const play = () => {
      v.play().catch(() => {})
    }
    play()
    v.addEventListener('loadedmetadata', play)
    return () => v.removeEventListener('loadedmetadata', play)
  }, [mode, cameraStream])

  // Grab the current video frame, cropped to the on-screen card outline. The
  // <video> is object-cover, so the source is scaled to cover the element and
  // center-cropped — undo that to map frame → source px. Returns a JPEG data URL.
  const grabFrame = (): string | null => {
    if (!videoRef.current || !canvasRef.current) return null
    const canvas = canvasRef.current
    const video = videoRef.current
    const ctx = canvas.getContext('2d')
    if (!ctx) return null

    const vW = video.videoWidth
    const vH = video.videoHeight
    const frameEl = frameRef.current
    const videoRect = video.getBoundingClientRect()
    let sx = 0, sy = 0, sw = vW, sh = vH
    if (frameEl && videoRect.width > 0 && videoRect.height > 0) {
      const frameRect = frameEl.getBoundingClientRect()
      const s = Math.max(videoRect.width / vW, videoRect.height / vH) // object-cover scale
      const cropX = (vW * s - videoRect.width) / 2 // px trimmed off each side of the source
      const cropY = (vH * s - videoRect.height) / 2
      sx = Math.max(0, (frameRect.left - videoRect.left + cropX) / s)
      sy = Math.max(0, (frameRect.top - videoRect.top + cropY) / s)
      sw = Math.min(vW - sx, frameRect.width / s)
      sh = Math.min(vH - sy, frameRect.height / s)
    }
    canvas.width = Math.round(sw)
    canvas.height = Math.round(sh)
    ctx.drawImage(video, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height)
    return canvas.toDataURL('image/jpeg')
  }

  const captureCurrentStep = () => {
    const dataUrl = grabFrame()
    if (!dataUrl) return
    playCashRegister()

    if (captureStep === 'front') {
      setFrontImage(dataUrl)
      setCaptureStep('back')
    } else {
      setBackImage(dataUrl)
      stopCamera()
      scanCard(frontImage || dataUrl)
    }
  }

  const skipBack = () => {
    stopCamera()
    if (frontImage) scanCard(frontImage)
  }

  // ---- Batch ("Scan multiple") ----

  // Identify one queued card in the background; update just that item's status.
  const identifyBatchItem = async (itemId: string, frontImageData: string) => {
    try {
      const resized = await resizeImage(frontImageData, 900)
      const res = await fetch('/api/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: resized }),
      })
      if (!res.ok) throw new Error('scan failed')
      const result: IdentifiedCard = await res.json()
      setQueue((q) => q.map((it) => (it.id === itemId ? { ...it, status: 'done', result } : it)))
    } catch {
      setQueue((q) => q.map((it) => (it.id === itemId ? { ...it, status: 'error' } : it)))
    }
  }

  // Tap the outline in batch mode: snap the front, queue it, and kick off
  // identification immediately — the camera stays open for the next card.
  const captureBatch = () => {
    const dataUrl = grabFrame()
    if (!dataUrl) return
    playCashRegister()
    const itemId = `${Date.now()}_${Math.round(Math.random() * 1e6)}`
    setQueue((q) => [...q, { id: itemId, frontImage: dataUrl, status: 'scanning', result: null, quantity: 1 }])
    identifyBatchItem(itemId, dataUrl)
  }

  const removeBatchItem = (itemId: string) => setQueue((q) => q.filter((it) => it.id !== itemId))

  const setBatchQty = (itemId: string, next: number) =>
    setQueue((q) => q.map((it) => (it.id === itemId ? { ...it, quantity: Math.max(1, next) } : it)))

  const retryBatchItem = (itemId: string) => {
    const it = queue.find((x) => x.id === itemId)
    if (!it) return
    setQueue((q) => q.map((x) => (x.id === itemId ? { ...x, status: 'scanning' } : x)))
    identifyBatchItem(itemId, it.frontImage)
  }

  // Swap a batch item to a different Scrydex match (the "wrong print?" picker).
  const selectBatchMatch = (itemId: string, m: ScrydexMatch) =>
    setQueue((q) =>
      q.map((it) =>
        it.id === itemId && it.result
          ? {
              ...it,
              result: {
                ...it.result,
                name: m.name,
                set_name: m.set_name,
                year: m.year,
                scrydex_id: m.scrydex_id,
                scrydex_image_url: m.image_url,
                card_number: m.number,
                estimated_value: m.estimated_value,
                price_change_pct: m.price_change_pct,
              },
            }
          : it
      )
    )

  const startBatch = async () => {
    setQueue([])
    await startCamera('batch-camera')
  }

  const reviewBatch = () => {
    stopCamera()
    setMode('batch-review')
  }

  // Hand every identified card (with its photo + quantity) to the parent for a
  // single bulk insert. Keeps ALL fields the portfolio needs.
  const addAllBatch = async () => {
    if (!onCardsFound) return
    const ready = queue.filter((it) => it.status === 'done' && it.result)
    if (!ready.length) return
    setAdding(true)
    try {
      await onCardsFound(
        ready.map((it) => ({
          ...(it.result as IdentifiedCard),
          image: it.frontImage,
          quantity: it.quantity,
        }))
      )
      onClose()
    } finally {
      setAdding(false)
    }
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>, slot: CaptureStep) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      const dataUrl = ev.target?.result as string
      if (slot === 'front') setFrontImage(dataUrl)
      else setBackImage(dataUrl)
    }
    reader.readAsDataURL(file)
  }

  const resizeImage = (dataUrl: string, maxDim = 1024): Promise<string> =>
    new Promise((resolve, reject) => {
      const img = new Image()
      img.onload = () => {
        let { width, height } = img
        if (width > maxDim || height > maxDim) {
          const scale = maxDim / Math.max(width, height)
          width = Math.round(width * scale)
          height = Math.round(height * scale)
        }
        const canvas = document.createElement('canvas')
        canvas.width = width
        canvas.height = height
        const ctx = canvas.getContext('2d')
        if (!ctx) return reject(new Error('Canvas not supported'))
        ctx.drawImage(img, 0, 0, width, height)
        // 0.7 quality keeps the card + collector number legible while cutting
        // the upload/AI payload roughly in half vs 0.85.
        resolve(canvas.toDataURL('image/jpeg', 0.7))
      }
      img.onerror = () => reject(new Error('Failed to load image'))
      img.src = dataUrl
    })

  // Only the front image is sent to the AI — the back is stored on the card but never analyzed.
  const scanCard = async (frontImageData: string) => {
    setMode('scanning')
    setError(null)
    try {
      // Cropped card fills the frame, so 900px keeps plenty of detail (incl. the
      // collector number) while trimming Gemini's upload + decode time.
      const resized = await resizeImage(frontImageData, 900)
      const res = await fetch('/api/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: resized }),
      })
      if (!res.ok) throw new Error('Scan failed')
      const result = await res.json()
      setScanResult(result)
      setMode('result')
    } catch {
      setError('Could not identify the card. Try again with a clearer photo.')
      setMode('choose')
    }
  }

  const selectMatch = (m: ScrydexMatch) => {
    setScanResult((prev) =>
      prev
        ? {
            ...prev,
            name: m.name,
            set_name: m.set_name,
            year: m.year,
            scrydex_id: m.scrydex_id,
            scrydex_image_url: m.image_url,
            card_number: m.number,
            estimated_value: m.estimated_value,
            price_change_pct: m.price_change_pct,
            variant: m.variant,
            variants: m.variants,
          }
        : prev
    )
  }

  // Pick a foil finish (Master Ball / Poké Ball / …) — reprices the card.
  const selectVariant = (v: CardVariant) => {
    setScanResult((prev) => (prev ? { ...prev, variant: v.name, estimated_value: v.nm } : prev))
  }

  const handleUseCard = () => {
    if (scanResult && onCardFound) {
      onCardFound({ ...scanResult, image: frontImage ?? undefined, backImage: backImage ?? undefined })
    }
    onClose()
  }

  const handleClose = () => {
    stopCamera()
    onClose()
  }

  const cancelCamera = () => {
    stopCamera()
    setMode('choose')
  }

  const reset = () => {
    stopCamera()
    setFrontImage(null)
    setBackImage(null)
    setCaptureStep('front')
    setScanResult(null)
    setError(null)
    setMode('choose')
  }

  // Full-screen camera capture UI. Portaled to <body> so `fixed inset-0` is
  // relative to the viewport — otherwise a transformed ancestor on the host
  // page (e.g. the portfolio/vault view) becomes the containing block and
  // clips the bottom controls (the "Skip back of card" button).
  if (mode === 'camera') {
    return createPortal(
      <div className="fixed inset-0 z-[60] bg-black flex flex-col">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="absolute inset-0 w-full h-full object-cover"
        />
        <canvas ref={canvasRef} className="hidden" />

        {/* Top bar */}
        <div
          className="relative z-10 flex items-center justify-between px-4 pb-3"
          style={{ paddingTop: 'calc(env(safe-area-inset-top) + 0.9rem)' }}
        >
          <button
            onClick={cancelCamera}
            className="w-9 h-9 rounded-full bg-black/50 flex items-center justify-center text-white"
          >
            <ChevronLeft size={20} />
          </button>
          <span className="px-4 py-1.5 rounded-full bg-black/50 text-white text-sm font-medium">
            {captureStep === 'front' ? 'Front of card' : 'Back of card'}
          </span>
          <div className="w-9" />
        </div>

        {/* Guide frame — ONLY the card outline is tappable to capture, so the
            controls below can't fire the shutter by accident. */}
        <div className="relative z-10 flex-1 flex items-center justify-center px-8">
          <div
            ref={frameRef}
            onClick={captureCurrentStep}
            role="button"
            aria-label="Capture photo"
            className="relative w-full max-w-[19rem] aspect-[2.5/3.5] rounded-xl overflow-hidden cursor-pointer"
            style={{ boxShadow: '0 0 0 9999px rgba(0,0,0,0.45)' }}
          >
            {/* corner brackets for a precise "align the card here" feel */}
            <span className="absolute -top-px -left-px w-8 h-8 border-t-4 border-l-4 border-gold rounded-tl-xl" />
            <span className="absolute -top-px -right-px w-8 h-8 border-t-4 border-r-4 border-gold rounded-tr-xl" />
            <span className="absolute -bottom-px -left-px w-8 h-8 border-b-4 border-l-4 border-gold rounded-bl-xl" />
            <span className="absolute -bottom-px -right-px w-8 h-8 border-b-4 border-r-4 border-gold rounded-br-xl" />
            <div className="absolute inset-x-0 bottom-3 flex justify-center">
              <span className="text-white text-xs font-medium bg-black/50 px-3 py-1.5 rounded-full">
                Fill the frame · tap the card to capture
              </span>
            </div>
          </div>
        </div>

        {/* Bottom control bar — separated below the capture zone */}
        <div
          className="relative z-10 flex flex-col items-center gap-4 px-6 pt-4"
          style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 1.75rem)' }}
        >
          {(frontImage || backImage) && (
            <div className="flex gap-3">
              {frontImage && (
                <button
                  onClick={() => setCaptureStep('front')}
                  className={`w-12 h-16 rounded-lg overflow-hidden border-2 ${
                    captureStep === 'front' ? 'border-gold' : 'border-white/30'
                  }`}
                >
                  <img src={frontImage} alt="Front" className="w-full h-full object-cover" />
                </button>
              )}
              {backImage && (
                <button
                  onClick={() => setCaptureStep('back')}
                  className={`w-12 h-16 rounded-lg overflow-hidden border-2 ${
                    captureStep === 'back' ? 'border-gold' : 'border-white/30'
                  }`}
                >
                  <img src={backImage} alt="Back" className="w-full h-full object-cover" />
                </button>
              )}
            </div>
          )}
          {captureStep === 'back' && (
            <button
              onClick={skipBack}
              className="w-full max-w-xs py-3.5 rounded-xl bg-white/10 border border-white/20 text-white font-medium text-sm hover:bg-white/15 active:bg-white/25 transition-colors"
            >
              Skip back of card →
            </button>
          )}
        </div>
      </div>,
      document.body
    )
  }

  // Full-screen BATCH camera: tap each card to queue it; identification runs in
  // the background while the camera stays open. Review the whole batch after.
  if (mode === 'batch-camera') {
    const doneCount = queue.filter((it) => it.status === 'done').length
    return createPortal(
      <div className="fixed inset-0 z-[60] bg-black flex flex-col">
        <video ref={videoRef} autoPlay playsInline muted className="absolute inset-0 w-full h-full object-cover" />
        <canvas ref={canvasRef} className="hidden" />

        {/* Top bar */}
        <div
          className="relative z-10 flex items-center justify-between px-4 pb-3"
          style={{ paddingTop: 'calc(env(safe-area-inset-top) + 0.9rem)' }}
        >
          <button
            onClick={() => { stopCamera(); setMode('choose') }}
            className="w-9 h-9 rounded-full bg-black/50 flex items-center justify-center text-white"
          >
            <ChevronLeft size={20} />
          </button>
          <span className="px-4 py-1.5 rounded-full bg-black/50 text-white text-sm font-medium">
            {queue.length ? `${queue.length} card${queue.length > 1 ? 's' : ''} added` : 'Scan multiple'}
          </span>
          <div className="w-9" />
        </div>

        {/* Guide frame — tap to queue this card */}
        <div className="relative z-10 flex-1 flex items-center justify-center px-8">
          <div
            ref={frameRef}
            onClick={captureBatch}
            role="button"
            aria-label="Capture card"
            className="relative w-full max-w-[19rem] aspect-[2.5/3.5] rounded-xl overflow-hidden cursor-pointer"
            style={{ boxShadow: '0 0 0 9999px rgba(0,0,0,0.45)' }}
          >
            <span className="absolute -top-px -left-px w-8 h-8 border-t-4 border-l-4 border-gold rounded-tl-xl" />
            <span className="absolute -top-px -right-px w-8 h-8 border-t-4 border-r-4 border-gold rounded-tr-xl" />
            <span className="absolute -bottom-px -left-px w-8 h-8 border-b-4 border-l-4 border-gold rounded-bl-xl" />
            <span className="absolute -bottom-px -right-px w-8 h-8 border-b-4 border-r-4 border-gold rounded-br-xl" />
            <div className="absolute inset-x-0 bottom-3 flex justify-center">
              <span className="text-white text-xs font-medium bg-black/50 px-3 py-1.5 rounded-full">
                Tap each card · keep going
              </span>
            </div>
          </div>
        </div>

        {/* Bottom: queued thumbnails + Review button */}
        <div
          className="relative z-10 flex flex-col gap-3 px-4 pt-3"
          style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 1.25rem)' }}
        >
          {queue.length > 0 && (
            <div className="flex gap-2 overflow-x-auto pb-1">
              {queue.map((it) => (
                <div key={it.id} className="relative flex-shrink-0 w-11 h-14">
                  <img src={it.frontImage} alt="" className="w-11 h-14 object-cover rounded-md border border-white/20" />
                  <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full flex items-center justify-center text-[9px] bg-black/80">
                    {it.status === 'scanning' && <span className="w-2.5 h-2.5 rounded-full border border-gold border-t-transparent animate-spin" />}
                    {it.status === 'done' && <Check size={11} className="text-green-400" />}
                    {it.status === 'error' && <span className="text-red-400 font-bold">!</span>}
                  </span>
                </div>
              ))}
            </div>
          )}
          <button
            onClick={reviewBatch}
            disabled={queue.length === 0}
            className="w-full py-3.5 rounded-xl bg-gold text-navy-900 font-semibold text-sm disabled:opacity-40 disabled:cursor-not-allowed hover:opacity-90 transition-opacity"
          >
            {queue.length === 0
              ? 'Tap a card to start'
              : `Review ${queue.length} card${queue.length > 1 ? 's' : ''}${doneCount < queue.length ? ` · ${doneCount}/${queue.length} identified` : ''}`}
          </button>
        </div>
      </div>,
      document.body
    )
  }

  // Batch review: confirm matches, set quantities, then bulk-add.
  if (mode === 'batch-review') {
    const ready = queue.filter((it) => it.status === 'done' && it.result)
    return createPortal(
      <div className="fixed inset-0 z-50 flex flex-col bg-[#0e0e11]">
        <div
          className="flex items-center justify-between px-4 pb-3 border-b border-white/5"
          style={{ paddingTop: 'calc(env(safe-area-inset-top) + 0.9rem)' }}
        >
          <button onClick={() => startCamera('batch-camera')} className="flex items-center gap-1 text-gray-300 text-sm">
            <ChevronLeft size={18} /> Scan more
          </button>
          <h2 className="font-heading font-bold text-white">Review {queue.length}</h2>
          <button onClick={handleClose} className="text-gray-400 hover:text-white">
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto overscroll-contain px-3 py-3 space-y-2.5">
          {queue.map((it) => (
            <div key={it.id} className="bg-[#1a1a1d] border border-white/10 rounded-xl p-3">
              <div className="flex gap-3">
                <img src={it.result?.scrydex_image_url || it.frontImage} alt="" className="w-14 h-20 object-contain rounded-lg bg-[#111113] flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  {it.status === 'scanning' && (
                    <div className="flex items-center gap-2 text-gray-400 text-sm py-2">
                      <span className="w-3.5 h-3.5 rounded-full border-2 border-gold border-t-transparent animate-spin" /> Identifying…
                    </div>
                  )}
                  {it.status === 'error' && (
                    <div className="text-sm">
                      <p className="text-red-400 font-medium">Couldn't identify</p>
                      <div className="flex gap-3 mt-1">
                        <button onClick={() => retryBatchItem(it.id)} className="text-gold text-xs">Retry</button>
                        <button onClick={() => removeBatchItem(it.id)} className="text-gray-500 text-xs">Remove</button>
                      </div>
                    </div>
                  )}
                  {it.status === 'done' && it.result && (
                    <>
                      <p className="text-white font-semibold text-sm leading-tight truncate">{it.result.name}</p>
                      {it.result.set_name && (
                        <p className="text-gray-500 text-xs truncate">{it.result.set_name}{it.result.year ? ` · ${it.result.year}` : ''}</p>
                      )}
                      {it.result.estimated_value != null && (
                        <p className="text-gold text-sm font-semibold mt-0.5">${it.result.estimated_value.toFixed(2)}</p>
                      )}
                      {!it.result.scrydex_id && (
                        <p className="text-amber-400/80 text-[11px] mt-0.5">No price match — will add unpriced</p>
                      )}
                    </>
                  )}
                </div>
                {/* Qty + remove */}
                <div className="flex flex-col items-end justify-between flex-shrink-0">
                  <button onClick={() => removeBatchItem(it.id)} className="text-gray-600 hover:text-red-400 p-1">
                    <X size={16} />
                  </button>
                  {it.status === 'done' && (
                    <div className="flex items-center gap-1.5 bg-[#111113] rounded-lg px-1 py-1 border border-white/10">
                      <button onClick={() => setBatchQty(it.id, it.quantity - 1)} className="w-7 h-7 flex items-center justify-center text-gray-300 text-lg leading-none">−</button>
                      <span className="w-5 text-center text-white text-sm font-semibold">{it.quantity}</span>
                      <button onClick={() => setBatchQty(it.id, it.quantity + 1)} className="w-7 h-7 flex items-center justify-center text-gray-300 text-lg leading-none">+</button>
                    </div>
                  )}
                </div>
              </div>

              {/* Wrong print? Alternate matches */}
              {it.status === 'done' && it.result?.matches && it.result.matches.length > 1 && (
                <div className="mt-2 pt-2 border-t border-white/5">
                  <p className="text-[11px] text-gray-500 mb-1.5">Wrong print? Pick another:</p>
                  <div className="flex gap-1.5 overflow-x-auto pb-1">
                    {it.result.matches.map((m) => (
                      <button
                        key={m.scrydex_id}
                        onClick={() => selectBatchMatch(it.id, m)}
                        className={`flex-shrink-0 w-11 rounded border-2 p-0.5 ${
                          it.result?.scrydex_id === m.scrydex_id ? 'border-gold bg-gold/10' : 'border-white/10'
                        }`}
                      >
                        {m.image_url ? (
                          <img src={m.image_url} alt="" className="w-full h-14 object-contain rounded bg-[#111113]" />
                        ) : (
                          <div className="w-full h-14 rounded bg-[#111113]" />
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}
          {queue.length === 0 && (
            <div className="text-center text-gray-500 text-sm py-12">No cards yet — tap "Scan more" to add some.</div>
          )}
        </div>

        {/* Add-all footer */}
        <div
          className="border-t border-white/10 px-4 pt-3 bg-[#0e0e11]"
          style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 1rem)' }}
        >
          <button
            onClick={addAllBatch}
            disabled={ready.length === 0 || adding}
            className="w-full py-3.5 rounded-xl bg-gold text-navy-900 font-bold text-sm disabled:opacity-40 hover:opacity-90 transition-opacity"
          >
            {adding
              ? 'Adding…'
              : ready.length === 0
                ? 'Nothing to add yet'
                : `Add ${ready.reduce((n, it) => n + it.quantity, 0)} card${ready.reduce((n, it) => n + it.quantity, 0) > 1 ? 's' : ''} to portfolio`}
          </button>
        </div>
      </div>,
      document.body
    )
  }

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
      onClick={(e) => e.target === e.currentTarget && handleClose()}
    >
      <div className="bg-[#1a1a1d] rounded-2xl border border-white/10 w-full max-w-md max-h-[90vh] overflow-y-auto overscroll-contain">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-white/5">
          <div className="flex items-center gap-2">
            <ScanLine size={20} className="text-gold" />
            <h2 className="font-heading text-xl font-bold text-white">Scan with AI</h2>
          </div>
          <button onClick={handleClose} className="text-gray-400 hover:text-white transition-colors">
            <X size={20} />
          </button>
        </div>

        <div className="p-6">
          {/* Choose mode */}
          {mode === 'choose' && (
            <div className="space-y-3">
              <p className="text-gray-400 text-sm mb-4">
                Take photos of the front and back of your card to identify it automatically.
              </p>
              {error && (
                <div className="p-3 bg-red-900/30 border border-red-500/30 rounded-xl text-red-400 text-sm mb-3">
                  {error}
                </div>
              )}
              <button
                onClick={() => startCamera()}
                className="w-full flex items-center gap-3 p-4 bg-[#111113] border border-white/10 rounded-xl hover:border-gold/30 transition-colors text-left"
              >
                <div className="w-10 h-10 bg-gold/10 rounded-xl flex items-center justify-center">
                  <Camera size={20} className="text-gold" />
                </div>
                <div>
                  <p className="text-white font-medium">Camera</p>
                  <p className="text-gray-500 text-xs">Take photos of front &amp; back</p>
                </div>
              </button>
              {onCardsFound && (
                <button
                  onClick={startBatch}
                  className="w-full flex items-center gap-3 p-4 bg-[#111113] border border-white/10 rounded-xl hover:border-gold/30 transition-colors text-left"
                >
                  <div className="w-10 h-10 bg-gold/10 rounded-xl flex items-center justify-center">
                    <Layers size={20} className="text-gold" />
                  </div>
                  <div>
                    <p className="text-white font-medium">Scan multiple</p>
                    <p className="text-gray-500 text-xs">Snap a stack fast, review &amp; add all at once</p>
                  </div>
                </button>
              )}
              <button
                onClick={() => setMode('upload')}
                className="w-full flex items-center gap-3 p-4 bg-[#111113] border border-white/10 rounded-xl hover:border-gold/30 transition-colors text-left"
              >
                <div className="w-10 h-10 bg-gold/10 rounded-xl flex items-center justify-center">
                  <Upload size={20} className="text-gold" />
                </div>
                <div>
                  <p className="text-white font-medium">Upload Images</p>
                  <p className="text-gray-500 text-xs">Select photos from your device</p>
                </div>
              </button>
            </div>
          )}

          {/* Upload mode */}
          {mode === 'upload' && (
            <div className="space-y-4">
              <p className="text-gray-400 text-sm">Upload a front photo (required) and back photo (optional).</p>
              <div className="grid grid-cols-2 gap-3">
                {(['front', 'back'] as CaptureStep[]).map((slot) => {
                  const img = slot === 'front' ? frontImage : backImage
                  const inputRef = slot === 'front' ? frontInputRef : backInputRef
                  return (
                    <button
                      key={slot}
                      onClick={() => inputRef.current?.click()}
                      className="aspect-[5/7] rounded-xl border-2 border-dashed border-white/15 hover:border-gold/40 flex items-center justify-center overflow-hidden bg-[#111113] transition-colors"
                    >
                      {img ? (
                        <img src={img} alt={slot} className="w-full h-full object-cover" />
                      ) : (
                        <div className="text-center text-gray-500 text-xs px-2">
                          <Upload size={20} className="mx-auto mb-1" />
                          {slot === 'front' ? 'Front (required)' : 'Back (optional)'}
                        </div>
                      )}
                    </button>
                  )
                })}
              </div>
              <input
                ref={frontInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => handleFileSelect(e, 'front')}
              />
              <input
                ref={backInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => handleFileSelect(e, 'back')}
              />
              <div className="flex gap-3">
                <button
                  onClick={reset}
                  className="flex-1 py-3 rounded-xl border border-white/10 text-gray-400 hover:text-white text-sm transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={() => frontImage && scanCard(frontImage)}
                  disabled={!frontImage}
                  className="flex-1 py-3 rounded-xl bg-gold text-navy-900 font-semibold text-sm hover:opacity-90 transition-opacity disabled:opacity-40"
                >
                  Continue
                </button>
              </div>
            </div>
          )}

          {/* Scanning state */}
          {mode === 'scanning' && (
            <div className="py-12 text-center space-y-4">
              {frontImage && (
                <img
                  src={frontImage}
                  alt="Front"
                  className="w-32 h-44 object-cover rounded-xl mx-auto opacity-50"
                />
              )}
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gold mx-auto" />
              <p className="text-gray-400 text-sm">Identifying card with AI...</p>
            </div>
          )}

          {/* Result */}
          {mode === 'result' && scanResult && (
            <div className="space-y-4">
              <div className="flex justify-center items-start gap-4">
                {(frontImage || backImage) && (
                  <div className="flex gap-2">
                    {frontImage && (
                      <img src={frontImage} alt="Your front photo" className="w-24 h-32 object-cover rounded-xl" />
                    )}
                    {backImage && (
                      <img src={backImage} alt="Your back photo" className="w-24 h-32 object-cover rounded-xl" />
                    )}
                  </div>
                )}
                {scanResult.scrydex_image_url && (
                  <div className="text-center">
                    <img
                      src={scanResult.scrydex_image_url}
                      alt="Matched card"
                      className="w-24 h-32 object-contain rounded-xl bg-[#111113]"
                    />
                    <p className="text-gray-600 text-[10px] mt-1 tracking-wide">SCRYDEX MATCH</p>
                  </div>
                )}
              </div>
              <div className="bg-[#111113] rounded-xl p-4 border border-gold/20">
                <p className="text-xs text-gold font-medium tracking-widest mb-2">IDENTIFIED CARD</p>
                <p className="text-white font-bold text-lg">{scanResult.name}</p>
                {scanResult.set_name && (
                  <p className="text-gray-400 text-sm">{scanResult.set_name} · {scanResult.year}</p>
                )}
                {scanResult.estimated_value != null && (
                  <div className="flex items-center gap-2 mt-2">
                    <p className="text-gold font-semibold">
                      Est. value ${scanResult.estimated_value.toFixed(2)}
                    </p>
                    {scanResult.price_change_pct != null && (
                      <PriceTicker pct={scanResult.price_change_pct} size="sm" />
                    )}
                  </div>
                )}
                {/* Foil picker — Master Ball / Poké Ball etc. so a special
                    print isn't saved at the cheap base price. */}
                {scanResult.variants && scanResult.variants.length > 1 && (
                  <div className="mt-3">
                    <p className="text-[11px] text-gray-500 mb-1.5">Which finish is it?</p>
                    <div className="flex gap-2 flex-wrap">
                      {scanResult.variants.map((v) => {
                        const active = scanResult.variant === v.name
                        return (
                          <button
                            key={v.name}
                            onClick={() => selectVariant(v)}
                            className={`px-3 py-1.5 rounded-lg border text-left transition-colors ${
                              active ? 'border-gold bg-gold/10' : 'border-white/10 hover:border-white/25'
                            }`}
                          >
                            <div className={`text-xs font-medium ${active ? 'text-white' : 'text-gray-300'}`}>
                              {variantLabel(v.name)}
                            </div>
                            <div className="text-gold text-xs font-semibold">${v.nm.toFixed(2)}</div>
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )}
                {scanResult.scrydex_id && (
                  <button
                    onClick={() => setShowDetail(true)}
                    className="mt-3 w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-gold/30 text-gold text-sm font-medium hover:bg-gold/10 transition-colors"
                  >
                    <Search size={15} />
                    View full details — prices, sales &amp; pop
                  </button>
                )}
              </div>

              {scanResult.matches && scanResult.matches.length > 1 && (
                <div>
                  <p className="text-xs text-gray-500 mb-2">Not the right print? Choose another:</p>
                  <div className="flex gap-2 overflow-x-auto pb-1">
                    {scanResult.matches.map((m) => (
                      <button
                        key={m.scrydex_id}
                        onClick={() => selectMatch(m)}
                        className={`flex-shrink-0 w-16 rounded-lg border-2 p-1 text-left transition-colors ${
                          scanResult.scrydex_id === m.scrydex_id
                            ? 'border-gold bg-gold/10'
                            : 'border-white/10 hover:border-white/30'
                        }`}
                      >
                        {m.image_url ? (
                          <img src={m.image_url} alt={m.name} className="w-full h-20 object-contain rounded bg-[#111113]" />
                        ) : (
                          <div className="w-full h-20 rounded bg-[#111113]" />
                        )}
                        <p className="text-white text-[10px] truncate mt-1">{m.set_name || m.name}</p>
                        {m.estimated_value != null && (
                          <p className="text-gold text-[10px] font-semibold">${m.estimated_value.toFixed(2)}</p>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <p className="text-xs text-gray-500 text-center">
                {scanResult.scrydex_id
                  ? 'Matched to Scrydex — double-check the details before adding this card to your vault.'
                  : "Couldn't confidently match this to a priced card — you can still add it and link a Scrydex ID later."}
              </p>
              <div className="flex gap-3">
                <button
                  onClick={reset}
                  className="flex-1 py-3 rounded-xl border border-white/10 text-gray-400 hover:text-white text-sm transition-colors"
                >
                  Scan Again
                </button>
                <button
                  onClick={handleUseCard}
                  className="flex-1 py-3 rounded-xl bg-gold text-navy-900 font-semibold text-sm hover:opacity-90 transition-opacity"
                >
                  Use This Card
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {showDetail && scanResult?.scrydex_id && (
        <CardDetailDialog
          card={{
            id: scanResult.scrydex_id,
            name: scanResult.name,
            card_set: scanResult.set_name,
            card_number: scanResult.card_number,
            year: scanResult.year,
            scrydex_id: scanResult.scrydex_id,
            image_url: scanResult.scrydex_image_url,
            estimated_value: scanResult.estimated_value,
            price_change_pct: scanResult.price_change_pct,
          }}
          onClose={() => setShowDetail(false)}
        />
      )}
    </div>,
    document.body
  )
}
