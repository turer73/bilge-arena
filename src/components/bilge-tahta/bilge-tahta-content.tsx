'use client'

import { useEffect, useState } from 'react'
import type { BilgeTahtaStep } from '@/lib/bilge-tahta/contract'

interface BilgeTahtaContentProps {
  step: BilgeTahtaStep
  animate?: boolean
}

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

export function BilgeTahtaContent({ step, animate = true }: BilgeTahtaContentProps) {
  const [visibleLength, setVisibleLength] = useState(() => (
    animate && !prefersReducedMotion() ? 0 : step.content.length
  ))
  const animationActive = animate && visibleLength < step.content.length

  useEffect(() => {
    if (!animate || prefersReducedMotion()) return

    const timer = window.setInterval(() => {
      setVisibleLength((current) => {
        const next = Math.min(current + 3, step.content.length)
        if (next === step.content.length) window.clearInterval(timer)
        return next
      })
    }, 24)

    return () => window.clearInterval(timer)
  }, [animate, step.content, step.id])

  return (
    <div className="min-w-0">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-extrabold uppercase tracking-[0.14em] text-rose-300">
          {step.title}
        </p>
        {animationActive && (
          <button
            type="button"
            onClick={() => setVisibleLength(step.content.length)}
            className="min-h-11 rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-xs font-bold text-emerald-100 transition hover:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-yellow-200"
          >
            Yazıyı hemen göster
          </button>
        )}
      </div>

      <p
        className="min-h-24 whitespace-pre-wrap break-words text-base font-medium leading-7 text-slate-50 sm:text-lg sm:leading-8"
        data-testid="bilge-tahta-text"
      >
        {step.content.slice(0, visibleLength)}
        {animationActive && (
          <span
            aria-hidden="true"
            className="ml-1 inline-block h-5 w-1.5 animate-pulse bg-slate-100 motion-reduce:hidden"
          />
        )}
      </p>

      {step.formula && (
        <div
          role="math"
          aria-label={`Formül: ${step.formula}`}
          className="mt-5 max-w-full overflow-x-auto rounded-r-xl border-l-4 border-yellow-200 bg-white/[0.07] px-4 py-3 text-slate-50 [scrollbar-width:thin]"
          data-testid="bilge-tahta-formula"
        >
          <code className="block w-max min-w-full whitespace-pre font-mono text-sm sm:text-base">
            {step.formula}
          </code>
        </div>
      )}

      {(step.sourceLabel || step.guardrailLabel) && (
        <div className="mt-5 flex flex-wrap gap-2 text-[11px] font-semibold text-emerald-100">
          {step.sourceLabel && (
            <span className="rounded-full border border-emerald-200/20 bg-emerald-100/10 px-3 py-1.5">
              Kaynak: {step.sourceLabel}
            </span>
          )}
          {step.guardrailLabel && (
            <span className="rounded-full border border-yellow-200/20 bg-yellow-100/10 px-3 py-1.5 text-yellow-100">
              {step.guardrailLabel}
            </span>
          )}
        </div>
      )}
    </div>
  )
}
