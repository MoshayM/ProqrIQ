import React from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, RefreshCw, LayoutDashboard } from 'lucide-react'

interface State { hasError: boolean; error: Error | null }

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  State
> {
  constructor(props: { children: React.ReactNode }) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[ErrorBoundary]', error, info.componentStack)
  }

  render() {
    if (!this.state.hasError) return this.props.children

    const isDev = import.meta.env.DEV

    return (
      <div className="min-h-screen flex items-center justify-center bg-surface-2 p-4">
        <div className="max-w-md w-full text-center">
          <div className="w-16 h-16 rounded-2xl bg-red-50 flex items-center justify-center mx-auto mb-4">
            <AlertTriangle className="w-8 h-8 text-red-500" />
          </div>
          <h1 className="text-xl font-bold text-[#0f1729] mb-2">Something went wrong</h1>
          <p className="text-sm text-[#9aa3b2] mb-6">
            An unexpected error occurred. Try refreshing the page.
          </p>

          {isDev && this.state.error && (
            <pre className="text-left text-xs bg-[#1a1a2e] text-red-300 rounded-xl p-4 mb-6 overflow-auto max-h-40">
              {this.state.error.message}
            </pre>
          )}

          <div className="flex items-center justify-center gap-3">
            <button
              onClick={() => { this.setState({ hasError: false, error: null }); window.location.reload() }}
              className="inline-flex items-center gap-2 px-4 py-2 bg-brand text-white text-sm font-medium rounded-lg hover:bg-brand/90 transition-colors"
            >
              <RefreshCw className="w-4 h-4" />
              Try again
            </button>
            <Link
              to="/dashboard"
              onClick={() => this.setState({ hasError: false, error: null })}
              className="inline-flex items-center gap-2 px-4 py-2 border border-[#e5e8ef] text-[#4a5568] text-sm font-medium rounded-lg hover:bg-surface-3 transition-colors"
            >
              <LayoutDashboard className="w-4 h-4" />
              Dashboard
            </Link>
          </div>
        </div>
      </div>
    )
  }
}
