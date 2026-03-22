'use client'

import { Component, type ReactNode } from 'react'
import * as Sentry from '@sentry/nextjs'

// ─── Fallback varyantları ──────────────────────────────

type Variant = 'card' | 'inline' | 'minimal'

interface FallbackProps {
  error: Error
  resetError: () => void
  variant: Variant
  label: string
}

function ErrorFallback({ error, resetError, variant, label }: FallbackProps) {
  if (variant === 'minimal') {
    return (
      <button
        onClick={resetError}
        className="text-xs text-[var(--text-muted)] hover:text-[var(--text-sub)] transition-colors"
        title={error.message}
      >
        ⚠️ {label} yüklenemedi · Tekrar dene
      </button>
    )
  }

  if (variant === 'inline') {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface-1)] px-3 py-2 text-xs text-[var(--text-sub)]">
        <span>⚠️</span>
        <span>{label} yüklenemedi</span>
        <button
          onClick={resetError}
          className="ml-auto rounded bg-[var(--surface-2)] px-2 py-0.5 text-[10px] font-medium hover:bg-[var(--surface-3)] transition-colors"
        >
          Tekrar Dene
        </button>
      </div>
    )
  }

  // card (default)
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface-1)] p-6 text-center">
      <div className="text-2xl">⚠️</div>
      <p className="text-sm font-medium">{label} yüklenirken hata oluştu</p>
      <p className="max-w-[300px] text-xs text-[var(--text-muted)]">
        {error.message || 'Beklenmeyen bir hata meydana geldi.'}
      </p>
      <button
        onClick={resetError}
        className="rounded-lg bg-[var(--focus)] px-4 py-1.5 text-xs font-bold text-white transition-opacity hover:opacity-90"
      >
        Tekrar Dene
      </button>
    </div>
  )
}

// ─── Error Boundary ────────────────────────────────────

interface Props {
  children: ReactNode
  /** Kullanıcıya gösterilen alan adı: "Sohbet", "Sıralama" vb. */
  label?: string
  /** Fallback görünümü */
  variant?: Variant
  /** Hata durumunda render edilecek özel bileşen */
  fallback?: (props: { error: Error; reset: () => void }) => ReactNode
}

interface State {
  error: Error | null
}

export class ComponentErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    Sentry.withScope((scope) => {
      scope.setTag('errorBoundary', this.props.label || 'unknown')
      scope.setContext('componentStack', { stack: info.componentStack })
      Sentry.captureException(error)
    })
  }

  resetError = () => {
    this.setState({ error: null })
  }

  render() {
    const { error } = this.state
    const { children, label = 'Bu alan', variant = 'card', fallback } = this.props

    if (error) {
      if (fallback) {
        return fallback({ error, reset: this.resetError })
      }
      return (
        <ErrorFallback
          error={error}
          resetError={this.resetError}
          variant={variant}
          label={label}
        />
      )
    }

    return children
  }
}
