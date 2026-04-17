export interface QuizMode {
  id: string
  name: string
  description: string
  questionCount: number
  timePerQuestion: number   // saniye, 0 = sinirsiz
  icon: string
  isDeneme?: boolean        // deneme sinavi modu mu
  lives?: number            // can sayisi, undefined = sinirsiz
}

export const MODES: QuizMode[] = [
  {
    id: 'classic',
    name: 'Klasik',
    description: '10 soru, 30 saniye, 3 can',
    questionCount: 10,
    timePerQuestion: 30,
    icon: '⚔️',
    lives: 3,
  },
  {
    id: 'blitz',
    name: 'Blitz',
    description: '5 soru, 15 saniye, 2 can',
    questionCount: 5,
    timePerQuestion: 15,
    icon: '⚡',
    lives: 2,
  },
  {
    id: 'marathon',
    name: 'Maraton',
    description: '20 soru, 30 saniye, 3 can',
    questionCount: 20,
    timePerQuestion: 30,
    icon: '🏃',
    lives: 3,
  },
  {
    id: 'boss',
    name: 'Boss',
    description: '5 zor soru, 45 saniye, 2 can',
    questionCount: 5,
    timePerQuestion: 45,
    icon: '👹',
    lives: 2,
  },
  {
    id: 'deneme',
    name: 'Deneme Sınavı',
    description: 'TYT formatında deneme',
    questionCount: 40,
    timePerQuestion: 0,
    icon: '📋',
    isDeneme: true,
  },
  {
    id: 'practice',
    name: 'Pratik',
    description: 'Sınırsız, zamansız',
    questionCount: 10,
    timePerQuestion: 0,
    icon: '📝',
  },
]

export const DEFAULT_MODE = MODES[0]

export function getModeById(id: string): QuizMode {
  return MODES.find(m => m.id === id) || DEFAULT_MODE
}

// ──────────────────────────────────────────
// Deneme Sinavi Konfigurasyonu
// ──────────────────────────────────────────
// Gercek TYT: 120 soru / 135dk
// Bilge Arena deneme: kucultulmus format, ders bazli
export interface DenemeConfig {
  totalTime: number           // toplam sure (saniye)
  questionDistribution: Record<string, number> // kategori -> soru sayisi
}

export const DENEME_CONFIGS: Record<string, DenemeConfig> = {
  matematik: {
    totalTime: 45 * 60,  // 45 dakika
    questionDistribution: {
      sayilar: 8,
      problemler: 14,
      geometri: 10,
      denklemler: 4,
      fonksiyonlar: 2,
      olasilik: 2,
    },
  },
  turkce: {
    totalTime: 45 * 60,
    questionDistribution: {
      paragraf: 15,
      dil_bilgisi: 10,
      sozcuk: 7,
      anlam_bilgisi: 5,
      yazim_kurallari: 3,
    },
  },
  fen: {
    totalTime: 25 * 60,  // 25 dakika
    questionDistribution: {
      fizik: 7,
      kimya: 7,
      biyoloji: 6,
    },
  },
  sosyal: {
    totalTime: 25 * 60,
    questionDistribution: {
      tarih: 7,
      cografya: 7,
      felsefe: 6,
    },
  },
  wordquest: {
    totalTime: 30 * 60,
    questionDistribution: {
      vocabulary: 10,
      grammar: 8,
      cloze_test: 5,
      dialogue: 5,
      restatement: 5,
      sentence_completion: 5,
      phrasal_verbs: 2,
    },
  },
}
