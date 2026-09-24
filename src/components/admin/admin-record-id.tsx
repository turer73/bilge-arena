'use client'

import { useState } from 'react'

export function shortAdminId(id: string): string {
  return id.length > 16 ? `${id.slice(0, 8)}…${id.slice(-4)}` : id
}

export function AdminRecordId({ label, id }: { label: string; id: string | null }) {
  const [copiedId, setCopiedId] = useState<string | null>(null)

  if (!id) return <span className="text-xs text-[var(--text-sub)]">{label}: kayıt yok</span>

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(id)
      setCopiedId(id)
    } catch {
      setCopiedId(null)
    }
  }

  return (
    <span className="inline-flex flex-wrap items-center gap-2 text-xs text-[var(--text-sub)]">
      <span>{label}: <code title={id} className="font-mono">{shortAdminId(id)}</code></span>
      <button
        type="button"
        onClick={() => void copy()}
        aria-label={`${label} kimliğini kopyala`}
        className="min-h-9 rounded-lg border border-[var(--border)] px-2 font-semibold text-[var(--focus)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus)]"
      >
        {copiedId === id ? 'Kopyalandı' : 'Kopyala'}
      </button>
    </span>
  )
}
