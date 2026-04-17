/**
 * Plausible custom event tracker.
 *
 * Kullanim:
 *   trackEvent('Signup')
 *   trackEvent('QuizComplete', { props: { game: 'matematik', score: 7, mode: 'classic' } })
 *
 * SSR-safe: server'da cagrilirsa sessizce atlar.
 * Fail-safe: plausible yuklenmemisse kuyruklar ve yuklenince gonderir (Plausible native davranis).
 *
 * Analytics URL: https://analytics.panola.app (VPS self-hosted Plausible CE)
 */

type PlausibleProps = Record<string, string | number | boolean>

interface PlausibleOptions {
  props?: PlausibleProps
  callback?: () => void
}

interface PlausibleQueue {
  (...args: unknown[]): void
  q?: unknown[][]
}

declare global {
  interface Window {
    plausible?: PlausibleQueue
  }
}

/**
 * Named custom events. Tip guvenli, auto-complete icin.
 * Yeni event eklerken buraya da ekle.
 */
export type EventName =
  | 'Signup'              // Yeni kullanici kaydi (auth callback sonrasi)
  | 'GuestQuizStart'      // Misafir quiz basladi
  | 'UserQuizStart'       // Kayitli kullanici quiz basladi
  | 'QuizComplete'        // Quiz bitti (misafir + kayitli)
  | 'GuestQuizComplete'   // Misafir quiz bitirdi (conversion moment)
  | 'ShareClick'          // Sosyal paylasim tiklamasi
  | 'DuelChallenge'       // Duello gonderildi
  | 'BadgeEarned'         // Yeni rozet kazanildi
  | 'StreakMilestone'     // Streak 3/7/14/30 milestone
  | 'DailyLogin'          // Gunluk giris XP'si alindi
  | 'PremiumUpsell'       // Premium'a gec CTA'si tiklandi
  | 'Day2Return'          // Kayit olan 2. gun geri geldi

/**
 * Plausible custom event gonder. Sessizce basarisiz olur (hic fırlatmaz).
 */
export function trackEvent(name: EventName, options?: PlausibleOptions): void {
  // SSR guard
  if (typeof window === 'undefined') return

  try {
    if (typeof window.plausible === 'function') {
      window.plausible(name, options)
    }
    // plausible yuklenmediyse native kuyruklama var (data-domain script otomatik)
  } catch {
    // Analytics hatalari sessizce atla — kullanici deneyimini bozma
  }
}

/**
 * Shortcut: sadece isim, prop yok
 */
export const track = trackEvent
