'use client'

import Link from 'next/link'
import { useParams } from 'next/navigation'
import { useEffect, useState } from 'react'
import { ArrowLeft, Clock3, RefreshCw, ShieldCheck, Users } from 'lucide-react'
import type { InstitutionSupportDirectory } from '@/lib/institution-admin/contracts'
import { TR_TIME_ZONE } from '@/lib/utils/tr-date'

function formatDate(value: string) {
  return new Intl.DateTimeFormat('tr-TR', {
    timeZone: TR_TIME_ZONE, dateStyle: 'medium', timeStyle: 'short',
  }).format(new Date(value))
}

export default function InstitutionSupportPage() {
  const { institutionId } = useParams<{ institutionId: string }>()
  const [directory, setDirectory] = useState<InstitutionSupportDirectory | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    fetch(`/api/admin/institutions/${encodeURIComponent(institutionId)}/support-directory`, {
      cache: 'no-store', signal: controller.signal,
    }).then(async (response) => {
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Destek görünümü alınamadı')
      if (!controller.signal.aborted) setDirectory(data)
    }).catch((nextError) => {
      if (!controller.signal.aborted) setError(nextError instanceof Error ? nextError.message : 'Destek görünümü alınamadı')
    }).finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [institutionId])

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <Link href="/admin/kurumlar" className="inline-flex min-h-11 items-center gap-2 text-sm font-bold text-[var(--focus)]"><ArrowLeft className="h-4 w-4" /> Kurumlara dön</Link>
      {loading ? <div className="flex h-52 items-center justify-center rounded-2xl bg-[var(--card-bg)]"><RefreshCw className="h-6 w-6 animate-spin" aria-label="Yükleniyor" /></div> : error ? <section className="rounded-2xl border border-red-400/25 bg-red-400/10 p-6"><h1 className="text-xl font-black">Destek görünümü açılamadı</h1><p className="mt-2 text-sm text-red-100">{error}</p><p className="mt-3 text-xs text-[var(--text-sub)]">Kurum yöneticisi erişimi kapatmış veya izin süresi dolmuş olabilir.</p></section> : directory && <>
        <header className="rounded-2xl border border-emerald-400/25 bg-emerald-400/[0.08] p-4 sm:p-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div className="min-w-0"><div className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-emerald-300"><ShieldCheck className="h-4 w-4" /> Salt-okunur destek</div><h1 className="mt-2 truncate text-2xl font-black sm:text-3xl">{directory.institution.name}</h1><p className="mt-2 text-sm text-[var(--text-sub)]">{directory.access.reason}</p></div><div className="flex shrink-0 items-center gap-2 rounded-xl bg-emerald-400/10 px-3 py-2 text-xs font-bold text-emerald-200"><Clock3 className="h-4 w-4" /> {formatDate(directory.access.expiresAt)} tarihine kadar</div></div>
          <p className="mt-4 text-xs leading-5 text-[var(--text-sub)]">Bu görünümde veri değiştirilemez. Her görüntüleme yönetim günlüğüne kaydedilir ve kurum yöneticisi erişimi anında kapatabilir.</p>
        </header>
        {directory.classrooms.length === 0 ? <section className="rounded-2xl border border-dashed border-[var(--border)] p-8 text-center text-sm text-[var(--text-sub)]">Aktif sınıf bulunamadı.</section> : <div className="grid gap-4 md:grid-cols-2">{directory.classrooms.map((classroom) => <article key={classroom.id} className="min-w-0 rounded-2xl border border-[var(--border)] bg-[var(--card-bg)] p-4"><div className="flex items-start justify-between gap-2"><div className="min-w-0"><h2 className="truncate text-lg font-black">{classroom.name}</h2><p className="mt-1 truncate text-xs text-[var(--text-sub)]">{classroom.teacherAlias}</p></div><span className="flex shrink-0 items-center gap-1 rounded-full bg-[var(--focus-bg)] px-2 py-1 text-xs font-bold text-[var(--focus)]"><Users className="h-3.5 w-3.5" /> {classroom.activeStudentCount}</span></div><div className="mt-4 space-y-2">{classroom.students.length === 0 ? <p className="text-xs text-[var(--text-sub)]">Aktif öğrenci yok.</p> : classroom.students.map((student) => <div key={student.memberRef} className="flex min-w-0 items-center justify-between gap-2 rounded-xl bg-[var(--surface)] px-3 py-2"><span className="truncate text-sm font-bold">{student.alias}</span><span className="shrink-0 text-[10px] text-[var(--text-sub)]">{formatDate(student.joinedAt)}</span></div>)}</div></article>)}</div>}
      </>}
    </div>
  )
}
