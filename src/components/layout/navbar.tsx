'use client'

import { useState, useEffect, useRef } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Zap, Menu, X, User, LogOut, Trophy, Shield, Users } from 'lucide-react'
import { Logo } from './logo'
import { ThemeToggle } from './theme-toggle'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/lib/hooks/use-auth'

const NAV_LINKS = [
  { href: '/', label: 'Ana Sayfa' },
  { href: '/arena', label: 'Oyunlar' },
  { href: '/arena/siralama', label: 'Sıralama' },
  { href: '/nasil-calisir', label: 'Nasıl Çalışır' },
  { href: '/hakkinda', label: 'Hakkında' },
]

export function Navbar() {
  const [scrolled, setScrolled] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const pathname = usePathname()
  const { user, profile, signOut } = useAuth()

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
      className={`fixed inset-x-0 top-0 z-50 transition-all duration-300 ${
        scrolled || mobileOpen
          ? 'border-b border-[var(--border)] bg-[var(--surface)]/90 backdrop-blur-xl'
          : 'bg-transparent'
      }`}
    >
      <div className="mx-auto flex h-[72px] max-w-[1200px] items-center justify-between px-6 lg:px-8">
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
              <Link href="/arena" className="hidden sm:inline-flex">
                <Button variant="primary" size="sm">
                  <Zap size={14} />
                  Oyna
                </Button>
              </Link>
              {/* User dropdown */}
              <div className="relative" ref={dropdownRef}>
                <button
                  onClick={() => setDropdownOpen(!dropdownOpen)}
                  className="flex items-center gap-2 rounded-lg px-2 py-1.5 transition-colors hover:bg-[var(--card)]"
                  aria-label="Kullanici menusu"
                  aria-expanded={dropdownOpen}
                >
                  {profile?.avatar_url ? (
                    <Image
                      src={profile.avatar_url}
                      alt={profile?.username || profile?.display_name || 'Kullanici avatari'}
                      width={32}
                      height={32}
                      className="h-8 w-8 rounded-full"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--focus)] text-sm font-bold text-white">
                      {(profile?.username || profile?.display_name || user.email || '?')[0].toUpperCase()}
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
                      Arkadaslar
                    </Link>
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
            className="flex items-center justify-center rounded-lg p-2 text-[var(--text-sub)] transition-colors hover:bg-[var(--card)] md:hidden"
            aria-label="Menu"
          >
            {mobileOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      {mobileOpen && (
        <div className="border-t border-[var(--border)] bg-[var(--surface)]/95 backdrop-blur-xl md:hidden">
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
