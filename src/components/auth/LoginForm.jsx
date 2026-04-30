import { useState } from 'react'
import { useAuth } from '../../hooks/useAuth'
import { useToast } from '../../hooks/useToast'
import { buildManagedLoginEmailFromPhone, normalizePhoneNumber } from '../../utils/helpers'

export default function LoginForm() {
  const { login } = useAuth()
  const toast = useToast()

  const [formData, setFormData] = useState({ email: '', password: '' })
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [showPassword, setShowPassword] = useState(false)

  function handleChange(event) {
    const { name, value } = event.target
    setFormData((current) => ({ ...current, [name]: value }))
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setIsSubmitting(true)

    try {
      const rawIdentifier = String(formData.email || '').trim()
      const normalizedIdentifier = rawIdentifier.includes('@')
        ? rawIdentifier
        : buildManagedLoginEmailFromPhone(normalizePhoneNumber(rawIdentifier))

      await login(normalizedIdentifier, formData.password)
      // Full reload avoids post-login hydration races with protected data queries.
      window.location.assign('/')
    } catch (loginError) {
      let message = ''
      if (loginError?.code === 'auth/invalid-credential') {
        message = 'Invalid login email/phone or password. Recheck credentials and make sure this user exists in Firebase Authentication for this project.'
      } else {
        message = loginError.message || 'Failed to login'
      }
      toast.error(message)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 sm:space-y-5">
      <div>
        <label className="mb-2 block text-sm font-semibold text-slate-700" htmlFor="email">
          Email or Phone
        </label>
        <div className="group flex items-center gap-2 rounded-xl border border-slate-200 bg-white/95 px-3 py-2 shadow-sm transition focus-within:border-[#8246f6] focus-within:ring-2 focus-within:ring-[#d9c6ff]">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4 text-slate-400 transition group-focus-within:text-[#8246f6]" aria-hidden="true">
            <path d="M4 7.8A2.8 2.8 0 0 1 6.8 5h10.4A2.8 2.8 0 0 1 20 7.8v8.4a2.8 2.8 0 0 1-2.8 2.8H6.8A2.8 2.8 0 0 1 4 16.2V7.8Z" />
            <path d="m5.5 8.2 6.5 5 6.5-5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <input
            id="email"
            name="email"
            type="email"
            required
            className="w-full border-0 bg-transparent px-1 py-1.5 text-slate-900 outline-none placeholder:text-slate-400"
            value={formData.email}
            onChange={handleChange}
            placeholder="you@infinitepixels.com or 010xxxxxxx"
          />
        </div>
      </div>

      <div>
        <label className="mb-2 block text-sm font-semibold text-slate-700" htmlFor="password">
          Password
        </label>
        <div className="group flex items-center gap-2 rounded-xl border border-slate-200 bg-white/95 px-3 py-2 shadow-sm transition focus-within:border-[#8246f6] focus-within:ring-2 focus-within:ring-[#d9c6ff]">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4 text-slate-400 transition group-focus-within:text-[#8246f6]" aria-hidden="true">
            <rect x="5" y="11" width="14" height="9" rx="2" />
            <path d="M8 11V8a4 4 0 0 1 8 0v3" strokeLinecap="round" />
          </svg>
          <input
            id="password"
            name="password"
            type={showPassword ? 'text' : 'password'}
            required
            className="w-full border-0 bg-transparent px-1 py-1.5 text-slate-900 outline-none placeholder:text-slate-400"
            value={formData.password}
            onChange={handleChange}
            placeholder="Enter your password"
          />
          <button
            type="button"
            onClick={() => setShowPassword((current) => !current)}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-500 transition hover:bg-slate-100 hover:text-slate-700"
            aria-label={showPassword ? 'Hide password' : 'Show password'}
            title={showPassword ? 'Hide password' : 'Show password'}
          >
            {showPassword ? (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" className="h-4 w-4" aria-hidden="true">
                <path d="M3 3l18 18" strokeLinecap="round" />
                <path d="M10.7 10.7a2 2 0 0 0 2.6 2.6" strokeLinecap="round" />
                <path d="M9.9 5.1A11.1 11.1 0 0 1 12 4.9c5 0 8.8 3.5 10 7.1a10.9 10.9 0 0 1-4.1 5.4" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M6 6.3C3.8 7.7 2.4 9.8 2 12c.5 2.9 3 5.6 6.3 6.8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" className="h-4 w-4" aria-hidden="true">
                <path d="M2 12c1.2-3.6 5-7.1 10-7.1s8.8 3.5 10 7.1c-1.2 3.6-5 7.1-10 7.1S3.2 15.6 2 12Z" strokeLinejoin="round" />
                <circle cx="12" cy="12" r="3" />
              </svg>
            )}
          </button>
        </div>
      </div>

      <div className="flex items-center justify-between text-[11px] sm:text-sm">
        <label className="inline-flex items-center gap-2 text-slate-600">
          <input type="checkbox" className="h-4 w-4 rounded border-slate-300 text-[#8246f6] focus:ring-[#cdb5ff]" />
          Keep me signed in
        </label>
        <span className="font-medium text-slate-500">Protected session</span>
      </div>

      <button
        type="submit"
        disabled={isSubmitting}
        className="relative flex w-full items-center justify-center gap-2 overflow-hidden rounded-xl bg-gradient-to-r from-[#8246f6] via-[#7840ea] to-[#6f39e7] px-4 py-2.5 text-sm font-semibold text-white shadow-xl shadow-[#8246f6]/30 transition hover:scale-[1.01] hover:shadow-2xl hover:shadow-[#8246f6]/35 disabled:cursor-not-allowed disabled:opacity-70 sm:py-3"
      >
        {isSubmitting ? (
          <>
            <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.3" strokeWidth="3" />
              <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
            </svg>
            Signing in...
          </>
        ) : (
          'Sign in'
        )}
      </button>

      <p className="hidden text-center text-[11px] text-slate-500 sm:block sm:text-xs">By signing in, you agree to internal platform usage and security policies.</p>
    </form>
  )
}
