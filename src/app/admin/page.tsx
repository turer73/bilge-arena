'use client'

import { useEffect, useState } from 'react'
import { DocumentBoundaryLink as Link } from '@/components/privacy/document-boundary-link'
import { ArrowUpRight, Award, BookOpen, Building2, CircleAlert, CircleCheck, Flag, Gamepad2, House, Image, Inbox, KeyRound, ScrollText, Settings2, ShieldCheck, Users, type LucideIcon } from 'lucide-react'

interface AdminStats {
  totalUsers: number
  totalQuestions: number
  totalSessions: number
  totalAnswers: number
  pendingReports: number
}

const STAT_CARDS: Array<{ key: keyof AdminStats; label: string; Icon: LucideIcon; tone: string }> = [
  { key: 'totalUsers', label: 'Kullanıcı', Icon: Users, tone: 'text-[var(--focus-text)]' },
  { key: 'totalQuestions', label: 'Soru', Icon: BookOpen, tone: 'text-[var(--focus-text)]' },
  { key: 'totalSessions', label: 'Oturum', Icon: Gamepad2, tone: 'text-[var(--reward)]' },
  { key: 'totalAnswers', label: 'Cevap', Icon: CircleCheck, tone: 'text-[var(--growth)]' },
  { key: 'pendingReports', label: 'Bekleyen rapor', Icon: CircleAlert, tone: 'text-[var(--text)]' },
]

interface DashboardLink {
  label: string
  description: string
  href: string
  Icon: LucideIcon
  permissions: readonly string[]
  required?: readonly string[]
}

const WORKFLOWS: Array<{ title: string; description: string; links: DashboardLink[] }> = [
  { title: 'İçerik ve kalite', description: 'Soruları hazırlama, kanıtları ve bildirimleri inceleme.', links: [
    { label: 'Soru yönetimi', description: 'Soru bankası ve düzenleme', href: '/admin/sorular', Icon: BookOpen, permissions: ['admin.questions.view', 'content.prepare'], required: ['admin.dashboard.view'] },
    { label: 'Soru Kalitesi', description: 'İtiraz, bulgu ve içerik kararları', href: '/admin/soru-kalite', Icon: ShieldCheck, permissions: ['admin.questions.view', 'content.prepare', 'content.review.stage1', 'content.review.stage2', 'content.publish', 'content.appeals.manage', 'content.corrections.apply', 'content.psychometrics.refresh'] },
    { label: 'Gönderiler', description: 'Topluluktan gelen sorular', href: '/admin/gonderiler', Icon: Inbox, permissions: ['admin.questions.view'] },
    { label: 'Raporlar', description: 'Bekleyen hata bildirimleri', href: '/admin/raporlar', Icon: Flag, permissions: ['admin.reports.view'] },
  ] },
  { title: 'Kullanıcı ve platform', description: 'Erişimleri, kurumları ve site öğelerini yönetme.', links: [
    { label: 'Kullanıcılar', description: 'Hesaplar ve roller', href: '/admin/kullanicilar', Icon: Users, permissions: ['admin.users.view'] },
    { label: 'Kurumlar', description: 'Kurum pilotları', href: '/admin/kurumlar', Icon: Building2, permissions: ['institution.pilots.manage'] },
    { label: 'Arka Planlar', description: 'Görsel varlıklar', href: '/admin/arka-planlar', Icon: Image, permissions: ['admin.backgrounds.view'] },
    { label: 'Site ayarları', description: 'Platform yapılandırması', href: '/admin/ayarlar', Icon: Settings2, permissions: ['admin.settings.view'] },
  ] },
  { title: 'Görünüm ve denetim', description: 'Ana sayfa, ödüller ve yönetim kayıtları.', links: [
    { label: 'Anasayfa', description: 'Ana sayfa içeriği', href: '/admin/anasayfa-editor', Icon: House, permissions: ['admin.homepage.view'] },
    { label: 'Rozetler', description: 'Ödül görünümü', href: '/admin/rozetler', Icon: Award, permissions: ['admin.badges.view'] },
    { label: 'Loglar', description: 'İşlem kayıtları', href: '/admin/loglar', Icon: ScrollText, permissions: ['admin.logs.view'] },
    { label: 'Roller', description: 'Yönetici yetkileri', href: '/admin/roller', Icon: KeyRound, permissions: ['admin.roles.view'] },
  ] },
]

