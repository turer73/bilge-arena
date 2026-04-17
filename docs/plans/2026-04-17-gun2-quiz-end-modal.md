# Gun 2: Quiz-Son Modal Implementasyonu

**Oturum basligina kopyalayip yeni Claude oturumuna yapistir. Tek parca, self-contained.**

---

## Sen Kimsin, Ne Yapacaksin

Bilge Arena projesinde (YKS/TYT sinav hazirlik quiz platformu) **guest kullanicilari uyeye donusturmek icin** 3 seviyeli escalation modalini implemente edeceksin. Next.js 16 App Router + React 19 + Supabase + Zustand + Tailwind kullaniyoruz.

**Proje konumu:** `F:\projelerim\bilge-arena\`

## Proje Baglam Ozeti

- **10 aktif kullanici**, Instagram'dan organik trafik var
- **Play-first pattern**: Guest kullanicilar uye olmadan quiz oynayabilir (asla bozma)
- **Google OAuth** Supabase Auth ile kurulu, calisiyor
- **Plausible Analytics** self-hosted, custom event'ler tanimli
- **Husky pre-push** zorunlu: `npm run build && npm run test` gecmeden push edemezsin
- **Kalite skoru:** 8.58/10 (durust deger)

## Hedef: 3 Seviyeli Escalation Modal (Duolingo Pattern)

Guest quiz bitirdiginde uye olmaya cekmek icin giderek artan baskida CTA goster.

### Level 1 - Soft CTA (1. quiz bitiminde)
```
Baslik: "Skorunu Kaydet!"
Mesaj: "Bu harika skor kaybolmasin. Hesap acarak rozetlerini ve ilerlemesini kaydet."
Butonlar:
  - [Google ile Devam Et] (primary, Google ikonu)
  - [Belki sonra] (ghost, modal'i kapatir)
Dismissible: Evet (X butonu + ESC tusu + overlay click)
```

### Level 2 - Medium CTA (2. quiz bitiminde)
```
Baslik: "Streak'in Yakinda Kaybolacak"
Mesaj: "2 quiz cozdun ama hic kaydetmedin. Yarin giris yapmadan ilerlemeni kaybedeceksin. Simdi hesap ac, streak'ini koru."
Butonlar:
  - [Google ile Kaydet] (primary)
  - [Daha sonra] (ghost)
Dismissible: Evet, ama gorsel agirlik daha fazla (urgency border + warning ikonu)
```

### Level 3 - Hard Wall (3. ve sonraki quiz bitimlerinde)
```
Baslik: "Son Sans!"
Mesaj: "3 quiz cozdun, cok iyi gidiyorsun! Devam etmek icin hesap ac. Rozetlerin, XP'n, siralamada yerin - hepsi seni bekliyor."
Butonlar:
  - [Google ile Hemen Baslat] (primary, buyuk, pulsing animation)
  - [Lobiye Don] (ghost - NOT: Kapat degil, lobiye donduruyor)
Dismissible: HAYIR (X butonu yok, ESC/overlay calismaz, sadece butonlar)
```

## Olusturulacak Dosyalar

### 1. `src/lib/hooks/use-guest-session.ts` (YENI)

Guest quiz sayacini localStorage ile yonetir.

```typescript
'use client'

import { useCallback, useEffect, useState } from 'react'

const GUEST_QUIZ_COUNT_KEY = 'guest_quiz_count'

/**
 * Guest kullanicilar icin quiz tamamlama sayacini yonetir.
 * localStorage'da tutulur, kayit olduktan sonra temizlenir.
 */
export function useGuestSession() {
  const [quizCount, setQuizCount] = useState<number>(0)

  useEffect(() => {
    try {
      const stored = localStorage.getItem(GUEST_QUIZ_COUNT_KEY)
      setQuizCount(stored ? parseInt(stored, 10) || 0 : 0)
    } catch {
      // Safari private mode vb. - sessizce atla
    }
  }, [])

  const incrementQuizCount = useCallback((): number => {
    try {
      const current = parseInt(localStorage.getItem(GUEST_QUIZ_COUNT_KEY) ?? '0', 10) || 0
      const next = current + 1
      localStorage.setItem(GUEST_QUIZ_COUNT_KEY, String(next))
      setQuizCount(next)
      return next
    } catch {
      return quizCount + 1
    }
  }, [quizCount])

  const resetQuizCount = useCallback(() => {
    try {
      localStorage.removeItem(GUEST_QUIZ_COUNT_KEY)
      setQuizCount(0)
    } catch {
      // yoksay
    }
  }, [])

  return { quizCount, incrementQuizCount, resetQuizCount }
}

/**
 * Level hesaplama: 1.quiz -> 1, 2.quiz -> 2, 3+.quiz -> 3
 */
export function computePromptLevel(quizCount: number): 1 | 2 | 3 {
  if (quizCount <= 1) return 1
  if (quizCount === 2) return 2
  return 3
}
```

### 2. `src/components/game/signup-prompt-modal.tsx` (YENI)

Modal bileseni - 3 seviyeli.

```typescript
'use client'

import { useEffect, useRef } from 'react'
import { useAuth } from '@/lib/hooks/use-auth'
import { trackEvent } from '@/lib/utils/plausible'

interface SignupPromptModalProps {
  level: 1 | 2 | 3
  open: boolean
  onDismiss: () => void
  onExitToLobby: () => void // sadece Level 3'te kullanilir
}

const LEVEL_CONFIG = {
  1: {
    title: 'Skorunu Kaydet!',
    message: 'Bu harika skor kaybolmasin. Hesap acarak rozetlerini ve ilerlemesini kaydet.',
    primaryCta: 'Google ile Devam Et',
    secondaryCta: 'Belki sonra',
    borderColor: 'var(--focus-border)',
    iconEmoji: '',
  },
  2: {
    title: 'Streak\'in Yakinda Kaybolacak',
    message: '2 quiz cozdun ama hic kaydetmedin. Yarin giris yapmadan ilerlemeni kaybedeceksin. Simdi hesap ac, streak\'ini koru.',
    primaryCta: 'Google ile Kaydet',
    secondaryCta: 'Daha sonra',
    borderColor: 'var(--reward-border)',
    iconEmoji: '',
  },
  3: {
    title: 'Son Sans!',
    message: '3 quiz cozdun, cok iyi gidiyorsun! Devam etmek icin hesap ac. Rozetlerin, XP\'n, siralamada yerin - hepsi seni bekliyor.',
    primaryCta: 'Google ile Hemen Baslat',
    secondaryCta: 'Lobiye Don',
    borderColor: 'var(--urgency-border)',
    iconEmoji: '',
  },
} as const

export function SignupPromptModal({ level, open, onDismiss, onExitToLobby }: SignupPromptModalProps) {
  const { signInWithGoogle } = useAuth()
  const tracked = useRef(false)
  const config = LEVEL_CONFIG[level]
  const isHardWall = level === 3

  // Gosterildigi an event fire
  useEffect(() => {
    if (!open || tracked.current) return
    tracked.current = true
    trackEvent('PromptShown', { props: { level } })
  }, [open, level])

  // ESC ve overlay kapatma - sadece soft/medium icin
  useEffect(() => {
    if (!open || isHardWall) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        trackEvent('PromptDismissed', { props: { level, method: 'esc' } })
        onDismiss()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, isHardWall, level, onDismiss])

  if (!open) return null

  const handlePrimary = async () => {
    trackEvent('PromptCtaClicked', { props: { level, outcome: 'signup' } })
    await signInWithGoogle()
  }

  const handleSecondary = () => {
    if (isHardWall) {
      trackEvent('PromptCtaClicked', { props: { level, outcome: 'exit_lobby' } })
      onExitToLobby()
    } else {
      trackEvent('PromptDismissed', { props: { level, method: 'button' } })
      onDismiss()
    }
  }

  const handleOverlayClick = () => {
    if (isHardWall) return
    trackEvent('PromptDismissed', { props: { level, method: 'overlay' } })
    onDismiss()
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="prompt-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fadeUp"
    >
      {/* Overlay */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={handleOverlayClick}
        aria-hidden="true"
      />

      {/* Modal */}
      <div
        className="relative w-full max-w-md rounded-2xl border bg-[var(--card-bg)] p-6 shadow-2xl md:p-8"
        style={{ borderColor: config.borderColor }}
      >
        {/* X butonu - hard wall'da yok */}
        {!isHardWall && (
          <button
            onClick={handleSecondary}
            className="absolute right-3 top-3 rounded-lg p-1.5 text-[var(--text-sub)] transition-colors hover:bg-[var(--surface)] hover:text-[var(--text)]"
            aria-label="Kapat"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        )}

        {/* Baslik */}
        <h2 id="prompt-modal-title" className="mb-3 font-display text-xl font-black md:text-2xl">
          {config.title}
        </h2>

        {/* Mesaj */}
        <p className="mb-6 text-sm leading-relaxed text-[var(--text-sub)] md:text-base">
          {config.message}
        </p>

        {/* Butonlar */}
        <div className={`flex ${isHardWall ? 'flex-col' : 'flex-col sm:flex-row'} gap-2`}>
          <button
            onClick={handlePrimary}
            className={`btn-primary ${isHardWall ? 'animate-pulse' : ''} flex flex-1 items-center justify-center gap-2 rounded-[10px] py-3 font-display text-sm font-bold tracking-wider`}
          >
            <GoogleIcon />
            <span>{config.primaryCta}</span>
          </button>
          <button
            onClick={handleSecondary}
            className="btn-ghost flex-1 rounded-[10px] py-3 text-sm font-bold"
          >
            {config.secondaryCta}
          </button>
        </div>
      </div>
    </div>
  )
}

function GoogleIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
    </svg>
  )
}
```

### 3. Modifikasyon: `src/components/game/result-screen.tsx`

Bu dosya ZATEN var. Sadece modal entegrasyonu ekle. Mevcut yapisi:
- `useQuizStore`, `useAuthStore` import'lari var
- `trackEvent` import'u var
- `useEffect` ile tracked ref'i QuizComplete icin kullaniyor

Eklenecek degisiklikler:
```typescript
// ust kisma ekle:
import { useState, useEffect, useRef } from 'react'
import { SignupPromptModal } from './signup-prompt-modal'
import { useGuestSession, computePromptLevel } from '@/lib/hooks/use-guest-session'

