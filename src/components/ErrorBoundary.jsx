import { Component } from 'react'

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError() {
    return { hasError: true }
  }

  componentDidCatch(error, info) {
    console.error('App crashed:', error, info?.componentStack)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-slate-100">
          <div className="max-w-md rounded-2xl bg-white p-8 text-center shadow-lg">
            <h1 className="mb-2 text-lg font-bold text-slate-800">Something went wrong</h1>
            <p className="mb-6 text-sm text-slate-500">
              An unexpected error occurred. Refresh the page to continue.
            </p>
            <button
              onClick={() => window.location.reload()}
              className="rounded-xl bg-[#8246f6] px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#6f39e7]"
            >
              Refresh page
            </button>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
