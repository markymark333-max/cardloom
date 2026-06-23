import { useNavigate } from '@tanstack/react-router'

export function NotFoundPage() {
  const navigate = useNavigate()
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-6">
      <p className="text-gold text-xs font-semibold tracking-widest mb-3">404</p>
      <h1 className="font-heading text-5xl font-bold text-white mb-4">Page not found.</h1>
      <p className="text-gray-400 mb-8">This thread has come unraveled.</p>
      <button
        onClick={() => navigate({ to: '/' })}
        className="bg-gold text-navy-900 font-semibold px-6 py-3 rounded-xl hover:opacity-90 transition-opacity"
      >
        Back to CardLoom
      </button>
    </div>
  )
}
