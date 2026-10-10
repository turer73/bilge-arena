'use client'

import Link from 'next/link'
import { useEffect, useState, type ReactNode } from 'react'
import { preparationContextSchema, PREPARATION_DESCRIPTION, PREPARATION_HREF } from '@/lib/diagnostic/tyt-social-preparation'

export function TytSocialPreparationCard({ userId, fallback }: { userId: string; fallback: ReactNode }) {
  const [owner, setOwner] = useState<string | null>(null)
  useEffect(() => {
    const controller = new AbortController()
    void fetch('/api/study/tyt-social-preparation', { cache: 'no-store', signal: controller.signal })
      .then(async r => r.ok ? r.json() : null)
      .then(raw => {
        const parsed = preparationContextSchema.safeParse(raw)
        if (!controller.signal.aborted) setOwner(parsed.success && parsed.data.available ? userId : null)
      }).catch(() => { /* Existing safe fallback remains visible. */ })
    return () => controller.abort()
  }, [userId])
  if (owner !== userId) return fallback
  return <article className="rounded-[22px] border-2 border-[var(--app-accent-border)] bg-[var(--app-card)] p-4">
    <p className="text-xs font-black text-[var(--app-accent-text)]">2027 TYT SOSYAL · HAZIRLIK PİLOTU</p>
    <h2 className="mt-2 font-black text-[var(--app-text)]">20 soruyla çalışma yönünü keşfet</h2>
    <p className="mt-2 text-sm leading-6 text-[var(--app-text-sub)]">{PREPARATION_DESCRIPTION}</p>
    <Link href={PREPARATION_HREF} className="mt-4 flex min-h-12 items-center justify-center rounded-xl bg-[var(--app-accent)] px-4 font-bold text-white">Hazırlık turunu aç</Link>
  </article>
}