// component icinde, mevcut state yaninda:
const { incrementQuizCount } = useGuestSession()
const [promptOpen, setPromptOpen] = useState(false)
const [promptLevel, setPromptLevel] = useState<1 | 2 | 3>(1)
const isGuest = !user

// Mevcut useEffect (QuizComplete tracker) ALTINA yeni bir useEffect ekle:
const promptInitialized = useRef(false)
useEffect(() => {
  if (promptInitialized.current) return
  if (!isGuest) return // auth'lu kullaniciya gosterme
  promptInitialized.current = true

  const nextCount = incrementQuizCount()
  const level = computePromptLevel(nextCount)
  setPromptLevel(level)
  // Kucuk gecikme - stat animasyonlari bitsin
  const timer = setTimeout(() => setPromptOpen(true), 1500)
  return () => clearTimeout(timer)
}, [isGuest, incrementQuizCount])

// JSX return'unun EN ALTINA (div icinde, son satir) ekle:
{isGuest && (
  <SignupPromptModal
    level={promptLevel}
    open={promptOpen}
    onDismiss={() => setPromptOpen(false)}
    onExitToLobby={onExit}
  />
)}
```

### 4. Modifikasyon: `src/components/game/deneme-result.tsx`

Ayni pattern. Ayni modifikasyonu uygula.

## Plausible Event Listesini Genislet

Dosya: `src/lib/utils/plausible.ts`

Mevcut EventName union'ina 3 yeni event ekle:
```typescript
export type EventName =
  | 'Signup' | 'GuestQuizStart' | 'UserQuizStart'
  | 'QuizComplete' | 'GuestQuizComplete' | 'ShareClick'
  | 'DuelChallenge' | 'BadgeEarned' | 'StreakMilestone'
  | 'DailyLogin' | 'PremiumUpsell' | 'Day2Return'
  // Gun 2 modal:
  | 'PromptShown'
  | 'PromptCtaClicked'
  | 'PromptDismissed'
