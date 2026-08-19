import { useState } from 'react'
import { Link, useNavigate } from '@tanstack/react-router'
import { LogOut, X, Eye, EyeOff, Camera, Layers } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { Logo } from './Logo'

interface SiteHeaderProps {
  onOpenScan: () => void
}

export function SiteHeader({ onOpenScan }: SiteHeaderProps) {
  const { user, signOut } = useAuth()
  const navigate = useNavigate()

  const [showModal, setShowModal] = useState(false)
  const [isSignUp, setIsSignUp] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [authError, setAuthError] = useState<string | null>(null)
  const [authLoading, setAuthLoading] = useState(false)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)

  const openModal = (signup = false) => {
    setIsSignUp(signup)
    setAuthError(null)
    setSuccessMsg(null)
    setEmail('')
    setPassword('')
    setShowModal(true)
  }

  const closeModal = () => {
    setShowModal(false)
    setAuthError(null)
    setSuccessMsg(null)
  }

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault()
    setAuthError(null)
    setSuccessMsg(null)
    setAuthLoading(true)

    try {
      if (isSignUp) {
        const { error } = await supabase.auth.signUp({ email, password })
        if (error) throw error
        setSuccessMsg('Check your email to confirm your account.')
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw error
        closeModal()
      }
    } catch (err: unknown) {
      setAuthError(err instanceof Error ? err.message : 'Authentication failed')
    } finally {
      setAuthLoading(false)
    }
  }

  const handleSignOut = async () => {
    await signOut()
    navigate({ to: '/' })
  }

  return (
    <>
      <header className="sticky top-0 z-40 bg-navy-900/80 backdrop-blur-sm border-b border-white/5">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          {/* Logo */}
          <Link to="/" className="flex-shrink-0">
            <Logo size="sm" showTagline={false} />
          </Link>

          {/* Center nav */}
          <nav className="hidden md:flex items-center gap-8">
            <Link to="/" className="text-sm text-gray-300 hover:text-white transition-colors">
              Home
            </Link>
            <Link to="/vault" className="text-sm text-gray-300 hover:text-white transition-colors">
              Vault
            </Link>
            <button
              onClick={onOpenScan}
              className="flex items-center gap-1.5 text-sm bg-gold/10 text-gold border border-gold/30 px-3 py-1.5 rounded-full hover:bg-gold/20 transition-colors"
            >
              <Camera size={14} />
              Add Card
            </button>
            <Link to="/inventory" className="flex items-center gap-1.5 text-sm text-gray-300 hover:text-white transition-colors">
              <Layers size={14} />
              Inventory
            </Link>
            <Link to="/portal" className="text-sm text-gray-300 hover:text-white transition-colors">
              Feed
            </Link>
            <Link to="/marketplace" className="text-sm text-gray-300 hover:text-white transition-colors">
              Shop
            </Link>
          </nav>

          {/* Right side */}
          <div className="flex items-center gap-3">
            {user ? (
              <>
                <span className="hidden sm:block text-sm text-gray-400 max-w-[160px] truncate">
                  {user.email}
                </span>
                <button
                  onClick={handleSignOut}
                  className="p-2 text-gray-400 hover:text-white transition-colors"
                  title="Sign out"
                >
                  <LogOut size={18} />
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={() => openModal(false)}
                  className="text-sm text-gray-300 hover:text-white px-4 py-2 rounded-xl border border-white/10 hover:border-white/20 transition-all"
                >
                  Sign In
                </button>
                <button
                  onClick={() => openModal(true)}
                  className="text-sm bg-gold text-navy-900 font-semibold px-4 py-2 rounded-xl hover:opacity-90 transition-opacity"
                >
                  <span className="hidden sm:inline">Open the </span>Vault
                </button>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Auth Modal */}
      {showModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
          onClick={(e) => e.target === e.currentTarget && closeModal()}
        >
          <div className="bg-navy-800 rounded-2xl border border-white/10 p-8 w-full max-w-md relative">
            <button
              onClick={closeModal}
              className="absolute top-4 right-4 text-gray-400 hover:text-white transition-colors"
            >
              <X size={20} />
            </button>

            <div className="mb-6">
              <h2 className="font-heading text-2xl font-bold text-white mb-1">
                {isSignUp ? 'Create your account' : 'Welcome back'}
              </h2>
              <p className="text-gray-400 text-sm">
                {isSignUp
                  ? 'Join CardLoom and start building your vault.'
                  : 'Sign in to access your vault.'}
              </p>
            </div>

            {successMsg && (
              <div className="mb-4 p-3 bg-green-900/30 border border-green-500/30 rounded-xl text-green-400 text-sm">
                {successMsg}
              </div>
            )}

            {authError && (
              <div className="mb-4 p-3 bg-red-900/30 border border-red-500/30 rounded-xl text-red-400 text-sm">
                {authError}
              </div>
            )}

            <form onSubmit={handleAuth} className="space-y-4">
              <div>
                <label className="block text-sm text-gray-400 mb-1.5">Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="w-full bg-navy-900 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-gray-600 focus:outline-none focus:border-gold/50 transition-colors"
                  placeholder="you@example.com"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1.5">Password</label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    className="w-full bg-navy-900 border border-white/10 rounded-xl px-4 py-3 pr-10 text-white placeholder-gray-600 focus:outline-none focus:border-gold/50 transition-colors"
                    placeholder="••••••••"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300"
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={authLoading}
                className="w-full bg-gold text-navy-900 font-semibold py-3 rounded-xl hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                {authLoading ? 'Please wait...' : isSignUp ? 'Create Account' : 'Sign In'}
              </button>
            </form>

            <p className="mt-4 text-center text-sm text-gray-500">
              {isSignUp ? 'Already have an account?' : "Don't have an account?"}{' '}
              <button
                onClick={() => {
                  setIsSignUp(!isSignUp)
                  setAuthError(null)
                  setSuccessMsg(null)
                }}
                className="text-gold hover:underline"
              >
                {isSignUp ? 'Sign in' : 'Sign up'}
              </button>
            </p>
          </div>
        </div>
      )}
    </>
  )
}
