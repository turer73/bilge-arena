'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useEffect, useState, useCallback, useRef } from 'react'
import type { CSSProperties } from 'react'
import type { LucideIcon } from 'lucide-react'
import {
  ArrowLeft,
  ArrowRight,
  BookOpenText,
  Calculator,
  Check,
  ChevronRight,
  CircleHelp,
  Flag,
  FlaskConical,
  Globe2,
  Languages,
  Layers3,
  LockKeyhole,
  LoaderCircle,
  Map as MapIcon,
  RotateCcw,
  ShieldCheck,
  Swords,
  Target,
  Trophy,
  X,
} from 'lucide-react'
import { GAMES, GAME_LIST, getCategoryLabel } from '@/lib/constants/games'
import type { GameSlug } from '@/lib/constants/games'
import { renderRichText } from '@/lib/utils/rich-text'
import { shufflePublicOptionsWithMap } from '@/lib/utils/question'
import { gradeQuestion } from '@/lib/questions/grade-question'
import type { PublicQuestion } from '@/lib/utils/question-public'
import { isValidUuid } from '@/lib/utils/uuid'
import { useTytSocialExamPolicy } from '@/lib/hooks/use-tyt-social-exam-policy'
import { getTytSocialAllowedCategories } from '@/lib/exam-policy/tyt-social-contract'
import { isTytSocialV2ClientEnabled } from '@/lib/feature-flags/tyt-social-v2-client'
import { useAuthStore } from '@/stores/auth-store'
import styles from './fethet.module.css'

// ─── Types ────────────────────────────────────────────────────────────────────

type FethetQuestion = PublicQuestion & {
  optionMap: number[]
}

interface QuestionListResponse {
  questions?: PublicQuestion[]
  attemptId?: unknown
  expiresAt?: unknown
}

interface ActiveQuiz {
  game: GameSlug
  category: string
}

// ─── Constants ────────────────────────────────────────────────────────────────

const LEGACY_STORAGE_KEY = 'bilge-arena-fethet-v1'
const V2_STORAGE_KEY = 'bilge-arena-fethet-v2'
const QUESTIONS_PER_CATEGORY = 3
const PASS_THRESHOLD = 2   // Kaç doğru = fethedildi

const MATHEMATICS_NUMBERS_PREVIEW: PublicQuestion[] = [
  {
    id: 'preview-matematik-sayilar-1',
    game: 'matematik',
    category: 'sayilar',
    subcategory: 'temel-kavramlar',
    topic: 'Sayı kümeleri',
    difficulty: 1,
    level_tag: 'TYT',
    base_points: 10,
    content: {
      type: 'multiple_choice',
      question: 'Üç basamaklı en küçük pozitif tam sayı ile iki basamaklı en büyük pozitif tam sayının farkı kaçtır?',
      options: ['1', '9', '10', '11', '99'],
    },
  },
  {
    id: 'preview-matematik-sayilar-2',
    game: 'matematik',
    category: 'sayilar',
    subcategory: 'tam-sayilar',
    topic: 'Tam sayılar',
    difficulty: 2,
    level_tag: 'TYT',
    base_points: 20,
    content: {
      type: 'multiple_choice',
      question: '-4 ile 7 arasındaki tam sayıların toplamı kaçtır?',
      options: ['18', '11', '7', '22', '28'],
    },
  },
  {
    id: 'preview-matematik-sayilar-3',
    game: 'matematik',
    category: 'sayilar',
    subcategory: 'birinci-dereceden-denklemler',
    topic: 'Sayı problemleri',
    difficulty: 2,
    level_tag: 'TYT',
    base_points: 20,
    content: {
      type: 'multiple_choice',
      question: 'Bir sayının 3 katının 5 fazlası 26 ise bu sayı kaçtır?',
      options: ['7', '6', '8', '9', '10'],
    },
  },
]

const PREVIEW_SOLUTIONS: Record<string, string> = {
  'preview-matematik-sayilar-1': 'Üç basamaklı en küçük sayı 100, iki basamaklı en büyük sayı 99 olduğundan fark 1 olur.',
  'preview-matematik-sayilar-2': '-4 ile 4 arasındaki sayılar birbirini götürür; geriye 5 + 6 + 7 = 18 kalır.',
  'preview-matematik-sayilar-3': '3x + 5 = 26 denkleminden 3x = 21 ve x = 7 bulunur.',
}