```

VPS'de Plausible Goals tablosuna ekleme yapmak gerekir (SSH ile):
```sql
-- Plausible PostgreSQL
INSERT INTO goals (site_id, event_name, inserted_at, updated_at, display_name)
VALUES
  (1, 'PromptShown', NOW(), NOW(), 'PromptShown'),
  (1, 'PromptCtaClicked', NOW(), NOW(), 'PromptCtaClicked'),
  (1, 'PromptDismissed', NOW(), NOW(), 'PromptDismissed');
```

## Ironic Kurallar (IHLAL YOK)

1. **Play-first pattern'i BOZMA**: Guest hala quiz baslatabilmeli, bitirebilmeli, sonucu gormeli. Modal sonradan cikar.
2. **Auth'lu kullaniciya modal GOSTERME**: `isGuest` kontrolu zorunlu. 
3. **Pre-push hook ATLAMA**: `npm run build && npm run test` gecmeden push yok. `--no-verify` YASAK.
4. **Turkce karakter BOZMA**: Tum UI string'leri Turkce karakterli olmali (mesela "Belki sonra" degil "Belki sonra" - `i` ile `I` farkli).
5. **Mevcut share buttons / stat card'lari KALDIRMA**: Modal EKLE, mevcut UI'yi koruyarak.
6. **Kayit sonrasi sayacı RESET et**: `use-auth.ts`'de signup event tetiklendiginde `resetQuizCount()` cagir.

## Verification Checklist (ZORUNLU, Evidence-based)

Kod yazdiktan sonra, claim yapmadan once HER BIRINI calistir ve ciktiyi oku:

```bash
cd F:/projelerim/bilge-arena

