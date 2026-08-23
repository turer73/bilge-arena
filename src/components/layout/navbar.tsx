'use client'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Zap, Menu, X, User, LogOut, Trophy, Shield, Users, Swords, Palette, ShoppingBag, BookX, GraduationCap, Building2 } from 'lucide-react'
import { Logo } from './logo'
import { ThemeToggle } from './theme-toggle'
import { NotificationBell } from './notification-bell'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/lib/hooks/use-auth'
import { institutionPilotWorkspaceSchema } from '@/lib/institution-pilot/server-contract'
import { trUpper } from '@/lib/utils/tr-text'

const NAV_LINKS = [
  { href: '/', label: 'Ana Sayfa' },
  { href: '/arena', label: 'Oyunlar' },
  { href: '/arena/calisma', label: 'Ders Çalış' },
  { href: '/oda', label: 'Oda Modu' },
  { href: '/arena/siralama', label: 'Sıralama' },
  { href: '/nasil-calisir', label: 'Nasıl Çalışır' },
  { href: '/hakkinda', label: 'Hakkında' },
]

export function Navbar() {
  const [scrolled, setScrolled] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [institutionPanelVisible, setInstitutionPanelVisible] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const pathname = usePathname()
  const { user, profile, signOut } = useAuth()
  const userId = user?.id

  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 40)
    window.addEventListener('scroll', fn, { passive: true })
    return () => window.removeEventListener('scroll', fn)
  }, [])

  // Route degisince mobile menuyu kapat
  useEffect(() => {
    setMobileOpen(false)
    setDropdownOpen(false)
  }, [pathname])

  useEffect(() => {
    const controller = new AbortController()
    if (!userId) {
      queueMicrotask(() => {
        if (!controller.signal.aborted) setInstitutionPanelVisible(false)
      })
      return () => controller.abort()
    }
    fetch('/api/institution/workspace', { cache: 'no-store', signal: controller.signal })
      .then(async (response) => {
        const workspace = response.ok
          ? institutionPilotWorkspaceSchema.safeParse(await response.json().catch(() => null))
          : null
        if (!controller.signal.aborted) setInstitutionPanelVisible(workspace?.success === true)
      })
      .catch(() => {
        if (!controller.signal.aborted) setInstitutionPanelVisible(false)
    })
    return () => controller.abort()
  }, [userId])

  // Dropdown disina tiklaninca kapat
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  return (
    <nav
      data-app-navbar
      className={`fixed inset-x-0 top-0 z-50 transition-[background-color,backdrop-filter,border-color,box-shadow] duration-500 ${pathname === '/arena' ? 'max-lg:hidden' : ''} ${
        scrolled || mobileOpen
          ? 'border-b border-[var(--border)] bg-[var(--surface)]/90 backdrop-blur-xl shadow-sm'
          : 'bg-transparent backdrop-blur-none border-transparent'
      }`}
    >
      <div className="mx-auto flex h-[var(--navbar-h)] max-w-[1200px] items-center justify-between px-6 lg:px-8">
        {/* Logo */}
        <Logo size={36} />

        {/* Desktop nav links */}
        <div className="hidden items-center gap-1 md:flex">
          {NAV_LINKS.map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              className={`rounded-lg px-3.5 py-1.5 text-sm font-medium transition-colors hover:bg-[var(--card)] hover:text-[var(--text)] ${
                pathname === href
                  ? 'text-[var(--focus)]'
                  : 'text-[var(--text-sub)]'
              }`}
            >
              {label}
            </Link>
          ))}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-3">
          <ThemeToggle />

          {user ? (
            <>
              {/* Coin sayacı */}
              {profile && (
                <Link
                  href="/arena/profil"
                  className="hidden items-center gap-1 rounded-lg border border-[var(--border)] bg-[var(--card-bg)] px-2 py-1 text-[11px] font-bold text-[var(--reward-light)] transition-colors hover:border-[var(--reward-border)] sm:flex"
                  title="Coin bakiyesi"
                >
                  🪙 {(profile.coin_balance ?? 0).toLocaleString('tr-TR')}
                </Link>
              )}
              <Link href="/arena" className="hidden sm:inline-flex">
                <Button variant="primary" size="sm">
                  <Zap size={14} />
                  Oyna
                </Button>
              </Link>
              <NotificationBell />
              {/* User dropdown */}
              <div className="relative" ref={dropdownRef}>
                <button
                  onClick={() => setDropdownOpen(!dropdownOpen)}
                  className="flex items-center gap-2 rounded-lg px-2 py-1.5 transition-colors hover:bg-[var(--card)]"
                  aria-label="Kullanıcı menüsü"
                  aria-expanded={dropdownOpen}
                >
                  {profile?.avatar_url ? (
                    // Plain <img>: avatar SVG (hazır-avatar seti) next/image optimizer'ına takılır
                    <img
                      src={profile.avatar_url}
                      alt={profile?.username || profile?.display_name || 'Kullanıcı avatarı'}
                      className="h-8 w-8 rounded-full object-cover"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--focus)] text-sm font-bold text-white">
                      {trUpper((profile?.username || profile?.display_name || user.email || '?')[0])}
                    </div>
                  )}
                </button>

                {dropdownOpen && (
                  <div className="absolute right-0 top-full mt-2 w-56 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-1.5 shadow-xl">
                    <div className="mb-1.5 border-b border-[var(--border)] px-3 py-2">
                      <p className="text-sm font-medium text-[var(--text)]">
                        {profile?.username || profile?.display_name || 'Kullanıcı'}
                      </p>
                      <p className="text-xs text-[var(--text-muted)]">{user.email}</p>
                    </div>
                    <Link
                      href="/arena/profil"
                      className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-[var(--text-sub)] transition-colors hover:bg-[var(--card)] hover:text-[var(--text)]"
                    >
                      <User size={14} />
                      Profil
                    </Link>
                    <Link
                      href="/arena/calisma"
                      className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-[var(--text-sub)] transition-colors hover:bg-[var(--card)] hover:text-[var(--text)]"
                    >
                      <GraduationCap size={14} />
                      Ders Çalış
                    </Link>
                    <Link
                      href="/arena/yanlislarim"
                      className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-[var(--text-sub)] transition-colors hover:bg-[var(--card)] hover:text-[var(--text)]"
                    >
                      <BookX size={14} />
                      Yanlışlarım
                    </Link>
                    <Link
                      href="/arena/kisisellestir"
                      className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-[var(--text-sub)] transition-colors hover:bg-[var(--card)] hover:text-[var(--text)]"
                    >
                      <Palette size={14} />
                      Kişiselleştir
                    </Link>
                    <Link
                      href="/arena/magaza"
                      className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-[var(--text-sub)] transition-colors hover:bg-[var(--card)] hover:text-[var(--text)]"
                    >
                      <ShoppingBag size={14} />
                      Mağaza
                    </Link>
                    <Link
                      href="/arena/siralama"
                      className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-[var(--text-sub)] transition-colors hover:bg-[var(--card)] hover:text-[var(--text)]"
                    >
                      <Trophy size={14} />
                      Sıralama
                    </Link>
                    <Link
                      href="/arena/arkadaslar"
                      className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-[var(--text-sub)] transition-colors hover:bg-[var(--card)] hover:text-[var(--text)]"
                    >
                      <Users size={14} />
                      Arkadaşlar
                    </Link>
                    <Link
                      href="/oda"
                      className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-[var(--focus)] transition-colors hover:bg-[var(--focus-bg)]"
                    >
                      <Users size={14} />
                      Oda Modu
                    </Link>
                    <Link
                      href="/arena/duello"
                      className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-[var(--reward)] transition-colors hover:bg-[var(--reward-bg)]"
                    >
                      <Swords size={14} />
                      Duello
                    </Link>
                    {institutionPanelVisible && (
                      <>
                        <div className="my-1 border-t border-[var(--border)]" />
                        <Link
                          href="/arena/kurum"
                          className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-bold text-sky-300 transition-colors hover:bg-sky-400/10"
                        >
                          <Building2 size={14} />
                          Kurum Paneli
                        </Link>
                      </>
                    )}
                    {profile?.role === 'admin' && (
                      <>
                        <div className="my-1 border-t border-[var(--border)]" />
                        <Link
                          href="/admin"
                          className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-[var(--reward)] transition-colors hover:bg-[var(--reward-bg)]"
                        >
                          <Shield size={14} />
                          Admin Panel
                        </Link>
                      </>
                    )}
                    <button
                      onClick={signOut}
                      className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-red-400 transition-colors hover:bg-red-500/10"
                    >
                      <LogOut size={14} />
                      Çıkış Yap
                    </button>
                  </div>
                )}
              </div>
            </>
          ) : (
            <>
              <Link href="/giris" className="hidden sm:inline-flex">
                <Button variant="ghost" size="sm">
                  Giriş Yap
                </Button>
              </Link>
              <Link href="/arena" className="hidden sm:inline-flex">
                <Button variant="primary" size="sm">
                  <Zap size={14} />
                  Oyna
                </Button>
              </Link>
            </>
          )}

          {/* Mobile hamburger */}
          <button
            onClick={() => setMobileOpen(!mobileOpen)}
            className="flex min-h-11 min-w-11 items-center justify-center rounded-lg p-2 text-[var(--text-sub)] transition-colors hover:bg-[var(--card)] md:hidden"
            aria-label={mobileOpen ? 'Menüyü kapat' : 'Menüyü aç'}
            aria-expanded={mobileOpen}
            aria-controls="mobile-navigation"
          >
            {mobileOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      {mobileOpen && (
        <div id="mobile-navigation" key="mobile-menu" className="animate-slideDown border-t border-[var(--border)] bg-[var(--surface)]/95 backdrop-blur-xl md:hidden">
          <div className="flex flex-col gap-1 px-6 py-4">
            {NAV_LINKS.map(({ href, label }) => (
              <Link
                key={href}
                href={href}
                className={`rounded-lg px-4 py-2.5 text-sm font-medium transition-colors hover:bg-[var(--card)] ${
                  pathname === href
                    ? 'text-[var(--focus)] bg-[var(--focus-bg)]'
                    : 'text-[var(--text-sub)]'
                }`}
              >
                {label}
              </Link>
            ))}
            {user && institutionPanelVisible && (
              <Link
                href="/arena/kurum"
                className="mt-2 flex min-h-11 items-center gap-2 rounded-lg border border-sky-400/20 bg-sky-400/10 px-4 py-2.5 text-sm font-bold text-sky-200"
              >
                <Building2 size={16} />
                Kurum Paneli
              </Link>
            )}
            <div className="mt-2 flex gap-2">
              {user ? (
                <>
                  <Link href="/arena/profil" className="flex-1">
                    <Button variant="ghost" size="sm" className="w-full">
                      <User size={14} />
                      Profil
                    </Button>
                  </Link>
                  {profile?.role === 'admin' && (
                    <Link href="/admin" className="flex-1">
                      <Button variant="ghost" size="sm" className="w-full text-[var(--reward)]">
                        <Shield size={14} />
                        Admin
                      </Button>
                    </Link>
                  )}
                  <Button variant="ghost" size="sm" className="flex-1 text-red-400" onClick={signOut}>
                    <LogOut size={14} />
                    Çıkış
                  </Button>
                </>
              ) : (
                <>
                  <Link href="/giris" className="flex-1">
                    <Button variant="ghost" size="sm" className="w-full">
                      Giriş Yap
                    </Button>
                  </Link>
                  <Link href="/arena" className="flex-1">
                    <Button variant="primary" size="sm" className="w-full">
                      <Zap size={14} />
                      Oyna
                    </Button>
                  </Link>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </nav>
  )
}
