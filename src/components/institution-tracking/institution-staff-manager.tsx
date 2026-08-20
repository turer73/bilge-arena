'use client'

import { useState } from 'react'
import { AlertTriangle, Loader2, MailPlus, ShieldCheck, UserMinus, Users } from 'lucide-react'
import type { InstitutionRoleDirectory } from '@/lib/institution-pilot/role-contract'

type Member = InstitutionRoleDirectory['members'][number]

async function staffApi(path: string, init: RequestInit) {
  const response = await fetch(path, { cache: 'no-store', ...init })
  const data: unknown = await response.json().catch(() => null)
  if (!response.ok) {
    const message = data && typeof data === 'object' && 'error' in data && typeof data.error === 'string'
      ? data.error
      : 'Personel işlemi tamamlanamadı'
    throw new Error(message)
  }
}

export function InstitutionStaffManager({
  members,
  onChanged,
}: {
  members: Member[]
  onChanged: () => Promise<void>
}) {
  const [teacherEmail, setTeacherEmail] = useState('')
  const [savingKey, setSavingKey] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  async function addTeacher() {
    const email = teacherEmail.trim().toLowerCase()
    setSavingKey('add')
    setError(null)
    setSuccess(null)
    try {
      await staffApi('/api/institution/staff', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ teacherEmail: email, requestId: crypto.randomUUID() }),
      })
      setTeacherEmail('')
      setSuccess('Öğretmen kuruma eklendi. Artık bu öğretmene sınıf atayabilirsiniz.')
      await onChanged()
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Öğretmen eklenemedi')
    } finally {
      setSavingKey(null)
    }
  }

  async function removeTeacher(member: Member) {
    if (!window.confirm(`“${member.alias}” öğretmenini kurumdan çıkarmak istiyor musunuz?`)) return
    const key = `remove:${member.memberRef}`
    setSavingKey(key)
    setError(null)
    setSuccess(null)
    try {
      await staffApi(`/api/institution/staff/${member.memberRef}`, {
        method: 'DELETE',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ requestId: crypto.randomUUID() }),
      })
      setSuccess('Öğretmenin kurum erişimi kaldırıldı.')
      await onChanged()
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Öğretmen çıkarılamadı')
    } finally {
      setSavingKey(null)
    }
  }

  return (
    <section className="rounded-2xl border border-white/10 bg-[var(--surface)] p-4 sm:p-5" aria-labelledby="institution-staff-title">
      <div className="flex items-start gap-3">
        <Users className="mt-0.5 h-5 w-5 shrink-0 text-[var(--primary)]" aria-hidden="true" />
        <div>
          <h2 id="institution-staff-title" className="text-lg font-black">Kurum personeli</h2>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-[var(--text-sub)]">
            Bilge Arena hesabı bulunan öğretmeni kayıtlı e-posta adresiyle kuruma ekleyin. E-posta adresi kurum dizininde gösterilmez.
          </p>
        </div>
      </div>

      <form className="mt-4 grid gap-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-end" onSubmit={(event) => { event.preventDefault(); void addTeacher() }}>
        <label className="min-w-0 text-xs font-bold text-[var(--text-sub)]">
          Öğretmenin Bilge Arena e-posta adresi
          <input
            type="email"
            autoComplete="off"
            required
            maxLength={254}
            value={teacherEmail}
            onChange={(event) => setTeacherEmail(event.target.value)}
            placeholder="ogretmen@example.com"
            className="mt-1 min-h-11 w-full rounded-xl border border-white/15 bg-white/[0.03] px-3 text-sm text-[var(--text)]"
          />
        </label>
        <button type="submit" disabled={savingKey !== null || teacherEmail.trim().length < 3} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[var(--primary)] px-4 text-sm font-black text-white disabled:opacity-50">
          {savingKey === 'add' ? <Loader2 className="h-4 w-4 animate-spin" /> : <MailPlus className="h-4 w-4" />} Öğretmen ekle
        </button>
      </form>
      <p className="mt-2 text-xs leading-5 text-[var(--text-sub)]">
        Hesap henüz yoksa öğretmen önce normal Bilge Arena kaydını tamamlamalıdır. Pilot aşamasında sistem otomatik davet e-postası göndermez.
      </p>

      {error && <div role="alert" className="mt-3 flex items-start gap-2 rounded-xl border border-red-400/25 bg-red-400/10 p-3 text-sm font-semibold text-red-200"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> {error}</div>}
      {success && <div role="status" className="mt-3 flex items-start gap-2 rounded-xl border border-emerald-400/25 bg-emerald-400/10 p-3 text-sm font-semibold text-emerald-200"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" /> {success}</div>}

      <div className="mt-5 border-t border-white/10 pt-4">
        <div className="mb-2 text-xs font-black uppercase tracking-[0.12em] text-[var(--text-sub)]">Aktif personel · {members.length}</div>
        <div className="grid gap-2 md:grid-cols-2">
          {members.map((member) => {
            const removing = savingKey === `remove:${member.memberRef}`
            return (
              <div key={member.memberRef} className="flex min-h-14 items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.025] px-3 py-2">
                <span className="min-w-0">
                  <span className="block truncate text-sm font-bold">{member.alias}</span>
                  <span className="text-[11px] text-[var(--text-sub)]">{member.membershipRole === 'manager' ? 'Kurum yöneticisi' : 'Öğretmen'}</span>
                </span>
                {member.membershipRole === 'teacher' && (
                  <button
                    type="button"
                    onClick={() => void removeTeacher(member)}
                    disabled={savingKey !== null}
                    aria-label={`${member.alias} öğretmenini kurumdan çıkar`}
                    className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl border border-red-400/20 px-3 text-xs font-bold text-red-300 hover:bg-red-400/10 disabled:opacity-50"
                  >
                    {removing ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserMinus className="h-4 w-4" />} Çıkar
                  </button>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}