# 1. Lint
npm run lint
# Beklenen: 0 errors, 0 warnings (yeni dosyalarda)

# 2. Type check
npm run type-check
# Beklenen: exit 0, hata yok

# 3. Test
npm run test
# Beklenen: tum testler gecer (yeni test yazdiysa onlar da)

# 4. Build
npm run build
# Beklenen: exit 0, Next.js build basarili
```

**HER SEYI GECTIYSE** bu durumlari manuel test et (npm run dev ile):

- [ ] Guest olarak quiz baslat, tamamla -> Level 1 modal gorunuyor mu? (1.5s gecikme var)
- [ ] Modal'i "Belki sonra" ile kapat -> result screen gorunur kalmali
- [ ] Yeni quiz baslat, tamamla -> Level 2 modal gorunuyor mu? (farkli mesaj)
- [ ] Uclenci quiz -> Level 3 modal gorunuyor mu? X butonu YOK, ESC calismaz
- [ ] Level 3'te "Lobiye Don" -> onExit cagriliyor mu?
- [ ] Auth'lu kullaniciyla quiz bitir -> modal HIC gorunmemeli
- [ ] Google ile giris basarili -> localStorage'daki `guest_quiz_count` temizlenmeli

## Manuel Test Ipuclari

Guest simulasyonu icin:
```javascript
// Browser console
localStorage.removeItem('guest_quiz_count')  // reset
localStorage.setItem('guest_quiz_count', '2') // Level 2 simule et
localStorage.setItem('guest_quiz_count', '5') // Level 3 simule et
```

Auth store temizle (guest mode zorla):
```javascript
// Eger zaten loginliyse signOut() fonksiyonunu cagir
```

## Ilgili Dosyalarin Su Anki Yapisi (Referans Icin)

**`src/lib/hooks/use-auth.ts`**: Google OAuth, profile sync, Signup/Day2Return event tracking var. `signInWithGoogle()` fonksiyonu dogrudan kullanilabilir.

**`src/components/game/result-screen.tsx`**: Quiz sonucu UI'si. useRef guard ile QuizComplete event'i tetikleniyor. `onRestart` ve `onExit` prop'lari var. JSX'in en altinda butonlar var.

**`src/components/game/deneme-result.tsx`**: Deneme sinavi sonucu. result-screen'den farkli (kategori analizi var). Yine `onRestart` ve `onExit` prop'lari mevcut.

**`src/lib/utils/plausible.ts`**: `trackEvent(name, options)` fonksiyonu. SSR-safe (window check), fail-safe (try-catch). Yeni event eklemek icin union'a eklemek yeterli.

**`src/stores/auth-store.ts`**: Zustand store. `user`, `profile`, `loading`, `setUser`, `setProfile`, `setLoading`, `signOut` icerir. `useAuthStore()` ile erisilir.

**Tailwind design tokens (sitede tanimli):**
- `var(--growth)` - yesil (basari)
- `var(--focus)` - mavi (bilgi)
- `var(--reward)` - altin/sari (odul)
- `var(--urgency)` - kirmizi (acil)
- `var(--wisdom)` - mor (bilgelik)
- `var(--card-bg)`, `var(--surface)`, `var(--border)` - yuzey tokenlari
- `var(--text)`, `var(--text-sub)` - metin tokenlari
- `var(--*-border)`, `var(--*-bg)` - her renk icin varyant

**Mevcut animasyon siniflari:**
- `animate-fadeUp` (0.4s fadeUp)
- `animate-rankReveal` (rank ortaya cikma)
- `animate-pulse` (Tailwind default)

## Tahmini Efor

- Implementasyon: 3 saat
- Test + verification: 1 saat
- **Toplam: 4 saat**

## Rollback Plani

Modal bir sorun yaratirsa:
1. **Hizli fix**: `result-screen.tsx` ve `deneme-result.tsx`'de `SignupPromptModal` import'unu ve JSX kullanimini kaldir. Git ile revert et.
2. **Env flag**: `NEXT_PUBLIC_ENABLE_PROMPT_MODAL=false` tanimla, modal'de `if (!process.env.NEXT_PUBLIC_ENABLE_PROMPT_MODAL) return null` kontrolu ekle (opsiyonel ek guvenlik).

## Ilerleyen Gunler Icin Notlar (Implemente ETME, sadece baglam)

- **Gun 3**: Email capture widget (newsletter tarzi modal)
- **Gun 4-5**: Telegram bot (n8n workflow ile)
- **Gun 6-7**: E2E Playwright testi
- **Sonraki sprint**: Oda/Room ozelligi (BilgiArena rakibinden ilham, 2 gun MVP)

## Durust Uyarilar

1. **Son cevap modal boyutu mobile'de sigmazsa**: max-h ve overflow-y-auto ekle.
2. **Level 3'te kullanici X butonunu aramaya calisabilir**: "Lobiye Don" butonu cikis yoludur, mesaji aciklayici.
3. **Guest sayaci birden fazla cihazda senkronlanmaz**: localStorage lokal. Bu kabul edilebilir (MVP icin).
4. **Modal'in kendi testleri olmali mi?**: Evet, en azindan unit test: her 3 level render edilebilir mi, dismiss calisiyor mu, event'ler tetikleniyor mu. Playwright E2E Gun 6-7'de.

## Baslarken Adimlar

```bash
cd F:/projelerim/bilge-arena

