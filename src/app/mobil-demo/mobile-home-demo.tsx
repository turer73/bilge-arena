'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  BookOpenText,
  Building2,
  Calculator,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Flame,
  FlaskConical,
  Gem,
  Globe2,
  GraduationCap,
  Languages,
  Lightbulb,
  Lock,
  MessageCircle,
  Play,
  Settings,
  ShoppingBag,
  ShieldCheck,
  Sparkles,
  Star,
  Target,
  Trophy,
  X,
  type LucideIcon,
} from 'lucide-react'
import { BottomNav } from '@/components/layout/bottom-nav'
import { useTopicProgress } from '@/lib/hooks/use-topic-progress'
import { GAMES } from '@/lib/constants/games'

export const COACH_SEEN_STORAGE_KEY = 'ba-coach-seen'

export function coachSeenStorageKey(userId?: string | null) {
  return `${COACH_SEEN_STORAGE_KEY}:${userId ?? 'guest'}`
}

/** Koc penceresi gunde bir kez karsilar; ayni gun tekrar acilmaz. */
function coachSeenToday(userId?: string | null) {
  try {
    return window.localStorage.getItem(coachSeenStorageKey(userId)) === new Date().toDateString()
  } catch {
    // localStorage kapaliysa (gizli sekme/kisitli tarayici) koc gosterilir.
    return false
  }
}

function markCoachSeen(userId?: string | null) {
  try {
    window.localStorage.setItem(coachSeenStorageKey(userId), new Date().toDateString())
  } catch {
    // sessiz gec: kayit edilemezse en fazla bir kez daha gosterilir
  }
}

export type MobileSubjectId = 'matematik' | 'turkce' | 'fen' | 'sosyal' | 'ingilizce'
type SubjectId = MobileSubjectId

interface MobileHomeDemoProps {
  mode?: 'demo' | 'live'
  examLabel?: 'YKS' | 'LGS'
  /** Canli yoldaki cevaplari TYT/AYT/LGS kapsaminda ayirir. */
  examRef?: string | null
  availableSubjects?: MobileSubjectId[]
  currentStreak?: number
  coinBalance?: number
  totalXP?: number
  displayName?: string
  dailyGoal?: { current: number; target: number } | null
  classroomEnabled?: boolean
  institutionEnabled?: boolean
  showBottomNav?: boolean
  /** Canli modda gercek ilerlemeyi cekmek icin; demo modunda gerekmez. */
  userId?: string | null
}

interface Subject {
  id: SubjectId
  label: string
  shortLabel: string
  icon: LucideIcon
  color: string
  shadow: string
  unit: string
  description: string
  topics: string[]
}

const SUBJECTS: Subject[] = [
  {
    id: 'matematik', label: 'Matematik', shortLabel: 'Mat', icon: Calculator,
    color: '#2563eb', shadow: '#1d4ed8', unit: 'TYT Matematik · Ünite 3',
    description: 'Temel kavramlardan problemlere ilerle',
    topics: ['Temel Kavramlar', 'Sayı Basamakları', 'Bölme ve Bölünebilme', 'EBOB · EKOK', 'Rasyonel Sayılar', 'Mini Ünite Sınavı'],
  },
  {
    id: 'turkce', label: 'Türkçe', shortLabel: 'Türkçe', icon: BookOpenText,
    color: '#f97316', shadow: '#ea580c', unit: 'TYT Türkçe · Ünite 2',
    description: 'Paragrafı hızla çöz, anlamı yakala',
    topics: ['Sözcükte Anlam', 'Cümlede Anlam', 'Paragrafın Yapısı', 'Ana Düşünce', 'Anlatım Teknikleri', 'Mini Ünite Sınavı'],
  },
  {
    id: 'fen', label: 'Fen Bilimleri', shortLabel: 'Fen', icon: FlaskConical,
    color: '#10b981', shadow: '#059669', unit: 'TYT Fen · Ünite 1',
    description: 'Fizik, kimya ve biyolojiyi keşfet',
    topics: ['Fizik Bilimine Giriş', 'Madde ve Özellikleri', 'Atomun Yapısı', 'Canlıların Ortak Özellikleri', 'Hücre', 'Mini Ünite Sınavı'],
  },
  {
    id: 'sosyal', label: 'Sosyal Bilimler', shortLabel: 'Sosyal', icon: Globe2,
    color: '#8b5cf6', shadow: '#7c3aed', unit: 'TYT Sosyal · Ünite 2',
    description: 'Tarih ve coğrafyada bağlantıları kur',
    topics: ['Tarih Bilimine Giriş', 'İlk Uygarlıklar', 'Harita Bilgisi', 'İklim Bilgisi', 'Felsefenin Konusu', 'Mini Ünite Sınavı'],
  },
  {
    id: 'ingilizce', label: 'İngilizce', shortLabel: 'YDT', icon: Languages,
    color: '#06b6d4', shadow: '#0891b2', unit: 'YDT İngilizce · Ünite 4',
    description: 'Kelime hazneni her gün biraz büyüt',
    topics: ['Daily Vocabulary', 'Phrasal Verbs', 'Tenses', 'Cloze Test', 'Reading Skills', 'Mini Ünite Sınavı'],
  },
]

