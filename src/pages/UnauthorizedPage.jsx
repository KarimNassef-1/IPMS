import { Link } from 'react-router-dom'

export default function UnauthorizedPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 p-4">
      <div className="w-full max-w-lg rounded-3xl border border-white/40 bg-white/70 p-8 text-center shadow-lg backdrop-blur">
        <h1 className="text-3xl font-black tracking-tight text-slate-900">Unauthorized</h1>
        <p className="mt-2 text-sm text-slate-600">You do not have permission to access this module.</p>
        <Link
          to="/"
          className="mt-6 inline-flex rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-700"
        >
          Back to Dashboard
        </Link>
      </div>
    </div>
  )
}
