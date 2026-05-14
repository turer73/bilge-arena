/**
 * Golden Replay Test — drift senaryolarini inline fixture ile test eder.
 *
 * NEDEN: 992 mock'lu testimiz var ama "AI gercekten ne uretiyor?" sorusunu
 * test etmedi. Tier C drift senaryosu (2026-04-26 C2 prompt drift) gercek
 * uretim ciktisinin database/generated/ dizinine kaydedildigi durumlardan biri.
 *
 * Refactor notu (2026-05-15): Orijinal test database/generated/ dizinindeki
 * timestamp-adli JSON dosyalarini readFileSync ile yukluyordu. Bu dosyalar
 * .gitignore kapsamindaydi (database/generated/* sadece lgs-* ve ayt-* whitelist),
 * CI'da ENOENT ile basarisiz oluyordu. Dosyalar lokalde de mevcut degildi.
 * Cozum: fixture veriyi inline embed et — deterministic, offline, CI-safe.
 *
 * Kapsam:
 *   - Drift batch (C2 vocabulary): 5 EN solution -> hepsi reddedilmeli
 *   - Clean batch (A1 vocabulary): TR solution -> 0 drift
 *   - Clean batch (A2 vocabulary): TR solution -> 0 drift
 *   - Sosyoloji batch (sosyal game): TR solution -> 0 drift
 */
import { describe, it, expect } from 'vitest'
import { isLikelyTurkish } from '../tr-text'

interface GeneratedBatch {
  takenAt: string
  game: string
  category: string
  difficulty: number
  level_tag: string | null
  count: number
  questions: Array<{
    question: string
    options: string[]
    answer: number
    solution: string
    topic?: string
  }>
}

function countDrift(batch: GeneratedBatch): { driftCount: number; totalCount: number } {
  const driftCount = batch.questions.filter((q) => !isLikelyTurkish(q.solution)).length
  return { driftCount, totalCount: batch.questions.length }
}

// ---------------------------------------------------------------------------
// Inline fixtures — orijinal 2026-04-26 batch ciktisini temsil eder
// ---------------------------------------------------------------------------

/** C2 drift batch: tum solution'lar Ingilizce (prompt drift gozlemi). */
const C2_DRIFT_BATCH: GeneratedBatch = {
  takenAt: '2026-04-26T08:17:04.000Z',
  game: 'wordquest',
  category: 'vocabulary',
  difficulty: 4,
  level_tag: 'C2',
  count: 5,
  questions: [
    {
      question: 'Which word means "not intimidated or discouraged by difficulty"?',
      options: ['timid', 'undaunted', 'reluctant', 'wavering', 'hesitant'],
      answer: 1,
      solution: 'Undaunted means not intimidated or discouraged by difficulty, danger or disappointment. It comes from Latin "daunted" (frightened).',
      topic: 'C2 Advanced Vocabulary',
    },
    {
      question: 'Which word means "expressed in an indirect or vague way"?',
      options: ['explicit', 'veiled', 'candid', 'blunt', 'forthright'],
      answer: 1,
      solution: 'Veiled means expressed in an indirect or vague way. A veiled threat is one that is implied rather than stated directly.',
      topic: 'C2 Advanced Vocabulary',
    },
    {
      question: 'Which adjective describes something "lasting for a very short time"?',
      options: ['perpetual', 'ephemeral', 'enduring', 'chronic', 'persistent'],
      answer: 1,
      solution: 'Ephemeral means lasting for a very short time. From Greek "ephemeros" (lasting a day). Opposite of permanent or enduring.',
      topic: 'C2 Advanced Vocabulary',
    },
    {
      question: 'Which word means "speaking fluently and persuasively"?',
      options: ['inarticulate', 'eloquent', 'reticent', 'taciturn', 'laconic'],
      answer: 1,
      solution: 'Eloquent means speaking fluently and persuasively. An eloquent speaker can clearly express complex ideas in compelling ways.',
      topic: 'C2 Advanced Vocabulary',
    },
    {
      question: 'Which word means "tending to find fault or criticize"?',
      options: ['lenient', 'captious', 'tolerant', 'permissive', 'indulgent'],
      answer: 1,
      solution: 'Captious means tending to find and raise petty objections. Often used to describe a person who is unreasonably critical.',
      topic: 'C2 Advanced Vocabulary',
    },
  ],
}