const COACH_MESSAGES = [
  {
    eyebrow: 'Bugünkü rota',
    title: 'Hazırsın, Bilgin!',
    body: 'Bölme ve Bölünebilme için 10 soruluk kısa dersin hazır. Yaklaşık 4 dakikada tamamlayabilirsin.',
    icon: Sparkles,
    color: 'var(--app-accent-text)',
    tint: 'var(--app-accent-tint)',
  },
  {
    eyebrow: 'Mini taktik',
    title: 'Önce kuralı yakala',
    body: 'Soruyu çözmeden önce son basamaklara bak. Bölünebilme kuralları sana zaman kazandırır.',
    icon: Lightbulb,
    color: 'var(--app-warn)',
    tint: 'var(--app-warn-tint)',
  },
  {
    eyebrow: 'Günlük hedef',
    title: 'Yalnızca 4 soru kaldı!',
    body: 'Bu dersi tamamladığında günlük hedefini geçip serini korumaya yaklaşacaksın.',
    icon: Target,
    color: 'var(--app-success)',
    tint: 'var(--app-success-tint)',
  },
]

function Resource({ icon: Icon, value, color, label }: {
  icon: LucideIcon
  value: string | number
  color: string
  label: string
}) {
  return (
    <div aria-label={`${label}: ${value}`} className="flex min-h-11 items-center gap-1 text-sm font-black" style={{ color }}>
      <Icon aria-hidden="true" size={20} fill="currentColor" strokeWidth={2.7} />
      <span className="tabular-nums">{value}</span>
    </div>
  )
}

interface PathStepModel {
  key: string
  label: string
  href: string
  index: number
  done: boolean
  current: boolean
  exam: boolean
  locked: boolean
}

/** Yilan (boustrophedon) yerlesim: 1. satir soldan saga, 2. satir sagdan sola. */
function snakeColumn(index: number) {
  const evenRow = Math.floor(index / 2) % 2 === 0
  const leftFirst = index % 2 === 0
  return evenRow === leftFirst ? 1 : 2
}

/** Adim sayisina gore kesikli baglanti yolunu uretir (viewBox 0 0 100 100). */
function snakePath(count: number) {
  const rows = Math.max(1, Math.ceil(count / 2))
  const rowY = (row: number) => ((row + 0.5) / rows) * 100
  let d = `M25 ${rowY(0).toFixed(1)}`
  for (let row = 0; row < rows; row += 1) {
    const endsRight = row % 2 === 0
    d += ` H${endsRight ? 75 : 25}`
    if (row < rows - 1) d += ` V${rowY(row + 1).toFixed(1)}`
  }
  return d
}

