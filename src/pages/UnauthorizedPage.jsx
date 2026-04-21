import { Link } from 'react-router-dom'

export default function UnauthorizedPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-amber-50 p-4">
      <div className="w-full max-w-lg rounded-3xl border border-amber-300 bg-white p-8 text-center shadow-xl shadow-amber-200/60">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full border border-amber-300 bg-amber-100 text-2xl text-amber-700">
          !
        </div>
        <h1 className="mt-4 text-3xl font-black tracking-tight text-amber-900">Unauthorized Access</h1>
        <p className="mt-2 text-sm text-amber-800">
          Warning: You do not have permission to access this page.
        </p>
        <Link
          to="/"
          className="mt-6 inline-flex rounded-lg border border-amber-700 bg-amber-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-amber-700 focus:outline-none focus:ring-2 focus:ring-amber-300"
        >
          Back to Dashboard
        </Link>
      </div>
    </div>
  )
}
