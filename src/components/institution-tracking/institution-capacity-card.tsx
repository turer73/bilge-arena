'use client'

import { useEffect, useState } from 'react'
import { AlertTriangle, Loader2, UsersRound } from 'lucide-react'
import {
  institutionPilotWorkspaceSchema,
  type InstitutionPilotWorkspace,
} from '@/lib/institution-pilot/server-contract'

export function InstitutionCapacityCard() {
  const [workspace, setWorkspace] = useState<InstitutionPilotWorkspace | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    const controller = new AbortController()
    fetch('/api/institution/workspace', { cache: 'no-store', signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error('workspace')
        const parsed = institutionPilotWorkspaceSchema.safeParse(
          await response.json().catch(() => null),
        )
        if (!parsed.success) throw new Error('workspace')
        setWorkspace(parsed.data)
      })
      .catch((nextError: unknown) => {
        if (!(nextError instanceof DOMException && nextError.name === 'AbortError')) setError(true)
      })
    return () => controller.abort()
  }, [])

  if (error) return null
  if (!workspace) {
    return (
      <div className="flex min-h-24 items-center justify-center rounded-2xl border border-white/10 bg-[var(--surface)]">
        <Loader2 className="h-6 w-6 animate-spin text-[var(--primary)]" aria-label="Kurum kapasitesi yükleniyor" />
      </div>
    )
  }

  const { institution } = workspace
  const remaining = institution.studentLimit - institution.studentCount
  const percent = Math.round((institution.studentCount / institution.studentLimit) * 100)
  const warning = remaining <= Math.max(5, Math.ceil(institution.studentLimit * 0.1))

  return (
    <section className="rounded-2xl border border-white/10 bg-[var(--surface)] p-4 sm:p-5" aria-labelledby="institution-capacity-title">
      <div className="flex items-start gap-3">
        <UsersRound className="mt-0.5 h-5 w-5 shrink-0 text-[var(--primary)]" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <h2 id="institution-capacity-title" className="text-lg font-black">Öğrenci kapasitesi</h2>
          <p className="mt-1 text-sm leading-6 text-[var(--text-sub)]">
            Kurum genelinde benzersiz aktif öğrenciler sayılır; aynı öğrencinin ikinci sınıfı yeni kota tüketmez.
          </p>
          <div className="mt-4 flex items-end justify-between gap-3">
            <span className="text-2xl font-black">{institution.studentCount} / {institution.studentLimit}</span>
            <span className="text-xs font-bold text-[var(--text-sub)]">{remaining} boş kontenjan</span>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/10" role="progressbar" aria-label="Kurum öğrenci kapasitesi" aria-valuemin={0} aria-valuemax={institution.studentLimit} aria-valuenow={institution.studentCount}>
            <div className={`h-full rounded-full ${warning ? 'bg-amber-400' : 'bg-[var(--primary)]'}`} style={{ width: `${Math.min(100, percent)}%` }} />
          </div>
          {warning && (
            <p className="mt-3 flex items-start gap-2 text-xs font-semibold leading-5 text-amber-200">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              Kapasite sınırına yaklaşıldı. Sınır dolduğunda yeni öğrenci davetleri atomik olarak reddedilir.
            </p>
          )}
        </div>
      </div>
    </section>
  )
}
