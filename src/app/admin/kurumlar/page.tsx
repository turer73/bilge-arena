'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Building2, Plus, Search, ShieldCheck, ShieldOff, Users } from 'lucide-react'
import type { InstitutionAdminDirectory } from '@/lib/institution-admin/contracts'
import { TR_TIME_ZONE } from '@/lib/utils/tr-date'

type Candidate = { id: string; username?: string | null; display_name?: string | null }

function formatDate(value: string) {
  return new Intl.DateTimeFormat('tr-TR', { timeZone: TR_TIME_ZONE, dateStyle: 'medium' }).format(new Date(value))
}

export default function AdminInstitutionsPage() {
  const [directory, setDirectory] = useState<InstitutionAdminDirectory>({ institutions: [] })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [search, setSearch] = useState('')
  const [candidates, setCandidates] = useState<Candidate[]>([])
  const [manager, setManager] = useState<Candidate | null>(null)
  const [saving, setSaving] = useState(false)
  const [statusReasons, setStatusReasons] = useState<Record<string, string>>({})
  const [updatingStatus, setUpdatingStatus] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const response = await fetch('/api/admin/institutions', { cache: 'no-store' })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Kurumlar alınamadı')
      setDirectory(data)
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Kurumlar alınamadı')
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { void load() }, [load])
  useEffect(() => {
    if (search.trim().length < 2) { setCandidates([]); return }
    const controller = new AbortController()
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch(`/api/admin/users?search=${encodeURIComponent(search.trim())}&page=1`, { signal: controller.signal })
        const data = await response.json()
        if (response.ok) setCandidates((data.users ?? []).slice(0, 6))
      } catch { if (!controller.signal.aborted) setCandidates([]) }
    }, 300)
    return () => { window.clearTimeout(timer); controller.abort() }
  }, [search])

  async function createInstitution(event: React.FormEvent) {
    event.preventDefault()
    if (!manager) return
    setSaving(true)
    setError(null)
    try {
      const response = await fetch('/api/admin/institutions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, managerUserId: manager.id, requestId: crypto.randomUUID() }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Kurum oluşturulamadı')
      setName('')
      setSearch('')
      setManager(null)
      setCandidates([])
      await load()
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Kurum oluşturulamadı')
    } finally { setSaving(false) }
  }

  async function updateInstitutionStatus(
    institutionId: string,
    status: 'active' | 'suspended' | 'archived',
  ) {
    const reason = statusReasons[institutionId]?.trim() ?? ''
    if (reason.length < 10) {
      setError('Durum değişikliği için en az 10 karakterlik gerekçe yazın.')
      return
    }
    if (status === 'archived' && !window.confirm('Arşivlenen kurum yeniden etkinleştirilemez. Devam edilsin mi?')) return
    setUpdatingStatus(institutionId)
    setError(null)
    try {
      const response = await fetch('/api/admin/institutions', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ institutionId, status, reason, requestId: crypto.randomUUID() }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Kurum durumu güncellenemedi')
      setStatusReasons((current) => ({ ...current, [institutionId]: '' }))
      await load()
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Kurum durumu güncellenemedi')
    } finally {
      setUpdatingStatus(null)
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <header>
        <div className="flex items-center gap-2 text-sm font-black text-[var(--focus)]"><Building2 className="h-5 w-5" /> Kurum yönetimi</div>
        <h1 className="mt-2 text-2xl font-black sm:text-3xl">Kurumlar</h1>
        <p className="mt-2 text-sm leading-6 text-[var(--text-sub)]">Küçük dershaneleri oluşturun ve ilk kurum yöneticisini atayın. Öğrenciler daha sonra sınıf davetiyle katılır.</p>
      </header>

      <form onSubmit={createInstitution} className="rounded-2xl border border-[var(--border)] bg-[var(--card-bg)] p-4 sm:p-5">
        <h2 className="flex items-center gap-2 font-black"><Plus className="h-4 w-4" /> Yeni kurum</h2>
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <label className="text-xs font-bold text-[var(--text-sub)]">Kurum adı
            <input value={name} onChange={(event) => setName(event.target.value)} minLength={2} maxLength={120} required placeholder="Örn. Bilge Eğitim Merkezi" className="mt-1 min-h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 text-sm text-[var(--text)]" />
          </label>
          <div className="relative">
            <label className="text-xs font-bold text-[var(--text-sub)]">İlk kurum yöneticisi
              <span className="relative mt-1 block"><Search className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-[var(--text-sub)]" /><input value={search} onChange={(event) => { setSearch(event.target.value); setManager(null) }} placeholder="İsim veya kullanıcı adı ara" className="min-h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] pl-9 pr-3 text-sm text-[var(--text)]" /></span>
            </label>
            {!manager && candidates.length > 0 && <div className="absolute z-10 mt-1 max-h-56 w-full overflow-y-auto rounded-xl border border-[var(--border)] bg-[var(--surface)] p-1 shadow-xl">{candidates.map((candidate) => <button key={candidate.id} type="button" onClick={() => { setManager(candidate); setSearch(candidate.display_name || candidate.username || 'Seçili kullanıcı'); setCandidates([]) }} className="block min-h-11 w-full rounded-lg px-3 text-left text-sm hover:bg-[var(--card-bg)]"><span className="font-bold">{candidate.display_name || candidate.username || 'İsimsiz kullanıcı'}</span><span className="ml-2 text-xs text-[var(--text-sub)]">@{candidate.username || '—'}</span></button>)}</div>}
          </div>
        </div>
        {manager && <p className="mt-3 text-xs font-semibold text-emerald-300">Yönetici seçildi: {manager.display_name || manager.username}</p>}
        <button disabled={saving || !manager || name.trim().length < 2} className="mt-4 min-h-11 w-full rounded-xl bg-[var(--focus)] px-4 text-sm font-black text-white disabled:opacity-50 sm:w-auto">{saving ? 'Oluşturuluyor…' : 'Kurumu oluştur'}</button>
      </form>

      {error && <p role="alert" className="rounded-xl border border-red-400/20 bg-red-400/10 p-3 text-sm font-semibold text-red-200">{error}</p>}
      {loading ? <div className="h-40 animate-pulse rounded-2xl bg-[var(--card-bg)]" /> : directory.institutions.length === 0 ? <div className="rounded-2xl border border-dashed border-[var(--border)] p-8 text-center text-sm text-[var(--text-sub)]">Henüz kurum oluşturulmadı.</div> : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{directory.institutions.map((institution) => <article key={institution.id} className="min-w-0 rounded-2xl border border-[var(--border)] bg-[var(--card-bg)] p-4">
          <div className="flex items-start justify-between gap-2"><div className="min-w-0"><h2 className="truncate text-lg font-black">{institution.name}</h2><p className="mt-1 text-xs text-[var(--text-sub)]">{institution.manager?.alias || 'Yönetici atanmamış'} · {formatDate(institution.createdAt)}</p></div><span className="rounded-full bg-[var(--focus-bg)] px-2 py-1 text-[10px] font-black uppercase text-[var(--focus)]">{institution.status}</span></div>
          <div className="mt-4 grid grid-cols-3 gap-2 text-center"><div className="rounded-xl bg-[var(--surface)] p-2"><strong className="block text-lg">{institution.studentCount}</strong><span className="text-[10px] text-[var(--text-sub)]">Öğrenci</span></div><div className="rounded-xl bg-[var(--surface)] p-2"><strong className="block text-lg">{institution.classroomCount}</strong><span className="text-[10px] text-[var(--text-sub)]">Sınıf</span></div><div className="rounded-xl bg-[var(--surface)] p-2"><strong className="block text-lg">{institution.staffCount}</strong><span className="text-[10px] text-[var(--text-sub)]">Personel</span></div></div>
          <div className={`mt-4 flex items-start gap-2 rounded-xl border p-3 text-xs ${institution.supportAccess.active ? 'border-emerald-400/25 bg-emerald-400/10 text-emerald-200' : 'border-white/10 bg-[var(--surface)] text-[var(--text-sub)]'}`}>{institution.supportAccess.active ? <ShieldCheck className="h-4 w-4 shrink-0" /> : <ShieldOff className="h-4 w-4 shrink-0" />}<span>{institution.supportAccess.active ? `Kurum desteği ${formatDate(institution.supportAccess.expiresAt!)} tarihine kadar açık.` : 'Kurum desteği kapalı. Yalnız kurum yöneticisi açabilir.'}</span></div>
          {institution.supportAccess.active && <Link href={`/admin/kurumlar/${institution.id}`} className="mt-3 flex min-h-11 items-center justify-center rounded-xl border border-emerald-400/30 bg-emerald-400/10 px-4 text-sm font-black text-emerald-200">Salt-okunur destek görünümünü aç</Link>}
          {institution.status !== 'archived' ? <div className="mt-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3">
            <label className="text-[11px] font-bold text-[var(--text-sub)]">Durum değişikliği gerekçesi
              <textarea value={statusReasons[institution.id] ?? ''} onChange={(event) => setStatusReasons((current) => ({ ...current, [institution.id]: event.target.value }))} minLength={10} maxLength={500} rows={2} placeholder="Denetim kaydına yazılacak gerekçe" className="mt-1 w-full resize-y rounded-lg border border-[var(--border)] bg-[var(--card-bg)] p-2 text-xs text-[var(--text)]" />
            </label>
            <div className="mt-2 flex flex-wrap gap-2">
              {institution.status !== 'active' && <button type="button" disabled={updatingStatus === institution.id} onClick={() => void updateInstitutionStatus(institution.id, 'active')} className="min-h-10 rounded-lg border border-emerald-400/30 px-3 text-xs font-black text-emerald-300 disabled:opacity-50">Aktifleştir</button>}
              {institution.status !== 'suspended' && <button type="button" disabled={updatingStatus === institution.id} onClick={() => void updateInstitutionStatus(institution.id, 'suspended')} className="min-h-10 rounded-lg border border-amber-400/30 px-3 text-xs font-black text-amber-300 disabled:opacity-50">Askıya al</button>}
              <button type="button" disabled={updatingStatus === institution.id} onClick={() => void updateInstitutionStatus(institution.id, 'archived')} className="min-h-10 rounded-lg border border-red-400/30 px-3 text-xs font-black text-red-300 disabled:opacity-50">Arşivle</button>
            </div>
          </div> : <p className="mt-3 rounded-xl border border-white/10 bg-[var(--surface)] p-3 text-xs text-[var(--text-sub)]">Bu kurum arşivlendi; yaşam döngüsü terminaldir.</p>}
        </article>)}</div>
      )}
      <p className="flex items-center gap-2 text-xs text-[var(--text-sub)]"><Users className="h-4 w-4" /> Bu ekran üyelik, ödeme veya veli yönetimi yapmaz; kurum ve ilk yönetici başlangıcını sağlar.</p>
    </div>
  )
}