# 1. Mevcut durumu kontrol et
git status
git log --oneline -5

# 2. Yeni branch (opsiyonel ama onerilir)
git checkout -b feat/gun2-signup-prompt

# 3. Dosyalari olustur
# (Write tool ile)

# 4. Verification (yukaridaki checklist)

# 5. Commit + push
git add .
git commit -m "feat: guest signup prompt modal (3-level escalation)"
git push -u origin feat/gun2-signup-prompt

# 6. Vercel preview URL'sinde manuel test
# 7. Merge'e hazirsa PR ac veya main'e merge et
```

## Son Soz

Bu proje 10 gercek kullanici olan, para kazanmasi beklenen, Instagram'da pazarlanan bir urun. **Her degisiklik verification ile gerceklesmeli** - "calisiyordu herhalde" kabul edilmez. Evidence olmadan claim yapma.

Play-first pattern **kutsaldir**: Kullanici modal'dan cikabilir, quiz sonucu yine gorunur kalmali. Uyeligi zorla degil, ikna et.

Turkce karakter kontrolu: Build oncesi `grep -rE "BASARI|DOGRU|YANLIS|SURE" src/ --include="*.tsx"` bos dondurmeli (ASCII yazim kalmamis olmali - TURKCE `DOGRU` degil `DOGRU` yani diacritic'li).

Iyi calismalar.