function canOpenReports(permissions: readonly string[], legacyReportsAvailable: boolean) {
  return permissions.includes('admin.reports.view')
    && (permissions.includes('admin.questions.view') || permissions.includes('content.appeals.manage') || legacyReportsAvailable)
}

function canAccess(link: DashboardLink, permissions: readonly string[], legacyReportsAvailable: boolean) {
  if (link.href === '/admin/raporlar') return canOpenReports(permissions, legacyReportsAvailable)
  return link.permissions.some((permission) => permissions.includes(permission))
    && (link.required ?? []).every((permission) => permissions.includes(permission))
}

function isAdminStats(value: unknown): value is AdminStats {
  if (!value || typeof value !== 'object') return false
  return STAT_CARDS.every(({ key }) => {
    const count = (value as Record<string, unknown>)[key]
    return typeof count === 'number' && Number.isSafeInteger(count) && count >= 0
  })
}

export default function AdminDashboard() {
  const [stats, setStats] = useState<AdminStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [permissions, setPermissions] = useState<string[] | null>(null)
  const [legacyReportsAvailable, setLegacyReportsAvailable] = useState<boolean | null>(null)

  useEffect(() => {
    let active = true
    async function fetchStats() {
      try {
        const res = await fetch('/api/admin/stats', { cache: 'no-store' })
        if (!res.ok) throw new Error('Statistics request failed')
        const data: unknown = await res.json()
        if (!isAdminStats(data)) throw new Error('Invalid statistics response')
        if (active) setStats(data)
      } catch {
        if (active) setError(true)
      } finally {
        if (active) setLoading(false)
      }
    }
    async function fetchPermissions() {
      try {
        const res = await fetch('/api/admin/me/permissions', { cache: 'no-store' })
        if (!res.ok) throw new Error('Permissions request failed')
        const data: unknown = await res.json()
        const allowed = data && typeof data === 'object' && 'permissions' in data && Array.isArray(data.permissions)
          ? data.permissions.filter((permission: unknown): permission is string => typeof permission === 'string')
          : []
        if (active) setPermissions(allowed)
        if (allowed.includes('admin.reports.view')) {
          try {
            const reportResponse = await fetch('/api/admin/reports?page=1', { cache: 'no-store' })
            if (active) setLegacyReportsAvailable(reportResponse.ok)
          } catch {
            if (active) setLegacyReportsAvailable(false)
          }
        }
      } catch {
        if (active) setPermissions([])
      }
    }
    void fetchStats()
    void fetchPermissions()
    return () => { active = false }
  }, [])

  const reportProbePending = permissions?.includes('admin.reports.view')
    && !permissions.includes('admin.questions.view')
    && !permissions.includes('content.appeals.manage')
    && legacyReportsAvailable === null

  return (
    <div className="mx-auto max-w-7xl space-y-7 pb-8 text-[var(--text)]">
      <header className="rounded-2xl border border-[var(--border)] bg-[var(--card-bg)] px-5 py-6 sm:px-7 sm:py-7">
        <p className="text-xs font-bold uppercase tracking-[0.14em] text-[var(--focus-text)]">Genel bakış</p>
        <h1 className="mt-2 font-display text-3xl font-black tracking-tight sm:text-4xl">Yönetim paneli</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--text-sub)]">Platformun temel sayıları ve yönetim işlerine tek yerden erişim.</p>
      </header>

      <section aria-labelledby="overview-title">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 id="overview-title" className="text-lg font-bold">Platform özeti</h2>
            <p className="text-sm text-[var(--text-sub)]">Güncel toplamlar ve inceleme bekleyen raporlar</p>
          </div>
          <span className="text-xs text-[var(--text-sub)]">Yönetici verisi</span>
        </div>
        {error && <div role="alert" className="mb-3 rounded-xl border border-[var(--urgency-border)] bg-[var(--urgency-bg)] px-4 py-3 text-sm">Sayılar şu anda alınamıyor. İşlem kartları kullanılabilir; veriyi daha sonra yeniden kontrol edin.</div>}
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
          {STAT_CARDS.map(({ key, label, Icon, tone }) => (
            <div key={key} className="min-w-0 rounded-xl border border-[var(--border)] bg-[var(--card-bg)] p-4 sm:p-5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-semibold text-[var(--text-sub)]">{label}</span>
                <Icon aria-hidden="true" className={`h-5 w-5 shrink-0 ${tone}`} />
              </div>
              <div className="mt-5 font-display text-2xl font-black tabular-nums sm:text-3xl" aria-label={loading || (key === 'pendingReports' && permissions?.includes('admin.reports.view') && legacyReportsAvailable === null) ? `${label} yükleniyor` : undefined}>
                {loading || (key === 'pendingReports' && permissions?.includes('admin.reports.view') && legacyReportsAvailable === null)
                  ? <span aria-hidden="true" className="block h-9 w-20 animate-pulse rounded bg-[var(--surface)]" />
                  : stats && (key !== 'pendingReports' || legacyReportsAvailable === true)
                    ? stats[key].toLocaleString('tr-TR')
                    : '—'}
              </div>
              {key === 'pendingReports' && !loading && stats && <p className="mt-1 text-xs text-[var(--text-sub)]">{legacyReportsAvailable === true ? (stats.pendingReports > 0 ? 'Eski kuyrukta inceleme gerekiyor' : 'Eski kuyrukta bekleyen yok') : 'Rapor sayısı burada doğrulanamadı'}</p>}
            </div>
          ))}
        </div>
      </section>

      {stats && stats.pendingReports > 0 && permissions?.includes('admin.reports.view') && legacyReportsAvailable === true && (
        <Link href="/admin/raporlar" className="flex min-h-14 items-center justify-between gap-4 rounded-xl border border-[var(--urgency-border)] bg-[var(--urgency-bg)] px-4 py-3 text-sm transition-colors hover:bg-[var(--card-bg)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus)]">
          <span><strong>{stats.pendingReports.toLocaleString('tr-TR')} bekleyen rapor</strong><span className="ml-2 text-[var(--text-sub)]">Bildirimleri incele</span></span>
          <ArrowUpRight aria-hidden="true" className="h-5 w-5 shrink-0" />
        </Link>
      )}

      <section aria-labelledby="workflows-title">
        <div className="mb-3">
          <h2 id="workflows-title" className="text-lg font-bold">Yönetim alanları</h2>
          <p className="text-sm text-[var(--text-sub)]">Yetkiniz olan alanlardan işinize devam edin.</p>
        </div>
        {permissions === null ? (
          <p role="status" className="rounded-xl border border-[var(--border)] bg-[var(--card-bg)] p-5 text-sm text-[var(--text-sub)]">Yönetim alanları yükleniyor…</p>
        ) : (
          <div className="grid gap-4 xl:grid-cols-2">
            {WORKFLOWS.map((group) => {
              const links = group.links.filter((link) => canAccess(link, permissions, legacyReportsAvailable === true))
              if (links.length === 0) return null
              return (
                <div key={group.title} className="rounded-2xl border border-[var(--border)] bg-[var(--card-bg)] p-4 sm:p-5">
                  <h3 className="text-base font-bold">{group.title}</h3>
                  <p className="mt-1 text-sm leading-5 text-[var(--text-sub)]">{group.description}</p>
                  <div className="mt-4 grid gap-2 sm:grid-cols-2">
                    {links.map(({ href, label, description, Icon }) => (
                      <Link key={href} href={href} className="group flex min-h-20 items-start gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3 transition-colors hover:border-[var(--focus-border)] hover:bg-[var(--focus-bg)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus)]">
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[var(--focus-bg)] text-[var(--focus-text)]"><Icon aria-hidden="true" className="h-5 w-5" /></span>
                        <span className="min-w-0 flex-1"><span className="block text-sm font-bold">{label}</span><span className="mt-0.5 block text-xs leading-5 text-[var(--text-sub)]">{description}</span></span>
                        <ArrowUpRight aria-hidden="true" className="h-4 w-4 shrink-0 text-[var(--text-sub)] transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
                      </Link>
                    ))}
                  </div>
                </div>
              )
            })}
            {reportProbePending && (
              <p role="status" className="rounded-xl border border-[var(--border)] bg-[var(--card-bg)] p-5 text-sm text-[var(--text-sub)]">Rapor alanı doğrulanıyor…</p>
            )}
            {!reportProbePending && WORKFLOWS.every((group) => group.links.every((link) => !canAccess(link, permissions, legacyReportsAvailable === true))) && (
              <p className="rounded-xl border border-[var(--border)] bg-[var(--card-bg)] p-5 text-sm text-[var(--text-sub)]">Bu panoda açılabilir iş akışı yok.</p>
            )}
          </div>
        )}
      </section>
    </div>
  )
}
