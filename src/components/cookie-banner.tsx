'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { motion, AnimatePresence } from 'framer-motion'
import { Shield, BarChart3, ChevronDown, ChevronUp } from 'lucide-react'
import { getCookieConsent, setCookieConsent } from '@/lib/consent'

type View = 'hidden' | 'banner' | 'settings'

export function CookieBanner() {
  const [view, setView] = useState<View>('hidden')
  const [analyticsOn, setAnalyticsOn] = useState(true)

  // Ilk yuklemede: onceki consent yoksa banner goster
  useEffect(() => {
    const existing = getCookieConsent()
    if (!existing) {
      const timer = setTimeout(() => setView('banner'), 1500)
      return () => clearTimeout(timer)
    }
  }, [])

  // Footer'dan gelen "tekrar ac" event'i
  useEffect(() => {
    const handler = () => {
      const existing = getCookieConsent()
      setAnalyticsOn(existing?.analytics ?? true)
      setView('banner')
    }
    window.addEventListener('open-consent-banner', handler)
    return () => window.removeEventListener('open-consent-banner', handler)
  }, [])

  const handleAcceptAll = useCallback(() => {
    setCookieConsent(true)
    setView('hidden')
  }, [])

  const handleRejectAll = useCallback(() => {
    setCookieConsent(false)
    setView('hidden')
  }, [])

  const handleSavePrefs = useCallback(() => {
    setCookieConsent(analyticsOn)
    setView('hidden')
  }, [analyticsOn])

  return (
    <AnimatePresence>
      {view !== 'hidden' && (
        <motion.div
          initial={{ y: '100%' }}
          animate={{ y: 0 }}
          exit={{ y: '100%' }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          className="fixed bottom-0 left-0 right-0 z-50 border-t border-[var(--border)] bg-[var(--card-bg)] shadow-lg backdrop-blur-sm"
        >
          <div className="mx-auto max-w-[1200px] px-4 py-4 sm:px-6">
            {/* ── Ana banner ── */}
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs leading-relaxed text-[var(--text-muted)] sm:text-sm">
                Bu site, deneyiminizi iyileştirmek için çerezler kullanır.
                Detaylar için{' '}
                <Link
                  href="/cerez-politikasi"
                  className="font-medium text-[var(--focus)] underline underline-offset-2"
                >
                  Çerez Politikamızı
                </Link>{' '}
                inceleyebilirsiniz.
              </p>

              <div className="flex shrink-0 items-center gap-2">
                <button
                  onClick={handleRejectAll}
                  className="rounded-lg border border-[var(--border)] px-4 py-2 text-xs font-semibold text-[var(--text-muted)] transition-colors hover:bg-[var(--surface)] hover:text-[var(--text)]"
                >
                  Tümünü Reddet
                </button>
                <button
                  onClick={handleAcceptAll}
                  className="rounded-lg bg-[var(--focus)] px-4 py-2 text-xs font-bold text-white transition-opacity hover:opacity-90"
                >
                  Tümünü Kabul Et
                </button>
                <button
                  onClick={() => setView(view === 'settings' ? 'banner' : 'settings')}
                  className="flex items-center gap-1 rounded-lg px-3 py-2 text-xs font-medium text-[var(--focus)] transition-colors hover:bg-[var(--focus)]/10"
                >
                  Özelleştir
                  {view === 'settings' ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                </button>
              </div>
            </div>

            {/* ── Kategori toggle paneli ── */}
            <AnimatePresence>
              {view === 'settings' && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.25 }}
                  className="overflow-hidden"
                >
                  <div className="mt-4 space-y-3 border-t border-[var(--border)] pt-4">
                    {/* Zorunlu cerezler */}
                    <div className="flex items-center justify-between rounded-lg bg-[var(--surface)] px-4 py-3">
                      <div className="flex items-center gap-3">
                        <Shield size={18} className="text-emerald-500" />
                        <div>
                          <p className="text-sm font-semibold text-[var(--text)]">
                            Zorunlu Çerezler
                          </p>
                          <p className="text-xs text-[var(--text-muted)]">
                            Oturum yönetimi, güvenlik, kimlik doğrulama
                          </p>
                        </div>
                      </div>
                      {/* Her zaman aktif — disabled toggle */}
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium text-emerald-500">Her zaman aktif</span>
                        <div className="h-6 w-11 rounded-full bg-emerald-500/20 p-0.5">
                          <div className="h-5 w-5 translate-x-5 rounded-full bg-emerald-500 transition-transform" />
                        </div>
                      </div>
                    </div>

                    {/* Analitik cerezler */}
                    <div className="flex items-center justify-between rounded-lg bg-[var(--surface)] px-4 py-3">
                      <div className="flex items-center gap-3">
                        <BarChart3 size={18} className="text-blue-400" />
                        <div>
                          <p className="text-sm font-semibold text-[var(--text)]">
                            Analitik Çerezler
                          </p>
                          <p className="text-xs text-[var(--text-muted)]">
                            Google Analytics, Plausible Analytics — anonim kullanım istatistikleri
                          </p>
                        </div>
                      </div>
                      <button
                        onClick={() => setAnalyticsOn(!analyticsOn)}
                        role="switch"
                        aria-checked={analyticsOn}
                        className={`h-6 w-11 shrink-0 rounded-full p-0.5 transition-colors ${
                          analyticsOn ? 'bg-[var(--focus)]' : 'bg-[var(--border)]'
                        }`}
                      >
                        <div
                          className={`h-5 w-5 rounded-full bg-white transition-transform ${
                            analyticsOn ? 'translate-x-5' : 'translate-x-0'
                          }`}
                        />
                      </button>
                    </div>

                    {/* Kaydet butonu */}
                    <div className="flex justify-end">
                      <button
                        onClick={handleSavePrefs}
                        className="rounded-lg bg-[var(--focus)] px-5 py-2 text-xs font-bold text-white transition-opacity hover:opacity-90"
                      >
                        Tercihlerimi Kaydet
                      </button>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
