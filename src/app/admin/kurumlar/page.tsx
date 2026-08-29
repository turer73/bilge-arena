'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { Building2, Plus, Search, ShieldCheck, ShieldOff, Users } from 'lucide-react'
import type { InstitutionAdminDirectory } from '@/lib/institution-admin/contracts'
import { TR_TIME_ZONE } from '@/lib/utils/tr-date'

type Candidate = { id: string; username?: string | null; display_name?: string | null }
type ProvisioningMode = 'free' | 'commercial'

function formatDate(value: string) {
  return new Intl.DateTimeFormat('tr-TR', { timeZone: TR_TIME_ZONE, dateStyle: 'medium' }).format(new Date(value))
}

function isExpiredFreePilot(institution: InstitutionAdminDirectory['institutions'][number]) {
  return institution.pilotKind === 'invitation_free'
    && Boolean(institution.reviewDueAt)
    && new Date(institution.reviewDueAt!).getTime() <= Date.now()
}

export default function AdminInstitutionsPage() {
  const [directory, setDirectory] = useState<InstitutionAdminDirectory>({ institutions: [] })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [search, setSearch] = useState('')
  const [candidates, setCandidates] = useState<Candidate[]>([])
  const [manager, setManager] = useState<Candidate | null>(null)
  const [approvalReference, setApprovalReference] = useState('')
  const [studentLimit, setStudentLimit] = useState(30)
  const [staffLimit, setStaffLimit] = useState(2)
  const [trialDays, setTrialDays] = useState(30)
  const [saving, setSaving] = useState(false)
  const [statusReasons, setStatusReasons] = useState<Record<string, string>>({})
  const [updatingStatus, setUpdatingStatus] = useState<string | null>(null)
  const [provisioningMode, setProvisioningMode] = useState<ProvisioningMode>('free')
  const freeProvisionAttemptRef = useRef<{ payloadKey: string; requestId: string } | null>(null)
  const commercialProvisionAttemptRef = useRef<{ payloadKey: string; requestId: string } | null>(null)
  const provisionInFlightRef = useRef(false)
  const freePilotEnabled = directory.provisioning?.invitationFreePilotEnabled === true
  const commercialOnboardingEnabled = directory.provisioning?.commercialOnboardingEnabled === true
  const canProvision = freePilotEnabled || commercialOnboardingEnabled
  const activeProvisioningMode: ProvisioningMode = freePilotEnabled
    ? commercialOnboardingEnabled ? provisioningMode : 'free'
    : commercialOnboardingEnabled ? 'commercial' : 'free'

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
    if (!manager || !canProvision || provisionInFlightRef.current) return
    provisionInFlightRef.current = true
    setSaving(true)
    setError(null)
    setNotice(null)
    try {
      const payload = activeProvisioningMode === 'free'
        ? { name, managerUserId: manager.id, approvalReference, studentLimit, staffLimit, trialDays }
        : { name, managerUserId: manager.id }
      const payloadKey = JSON.stringify(payload)
      const attemptRef = activeProvisioningMode === 'free'
        ? freeProvisionAttemptRef
        : commercialProvisionAttemptRef
      if (attemptRef.current?.payloadKey !== payloadKey) {
        attemptRef.current = { payloadKey, requestId: crypto.randomUUID() }
      }
      const endpoint = activeProvisioningMode === 'free'
        ? '/api/admin/institutions/free-pilots'
        : '/api/admin/institutions'
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...payload,
          requestId: attemptRef.current.requestId,
        }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || (activeProvisioningMode === 'free'
        ? 'Ücretsiz kurum pilotu oluşturulamadı'
        : 'Ücretli kurum onboarding oluşturulamadı'))
      attemptRef.current = null
      setName('')
      setSearch('')
      setManager(null)
      setApprovalReference('')
      setCandidates([])
      await load()
      setNotice(activeProvisioningMode === 'free'
        ? `${data.institution?.name || name} ücretsiz pilotu oluşturuldu.`
        : `${data.institution?.name || name} kurumu oluşturuldu.`)
    } catch (nextError) {
      setError(nextError instanceof Error
        ? nextError.message
        : activeProvisioningMode === 'free'
          ? 'Ücretsiz kurum pilotu oluşturulamadı'
          : 'Ücretli kurum onboarding oluşturulamadı')
    } finally {
      provisionInFlightRef.current = false
      setSaving(false)
    }
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
    setNotice(null)
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
        <p className="mt-2 text-sm leading-6 text-[var(--text-sub)]">Kurum onboarding akışını seçin. Ücretsiz sistem pilotunda öğrenciler normal Bilge Arena hesaplarıyla, süreli sınıf daveti üzerinden katılır.</p>
      </header>

      <form onSubmit={createInstitution} className="rounded-2xl border border-[var(--border)] bg-[var(--card-bg)] p-4 sm:p-5">
        <h2 className="flex items-center gap-2 font-black"><Plus className="h-4 w-4" /> {activeProvisioningMode === 'free' ? 'Platform kontrollü ücretsiz pilot' : 'Ücretli kurum onboarding'}</h2>
        <p className={`mt-2 rounded-xl border p-3 text-xs font-semibold leading-5 ${canProvision ? 'border-amber-400/25 bg-amber-400/10 text-amber-100' : 'border-white/10 bg-[var(--surface)] text-[var(--text-sub)]'}`}>
          {!canProvision
            ? 'Ücretsiz pilot ve ücretli kurum onboarding akışları şu anda kapalı. Mevcut kurumları ve yaşam döngüsü işlemlerini yönetmeye devam edebilirsiniz.'
            : activeProvisioningMode === 'free'
              ? 'Bu akış genel kurum kaydı veya ücretli onboarding değildir. Yalnız sözleşme/KVKK ön koşulları ve sorumlusu doğrulanmış, mevcut hesabı bulunan kurum yöneticileri için kullanın.'
              : 'Bu akış ticari kurum onboarding içindir. Ücretsiz pilot sınırları ve onay referansı bu akışta kullanılmaz.'}
        </p>
        {freePilotEnabled && commercialOnboardingEnabled && <fieldset className="mt-4 flex flex-wrap gap-4" aria-label="Kurum oluşturma akışı">
          <label className="flex min-h-10 items-center gap-2 text-sm font-bold"><input type="radio" name="provisioning-mode" value="free" checked={activeProvisioningMode === 'free'} onChange={() => setProvisioningMode('free')} /> Ücretsiz pilot</label>
          <label className="flex min-h-10 items-center gap-2 text-sm font-bold"><input type="radio" name="provisioning-mode" value="commercial" checked={activeProvisioningMode === 'commercial'} onChange={() => setProvisioningMode('commercial')} /> Ücretli onboarding</label>
        </fieldset>}
        <fieldset disabled={!canProvision || saving} className="mt-4 grid gap-4 disabled:opacity-60 lg:grid-cols-2">
          <label className="text-xs font-bold text-[var(--text-sub)]">Kurum adı
            <input value={name} onChange={(event) => setName(event.target.value)} minLength={2} maxLength={120} required placeholder="Örn. Bilge Eğitim Merkezi" className="mt-1 min-h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 text-sm text-[var(--text)]" />
          </label>
          <div className="relative">
            <label className="text-xs font-bold text-[var(--text-sub)]">İlk kurum yöneticisi
              <span className="relative mt-1 block"><Search className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-[var(--text-sub)]" /><input role="combobox" aria-autocomplete="list" aria-expanded={!manager && candidates.length > 0} aria-controls="institution-manager-candidates" value={search} onChange={(event) => { setSearch(event.target.value); setManager(null) }} placeholder="İsim veya kullanıcı adı ara" className="min-h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] pl-9 pr-3 text-sm text-[var(--text)]" /></span>
            </label>
            {!manager && candidates.length > 0 && <div id="institution-manager-candidates" role="listbox" className="absolute z-10 mt-1 max-h-56 w-full overflow-y-auto rounded-xl border border-[var(--border)] bg-[var(--surface)] p-1 shadow-xl">{candidates.map((candidate) => <button key={candidate.id} type="button" role="option" aria-selected="false" onClick={() => { setManager(candidate); setSearch(candidate.display_name || candidate.username || 'Seçili kullanıcı'); setCandidates([]) }} className="block min-h-11 w-full rounded-lg px-3 text-left text-sm hover:bg-[var(--card-bg)]"><span className="font-bold">{candidate.display_name || candidate.username || 'İsimsiz kullanıcı'}</span><span className="ml-2 text-xs text-[var(--text-sub)]">@{candidate.username || '—'}</span></button>)}</div>}
          </div>
          {activeProvisioningMode === 'free' && <label className="text-xs font-bold text-[var(--text-sub)]">Onay / pilot dosyası referansı
            <input value={approvalReference} onChange={(event) => setApprovalReference(event.target.value.toUpperCase())} minLength={6} maxLength={64} required pattern="[A-Z0-9][A-Z0-9._/-]{5,63}" placeholder="Örn. PILOT-2026-001" className="mt-1 min-h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 text-sm uppercase text-[var(--text)]" />
            <span className="mt-1 block text-[10px] font-medium">Sözleşme/KVKK içeriğini değil, harici dosyanın kişisel veri içermeyen referansını yazın.</span>
          </label>}
          {activeProvisioningMode === 'free' && <label className="text-xs font-bold text-[var(--text-sub)]">Öğrenci üst sınırı
            <input type="number" value={studentLimit} onChange={(event) => setStudentLimit(Number(event.target.value))} min={1} max={40} required className="mt-1 min-h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 text-sm text-[var(--text)]" />
            <span className="mt-1 block text-[10px] font-medium">Davetli pilotta en fazla 40 aktif öğrenci.</span>
          </label>}
          {activeProvisioningMode === 'free' && <label className="text-xs font-bold text-[var(--text-sub)]">Toplam personel sınırı
            <select value={staffLimit} onChange={(event) => setStaffLimit(Number(event.target.value))} className="mt-1 min-h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 text-sm text-[var(--text)]">
              <option value={1}>1 yönetici</option>
              <option value={2}>1 yönetici + 1 öğretmen</option>
            </select>
          </label>}
          {activeProvisioningMode === 'free' && <label className="text-xs font-bold text-[var(--text-sub)]">Değerlendirme süresi
            <select value={trialDays} onChange={(event) => setTrialDays(Number(event.target.value))} className="mt-1 min-h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 text-sm text-[var(--text)]">
              <option value={14}>14 gün</option>
              <option value={30}>30 gün</option>
              <option value={60}>60 gün</option>
            </select>
          </label>}
        </fieldset>
        {manager && <p className="mt-3 text-xs font-semibold text-emerald-300">Yönetici seçildi: {manager.display_name || manager.username}</p>}
        <button disabled={!canProvision || saving || !manager || name.trim().length < 2 || (activeProvisioningMode === 'free' && (approvalReference.length < 6 || studentLimit < 1 || studentLimit > 40))} className="mt-4 min-h-11 w-full rounded-xl bg-[var(--focus)] px-4 text-sm font-black text-white disabled:opacity-50 sm:w-auto">{saving ? 'Oluşturuluyor…' : !canProvision ? 'Kurum oluşturma kapalı' : activeProvisioningMode === 'free' ? 'Ücretsiz pilotu oluştur' : 'Ücretli onboarding başlat'}</button>
      </form>

      {notice && <p role="status" className="rounded-xl border border-emerald-400/25 bg-emerald-400/10 p-3 text-sm font-semibold text-emerald-200">{notice}</p>}
      {error && <p role="alert" className="rounded-xl border border-red-400/20 bg-red-400/10 p-3 text-sm font-semibold text-red-200">{error}</p>}
      {loading ? <div className="h-40 animate-pulse rounded-2xl bg-[var(--card-bg)]" /> : directory.institutions.length === 0 ? <div className="rounded-2xl border border-dashed border-[var(--border)] p-8 text-center text-sm text-[var(--text-sub)]">Henüz kurum oluşturulmadı.</div> : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{directory.institutions.map((institution) => {
          const expiredFreePilot = isExpiredFreePilot(institution)
          const supportAccessActive = institution.supportAccess.active && !expiredFreePilot
          return <article key={institution.id} className="min-w-0 rounded-2xl border border-[var(--border)] bg-[var(--card-bg)] p-4">
          <div className="flex items-start justify-between gap-2"><div className="min-w-0"><h2 className="truncate text-lg font-black">{institution.name}</h2><p className="mt-1 text-xs text-[var(--text-sub)]">{institution.manager?.alias || 'Yönetici atanmamış'} · {formatDate(institution.createdAt)}</p>{institution.pilotKind === 'invitation_free' && <p className={`mt-1 text-[10px] font-black uppercase tracking-wide ${expiredFreePilot ? 'text-red-300' : 'text-amber-300'}`}>Platform kontrollü ücretsiz pilot{institution.approvalReference ? ` · ${institution.approvalReference}` : ''}{institution.reviewDueAt ? ` · ${expiredFreePilot ? 'süresi doldu' : `değerlendirme ${formatDate(institution.reviewDueAt)}`}` : ''}</p>}</div><span className={`rounded-full px-2 py-1 text-[10px] font-black uppercase ${expiredFreePilot ? 'bg-red-400/10 text-red-300' : 'bg-[var(--focus-bg)] text-[var(--focus)]'}`}>{expiredFreePilot ? 'erişim kapalı' : institution.status}</span></div>
          <div className="mt-4 grid grid-cols-3 gap-2 text-center"><div className="rounded-xl bg-[var(--surface)] p-2"><strong className="block text-lg">{institution.studentCount}</strong><span className="text-[10px] text-[var(--text-sub)]">Öğrenci</span></div><div className="rounded-xl bg-[var(--surface)] p-2"><strong className="block text-lg">{institution.classroomCount}</strong><span className="text-[10px] text-[var(--text-sub)]">Sınıf</span></div><div className="rounded-xl bg-[var(--surface)] p-2"><strong className="block text-lg">{institution.staffCount}</strong><span className="text-[10px] text-[var(--text-sub)]">Personel</span></div></div>
          <div className={`mt-4 flex items-start gap-2 rounded-xl border p-3 text-xs ${supportAccessActive ? 'border-emerald-400/25 bg-emerald-400/10 text-emerald-200' : 'border-white/10 bg-[var(--surface)] text-[var(--text-sub)]'}`}>{supportAccessActive ? <ShieldCheck className="h-4 w-4 shrink-0" /> : <ShieldOff className="h-4 w-4 shrink-0" />}<span>{supportAccessActive ? `Kurum desteği ${formatDate(institution.supportAccess.expiresAt!)} tarihine kadar açık.` : expiredFreePilot ? 'Pilot süresi dolduğu için kurum desteği ve tenant erişimi kapalı.' : 'Kurum desteği kapalı. Yalnız kurum yöneticisi açabilir.'}</span></div>
          {supportAccessActive && <Link href={`/admin/kurumlar/${institution.id}`} className="mt-3 flex min-h-11 items-center justify-center rounded-xl border border-emerald-400/30 bg-emerald-400/10 px-4 text-sm font-black text-emerald-200">Salt-okunur destek görünümünü aç</Link>}
          {institution.status !== 'archived' ? <div className="mt-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3">
            <label className="text-[11px] font-bold text-[var(--text-sub)]">Durum değişikliği gerekçesi
              <textarea value={statusReasons[institution.id] ?? ''} onChange={(event) => setStatusReasons((current) => ({ ...current, [institution.id]: event.target.value }))} minLength={10} maxLength={500} rows={2} placeholder="Denetim kaydına yazılacak gerekçe" className="mt-1 w-full resize-y rounded-lg border border-[var(--border)] bg-[var(--card-bg)] p-2 text-xs text-[var(--text)]" />
            </label>
            {expiredFreePilot && <p className="mt-2 rounded-lg border border-red-400/20 bg-red-400/10 p-2 text-[11px] font-bold text-red-200">Değerlendirme süresi doldu; tenant erişimi kapalıdır. Bu kaydı askıya alın veya arşivleyin. Yeniden deneme için yeni onay referansıyla yeni pilot açın.</p>}
            <div className="mt-2 flex flex-wrap gap-2">
              {institution.status !== 'active' && !expiredFreePilot && <button type="button" disabled={updatingStatus === institution.id} onClick={() => void updateInstitutionStatus(institution.id, 'active')} className="min-h-10 rounded-lg border border-emerald-400/30 px-3 text-xs font-black text-emerald-300 disabled:opacity-50">Aktifleştir</button>}
              {institution.status !== 'suspended' && <button type="button" disabled={updatingStatus === institution.id} onClick={() => void updateInstitutionStatus(institution.id, 'suspended')} className="min-h-10 rounded-lg border border-amber-400/30 px-3 text-xs font-black text-amber-300 disabled:opacity-50">Askıya al</button>}
              <button type="button" disabled={updatingStatus === institution.id} onClick={() => void updateInstitutionStatus(institution.id, 'archived')} className="min-h-10 rounded-lg border border-red-400/30 px-3 text-xs font-black text-red-300 disabled:opacity-50">Arşivle</button>
            </div>
          </div> : <p className="mt-3 rounded-xl border border-white/10 bg-[var(--surface)] p-3 text-xs text-[var(--text-sub)]">Bu kurum arşivlendi; yaşam döngüsü terminaldir.</p>}
        </article>})}</div>
      )}
      <p className="flex items-center gap-2 text-xs text-[var(--text-sub)]"><Users className="h-4 w-4" /> Bu ekran normal kullanıcı kaydını değiştirmez, veli yönetimi veya herkese açık kurum oluşturma sunmaz.</p>
    </div>
  )
}
