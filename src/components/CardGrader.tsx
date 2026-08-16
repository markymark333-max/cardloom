import { useState, useRef, useCallback } from 'react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface CategoryScore {
  score: number;
  notes: string;
}

interface GradeResult {
  grade: number;
  gradeName: string;
  centering: CategoryScore;
  corners: CategoryScore;
  edges: CategoryScore;
  surface: CategoryScore;
  overallNotes: string;
  confidence: 'high' | 'medium' | 'low';
  confidenceReason?: string;
}

interface CardGraderProps {
  /** Optional: pre-populate with an existing card's front image URL */
  existingFrontUrl?: string;
  /** Optional: pre-populate with an existing card's back image URL */
  existingBackUrl?: string;
  /** Called when user saves the grade to a card */
  onSaveGrade?: (grade: number, gradeName: string) => void;
  /** Optional card name shown in the header */
  cardName?: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function gradeColor(grade: number): string {
  if (grade === 10) return 'text-yellow-400';
  if (grade >= 8)  return 'text-green-400';
  if (grade >= 6)  return 'text-blue-400';
  if (grade >= 4)  return 'text-orange-400';
  return 'text-red-400';
}

function gradeBadgeBg(grade: number): string {
  if (grade === 10) return 'bg-yellow-400/10 border-yellow-400/40 text-yellow-400';
  if (grade >= 8)  return 'bg-green-400/10 border-green-400/40 text-green-400';
  if (grade >= 6)  return 'bg-blue-400/10 border-blue-400/40 text-blue-400';
  if (grade >= 4)  return 'bg-orange-400/10 border-orange-400/40 text-orange-400';
  return 'bg-red-400/10 border-red-400/40 text-red-400';
}

function scoreDots(score: number) {
  return Array.from({ length: 10 }, (_, i) => (
    <div
      key={i}
      className={`h-1.5 flex-1 rounded-full transition-all ${
        i < score ? scoreBarColor(score) : 'bg-white/10'
      }`}
    />
  ));
}

function scoreBarColor(score: number): string {
  if (score >= 9) return 'bg-yellow-400';
  if (score >= 7) return 'bg-green-400';
  if (score >= 5) return 'bg-blue-400';
  if (score >= 3) return 'bg-orange-400';
  return 'bg-red-400';
}

function confidencePill(level: 'high' | 'medium' | 'low') {
  const map = {
    high:   'bg-green-400/15 text-green-400 border-green-400/30',
    medium: 'bg-yellow-400/15 text-yellow-400 border-yellow-400/30',
    low:    'bg-red-400/15 text-red-400 border-red-400/30',
  };
  return map[level] ?? map.medium;
}

async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // Strip the data URL prefix to get raw base64
      resolve(result.split(',')[1]);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function CardGrader({
  existingFrontUrl,
  existingBackUrl,
  onSaveGrade,
  cardName,
}: CardGraderProps) {
  const [frontFile, setFrontFile]   = useState<File | null>(null);
  const [backFile, setBackFile]     = useState<File | null>(null);
  const [frontPreview, setFrontPreview] = useState<string>(existingFrontUrl ?? '');
  const [backPreview, setBackPreview]   = useState<string>(existingBackUrl ?? '');
  const [result, setResult]         = useState<GradeResult | null>(null);
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState<string | null>(null);
  const [saved, setSaved]           = useState(false);

  const frontInputRef = useRef<HTMLInputElement>(null);
  const backInputRef  = useRef<HTMLInputElement>(null);

  const handleFileChange = useCallback(
    (side: 'front' | 'back') =>
      (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const url = URL.createObjectURL(file);
        if (side === 'front') {
          setFrontFile(file);
          setFrontPreview(url);
        } else {
          setBackFile(file);
          setBackPreview(url);
        }
        setResult(null);
        setError(null);
        setSaved(false);
      },
    []
  );

  const handleGrade = useCallback(async () => {
    if (!frontFile && !frontPreview) {
      setError('Please upload a front image to grade.');
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);
    setSaved(false);

    try {
      let frontBase64: string;
      let backBase64: string | undefined;

      if (frontFile) {
        frontBase64 = await fileToBase64(frontFile);
      } else {
        // Fetch existing URL and convert
        const res = await fetch(frontPreview);
        const blob = await res.blob();
        frontBase64 = await fileToBase64(new File([blob], 'front.jpg', { type: blob.type }));
      }

      if (backFile) {
        backBase64 = await fileToBase64(backFile);
      } else if (backPreview) {
        const res = await fetch(backPreview);
        const blob = await res.blob();
        backBase64 = await fileToBase64(new File([blob], 'back.jpg', { type: blob.type }));
      }

      const body: Record<string, string> = {
        frontImageBase64: frontBase64,
        mimeType: frontFile?.type ?? 'image/jpeg',
      };
      if (backBase64) {
        body.backImageBase64 = backBase64;
      }

      const response = await fetch('/api/grade-card', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error ?? `Server error ${response.status}`);
      }

      const data: GradeResult = await response.json();
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [frontFile, backFile, frontPreview, backPreview]);

  const handleSave = useCallback(() => {
    if (!result || !onSaveGrade) return;
    onSaveGrade(result.grade, result.gradeName);
    setSaved(true);
  }, [result, onSaveGrade]);

  const handleReset = useCallback(() => {
    setFrontFile(null);
    setBackFile(null);
    setFrontPreview(existingFrontUrl ?? '');
    setBackPreview(existingBackUrl ?? '');
    setResult(null);
    setError(null);
    setSaved(false);
  }, [existingFrontUrl, existingBackUrl]);

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="w-full max-w-2xl mx-auto space-y-6 text-white">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">AI Card Grader</h2>
          {cardName && (
            <p className="text-sm text-white/50 mt-0.5">{cardName}</p>
          )}
        </div>
        <span className="text-xs text-white/30 border border-white/10 rounded-full px-2.5 py-1">
          PSA Standard
        </span>
      </div>

      {/* Image Upload Row */}
      {!result && (
        <div className="grid grid-cols-2 gap-4">
          {/* Front */}
          <ImageUploadSlot
            label="Front"
            preview={frontPreview}
            inputRef={frontInputRef}
            onChange={handleFileChange('front')}
            required
          />
          {/* Back */}
          <ImageUploadSlot
            label="Back (optional)"
            preview={backPreview}
            inputRef={backInputRef}
            onChange={handleFileChange('back')}
          />
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
          {error}
        </div>
      )}

      {/* Grade Button */}
      {!result && (
        <button
          onClick={handleGrade}
          disabled={loading || (!frontFile && !frontPreview)}
          className="w-full rounded-xl bg-white text-black font-semibold py-3 text-sm
                     hover:bg-white/90 disabled:opacity-40 disabled:cursor-not-allowed
                     transition-all active:scale-[0.98]"
        >
          {loading ? (
            <span className="flex items-center justify-center gap-2">
              <SpinnerIcon />
              Analyzing card…
            </span>
          ) : (
            'Grade This Card'
          )}
        </button>
      )}

      {/* Loading skeleton */}
      {loading && (
        <div className="space-y-3 animate-pulse">
          <div className="h-28 rounded-2xl bg-white/5" />
          <div className="grid grid-cols-2 gap-3">
            {[1,2,3,4].map(i => (
              <div key={i} className="h-20 rounded-xl bg-white/5" />
            ))}
          </div>
        </div>
      )}

      {/* Results */}
      {result && !loading && (
        <div className="space-y-4">

          {/* Grade hero */}
          <div className={`rounded-2xl border p-5 flex items-center gap-5 ${gradeBadgeBg(result.grade)}`}>
            <div className="shrink-0 text-center w-20">
              <div className={`text-6xl font-black tabular-nums ${gradeColor(result.grade)}`}>
                {result.grade}
              </div>
              <div className="text-[10px] font-semibold uppercase tracking-widest mt-1 opacity-70">
                PSA Grade
              </div>
            </div>
            <div className="flex-1 min-w-0">
              <div className={`text-lg font-bold ${gradeColor(result.grade)}`}>
                {result.gradeName}
              </div>
              <p className="text-sm text-white/60 mt-1 leading-relaxed line-clamp-3">
                {result.overallNotes}
              </p>
            </div>
          </div>

          {/* Category breakdown */}
          <div className="grid grid-cols-2 gap-3">
            {(
              [
                { key: 'centering', label: 'Centering' },
                { key: 'corners',   label: 'Corners'   },
                { key: 'edges',     label: 'Edges'     },
                { key: 'surface',   label: 'Surface'   },
              ] as const
            ).map(({ key, label }) => {
              const cat = result[key];
              return (
                <div
                  key={key}
                  className="rounded-xl border border-white/10 bg-white/5 p-4 space-y-2"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-white/50 uppercase tracking-wider">
                      {label}
                    </span>
                    <span className={`text-sm font-bold ${gradeColor(cat.score)}`}>
                      {cat.score}/10
                    </span>
                  </div>
                  <div className="flex gap-0.5">
                    {scoreDots(cat.score)}
                  </div>
                  <p className="text-xs text-white/50 leading-relaxed">
                    {cat.notes}
                  </p>
                </div>
              );
            })}
          </div>

          {/* Confidence */}
          <div className="flex items-start gap-2 flex-wrap">
            <span className="text-xs text-white/40">AI Confidence:</span>
            <span className={`text-xs border rounded-full px-2.5 py-0.5 ${confidencePill(result.confidence)}`}>
              {result.confidence.charAt(0).toUpperCase() + result.confidence.slice(1)}
            </span>
            {result.confidenceReason && (
              <span className="text-xs text-white/30">{result.confidenceReason}</span>
            )}
          </div>

          {/* Action buttons */}
          <div className="flex gap-3 pt-1">
            {onSaveGrade && (
              <button
                onClick={handleSave}
                disabled={saved}
                className="flex-1 rounded-xl bg-white text-black font-semibold py-2.5 text-sm
                           hover:bg-white/90 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              >
                {saved ? '✓ Saved to Card' : 'Save Grade to Card'}
              </button>
            )}
            <button
              onClick={handleReset}
              className="flex-1 rounded-xl border border-white/15 bg-white/5 text-white/70
                         font-medium py-2.5 text-sm hover:bg-white/10 transition-all"
            >
              Grade Another
            </button>
          </div>

          {/* Image thumbnails recap */}
          <div className="flex gap-3 pt-1">
            {frontPreview && (
              <img
                src={frontPreview}
                alt="Front"
                className="h-16 w-auto rounded-lg border border-white/10 object-cover"
              />
            )}
            {backPreview && (
              <img
                src={backPreview}
                alt="Back"
                className="h-16 w-auto rounded-lg border border-white/10 object-cover"
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

interface ImageUploadSlotProps {
  label: string;
  preview: string;
  inputRef: React.RefObject<HTMLInputElement>;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  required?: boolean;
}

function ImageUploadSlot({ label, preview, inputRef, onChange, required }: ImageUploadSlotProps) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-semibold text-white/50 uppercase tracking-wider flex gap-1">
        {label}
        {required && <span className="text-red-400">*</span>}
      </label>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className="relative w-full aspect-[3/4] rounded-xl border border-white/15 bg-white/5
                   hover:bg-white/10 hover:border-white/25 transition-all overflow-hidden
                   flex flex-col items-center justify-center group"
      >
        {preview ? (
          <>
            <img
              src={preview}
              alt={label}
              className="absolute inset-0 w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100
                            transition-opacity flex items-center justify-center">
              <span className="text-xs font-semibold text-white">Change</span>
            </div>
          </>
        ) : (
          <div className="flex flex-col items-center gap-2 text-white/30 group-hover:text-white/50 transition-colors">
            <UploadIcon />
            <span className="text-xs font-medium">Upload image</span>
          </div>
        )}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={onChange}
      />
    </div>
  );
}

function SpinnerIcon() {
  return (
    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
    </svg>
  );
}

function UploadIcon() {
  return (
    <svg className="w-8 h-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path strokeLinecap="round" strokeLinejoin="round"
        d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
    </svg>
  );
}