const GAME_PRESENTATION: Record<GameSlug, { icon: LucideIcon; image: string; note: string }> = {
  matematik: { icon: Calculator, image: '/academy/subjects/matematik-magic-v1.png', note: 'Sayıların bölgesi' },
  turkce: { icon: BookOpenText, image: '/academy/subjects/turkce-magic-v1.png', note: 'Dilin bölgesi' },
  fen: { icon: FlaskConical, image: '/academy/subjects/fen-magic-v1.png', note: 'Keşfin bölgesi' },
  sosyal: { icon: Globe2, image: '/academy/subjects/sosyal-magic-v1.png', note: 'Dünyanın bölgesi' },
  wordquest: { icon: Languages, image: '/academy/modes/wordquest-v1.png', note: 'İngilizcenin bölgesi' },
}

// ─── localStorage helpers ─────────────────────────────────────────────────────

function loadConquered(storageKey: string): Set<string> {
  if (typeof window === 'undefined') return new Set()
  try {
    const raw = localStorage.getItem(storageKey)
    return new Set(raw ? (JSON.parse(raw) as string[]) : [])
  } catch {
    return new Set()
  }
}

function saveConquered(storageKey: string, s: Set<string>): void {
  try {
    localStorage.setItem(storageKey, JSON.stringify([...s]))
  } catch {}
}

// ─── QuizModal ────────────────────────────────────────────────────────────────

interface QuizModalProps {
  game: GameSlug
  category: string
  onClose: () => void
  onResult: (pass: boolean) => void
}

