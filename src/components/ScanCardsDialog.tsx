import { useState, useRef, useCallback } from 'react'
import { X, Camera, Upload, ScanLine } from 'lucide-react'

interface ScanCardsDialogProps {
  onClose: () => void
  onCardFound?: (cardData: { name: string; set_name?: string; year?: number }) => void
}

type ScanMode = 'choose' | 'camera' | 'upload' | 'scanning' | 'result'

export function ScanCardsDialog({ onClose, onCardFound }: ScanCardsDialogProps) {
  const [mode, setMode] = useState<ScanMode>('choose')
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null)
  const [capturedImage, setCapturedImage] = useState<string | null>(null)
  const [scanResult, setScanResult] = useState<{ name: string; set_name?: string; year?: number } | null>(null)
  const [error, setError] = useState<string | null>(null)

  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const startCamera = useCallback(async () => {
    setError(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
      })
      setCameraStream(stream)
      setMode('camera')
      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream
        }
      }, 100)
    } catch {
      setError('Camera access denied or not available.')
    }
  }, [])

  const stopCamera = useCallback(() => {
    if (cameraStream) {
      cameraStream.getTracks().forEach((t) => t.stop())
      setCameraStream(null)
    }
  }, [cameraStream])

  const capturePhoto = useCallback(() => {
    if (!videoRef.current || !canvasRef.current) return
    const canvas = canvasRef.current
    const video = videoRef.current
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.drawImage(video, 0, 0)
    const dataUrl = canvas.toDataURL('image/jpeg')
    setCapturedImage(dataUrl)
    stopCamera()
    simulateScan(dataUrl)
  }, [stopCamera])

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      const dataUrl = ev.target?.result as string
      setCapturedImage(dataUrl)
      simulateScan(dataUrl)
    }
    reader.readAsDataURL(file)
  }

  const simulateScan = (_imageData: string) => {
    setMode('scanning')
    // Placeholder: AI scanning endpoint would POST image here
    // For now, simulate a 2-second delay with a mock result
    setTimeout(() => {
      const mockResult = {
        name: 'Charizard',
        set_name: 'Base Set',
        year: 1999,
      }
      setScanResult(mockResult)
      setMode('result')
    }, 2000)
  }

  const handleUseCard = () => {
    if (scanResult && onCardFound) {
      onCardFound(scanResult)
    }
    onClose()
  }

  const handleClose = () => {
    stopCamera()
    onClose()
  }

  const reset = () => {
    stopCamera()
    setCapturedImage(null)
    setScanResult(null)
    setError(null)
    setMode('choose')
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
      onClick={(e) => e.target === e.currentTarget && handleClose()}
    >
      <div className="bg-navy-800 rounded-2xl border border-white/10 w-full max-w-md">
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
                Point your camera at a card or upload an image to identify it automatically.
              </p>
              {error && (
                <div className="p-3 bg-red-900/30 border border-red-500/30 rounded-xl text-red-400 text-sm mb-3">
                  {error}
                </div>
              )}
              <button
                onClick={startCamera}
                className="w-full flex items-center gap-3 p-4 bg-navy-900 border border-white/10 rounded-xl hover:border-gold/30 transition-colors text-left"
              >
                <div className="w-10 h-10 bg-gold/10 rounded-xl flex items-center justify-center">
                  <Camera size={20} className="text-gold" />
                </div>
                <div>
                  <p className="text-white font-medium">Camera</p>
                  <p className="text-gray-500 text-xs">Take a photo of your card</p>
                </div>
              </button>
              <button
                onClick={() => fileInputRef.current?.click()}
                className="w-full flex items-center gap-3 p-4 bg-navy-900 border border-white/10 rounded-xl hover:border-gold/30 transition-colors text-left"
              >
                <div className="w-10 h-10 bg-gold/10 rounded-xl flex items-center justify-center">
                  <Upload size={20} className="text-gold" />
                </div>
                <div>
                  <p className="text-white font-medium">Upload Image</p>
                  <p className="text-gray-500 text-xs">Select an image from your device</p>
                </div>
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleFileUpload}
              />
            </div>
          )}

          {/* Camera mode */}
          {mode === 'camera' && (
            <div className="space-y-4">
              <div className="relative bg-black rounded-xl overflow-hidden aspect-[3/4]">
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-full object-cover"
                />
                {/* Overlay guides */}
                <div className="absolute inset-4 border-2 border-gold/40 rounded-xl pointer-events-none" />
              </div>
              <canvas ref={canvasRef} className="hidden" />
              <div className="flex gap-3">
                <button
                  onClick={reset}
                  className="flex-1 py-3 rounded-xl border border-white/10 text-gray-400 hover:text-white text-sm transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={capturePhoto}
                  className="flex-1 py-3 rounded-xl bg-gold text-navy-900 font-semibold text-sm hover:opacity-90 transition-opacity"
                >
                  Capture
                </button>
              </div>
            </div>
          )}

          {/* Scanning state */}
          {mode === 'scanning' && (
            <div className="py-12 text-center space-y-4">
              {capturedImage && (
                <img
                  src={capturedImage}
                  alt="Captured"
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
              {capturedImage && (
                <img
                  src={capturedImage}
                  alt="Captured"
                  className="w-32 h-44 object-cover rounded-xl mx-auto"
                />
              )}
              <div className="bg-navy-900 rounded-xl p-4 border border-gold/20">
                <p className="text-xs text-gold font-medium tracking-widest mb-2">IDENTIFIED CARD</p>
                <p className="text-white font-bold text-lg">{scanResult.name}</p>
                {scanResult.set_name && (
                  <p className="text-gray-400 text-sm">{scanResult.set_name} · {scanResult.year}</p>
                )}
              </div>
              <p className="text-xs text-gray-500 text-center">
                AI identification is a placeholder — connect your Anthropic API endpoint to enable real scanning.
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
    </div>
  )
}
