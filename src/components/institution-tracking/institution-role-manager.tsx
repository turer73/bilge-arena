'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  Loader2,
  LockKeyhole,
  Pencil,
  Plus,
  RefreshCw,
  ShieldCheck,
  Trash2,
  UserRoundCog,
  Users,
  X,
} from 'lucide-react'
import {
  institutionRoleDirectorySchema,
  type InstitutionPermission,
  type InstitutionRoleDirectory,
} from '@/lib/institution-pilot/role-contract'

type Role = InstitutionRoleDirectory['roles'][number]

async function api(path: string, init?: RequestInit) {
  const response = await fetch(path, { cache: 'no-store', ...init })
  const data: unknown = await response.json().catch(() => null)
  if (!response.ok) {
    const message = data && typeof data === 'object' && 'error' in data && typeof data.error === 'string'
      ? data.error
      : 'İşlem tamamlanamadı'
    throw new Error(message)
  }
  return data
}

export function InstitutionRoleManager() {
  const [directory, setDirectory] = useState<InstitutionRoleDirectory | null>(null)
  const [loading, setLoading] = useState(true)
  const [savingKey, setSavingKey] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [name, setName] = useState('Rehberlik Koordinatörü')
  const [description, setDescription] = useState('Kurum genelinde sınıf ve öğrenci dizinini takip eder.')
  const [permissions, setPermissions] = useState<InstitutionPermission[]>(['institution.classrooms.view_all'])
  const [editingRoleRef, setEditingRoleRef] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const parsed = institutionRoleDirectorySchema.safeParse(await api('/api/institution/roles'))
      if (!parsed.success) throw new Error('Rol dizini doğrulanamadı')
      setDirectory(parsed.data)
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Kurum rolleri alınamadı')
      setDirectory(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  const delegable = useMemo(
    () => directory?.permissions.filter((permission) => permission.delegable) ?? [],
    [directory],
  )

  function resetEditor() {
    setEditingRoleRef(null)
    setName('Yeni Kurum Rolü')
    setDescription('')
    setPermissions([])
  }

  function editRole(role: Role) {
    setEditingRoleRef(role.roleRef)
    setName(role.name)
    setDescription(role.description ?? '')
    setPermissions(role.permissions.filter((permission) => delegable.some((item) => item.permission === permission)))
    const editor = document.getElementById('create-role-title')
    if (typeof editor?.scrollIntoView === 'function') {
      editor.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }

  async function saveRole() {
    const saving = editingRoleRef ? `edit:${editingRoleRef}` : 'create'
    setSavingKey(saving)
    setError(null)
    try {
      await api(editingRoleRef ? `/api/institution/roles/${editingRoleRef}` : '/api/institution/roles', {
        method: editingRoleRef ? 'PATCH' : 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name, description: description.trim() || null, permissions, requestId: crypto.randomUUID() }),
      })
      resetEditor()
      await load()
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Rol oluşturulamadı')
    } finally {
      setSavingKey(null)
    }
  }

  async function deleteRole(role: Role) {
    if (!window.confirm(`“${role.name}” rolünü ve tüm atamalarını silmek istiyor musunuz?`)) return
    setSavingKey(`delete:${role.roleRef}`)
    setError(null)
    try {
      await api(`/api/institution/roles/${role.roleRef}`, {
        method: 'DELETE',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ requestId: crypto.randomUUID() }),
      })
      await load()
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Rol silinemedi')
    } finally {
      setSavingKey(null)
    }
  }

  async function toggleAssignment(role: Role, memberRef: string, assigned: boolean) {
    const key = `assignment:${role.roleRef}:${memberRef}`
    setSavingKey(key)
    setError(null)
    try {
      await api(`/api/institution/roles/${role.roleRef}/members/${memberRef}`, {
        method: assigned ? 'POST' : 'DELETE',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ requestId: crypto.randomUUID() }),
      })
      await load()
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Rol ataması güncellenemedi')
    } finally {
      setSavingKey(null)
    }
  }

  return (
    <div className="space-y-5">
      <header className="rounded-2xl border border-white/10 bg-[var(--surface)] p-4 sm:p-6">
        <Link href="/arena/kurum" className="inline-flex min-h-11 items-center gap-2 rounded-xl px-2 text-sm font-bold text-[var(--text-sub)] hover:bg-white/5 hover:text-[var(--text)]">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Kurum takibine dön
        </Link>
        <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.16em] text-[var(--primary)]">
              <UserRoundCog className="h-4 w-4" aria-hidden="true" /> Kurum içi yetkilendirme
            </div>
            <h1 className="mt-2 text-2xl font-black sm:text-3xl">Kurum Rolleri</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--text-sub)]">
              Bu roller yalnız bu kuruma aittir. Bilge Arena platform rollerini değiştirmez ve başka kurumlara taşınmaz.
            </p>
          </div>
          <button type="button" onClick={() => void load()} disabled={loading} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-white/15 px-4 text-sm font-bold disabled:opacity-50">
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} aria-hidden="true" /> Yenile
          </button>
        </div>
      </header>

      <section className="rounded-2xl border border-amber-400/20 bg-amber-400/[0.06] p-4 text-sm leading-6 text-amber-100">
        <div className="flex items-start gap-3">
          <LockKeyhole className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
          <p><strong>Pilot güvenlik sınırı:</strong> personel, rol ve destek erişimi yetkileri kurum yöneticisinde sabittir. Özel rollere yalnız aşağıdaki açıkça devredilebilir izinler verilebilir.</p>
        </div>
      </section>

      {error && (
        <div role="alert" className="flex items-start gap-2 rounded-xl border border-red-400/25 bg-red-400/10 p-3 text-sm font-semibold text-red-200">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" /> {error}
        </div>
      )}

      {loading && !directory ? (
        <div className="flex min-h-56 items-center justify-center rounded-2xl border border-white/10 bg-[var(--surface)]">
          <Loader2 className="h-7 w-7 animate-spin text-[var(--primary)]" aria-label="Kurum rolleri yükleniyor" />
        </div>
      ) : directory ? (
        <>
          <section className="rounded-2xl border border-white/10 bg-[var(--surface)] p-4 sm:p-5" aria-labelledby="create-role-title">
            <div className="flex items-center gap-2">
              <Plus className="h-5 w-5 text-[var(--primary)]" aria-hidden="true" />
              <h2 id="create-role-title" className="text-lg font-black">{editingRoleRef ? 'Özel rolü düzenle' : 'Özel rol oluştur'}</h2>
            </div>
            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              <label className="text-xs font-bold text-[var(--text-sub)]">
                Rol adı
                <input value={name} onChange={(event) => setName(event.target.value)} maxLength={50} className="mt-1 min-h-11 w-full rounded-xl border border-white/15 bg-white/[0.03] px-3 text-sm text-[var(--text)]" />
              </label>
              <label className="text-xs font-bold text-[var(--text-sub)]">
                Açıklama
                <input value={description} onChange={(event) => setDescription(event.target.value)} maxLength={200} className="mt-1 min-h-11 w-full rounded-xl border border-white/15 bg-white/[0.03] px-3 text-sm text-[var(--text)]" />
              </label>
            </div>
            <fieldset className="mt-4">
              <legend className="text-xs font-black uppercase tracking-[0.12em] text-[var(--text-sub)]">Devredilebilir izinler</legend>
              <div className="mt-2 grid gap-2 md:grid-cols-2">
                {delegable.map((permission) => {
                  const checked = permissions.includes(permission.permission)
                  return (
                    <label key={permission.permission} className="flex cursor-pointer items-start gap-3 rounded-xl border border-white/10 bg-white/[0.025] p-3">
                      <input type="checkbox" checked={checked} onChange={() => setPermissions((current) => checked ? current.filter((value) => value !== permission.permission) : [...current, permission.permission])} className="mt-1 h-4 w-4 accent-[var(--primary)]" />
                      <span><span className="block text-sm font-black">{permission.label}</span><span className="mt-1 block text-xs leading-5 text-[var(--text-sub)]">{permission.description}</span></span>
                    </label>
                  )
                })}
              </div>
            </fieldset>
            <div className="mt-4 flex flex-col gap-2 sm:flex-row">
              <button type="button" onClick={() => void saveRole()} disabled={savingKey !== null || name.trim().length < 2} className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-[var(--primary)] px-4 text-sm font-black text-white disabled:opacity-50 sm:w-auto">
                {savingKey === (editingRoleRef ? `edit:${editingRoleRef}` : 'create') ? <Loader2 className="h-4 w-4 animate-spin" /> : editingRoleRef ? <Pencil className="h-4 w-4" /> : <Plus className="h-4 w-4" />} {editingRoleRef ? 'Değişiklikleri kaydet' : 'Rol oluştur'}
              </button>
              {editingRoleRef && <button type="button" onClick={resetEditor} disabled={savingKey !== null} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-white/15 px-4 text-sm font-bold disabled:opacity-50"><X className="h-4 w-4" /> Vazgeç</button>}
            </div>
          </section>

          <section aria-labelledby="roles-title">
            <div className="mb-3 flex items-center gap-2 px-1">
              <ShieldCheck className="h-5 w-5 text-[var(--primary)]" aria-hidden="true" />
              <h2 id="roles-title" className="text-lg font-black">Tanımlı roller</h2>
              <span className="rounded-full bg-white/10 px-2 py-0.5 text-xs font-bold text-[var(--text-sub)]">{directory.roles.length}</span>
            </div>
            <div className="grid gap-4 xl:grid-cols-2">
              {directory.roles.map((role) => (
                <article key={role.roleRef} className="min-w-0 rounded-2xl border border-white/10 bg-[var(--surface)] p-4 sm:p-5">
                  <div className="flex min-w-0 items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="break-words text-base font-black">{role.name}</h3>
                        <span className={`rounded-full px-2 py-0.5 text-[11px] font-black ${role.system ? 'bg-sky-400/10 text-sky-200' : 'bg-violet-400/10 text-violet-200'}`}>{role.system ? 'Sistem rolü' : 'Özel rol'}</span>
                      </div>
                      <p className="mt-2 text-xs leading-5 text-[var(--text-sub)]">{role.description}</p>
                    </div>
                    {!role.system && <div className="flex shrink-0 gap-2">
                      <button type="button" onClick={() => editRole(role)} disabled={savingKey !== null} aria-label={`${role.name} rolünü düzenle`} className="flex h-11 w-11 items-center justify-center rounded-xl border border-white/15 text-[var(--text-sub)] hover:bg-white/5 hover:text-[var(--text)] disabled:opacity-50"><Pencil className="h-4 w-4" /></button>
                      <button type="button" onClick={() => void deleteRole(role)} disabled={savingKey !== null} aria-label={`${role.name} rolünü sil`} className="flex h-11 w-11 items-center justify-center rounded-xl border border-red-400/20 text-red-300 hover:bg-red-400/10 disabled:opacity-50">
                        {savingKey === `delete:${role.roleRef}` ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                      </button>
                    </div>}
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {role.permissions.map((permission) => {
                      const item = directory.permissions.find((candidate) => candidate.permission === permission)
                      return <span key={permission} className="rounded-lg border border-white/10 bg-white/[0.03] px-2 py-1 text-[11px] font-bold text-[var(--text-sub)]">{item?.label ?? permission}</span>
                    })}
                  </div>
                  <div className="mt-4 border-t border-white/10 pt-4">
                    <div className="mb-2 flex items-center gap-2 text-xs font-black uppercase tracking-[0.12em] text-[var(--text-sub)]"><Users className="h-4 w-4" /> Personel · {role.memberCount}</div>
                    {role.system ? (
                      <div className="space-y-2">
                        {directory.members.filter((member) => member.roleRefs.includes(role.roleRef)).map((member) => (
                          <div key={member.memberRef} className="flex items-center gap-2 rounded-xl bg-white/[0.025] px-3 py-2 text-sm font-semibold"><Check className="h-4 w-4 text-emerald-300" /> {member.alias}</div>
                        ))}
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {directory.members.map((member) => {
                          const assigned = member.roleRefs.includes(role.roleRef)
                          const key = `assignment:${role.roleRef}:${member.memberRef}`
                          return (
                            <label key={member.memberRef} className="flex min-h-11 cursor-pointer items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.025] px-3 py-2">
                              <span className="min-w-0"><span className="block truncate text-sm font-bold">{member.alias}</span><span className="text-[11px] text-[var(--text-sub)]">{member.membershipRole === 'manager' ? 'Kurum yöneticisi' : 'Öğretmen'}</span></span>
                              {savingKey === key ? <Loader2 className="h-4 w-4 animate-spin" /> : <input type="checkbox" checked={assigned} disabled={savingKey !== null} onChange={(event) => void toggleAssignment(role, member.memberRef, event.target.checked)} className="h-4 w-4 shrink-0 accent-[var(--primary)]" />}
                            </label>
                          )
                        })}
                      </div>
                    )}
                  </div>
                </article>
              ))}
            </div>
          </section>
        </>
      ) : null}
    </div>
  )
}