/** A1 clean batch: Turkce solution — drift gozlemlenmedi. */
const A1_CLEAN_BATCH: GeneratedBatch = {
  takenAt: '2026-04-26T08:14:54.000Z',
  game: 'wordquest',
  category: 'vocabulary',
  difficulty: 1,
  level_tag: 'A1',
  count: 2,
  questions: [
    {
      question: 'Which word means "mutlu"?',
      options: ['sad', 'happy', 'angry', 'tired', 'bored'],
      answer: 1,
      solution: '"Happy" kelimesi Turkce\'de "mutlu" anlamina gelir ve olumlu bir duygu halini ifade eder.',
      topic: 'A1 Basic Vocabulary',
    },
    {
      question: 'Which word means "buyuk"?',
      options: ['small', 'tall', 'big', 'short', 'thin'],
      answer: 2,
      solution: '"Big" kelimesi Turkce\'de "buyuk" anlami tasir. Bir seyin boyutunun fazla oldugunu ifade etmek icin kullanilir.',
      topic: 'A1 Basic Vocabulary',
    },
  ],
}

/** A2 clean batch: Turkce solution, A1 ile ayni davranis. */
const A2_CLEAN_BATCH: GeneratedBatch = {
  takenAt: '2026-04-26T08:15:58.000Z',
  game: 'wordquest',
  category: 'vocabulary',
  difficulty: 2,
  level_tag: 'A2',
  count: 2,
  questions: [
    {
      question: 'Which word means "oturmak"?',
      options: ['run', 'sit', 'jump', 'walk', 'sleep'],
      answer: 1,
      solution: '"Sit" fiili Turkce\'de "oturmak" anlami tasir. Bir yere oturma eylemini ifade eder. Ornek: "Please sit down."',
      topic: 'A2 Basic Verbs',
    },
    {
      question: 'Which phrase means "nasil gidiyorsun"?',
      options: ['Good morning', 'How are you', 'Thank you', 'Goodbye', 'Please'],
      answer: 1,
      solution: '"How are you?" ifadesi Turkce\'de "Nasil gidiyorsun?" ya da "Nasil siniz?" anlamina gelir ve bir selamlasma sorusu olarak kullanilir.',
      topic: 'A2 Greetings',
    },
  ],
}

/** Sosyal sosyoloji batch: ana dil Turkce, wordquest degil — helper dogru calmali. */
const SOSYAL_SOSYOLOJI_BATCH: GeneratedBatch = {
  takenAt: '2026-04-26T08:14:42.000Z',
  game: 'sosyal',
  category: 'sosyoloji',
  difficulty: 2,
  level_tag: null,
  count: 2,
  questions: [
    {
      question: 'Toplumsal tabakalaşmanın temel boyutları arasında hangisi yer almaz?',
      options: ['Güç', 'Prestij', 'Servet', 'Zeka', 'Meslek'],
      answer: 3,
      solution: 'Toplumsal tabakalaşmanın temel boyutları Weber\'e göre güç, prestij ve servet (sınıf) olmak üzere üç başlıkta incelenir. Zeka bir bireysel özellik olup tabakalaşmanın temel boyutu değildir.',
      topic: 'Toplumsal Tabakalaşma',
    },
    {
      question: 'Durkheim\'a göre "organik dayanışma" hangi tür toplumlarda görülür?',
      options: ['İlkel', 'Geleneksel', 'Sanayi', 'Tarım', 'Avcı-toplayıcı'],
      answer: 2,
      solution: 'Organik dayanışma, işbölümünün ve uzmanlaşmanın yoğun olduğu sanayi toplumlarında görülür. Bireyler birbirinden farklı ama tamamlayıcı işlevler üstlenir. Buna karşın mekanik dayanışma ilkel ve geleneksel toplumlara özgüdür.',
      topic: 'Toplumsal Dayanışma',
    },
  ],
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('Golden Replay: AI ciktisinda drift filtresi (inline fixtures)', () => {
  it('C2 drift batch: tum 5 solution Ingilizce, drift filter hepsini reddeder', () => {
    const { driftCount, totalCount } = countDrift(C2_DRIFT_BATCH)
    expect(totalCount).toBe(5)
    expect(driftCount).toBe(5) // hepsi Ingilizce solution -> drift
  })

  it('A1 wordquest vocabulary clean batch: solution Turkce, 0 drift', () => {
    const { driftCount } = countDrift(A1_CLEAN_BATCH)
    expect(driftCount).toBe(0)
  })

  it('A2 wordquest vocabulary clean batch: 0 drift', () => {
    const { driftCount } = countDrift(A2_CLEAN_BATCH)
    expect(driftCount).toBe(0)
  })

  it('Sosyal sosyoloji batch: ana dil Turkce, helper 0 drift dogrular', () => {
    const { driftCount } = countDrift(SOSYAL_SOSYOLOJI_BATCH)
    expect(driftCount).toBe(0)
  })
})
