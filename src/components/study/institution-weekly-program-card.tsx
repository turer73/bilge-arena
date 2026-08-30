'use client'

import { useEffect, useState } from 'react'
import { AlertTriangle, Building2, CalendarDays, CheckCircle2, Play, RefreshCw } from 'lucide-react'
import {
  institutionStudentProgramsSchema,
  type InstitutionStudentPrograms,
} from '@/lib/institution-tracking/student-program'

export function InstitutionWeeklyProgramCard() {
  const enabled = process.env.NEXT_PUBLIC_INSTITUTION_TRACKING_ENABLED === 'true'
  const [data, setData] = useState<InstitutionStudentPrograms | null>(null)
  const [loading, setLoading] = useState(enabled)
  const [failed, setFailed] = useState(false)
  const [retry, setRetry] = useState(0)
  const [starting, setStarting] = useState<string | null>(null)
  const [startError, setStartError] = useState(false)

  useEffect(() => {
    if (!enabled) return
    const controller = new AbortController()
    queueMicrotask(async () => {
      setLoading(true); setFailed(false)
      try {
        const response = await fetch('/api/study/institution-programs', { cache: 'no-store', signal: controller.signal })
        if (!response.ok) throw new Error('institution program request failed')
        const parsed = institutionStudentProgramsSchema.safeParse(await response.json().catch(() => null))
        if (!parsed.success) throw new Error('institution program response invalid')
        if (!controller.signal.aborted) setData(parsed.data)
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') return
        if (!controller.signal.aborted) { setData(null); setFailed(true) }
      } finally { if (!controller.signal.aborted) setLoading(false) }
    })
    return () => controller.abort()
  }, [enabled, retry])

  if (!enabled) return null
  if (loading && !data) return <div className="h-28 animate-pulse rounded-2xl bg-white/5" aria-label="Kurum programı yükleniyor" />
  if (failed) return (
    <section className="rounded-2xl border border-amber-400/20 bg-amber-400/5 p-4 text-sm text-amber-100">
      <div className="flex items-start gap-3"><AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" /><div><strong className="block">Kurum programı görüntülenemedi</strong><span className="mt-1 block text-xs text-[var(--text-sub)]">Kişisel çalışma planına devam edebilirsin.</span></div></div>
      <button type="button" onClick={() => setRetry((value) => value + 1)} className="mt-3 inline-flex min-h-10 items-center gap-2 rounded-xl border border-white/15 px-3 text-xs font-bold"><RefreshCw className="h-4 w-4" /> Yeniden dene</button>
    </section>
  )
  if (!data || data.programs.length === 0) return null
  // The server validates and returns the date used for program eligibility;
  // use the same boundary instead of a potentially skewed browser clock.
  const today = data.asOfDate

  async function startItem(programRef: string, position: number) {
    const key = `${programRef}:${position}`
    setStartError(false)
    setStarting(key)
    try {
      const response = await fetch(`/api/study/institution-programs/${programRef}/${position}/start`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ requestId: crypto.randomUUID() }),
      })
      const payload = await response.json().catch(() => null) as { startTarget?: { href?: string } } | null
      if (!response.ok || !payload?.startTarget?.href) throw new Error('program item start failed')
      window.location.assign(payload.startTarget.href)
    } catch {
      // A mutation error must not discard an already loaded teacher plan.
      // Keep the tasks visible and let the learner retry the exact item.
      setStartError(true)
    } finally { setStarting(null) }
  }

  return (
    <section className="rounded-2xl border border-[var(--primary)]/25 bg-[var(--primary)]/[0.06] p-4 sm:p-5" aria-labelledby="institution-weekly-program-title">
      <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0"><p className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.16em] text-[var(--primary)]"><Building2 className="h-4 w-4" /> Kurum programın</p><h2 id="institution-weekly-program-title" className="mt-1 text-lg font-black">Bu haftanın öğretmen planı</h2></div>
        <span className="w-fit rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 text-xs font-bold"><CalendarDays className="mr-1 inline h-3.5 w-3.5" /> {data.asOfDate}</span>
      </div>
      {startError && (
        <p role="alert" className="mt-3 rounded-xl border border-amber-400/20 bg-amber-400/5 p-3 text-xs text-amber-100">
          Görev başlatılamadı. Planın kaybolmadı; lütfen yeniden dene.
        </p>
      )}
      <div className="mt-4 space-y-4">
        {data.programs.map((program) => (
          <article key={program.programRef ?? `${program.classroomName}-${program.weekStart}`} className="rounded-xl border border-white/10 bg-[var(--surface)] p-3 sm:p-4">
            <div className="min-w-0"><h3 className="truncate text-sm font-black">{program.classroomName}</h3><p className="mt-1 truncate text-xs text-[var(--text-sub)]">{program.teacherAlias} · Günlük en fazla {program.dailyMinuteLimit} dk</p></div>
            <ol className="mt-3 space-y-2">
              {program.items.map((item) => {
                const isToday = item.scheduledDate === today
                const isFuture = item.scheduledDate > today
                const key = `${program.programRef ?? 'legacy'}:${item.position}`
                const actionLabel = item.taskType === 'diagnostic' ? 'Tanılamayı başlat' : 'Doğrulanmış pratiği başlat'
                return <li key={item.position} className={`grid min-w-0 gap-2 rounded-lg border p-3 text-sm sm:grid-cols-[6.5rem_minmax(0,1fr)_auto] sm:items-center ${isToday ? 'border-[var(--primary)]/40 bg-[var(--primary)]/10' : 'border-white/10'}`}><span className="text-xs font-bold text-[var(--text-sub)]">{isToday ? 'Bugün' : item.scheduledDate}</span><span className="min-w-0 break-words font-bold">{item.title}<small className="mt-0.5 block font-normal text-[var(--text-sub)]">{item.targetQuestionCount ? `${item.targetQuestionCount} soru · ` : ''}{item.reasonCode}</small></span><span className="flex items-center gap-2 sm:justify-end"><span className="text-xs font-black text-[var(--primary)]">{item.durationMinutes} dk</span>{item.status === 'completed' ? <CheckCircle2 aria-label="Tamamlandı" className="h-5 w-5 text-emerald-300" /> : item.canStart && program.programRef ? <button type="button" onClick={() => void startItem(program.programRef!, item.position)} disabled={starting !== null} className="inline-flex min-h-10 items-center gap-1 rounded-lg border border-[var(--primary)]/40 px-2 text-xs font-black disabled:opacity-50"><Play className="h-3.5 w-3.5" />{starting === key ? 'Başlatılıyor…' : actionLabel}</button> : <span className="text-xs text-[var(--text-sub)]">{isFuture ? 'Planlanan tarihinde açılacak' : 'Bu görev doğrulanmış oturumla başlatılamaz'}</span>}</span></li>
              })}
            </ol>
          </article>
        ))}
      </div>
    </section>
  )
}
