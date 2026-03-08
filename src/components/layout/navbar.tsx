'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Zap, Menu, X } from 'lucide-react'
import { Logo } from './logo'
import { ThemeToggle } from './theme-toggle'
import { Button } from '@/components/ui/button'

const NAV_LINKS = [
  { href: '/', label: 'Ana Sayfa' },
  { href: '/arena', label: 'Oyunlar' },
  { href: '/arena/siralama', label: 'Siralama' },
  { href: '/nasil-calisir', label: 'Nasil Calisir' },
  { href: '/hakkinda', label: 'Hakkinda' },
]

export function Navbar() {
  const [scrolled, setScrolled] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const pathname = usePathname()

  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 40)
    window.addEventListener('scroll', fn, { passive: true })
    return () => window.removeEventListener('scroll', fn)
  }, [])

  // Route degisince mobile menuyu kapat
  useEffect(() => {
    setMobileOpen(false)
  }, [pathname])

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
          <Link href="/giris" className="hidden sm:inline-flex">
            <Button variant="ghost" size="sm">
              Giris Yap
            </Button>
          </Link>
          <Link href="/arena" className="hidden sm:inline-flex">
            <Button variant="primary" size="sm">
              <Zap size={14} />
              Oyna
            </Button>
          </Link>

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
              <Link href="/giris" className="flex-1">
                <Button variant="ghost" size="sm" className="w-full">
                  Giris Yap
                </Button>
              </Link>
              <Link href="/arena" className="flex-1">
                <Button variant="primary" size="sm" className="w-full">
                  <Zap size={14} />
                  Oyna
                </Button>
              </Link>
            </div>
          </div>
        </div>
      )}
    </nav>
  )
}