function PathStep({ step, subject }: { step: PathStepModel; subject: Subject }) {
  const { done, current, exam, locked } = step
  const Icon = done ? Check : current ? Star : exam ? Trophy : locked ? Lock : BookOpenText

  return (
    <Link
      href={step.href}
      aria-label={`${step.label} dersini aç`}
      aria-disabled={locked || undefined}
      tabIndex={locked ? -1 : undefined}
      onClick={(event) => {
        if (locked) event.preventDefault()
      }}
      className="group relative z-10 flex min-h-16 items-center gap-2 rounded-[18px] border-2 bg-[var(--app-card)] p-2 outline-none transition-transform active:translate-y-1 focus-visible:ring-4 focus-visible:ring-[var(--app-accent)]"
      style={{
        gridColumn: snakeColumn(step.index),
        gridRow: Math.floor(step.index / 2) + 1,
        borderColor: current ? subject.color : 'var(--app-border)',
        background: current ? `${subject.color}0d` : 'var(--app-card)',
        boxShadow: `0 4px 0 ${current ? subject.shadow : 'var(--app-shadow)'}`,
      }}
    >
      <span
        className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-[14px] text-white"
        style={{ background: locked ? 'var(--app-disabled)' : subject.color }}
      >
        <Icon aria-hidden="true" size={21} fill={current || exam ? 'currentColor' : 'none'} strokeWidth={3} />
        {done && <span className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full border-2 border-[var(--app-card)] bg-[var(--app-success-solid)]"><Check size={10} strokeWidth={4} /></span>}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[9px] font-black uppercase tracking-[0.08em]" style={{ color: current ? subject.color : done ? 'var(--app-success)' : 'var(--app-text-muted)' }}>
          {current ? 'Sıradaki' : done ? 'Tamamlandı' : exam ? 'Ünite sonu' : `${step.index + 1}. ders`}
        </span>
        <span className={`mt-0.5 block text-[11px] font-extrabold leading-[13px] ${locked ? 'text-[var(--app-text-muted)]' : 'text-[var(--app-text)]'}`}>{step.label}</span>
      </span>
    </Link>
  )
}

function compactNumber(value: number) {
  return new Intl.NumberFormat('tr-TR', { notation: value >= 1000 ? 'compact' : 'standard', maximumFractionDigits: 1 }).format(value)
}

export function MobileHomeDemo({
  mode = 'demo',
  examLabel = 'YKS',
  examRef = null,
  availableSubjects,
  currentStreak = 12,
  coinBalance = 480,
  totalXP = 2300,
  displayName = 'Bilgin',
  dailyGoal = { current: 6, target: 10 },
  classroomEnabled = false,
  institutionEnabled = false,
  showBottomNav = true,
  userId = null,
}: MobileHomeDemoProps = {}) {
  const visibleSubjects = useMemo(
    () => SUBJECTS.filter((item) => !availableSubjects || availableSubjects.includes(item.id)),
    [availableSubjects],
  )
  const [subjectId, setSubjectId] = useState<SubjectId>(visibleSubjects[0]?.id ?? 'matematik')
  // Demo rotasi bir vitrin: pencere hep acik baslar. Canli modda karar
  // efekte birakilir (SSR'da kapali render edilir, hydration uyusmazligi yok).
  const [coachOpen, setCoachOpen] = useState(mode === 'demo')
  const coachDialogRef = useRef<HTMLElement | null>(null)
  const coachReturnFocusRef = useRef<HTMLElement | null>(null)
  const [coachMessage, setCoachMessage] = useState(0)
  const subject = useMemo(() => visibleSubjects.find((item) => item.id === subjectId) ?? visibleSubjects[0] ?? SUBJECTS[0], [subjectId, visibleSubjects])
  const gameSlug = subject.id === 'ingilizce' ? 'wordquest' : subject.id
  const gameHref = `/arena/${gameSlug}`
  const progressExamRef = examRef && GAMES[gameSlug].examTags.includes(examRef)
    ? examRef
    : examLabel === 'LGS'
      ? 'LGS'
      : GAMES[gameSlug].examTags.includes('TYT')
        ? 'TYT'
        : GAMES[gameSlug].examTags[0] ?? null

  // Canli modda yol, oyunun kanonik kategori listesi + kullanicinin gercek
  // konu basarisi uzerine kurulur. Demo modunda (rota /mobil-demo) backend
  // yok; sabit ornek icerik gosterilir.
  const progress = useTopicProgress(mode === 'live' ? gameSlug : null, userId, progressExamRef)
  const isLivePath = mode === 'live' && progress.topics.length > 0

  const steps: PathStepModel[] = useMemo(() => {
    if (isLivePath) {
      return progress.topics.map((topic, index) => ({
        key: `${gameSlug}-${topic.category}`,
        label: topic.label,
        // Adim gercekten o konuya goturur: lobi ?category ile acilir.
        href: `${gameHref}?category=${encodeURIComponent(topic.category)}`,
        index,
        done: topic.completed,
        current: index === progress.currentIndex,
        exam: false,
        // Canli yolda kilit YOK: her konu her zaman calisilabilir olmali.
        locked: false,
      }))
    }
    const demoCurrent = 2
    return subject.topics.map((topic, index) => ({
      key: `${subject.id}-${topic}`,
      label: topic,
      href: gameHref,
      index,
      done: index < demoCurrent,
      current: index === demoCurrent,
      exam: index === subject.topics.length - 1,
      locked: index > demoCurrent,
    }))
  }, [gameHref, gameSlug, isLivePath, progress.currentIndex, progress.topics, subject.id, subject.topics])

  const completedCount = steps.filter((step) => step.done).length
  const stepCount = Math.max(1, steps.length)
  const pathComplete = isLivePath && steps.length > 0 && completedCount === steps.length
  const currentStep = steps.find((step) => step.current) ?? (pathComplete ? steps.at(-1) : steps[0])
  const primaryHref = pathComplete ? gameHref : currentStep?.href ?? gameHref
  const unitLabel = isLivePath
    ? `${progressExamRef ?? examLabel} ${subject.label} · ${steps.length} konu`
    : subject.unit
  const message = COACH_MESSAGES[coachMessage]
  const MessageIcon = message.icon
  const bubbleRadius = '30px 30px 30px 16px'
  const goalRemaining = dailyGoal ? Math.max(0, dailyGoal.target - dailyGoal.current) : null
  const coachTitle = coachMessage === 0
    ? pathComplete ? `Yol tamam, ${displayName}!` : `Hazırsın, ${displayName}!`
    : coachMessage === 2
      ? goalRemaining === null
        ? 'Bugünkü rotayı tamamla!'
        : goalRemaining > 0
          ? `Yalnızca ${goalRemaining} soru kaldı!`
          : 'Günlük hedef tamam!'
      : message.title
  const coachBody = coachMessage === 0
    ? pathComplete
      ? `${subject.label} yolundaki tüm konuları tamamladın. Bilgini korumak için karışık tekrar yapabilirsin.`
      : `${currentStep?.label ?? subject.label} için 10 soruluk kısa dersin hazır. Yaklaşık 4 dakikada tamamlayabilirsin.`
    : coachMessage === 1
      ? 'Önce soru kökündeki ipucunu yakala. Bildiklerini küçük adımlara bölmek sana zaman kazandırır.'
      : 'Bu dersi tamamladığında günlük rotanda ilerleyip serini korumaya yaklaşacaksın.'

  useEffect(() => {
    if (mode !== 'live' || coachSeenToday(userId)) return
    markCoachSeen(userId)
    let cancelled = false
    queueMicrotask(() => {
      if (!cancelled) setCoachOpen(true)
    })
    return () => { cancelled = true }
  }, [mode, userId])

  useEffect(() => {
    if (!coachOpen) return

    const previousOverflow = document.body.style.overflow
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setCoachOpen(false)
    }

    // aria-modal tek basina odagi tutmuyor: Tab dongusu elle kapatilir,
    // arka plan `inert` ile okuyuculardan ve klavyeden cikarilir.
    const focusables = () => Array.from(
      coachDialogRef.current?.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ) ?? [],
    )

    const trapTab = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return
      const items = focusables()
      if (items.length === 0) return
      const first = items[0]
      const last = items[items.length - 1]
      const active = document.activeElement
      if (event.shiftKey && (active === first || !coachDialogRef.current?.contains(active))) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && active === last) {
        event.preventDefault()
        first.focus()
      }
    }

    coachReturnFocusRef.current = document.activeElement as HTMLElement | null
    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', closeOnEscape)
    window.addEventListener('keydown', trapTab, true)
    focusables()[0]?.focus()

    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', closeOnEscape)
      window.removeEventListener('keydown', trapTab, true)
      // Odak, pencereyi acan ogeye geri doner (WCAG 2.4.3).
      coachReturnFocusRef.current?.focus?.()
    }
  }, [coachOpen])

  const openCoach = useCallback(() => {
    setCoachMessage(0)
    setCoachOpen(true)
  }, [])

  return (
    <div className={`min-h-[100dvh] bg-[var(--app-bg)] pb-28 text-[var(--app-text)] md:mx-auto md:max-w-[440px] md:border-x md:border-[var(--app-border)] ${mode === 'live' ? '-mt-[var(--navbar-h)]' : ''}`}>
      <style>{`html { scrollbar-width: none; } html::-webkit-scrollbar { display: none; } nextjs-portal { display: none !important; }`}</style>
      <header inert={coachOpen} className="sticky top-0 z-30 border-b-2 border-[var(--app-border-soft)] bg-[var(--app-card)]/95 backdrop-blur-xl">
        <div className="flex h-14 items-center justify-between px-3">
          <Link href="/arena/profil" aria-label="Sınav türünü değiştir" className="flex min-h-11 items-center gap-1 rounded-xl text-[var(--app-text-sub)]">
            <ShieldCheck size={24} fill="var(--app-accent-border)" className="text-[var(--app-accent-text)]" strokeWidth={2.5} />
            <span className="text-xs font-black">{examLabel}</span>
            <ChevronDown size={14} strokeWidth={3} />
          </Link>
          <div className="flex items-center gap-4">
            <Resource icon={Flame} value={currentStreak} color="var(--app-warn)" label="Günlük seri" />
            <Resource icon={Gem} value={compactNumber(coinBalance)} color="#06b6d4" label="Altın" />
            <Resource icon={Sparkles} value={compactNumber(totalXP)} color="var(--wisdom-light)" label="Toplam XP" />
          </div>
          <Link href="/arena/profil" aria-label="Ayarlar" className="flex h-11 w-11 items-center justify-center rounded-xl text-[var(--app-text-muted)] active:bg-[var(--app-hover)]"><Settings size={20} strokeWidth={2.5} /></Link>
        </div>
      </header>

      <main inert={coachOpen}>
        <section aria-label="Ders seçimi" className="border-b-2 border-[var(--app-border-soft)] bg-[var(--app-card)] px-3 py-2.5">
          <div className="scrollbar-none flex snap-x gap-2 overflow-x-auto pb-1">
            {visibleSubjects.map((item) => {
              const Icon = item.icon
              const active = item.id === subject.id
              return (
                <button
                  key={item.id}
                  onClick={() => setSubjectId(item.id)}
                  aria-pressed={active}
                  className="flex min-h-11 shrink-0 snap-start items-center gap-1.5 rounded-2xl border-2 px-3 text-xs font-extrabold active:scale-95"
                  style={{
                    color: active ? item.color : 'var(--app-text-muted)', borderColor: active ? item.color : 'var(--app-border)',
                    background: active ? `${item.color}10` : '#fff', boxShadow: active ? `0 3px 0 ${item.color}35` : '0 3px 0 var(--app-border)',
                  }}
                >
                  <Icon size={18} strokeWidth={2.7} />{item.shortLabel}
                </button>
              )
            })}
          </div>
        </section>

        <section className="px-4 pt-4">
          <div className="relative overflow-hidden rounded-[22px] p-4 text-white" style={{ background: `linear-gradient(135deg, ${subject.color}, ${subject.shadow})`, boxShadow: `0 6px 0 ${subject.shadow}` }}>
            <div className="pointer-events-none absolute -right-8 -top-14 h-32 w-32 rounded-full border-[22px] border-white/10" />
            <div className="relative flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[10px] font-black uppercase tracking-[0.15em] text-white/75">{unitLabel}</p>
                <h1 className="mt-1 text-lg font-black leading-tight">{subject.label} Yolu</h1>
                <p className="mt-1 truncate text-[11px] font-semibold text-white/80">{subject.description}</p>
              </div>
              <span className="shrink-0 rounded-xl bg-black/15 px-2.5 py-1.5 text-xs font-black">{completedCount} / {steps.length}</span>
            </div>
            <div className="relative mt-3 h-2.5 overflow-hidden rounded-full bg-black/15 p-[2px]"><div className="h-full rounded-full bg-[var(--app-card)]" style={{ width: `${(completedCount / stepCount) * 100}%` }} /></div>
          </div>
        </section>

        <section className="px-4 pt-4" aria-labelledby="continue-title">
          <div className="relative min-h-[180px] overflow-hidden rounded-[24px] border-2 border-[var(--app-border)] bg-[var(--app-card)] p-4 shadow-[0_6px_0_var(--app-border)]">
            <div className="relative z-10 max-w-[64%]">
              <div className="text-[10px] font-black uppercase tracking-[0.15em]" style={{ color: subject.color }}>Bugünkü ders</div>
              <h2 id="continue-title" className="mt-1 text-lg font-black leading-6 text-[var(--app-text)]">{pathComplete ? 'Yol tamamlandı' : currentStep?.label ?? subject.label}</h2>
              <div className="mt-2 flex items-center gap-3 text-[11px] font-bold text-[var(--app-text-sub)]">
                <span className="flex items-center gap-1"><BookOpenText size={14} />10 soru</span>
                <span className="flex items-center gap-1"><Clock3 size={14} />4 dk</span>
              </div>
              <Link href={primaryHref} className="mt-4 flex min-h-11 w-full items-center justify-center gap-2 rounded-2xl text-sm font-black text-white active:translate-y-1" style={{ background: subject.color, boxShadow: `0 5px 0 ${subject.shadow}` }}>
                <Play size={17} fill="currentColor" /> {pathComplete ? 'TEKRAR ET' : 'DEVAM ET'}
              </Link>
            </div>
            <button onClick={openCoach} className="absolute right-3 top-3 z-10 flex min-h-8 items-center gap-1 rounded-xl border-2 border-[var(--app-border)] bg-[var(--app-card)] px-2 py-1 text-[10px] font-extrabold text-[var(--app-text-sub)] shadow-[0_3px_0_var(--app-border)] active:translate-y-0.5" aria-label="Bilge Chan mesajlarını aç">
              <MessageCircle size={13} fill="var(--app-accent-border)" className="text-[var(--app-accent-text)]" /> Hazırsın!
            </button>
            <button onClick={openCoach} className="absolute -bottom-10 -right-1 h-[160px] w-[116px]" aria-label="Bilge Chan koç penceresini aç">
              <Image src="/chan/chan-wave.webp" alt="" width={140} height={192} priority className="h-auto w-[112px] drop-shadow-[0_7px_8px_rgba(31,41,55,.14)]" />
            </button>
          </div>
        </section>

        <section aria-label={`${subject.label} öğrenme yolu`} className="relative mx-4 mt-4 rounded-[22px] border-2 border-[var(--app-border)] bg-[var(--app-card-sunken)] p-2.5 shadow-[0_5px_0_var(--app-border)]">
          <div className="mb-2 flex items-center justify-between">
            <div>
              <div className="text-[10px] font-black uppercase tracking-[0.15em]" style={{ color: subject.color }}>Ünite planı</div>
              <h2 className="text-[15px] font-black">Öğrenme yolu</h2>
            </div>
            <div className="rounded-xl bg-[var(--app-card)] px-2.5 py-1.5 text-[10px] font-black text-[var(--app-text-sub)] shadow-[0_2px_0_var(--app-shadow)]">{completedCount} / {steps.length}</div>
          </div>
          <div
            className="relative grid grid-cols-2 gap-x-8 gap-y-1.5"
            style={{ gridTemplateRows: `repeat(${Math.ceil(stepCount / 2)}, minmax(0, 1fr))` }}
          >
            <svg aria-hidden="true" className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none">
              <path d={snakePath(stepCount)} fill="none" stroke="var(--app-shadow)" strokeWidth="1.8" strokeDasharray="2.5 2.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            {steps.map((step) => <PathStep key={step.key} step={step} subject={subject} />)}
          </div>
        </section>

        <section aria-labelledby="mobile-tools-title" className="mx-4 mt-4">
          <div className="mb-2 flex items-end justify-between">
            <div>
              <div className="text-[10px] font-black uppercase tracking-[0.15em] text-[var(--app-accent-text)]">Bilge Arena</div>
              <h2 id="mobile-tools-title" className="text-[15px] font-black">Diğer alanlar</h2>
            </div>
            <span className="text-[10px] font-bold text-[var(--app-text-muted)]">Tüm işlevler</span>
          </div>
          <div className="grid grid-cols-2 gap-2.5">
            <Link href="/arena/magaza" className="flex min-h-[92px] flex-col justify-between rounded-[20px] border-2 border-[var(--app-warn-border)] bg-[var(--app-card)] p-3 text-[var(--app-text)] shadow-[0_4px_0_var(--app-warn-border)] active:translate-y-0.5">
              <span className="flex h-9 w-9 items-center justify-center rounded-[13px] bg-[var(--app-warn-tint)] text-[var(--app-warn)]"><ShoppingBag size={19} strokeWidth={2.7} /></span>
              <span><span className="block text-xs font-black">Mağaza</span><span className="mt-0.5 block text-[10px] font-semibold text-[var(--app-text-sub)]">Altınlarını kullan</span></span>
            </Link>
            {classroomEnabled && (
              <Link href="/arena/sinif" className="flex min-h-[92px] flex-col justify-between rounded-[20px] border-2 border-[var(--app-success-border)] bg-[var(--app-card)] p-3 text-[var(--app-text)] shadow-[0_4px_0_var(--app-success-border)] active:translate-y-0.5">
                <span className="flex h-9 w-9 items-center justify-center rounded-[13px] bg-[var(--app-success-tint)] text-[var(--app-success)]"><GraduationCap size={20} strokeWidth={2.7} /></span>
                <span><span className="block text-xs font-black">Sınıflarım</span><span className="mt-0.5 block text-[10px] font-semibold text-[var(--app-text-sub)]">Ödev, davet, öğretmen</span></span>
              </Link>
            )}
            {institutionEnabled && (
              <Link href="/arena/kurum" className="col-span-2 flex min-h-[78px] items-center gap-3 rounded-[20px] border-2 border-[var(--app-accent-border)] bg-[var(--app-card)] p-3 text-[var(--app-text)] shadow-[0_4px_0_var(--app-accent-border)] active:translate-y-0.5">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[15px] bg-[var(--app-accent-tint)] text-[var(--app-accent-text)]"><Building2 size={22} strokeWidth={2.7} /></span>
                <span className="min-w-0 flex-1"><span className="block text-xs font-black">Kurum paneli</span><span className="mt-0.5 block text-[10px] font-semibold text-[var(--app-text-sub)]">Sınıf, rol ve rapor akışları</span></span>
                <ChevronRight size={18} className="text-[var(--app-text-muted)]" strokeWidth={3} />
              </Link>
            )}
          </div>
        </section>

        {dailyGoal && <section className="mx-4 mb-7 rounded-[22px] border-2 border-[var(--app-border)] bg-[var(--app-card)] p-4 shadow-[0_5px_0_var(--app-border)]">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[var(--app-warn-tint)] text-[var(--app-warn)]"><Flame size={24} fill="currentColor" strokeWidth={2.6} /></div>
            <div className="min-w-0 flex-1">
              <div className="flex justify-between text-xs font-black"><span>Günlük hedef</span><span className="text-[var(--app-warn)]">{dailyGoal.current} / {dailyGoal.target} soru</span></div>
              <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-[var(--app-border-soft)] p-[2px]"><div className="h-full rounded-full bg-[var(--app-warn)]" style={{ width: `${Math.min(100, (dailyGoal.current / Math.max(1, dailyGoal.target)) * 100)}%` }} /></div>
            </div>
          </div>
        </section>}
      </main>

      {showBottomNav && <div inert={coachOpen}><BottomNav activeOverride="learn" appearance="learning" /></div>}

      {coachOpen && (
        <div
          className="fixed inset-y-0 left-1/2 z-[150] flex w-full max-w-[440px] -translate-x-1/2 items-center bg-[var(--app-overlay)] px-3 py-16 backdrop-blur-[2px]"
          onMouseDown={(event) => {
            if (event.currentTarget === event.target) setCoachOpen(false)
          }}
        >
          <section
            ref={coachDialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="coach-dialog-title"
            aria-describedby="coach-dialog-description"
            className="relative min-h-[400px] w-full"
          >
            <div className="absolute bottom-0 -left-1 z-20 w-[126px]">
              <div className="absolute left-1 top-1 rotate-[-2deg] rounded-lg border-2 border-white bg-[var(--app-accent)] px-2 py-1 text-[9px] font-black uppercase tracking-[0.08em] text-white shadow-[0_4px_12px_rgba(37,99,235,.28)]">Bilge Chan</div>
              <Image src="/chan/chan-wave.webp" alt="Bilge Arena öğrenme koçu Chan" width={150} height={206} className="mt-7 h-auto w-[126px] drop-shadow-[0_10px_10px_rgba(15,23,42,.22)]" />
            </div>

            <div className="absolute right-0 top-7 z-10 w-[calc(100%-64px)] max-w-[306px]">
              <div
                className="relative z-10 min-h-[302px] border-2 border-[var(--app-text)] bg-[var(--app-card)] px-5 pb-4 pt-5 text-[var(--app-text)]"
                style={{ borderRadius: bubbleRadius, boxShadow: '6px 8px 0 rgba(15,23,42,.16), 0 18px 42px rgba(15,23,42,.20)' }}
              >
                <span aria-hidden="true" className="absolute -left-[34px] bottom-[112px] h-10 w-10 bg-[var(--app-text)]" style={{ clipPath: 'polygon(100% 0, 100% 100%, 0 52%)' }} />
                <span aria-hidden="true" className="absolute -left-[27px] bottom-[118px] h-7 w-8 bg-[var(--app-card)]" style={{ clipPath: 'polygon(100% 0, 100% 100%, 0 52%)' }} />

                <button
                  type="button"
                  onClick={() => setCoachOpen(false)}
                  aria-label="Koç penceresini kapat"
                  className="absolute right-3 top-3 z-20 flex h-10 w-10 items-center justify-center rounded-full border-2 border-[var(--app-border)] bg-[var(--app-card)] text-[var(--app-text-sub)] shadow-[0_3px_0_var(--app-border)] active:translate-y-0.5 active:shadow-none"
                >
                  <X size={19} strokeWidth={3} />
                </button>

                <div className="mb-3 flex items-center gap-2 pr-10">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl" style={{ color: message.color, background: message.tint }}>
                    <MessageIcon size={20} strokeWidth={2.8} />
                  </span>
                  <span className="text-[10px] font-black uppercase tracking-[0.13em]" style={{ color: message.color }}>{message.eyebrow}</span>
                </div>

                <h2 id="coach-dialog-title" className="max-w-[220px] text-xl font-black leading-7 tracking-[-0.02em]">{coachTitle}</h2>
                <p id="coach-dialog-description" className="mt-2 text-[12px] font-semibold leading-[19px] text-[var(--app-text-sub)]">{coachBody}</p>

                <div className="mt-4 flex items-center justify-between gap-2 border-t-2 border-[var(--app-border-soft)] pt-4">
                  <button
                    type="button"
                    onClick={() => setCoachMessage((current) => Math.max(0, current - 1))}
                    disabled={coachMessage === 0}
                    className="flex min-h-10 items-center gap-0.5 rounded-xl px-2 text-[11px] font-black text-[var(--app-text-sub)] active:bg-[var(--app-hover)] disabled:opacity-30"
                  >
                    <ChevronLeft size={16} strokeWidth={3.5} /> Geri
                  </button>

                  <div aria-label={`${coachMessage + 1}. mesaj, toplam ${COACH_MESSAGES.length}`} className="flex gap-1.5">
                    {COACH_MESSAGES.map((item, index) => (
                      <button
                        key={item.title}
                        type="button"
                        onClick={() => setCoachMessage(index)}
                        aria-label={`${index + 1}. koç mesajını göster`}
                        aria-current={coachMessage === index ? 'step' : undefined}
                        // Gorsel nokta kucuk kalir; dokunma alani WCAG 2.5.8
                        // (AA, 24x24) icin seffaf dolguyla buyutulur.
                        className="flex h-6 w-6 items-center justify-center rounded-full"
                      >
                        <span
                          aria-hidden="true"
                          className="block h-2.5 rounded-full transition-all"
                          style={{
                            width: coachMessage === index ? 24 : 10,
                            background: coachMessage === index ? message.color : 'var(--app-disabled)',
                          }}
                        />
                      </button>
                    ))}
                  </div>

                  {coachMessage < COACH_MESSAGES.length - 1 ? (
                    <button
                      type="button"
                      onClick={() => setCoachMessage((current) => Math.min(COACH_MESSAGES.length - 1, current + 1))}
                      className="flex min-h-10 items-center gap-0.5 rounded-xl bg-[var(--app-accent)] px-3 text-[11px] font-black text-white shadow-[0_4px_0_var(--app-accent-strong)] active:translate-y-0.5 active:shadow-none"
                    >
                      İleri <ChevronRight size={16} strokeWidth={3.5} />
                    </button>
                  ) : (
                    <Link
                       href={primaryHref}
                      onClick={() => setCoachOpen(false)}
                      className="flex min-h-10 items-center gap-1 rounded-xl bg-[var(--app-success-solid)] px-3 text-[10px] font-black text-white shadow-[0_4px_0_var(--app-success-strong)] active:translate-y-0.5 active:shadow-none"
                    >
                      Başla <Play size={14} fill="currentColor" />
                    </Link>
                  )}
                </div>
              </div>
            </div>
          </section>
        </div>
      )}
    </div>
  )
}