function QuizModal({ game, category, onClose, onResult }: QuizModalProps) {
  const [questions, setQuestions] = useState<FethetQuestion[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [idx, setIdx] = useState(0)
  const [selected, setSelected] = useState<number | null>(null)
  const [correctCount, setCorrectCount] = useState(0)
  const [revealed, setRevealed] = useState(false)
  const [grading, setGrading] = useState(false)
  const [gradeError, setGradeError] = useState<string | null>(null)
  const [correctOption, setCorrectOption] = useState<number | null>(null)
  const [solution, setSolution] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const [passed, setPassed] = useState(false)
  const [attemptId, setAttemptId] = useState<string | null>(null)
  const gradingRef = useRef(false)

  const gameConfig = GAMES[game]
  const color = gameConfig?.colorHex ?? 'var(--focus)'
  const presentation = GAME_PRESENTATION[game]
  const GameIcon = presentation.icon
  const isDesignPreview = process.env.NODE_ENV === 'development'
    && typeof window !== 'undefined'
    && new URLSearchParams(window.location.search).get('preview') === 'quiz'
    && game === 'matematik'
    && category === 'sayilar'

  useEffect(() => {
    const governedSocial = isTytSocialV2ClientEnabled() && game === 'sosyal'
    setLoading(true)
    setError(null)
    setAttemptId(null)

    if (isDesignPreview) {
      setQuestions(MATHEMATICS_NUMBERS_PREVIEW.map((question) => {
        const shuffled = shufflePublicOptionsWithMap(question.content)
        return { ...question, content: shuffled.content, optionMap: shuffled.map }
      }))
      setLoading(false)
      return
    }

    const params = new URLSearchParams({
      game,
      category,
      limit: String(QUESTIONS_PER_CATEGORY),
    })
    const endpoint = governedSocial
      ? (() => {
          params.set('mode', 'classic')
          params.set('examRef', 'TYT')
          return `/api/questions/random?${params.toString()}`
        })()
      : (() => {
          params.set('active', 'true')
          return `/api/questions?${params.toString()}`
        })()

    fetch(endpoint, { cache: 'no-store' })
      .then((r) => {
        if (r.ok) return r.json()
        if (r.status === 409 && governedSocial) {
          throw new Error('Önce Çalış sayfasında TYT Sosyal cevaplama düzenini seçmelisin.')
        }
        throw new Error('Soru alınamadı')
      })
      .then((data: QuestionListResponse) => {
        const nextAttemptId = isValidUuid(data.attemptId)
          && typeof data.expiresAt === 'string'
          && Number.isFinite(Date.parse(data.expiresAt))
          && Date.parse(data.expiresAt) > Date.now()
          ? data.attemptId
          : null
        setAttemptId(nextAttemptId)
        // Display choices are shuffled; the map retains their canonical DB indexes.
        const qs: FethetQuestion[] = (data.questions ?? [])
          .slice(0, QUESTIONS_PER_CATEGORY)
          .map((q: PublicQuestion) => {
            const shuffled = shufflePublicOptionsWithMap(q.content)
            return { ...q, content: shuffled.content, optionMap: shuffled.map }
          })
        if (qs.length < QUESTIONS_PER_CATEGORY) {
          setError(governedSocial
            ? 'Bu kategori seçtiğin TYT Sosyal cevaplama düzeninde güvenilir bir fetih turu için yeterli soruya sahip değil.'
            : 'Bu kategori için güvenilir bir fetih turuna yetecek soru yok.')
        } else {
          setQuestions(qs)
        }
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false))
  }, [game, category, isDesignPreview])

  const question = questions[idx]
  const totalQ = questions.length

  async function handleSelect(optIdx: number) {
    if (revealed || gradingRef.current || !question) return
    const canonicalIndex = question.optionMap[optIdx]
    if (!Number.isInteger(canonicalIndex)) return

    gradingRef.current = true
    setSelected(optIdx)
    setGrading(true)
    setGradeError(null)
    try {
      if (isDesignPreview) {
        const displayCorrectOption = question.optionMap.indexOf(0)
        if (displayCorrectOption < 0) throw new Error('invalid_preview_question')

        setCorrectOption(displayCorrectOption)
        setSolution(PREVIEW_SOLUTIONS[question.id] ?? null)
        if (canonicalIndex === 0) setCorrectCount((count) => count + 1)
        setRevealed(true)
        return
      }

      const grade = await gradeQuestion(question.id, canonicalIndex, attemptId)
      const displayCorrectOption = question.optionMap.indexOf(grade.correctOption)
      if (displayCorrectOption < 0) throw new Error('invalid_grade_response')

      setCorrectOption(displayCorrectOption)
      setSolution(grade.solution)
      if (grade.isCorrect) setCorrectCount((count) => count + 1)
      setRevealed(true)
    } catch {
      setSelected(null)
      setGradeError('Cevap kontrol edilemedi. Lütfen tekrar dene.')
    } finally {
      gradingRef.current = false
      setGrading(false)
    }
  }

  function handleNext() {
    const nextIdx = idx + 1
    if (nextIdx >= totalQ) {
      // correctCount, handleSelect'ten gelen state (ayrı click event'i = commit edildi)
      const pass = correctCount >= PASS_THRESHOLD
      setPassed(pass)
      setDone(true)
      onResult(pass)
    } else {
      setIdx(nextIdx)
      setSelected(null)
      setRevealed(false)
      setCorrectOption(null)
      setSolution(null)
      setGradeError(null)
    }
  }

  return (
    <div className={styles.modalBackdrop}>
      <section
        className={styles.quizModal}
        style={{ '--subject': color } as CSSProperties}
        role="dialog"
        aria-modal="true"
        aria-labelledby="fetih-soru-baslik"
      >
        <button
          onClick={onClose}
          className={styles.modalClose}
          aria-label="Kapat"
        >
          <X size={19} aria-hidden="true" />
        </button>

        <header className={styles.quizHeader}>
          <div className={styles.quizHeaderArt} aria-hidden="true">
            <Image
              src={presentation.image}
              alt=""
              fill
              sizes="660px"
            />
          </div>
          <span className={styles.quizSubjectIcon}>
            <GameIcon size={22} aria-hidden="true" />
          </span>
          <div className={styles.quizHeadingCopy}>
            <span className={styles.modalEyebrow}>
              {isDesignPreview ? 'Tasarım önizlemesi' : '3 soruluk fetih mücadelesi'}
            </span>
            <h2 id="fetih-soru-baslik">
              {getCategoryLabel(category)} Geçidi
            </h2>
            <span className={styles.quizSubjectLine}>{gameConfig?.name} bölgesi · 3 soruluk fetih</span>
          </div>
          {!loading && !error && (
            <span className={styles.quizCounter}>
              {done ? `${correctCount}/${totalQ}` : `${Math.min(idx + 1, totalQ)}/${totalQ}`}
            </span>
          )}
        </header>

        {loading && (
          <div className={styles.loadingState} role="status">
            <LoaderCircle size={34} aria-hidden="true" />
            <p>Bu bölgenin soruları hazırlanıyor…</p>
          </div>
        )}

        {!loading && error && (
          <div className={styles.errorState}>
            <div className={styles.errorVisual} aria-hidden="true">
              <Image
                src="/academy/modes/conquest-locked-region-v1.png"
                alt=""
                fill
                sizes="(max-width: 640px) 340px, 620px"
              />
              <span className={styles.errorVisualSeal}>
                <LockKeyhole size={22} />
              </span>
              <div className={styles.errorVisualCaption}>
                <span>Keşfedilmemiş bölge</span>
                <strong>Geçit şimdilik kapalı</strong>
              </div>
            </div>
            <div className={styles.errorCopy}>
              <span className={styles.stateIcon}><CircleHelp size={25} aria-hidden="true" /></span>
              <div>
                <h3>Bu bölge henüz hazır değil</h3>
                <p>{error}</p>
              </div>
            </div>
            <div className={styles.modalActions}>
              <button onClick={onClose} className={styles.secondaryAction}>Haritaya dön</button>
              {game === 'sosyal' && (
                <Link href="/arena/calisma" className={styles.primaryAction}>
                  Çalış sayfasına git <ArrowRight size={16} aria-hidden="true" />
                </Link>
              )}
            </div>
          </div>
        )}

        {!loading && !error && done && (
          <div className={styles.resultState} data-passed={passed ? 'true' : 'false'}>
            <span className={styles.resultIcon}>
              {passed ? <Trophy size={34} aria-hidden="true" /> : <RotateCcw size={32} aria-hidden="true" />}
            </span>
            <span className={styles.modalEyebrow}>{correctCount}/{totalQ} doğru cevap</span>
            <h3>{passed ? 'Fethedildi!' : 'Başarısız'}</h3>
            <p>
              {passed
                ? `${getCategoryLabel(category)} kategorisi artık senindir!`
                : 'Tekrar deneyebilirsin. Biraz daha pratik yap!'}
            </p>
            <button
              onClick={onClose}
              className={styles.primaryAction}
            >
              {passed ? 'Haritaya dön' : 'Yeniden hazırlan'} <ArrowRight size={16} aria-hidden="true" />
            </button>
          </div>
        )}

        {!loading && !error && !done && question && (
          <div className={styles.quizBody}>
            <div className={styles.quizRoute} aria-label={`Fetih rotası: ${idx + 1}/${totalQ}`}>
              {Array.from({ length: totalQ }, (_, step) => {
                const routeState = step < idx ? 'complete' : step === idx ? 'active' : 'locked'
                const routeLabels = ['Giriş', 'Geçit', 'Mühür']

                return (
                  <span
                    key={step}
                    className={styles.routeStep}
                    data-state={routeState}
                    aria-current={step === idx ? 'step' : undefined}
                  >
                    <span className={styles.routeMarker}>
                      {routeState === 'complete'
                        ? <Check size={15} aria-hidden="true" />
                        : routeState === 'active'
                          ? <Flag size={15} aria-hidden="true" />
                          : step + 1}
                    </span>
                    <small>{routeLabels[step] ?? `${step + 1}. durak`}</small>
                  </span>
                )
              })}
            </div>
            <div className={styles.quizRouteGoal}>
              <span><Target size={15} aria-hidden="true" /> {PASS_THRESHOLD} doğru cevapla bölgeyi aç</span>
              <strong>{idx + 1}. durak</strong>
            </div>

            <div className={styles.quizQuestionCard}>
              <span className={styles.questionKicker}><MapIcon size={15} aria-hidden="true" /> Bölge sorusu</span>
              <p className={styles.quizQuestion}>
                {renderRichText(question.content.question || question.content.sentence || '')}
              </p>
            </div>

            <div className={styles.quizOptions}>
              {question.content.options.map((opt, i) => {
                let optionState = 'idle'

                if (revealed) {
                  if (i === correctOption) {
                    optionState = 'correct'
                  } else if (i === selected && i !== correctOption) {
                    optionState = 'wrong'
                  }
                } else if (selected === i) {
                  optionState = 'selected'
                }

                const label = ['A', 'B', 'C', 'D', 'E'][i] ?? String(i + 1)

                return (
                  <button
                    key={i}
                    onClick={() => handleSelect(i)}
                    disabled={revealed || grading}
                    className={styles.quizOption}
                    data-state={optionState}
                  >
                    <span className={styles.optionMarker}>{label}</span>
                    <span>{renderRichText(opt)}</span>
                    {optionState === 'correct' && <Check size={17} aria-hidden="true" />}
                    {optionState === 'wrong' && <X size={17} aria-hidden="true" />}
                    {(optionState === 'idle' || optionState === 'selected') && (
                      <ChevronRight className={styles.optionChevron} size={16} aria-hidden="true" />
                    )}
                  </button>
                )
              })}
            </div>

            {grading && (
              <p className={styles.gradeStatus} role="status">
                <LoaderCircle size={15} aria-hidden="true" /> Kontrol ediliyor…
              </p>
            )}
            {gradeError && (
              <p className={styles.gradeError} role="alert">{gradeError}</p>
            )}

            {revealed && solution && (
              <div className={styles.solutionBox}>
                <BookOpenText size={18} aria-hidden="true" />
                <p>{solution}</p>
              </div>
            )}

            {revealed && (
              <button
                onClick={handleNext}
                className={styles.nextAction}
              >
                {idx + 1 < totalQ ? 'Sonraki Soru →' : 'Sonucu Gör'}
              </button>
            )}
          </div>
        )}
      </section>
    </div>
  )
}

// ─── Ana Bileşen ──────────────────────────────────────────────────────────────

export function FethetClient() {
  const { user } = useAuthStore()
  const learnerV2Enabled = isTytSocialV2ClientEnabled()
  const socialPolicy = useTytSocialExamPolicy({ game: 'sosyal', examRef: 'TYT' })
  const governedSocial = learnerV2Enabled && socialPolicy.eligible
  const generalStorageKey = learnerV2Enabled
    ? `${V2_STORAGE_KEY}:${user?.id ? `user:${user.id}` : 'guest'}`
    : LEGACY_STORAGE_KEY
  const socialPolicyKey = socialPolicy.status === 'active'
    && governedSocial
    && user?.id
    && socialPolicy.policyVersion
    && socialPolicy.selectionEffectiveAt
    && socialPolicy.variantCode
    ? `${user.id}:${socialPolicy.policyVersion}:${socialPolicy.selectionEffectiveAt}:${socialPolicy.variantCode}`
    : null
  const socialStorageKey = socialPolicyKey
    ? `${V2_STORAGE_KEY}:social:${socialPolicyKey}`
    : null
  const socialCategories = governedSocial && socialPolicy.status === 'active'
    && socialPolicy.policyVersion
    && socialPolicy.variantCode
    ? getTytSocialAllowedCategories(socialPolicy.policyVersion, socialPolicy.variantCode)
    : []
  const categoriesByGame = new Map(GAME_LIST.map((game) => [
    game.slug,
    game.slug === 'sosyal' && governedSocial ? socialCategories : game.categories,
  ]))
  const allCategories = GAME_LIST.flatMap((game) => (
    (categoriesByGame.get(game.slug) ?? []).map((category) => `${game.slug}-${category}`)
  ))
  const [conquered, setConquered] = useState<Set<string>>(new Set())
  const [active, setActive] = useState<ActiveQuiz | null>(null)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    const allowed = new Set(allCategories)
    const stored = new Set([
      ...(governedSocial
        ? [...loadConquered(generalStorageKey)].filter((category) => !category.startsWith('sosyal-'))
        : loadConquered(generalStorageKey)),
      ...(socialStorageKey ? loadConquered(socialStorageKey) : []),
    ])
    setConquered(new Set(
      [...stored].filter((category) => allowed.has(category)),
    ))
    setMounted(true)
  // allCategories is deterministically derived from the policy key.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [generalStorageKey, socialStorageKey])

  const handleResult = useCallback((pass: boolean) => {
    if (!active) return
    if (pass) {
      setConquered((prev) => {
        const next = new Set(prev)
        next.add(`${active.game}-${active.category}`)
        saveConquered(generalStorageKey, governedSocial
          ? new Set([...next].filter((category) => !category.startsWith('sosyal-')))
          : next)
        if (socialStorageKey) {
          saveConquered(socialStorageKey, new Set(
            [...next].filter((category) => category.startsWith('sosyal-')),
          ))
        }
        return next
      })
    }
  }, [active, generalStorageKey, governedSocial, socialStorageKey])

  const handleClose = useCallback(() => {
    setActive(null)
  }, [])

  const conqueredCount = conquered.size
  const totalCount = allCategories.length
  const progress = totalCount > 0 ? (conqueredCount / totalCount) * 100 : 0
  const allDone = (governedSocial ? socialPolicy.status === 'active' : true)
    && conqueredCount >= totalCount

  const handleReset = () => {
    if (!confirm('Tüm ilerlemeniz sıfırlanacak. Emin misiniz?')) return
    const empty = new Set<string>()
    setConquered(empty)
    saveConquered(generalStorageKey, empty)
    if (socialStorageKey) saveConquered(socialStorageKey, empty)
  }

  return (
    <div className={styles.root}>
      <main className={styles.shell}>
        <section className={styles.hero} aria-labelledby="fethet-baslik">
          <div className={styles.heroArt} aria-hidden="true">
            <Image
              src="/academy/modes/conquest-janissary-v2.png"
              alt=""
              fill
              sizes="(min-width: 1240px) 1184px, 100vw"
              preload
            />
          </div>
          <div className={styles.heroContent}>
            <div className={styles.heroCopy}>
              <Link href="/arena" className={styles.backLink}>
                <ArrowLeft size={15} aria-hidden="true" /> Oyunlara dön
              </Link>
              <span className={styles.eyebrow}><Swords size={15} aria-hidden="true" /> Konu konu fetih</span>
              <h1 id="fethet-baslik">Bilgini haritaya işle, her konuyu fethet.</h1>
              <p>
                Her bölgede üç soruyla mücadele et. En az iki doğruyla bayrağını dik,
                bilgi haritanı adım adım tamamla.
              </p>
              <div className={styles.heroStats} aria-label="Bil ve Fethet kuralları">
                <div><Target size={18} aria-hidden="true" /><span><strong>{QUESTIONS_PER_CATEGORY} soru</strong><small>Her bölgede</small></span></div>
                <div><ShieldCheck size={18} aria-hidden="true" /><span><strong>{PASS_THRESHOLD} doğru</strong><small>Fetih için</small></span></div>
                <div><Layers3 size={18} aria-hidden="true" /><span><strong>{totalCount} bölge</strong><small>Tüm haritada</small></span></div>
              </div>
            </div>

            <aside className={styles.heroProgress} aria-label="Genel fetih ilerlemesi">
              <span className={styles.progressKicker}>Harita ilerlemen</span>
              <div
                className={styles.progressDial}
                style={{ '--progress': `${progress * 3.6}deg` } as CSSProperties}
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={totalCount}
                aria-valuenow={conqueredCount}
              >
                <span><strong>{conqueredCount}</strong><small>/{totalCount}</small></span>
              </div>
              <strong>{allDone ? 'Harita tamamlandı' : 'Sıradaki bölgeyi seç'}</strong>
              <p>%{Math.round(progress)} fethedildi</p>
            </aside>
          </div>
        </section>

        <section className={styles.mapSection} aria-labelledby="bilgi-haritasi-baslik">
          <header className={styles.mapHeader}>
            <div>
              <span className={styles.eyebrow}><MapIcon size={15} aria-hidden="true" /> Bilgi haritan</span>
              <h2 id="bilgi-haritasi-baslik">Mücadele bölgeni seç</h2>
              <p>Ders bölgelerinden bir konu seç; üç soruluk fetih turu hemen başlasın.</p>
            </div>
            <div className={styles.mapSummary}>
              <strong>{conqueredCount}/{totalCount}</strong>
              <span>bölge açıldı</span>
            </div>
          </header>

          <div className={styles.overallProgress} aria-hidden="true">
            <span style={{ width: `${progress}%` }} />
          </div>

          {allDone && (
            <div className={styles.completeBanner}>
              <Trophy size={24} aria-hidden="true" />
              <div><strong>Tüm bilgi haritası senin!</strong><span>Her bölgeyi başarıyla fethettin.</span></div>
            </div>
          )}

          <div className={styles.regionGrid}>
            {GAME_LIST.map((game) => {
              const slug = game.slug as GameSlug
              const visibleCategories = categoriesByGame.get(game.slug) ?? []
              const gameConquered = visibleCategories.filter((category) => conquered.has(`${slug}-${category}`)).length
              const presentation = GAME_PRESENTATION[slug]
              const RegionIcon = presentation.icon
              const gameComplete = visibleCategories.length > 0 && gameConquered === visibleCategories.length

              return (
                <article
                  key={slug}
                  className={styles.regionCard}
                  data-complete={gameComplete ? 'true' : 'false'}
                  style={{ '--subject': game.colorHex } as CSSProperties}
                >
                  <div className={styles.regionVisual}>
                    <Image
                      src={presentation.image}
                      alt=""
                      fill
                      sizes="(min-width: 980px) 560px, 100vw"
                    />
                    <div className={styles.regionHeading}>
                      <span className={styles.regionIcon}><RegionIcon size={20} aria-hidden="true" /></span>
                      <div><small>{presentation.note}</small><h3>{game.name}</h3></div>
                      <span className={styles.regionCount}>{gameConquered}/{visibleCategories.length}</span>
                    </div>
                  </div>

                  <div className={styles.categoryGrid}>
                    {slug === 'sosyal' && governedSocial && socialPolicy.status !== 'active' && (
                      <div className={styles.policyNotice}>
                        <ShieldCheck size={19} aria-hidden="true" />
                        <div>
                          <p>
                            {socialPolicy.loading
                              ? 'TYT Sosyal cevaplama düzenin kontrol ediliyor…'
                              : 'Sosyal fetih haritası, cevaplama düzenini seçtikten sonra açılır.'}
                          </p>
                          {!socialPolicy.loading && <Link href="/arena/calisma">Çalış sayfasında düzeni seç</Link>}
                        </div>
                      </div>
                    )}

                    {visibleCategories.map((cat) => {
                      const key = `${slug}-${cat}`
                      const isConquered = mounted && conquered.has(key)
                      const isActive = active?.game === slug && active?.category === cat
                      const categoryLabel = getCategoryLabel(cat)

                      return (
                        <button
                          key={cat}
                          type="button"
                          onClick={() => {
                            if (isConquered) return
                            setActive({ game: slug, category: cat })
                          }}
                          disabled={isConquered}
                          className={styles.categoryButton}
                          data-conquered={isConquered ? 'true' : 'false'}
                          data-active={isActive ? 'true' : 'false'}
                          aria-label={`${categoryLabel}, ${isConquered ? 'fethedildi' : 'fethet'}`}
                        >
                          <span className={styles.categoryMarker}>
                            {isConquered ? <Check size={17} aria-hidden="true" /> : <Flag size={17} aria-hidden="true" />}
                          </span>
                          <span className={styles.categoryCopy}>
                            <strong>{categoryLabel}</strong>
                            <small>{isConquered ? 'Fethedildi' : '3 soruluk mücadele'}</small>
                          </span>
                          {!isConquered && <ChevronRight size={17} aria-hidden="true" />}
                        </button>
                      )
                    })}
                  </div>
                </article>
              )
            })}
          </div>

          {mounted && conqueredCount > 0 && (
            <button onClick={handleReset} className={styles.resetButton}>
              <RotateCcw size={14} aria-hidden="true" /> İlerlemeyi sıfırla
            </button>
          )}
        </section>
      </main>

      {active && (
        <QuizModal
          game={active.game}
          category={active.category}
          onClose={handleClose}
          onResult={handleResult}
        />
      )}
    </div>
  )
}
