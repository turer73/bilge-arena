'use client'

import { type FormEvent, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { AlertTriangle, Loader2, School, X } from 'lucide-react'
import {
  institutionClassroomCreateResultSchema,
  type InstitutionClassroomCreateResult,
} from '@/lib/institution-pilot/classroom-contract'
import {
  institutionRoleDirectorySchema,
  type InstitutionRoleDirectory,
} from '@/lib/institution-pilot/role-contract'

export function InstitutionClassroomCreatePanel({
  onCancel,
  onCreated,
}: {
  onCancel: () => void
  onCreated: (result: InstitutionClassroomCreateResult) => void
}) {
  const [directory, setDirectory] = useState<InstitutionRoleDirectory | null>(null)
  const [loading, setLoading] = useState(true)
  const [name, setName] = useState('')
  const [teacherMemberRef, setTeacherMemberRef] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const pendingRef = useRef<{ fingerprint: string; requestId: string } | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    fetch('/api/institution/roles', { cache: 'no-store', signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error('Öğretmen listesi alınamadı')
        const parsed = institutionRoleDirectorySchema.safeParse(await response.json().catch(() => null))
        if (!parsed.success) throw new Error('Öğretmen listesi doğrulanamadı')
        if (!controller.signal.aborted) {
          setDirectory(parsed.data)
          const teacherRoleRef = parsed.data.roles.find(
            (role) => role.system && role.roleKey === 'teacher',
          )?.roleRef
          setTeacherMemberRef(
            parsed.data.members.find((member) => (
              member.membershipRole === 'teacher'
              || Boolean(teacherRoleRef && member.roleRefs.includes(teacherRoleRef))
            ))?.memberRef ?? '',
          )
        }
      })
      .catch((nextError) => {
        if (!controller.signal.aborted) {
          setError(nextError instanceof Error ? nextError.message : 'Öğretmen listesi alınamadı')
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => controller.abort()
  }, [])

  const teacherRoleRef = directory?.roles.find(
    (role) => role.system && role.roleKey === 'teacher',
  )?.roleRef
  const teachers = directory?.members.filter((member) => (
    member.membershipRole === 'teacher'
    || Boolean(teacherRoleRef && member.roleRefs.includes(teacherRoleRef))
  )) ?? []

  async function createClassroom(event: FormEvent) {
    event.preventDefault()
    const normalized = name.trim()
    if (normalized.length < 2 || !teacherMemberRef || busy) return
    const fingerprint = `${teacherMemberRef}:${normalized}`
    const pending = pendingRef.current?.fingerprint === fingerprint
      ? pendingRef.current
      : { fingerprint, requestId: crypto.randomUUID() }
    pendingRef.current = pending
    setBusy(true)
    setError(null)
    try {
      const response = await fetch('/api/institution/classrooms', {
        method: 'POST',
        cache: 'no-store',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          teacherMemberRef,
          name: normalized,
          requestId: pending.requestId,
        }),
      })
      const payload = await response.json().catch(() => null)
      if (!response.ok) {
        throw new Error(
          typeof payload?.error === 'string' ? payload.error : 'Sınıf oluşturulamadı',
        )
      }
      const result = institutionClassroomCreateResultSchema.safeParse(payload)
      if (!result.success) throw new Error('Sınıf sonucu doğrulanamadı')
      pendingRef.current = null
      onCreated(result.data)
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Sınıf oluşturulamadı')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="rounded-2xl border border-sky-400/25 bg-sky-400/[0.06] p-4 sm:p-5" aria-labelledby="institution-create-classroom-title">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.14em] text-sky-300">Sınıf yönetimi</p>
          <h2 id="institution-create-classroom-title" className="mt-1 text-lg font-black">Yeni sınıf oluştur</h2>
          <p className="mt-1 text-xs leading-5 text-[var(--text-sub)]">Sınıf kurumda açılır ve seçtiğiniz aktif öğretmene atanır.</p>
        </div>
        <button type="button" onClick={onCancel} aria-label="Sınıf oluşturmayı kapat" className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/10 text-[var(--text-sub)] hover:bg-white/5">
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>

      {loading ? (
        <div className="mt-5 flex min-h-24 items-center justify-center" role="status">
          <Loader2 className="h-6 w-6 animate-spin text-sky-300" aria-label="Öğretmenler yükleniyor" />
        </div>
      ) : teachers.length === 0 ? (
        <div className="mt-4 flex items-start gap-3 rounded-xl border border-amber-400/20 bg-amber-400/[0.07] p-4 text-sm leading-6">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-300" aria-hidden="true" />
          <div>
            <strong className="block">Aktif kurum öğretmeni bulunamadı</strong>
            <p className="mt-1 text-[var(--text-sub)]">Sınıf açmadan önce kuruma bir öğretmen ekleyin veya kurum yöneticisi için öğretmenlik rolünü açın.</p>
            <Link href="/arena/kurum/roller" className="mt-2 inline-flex min-h-10 items-center rounded-lg font-black text-amber-200 underline decoration-amber-300/50 underline-offset-4 hover:text-amber-100">
              Öğretmen ve rol yönetimine git
            </Link>
          </div>
        </div>
      ) : (
        <form onSubmit={createClassroom} className="mt-4 grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] md:items-end">
          <label className="grid gap-1.5 text-sm font-bold">
            Sınıf adı
            <input
              value={name}
              onChange={(event) => {
                setName(event.target.value)
                pendingRef.current = null
              }}
              minLength={2}
              maxLength={60}
              required
              placeholder="TYT Matematik A"
              className="min-h-11 rounded-xl border border-white/15 bg-[var(--surface)] px-3 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-300"
            />
          </label>
          <label className="grid gap-1.5 text-sm font-bold">
            Sınıf öğretmeni
            <select
              value={teacherMemberRef}
              onChange={(event) => {
                setTeacherMemberRef(event.target.value)
                pendingRef.current = null
              }}
              required
              className="min-h-11 rounded-xl border border-white/15 bg-[var(--surface)] px-3 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-300"
            >
              {teachers.map((teacher) => (
                <option key={teacher.memberRef} value={teacher.memberRef}>{teacher.alias}</option>
              ))}
            </select>
          </label>
          <button type="submit" disabled={busy || name.trim().length < 2} className="btn-primary inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 text-sm font-black disabled:opacity-50">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <School className="h-4 w-4" aria-hidden="true" />}
            {busy ? 'Oluşturuluyor…' : 'Sınıfı oluştur'}
          </button>
        </form>
      )}
      {error && <p role="alert" className="mt-3 rounded-xl border border-red-400/20 bg-red-400/[0.07] p-3 text-sm text-red-200">{error}</p>}
    </section>
  )
}
