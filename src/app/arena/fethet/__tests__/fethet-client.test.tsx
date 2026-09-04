/**
 * Fethet regresyon testleri (disc#1427 + şık-karıştırma).
 *
 * Wordquest prompts use `sentence`; grading is always delegated to the server.
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { FethetClient } from '../fethet-client'

const grader = vi.hoisted(() => ({ gradeQuestion: vi.fn() }))
const auth = vi.hoisted(() => ({ value: { user: { id: 'user-1' } } }))
vi.mock('@/lib/questions/grade-question', () => ({ gradeQuestion: grader.gradeQuestion }))
vi.mock('@/stores/auth-store', () => ({ useAuthStore: () => auth.value }))
vi.mock('@/lib/hooks/use-tyt-social-exam-policy', () => ({
  useTytSocialExamPolicy: () => ({
    eligible: true,
    status: 'active',
    loading: false,
    saving: false,
    error: null,
    policyVersion: 'tyt-social-2026-v1',
    selectionEffectiveAt: '2026-08-31T08:00:00+00:00',
    variantCode: 'questions_16_20',
    saveSelection: vi.fn(),
    retry: vi.fn(),
  }),
}))

const ATTEMPT_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'

const WQ_QUESTIONS = [
  {
    id: 'wq-1',
    game: 'wordquest',
    category: 'vocabulary',
    content: {
      type: 'multiple_choice',
      sentence: 'The negotiations reached a ---- when neither side compromised.',
      options: ['deadlock', 'consensus', 'breakthrough', 'resolution', 'harmony'],
    },
  },
  {
    id: 'wq-2',
    game: 'wordquest',
    category: 'vocabulary',
    content: {
      type: 'multiple_choice',
      sentence: 'The rapid ---- of technology transformed communication.',
      options: ['advancement', 'withdrawal', 'restriction', 'decline', 'stagnation'],
    },
  },
  {
    id: 'wq-3',
    game: 'wordquest',
    category: 'vocabulary',
    content: {
      type: 'multiple_choice',
      sentence: 'The violin is a delicate ---- requiring years of practice.',
      options: ['instrument', 'ornament', 'utensil', 'gadget', 'device'],
    },
  },
]
const CORRECT_TEXTS = ['deadlock', 'advancement', 'instrument']

function mockFetchWith(questions: unknown[]) {
  vi.stubGlobal('fetch', vi.fn(async () => ({
    ok: true,
    json: async () => ({
      questions,
      attemptId: ATTEMPT_ID,
      expiresAt: '2099-01-01T00:00:00.000Z',
    }),
  })))
}

async function openVocabularyQuiz() {
  render(<FethetClient />)
  const catLabel = await screen.findByText('Vocabulary')
  fireEvent.click(catLabel.closest('button')!)
}

describe('FethetClient — wordquest (İngilizce) akışı', () => {
  beforeEach(() => {
    vi.stubEnv('NEXT_PUBLIC_TYT_SOCIAL_V2_ENABLED', 'true')
    localStorage.clear()
    vi.restoreAllMocks()
    auth.value = { user: { id: 'user-1' } }
    grader.gradeQuestion.mockImplementation(async (_questionId: string, selectedOption: number) => ({
      isCorrect: selectedOption === 0,
      correctOption: 0,
      solution: null,
    }))
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('wordquest sentence alanını soru metni olarak basar (fix öncesi boştu)', async () => {
    mockFetchWith(WQ_QUESTIONS)
    await openVocabularyQuiz()
    expect(
      await screen.findByText(/The negotiations reached a/)
    ).toBeInTheDocument()
  })

  it('correct alanlı sorularda doğru seçimler sayılır ve kategori fethedilir (disc#1427)', async () => {
    mockFetchWith(WQ_QUESTIONS)
    await openVocabularyQuiz()

    for (let i = 0; i < 3; i++) {
      // Şıklar karıştırılmış olabilir — doğru şıkkı METİNLE bul (sıra-bağımsız).
      const opt = await screen.findByText(CORRECT_TEXTS[i])
      fireEvent.click(opt.closest('button')!)
      await screen.findByText(/Sonraki|Sonucu/)
      fireEvent.click(
        screen.getByText(i < 2 ? 'Sonraki Soru →' : 'Sonucu Gör')
      )
    }

    await waitFor(() => {
      expect(screen.getByText('Fethedildi!')).toBeInTheDocument()
    })
    expect(grader.gradeQuestion).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(Number),
      ATTEMPT_ID,
    )
  })

  it('yanlış seçimlerle kategori fethedilemez (notlama gerçekten ayırt ediyor)', async () => {
    mockFetchWith(WQ_QUESTIONS)
    await openVocabularyQuiz()

    for (let i = 0; i < 3; i++) {
      // Doğru-OLMAYAN ilk şıkkı metinle bul ve tıkla.
      const wrongText = WQ_QUESTIONS[i].content.options[1]!
      const opt = await screen.findByText(wrongText)
      fireEvent.click(opt.closest('button')!)
      await screen.findByText(/Sonraki|Sonucu/)
      fireEvent.click(
        screen.getByText(i < 2 ? 'Sonraki Soru →' : 'Sonucu Gör')
      )
    }

    await waitFor(() => {
      expect(screen.getByText('Başarısız')).toBeInTheDocument()
    })
  })

  it('TYT Sosyal için policy-aware random yüzeyini kullanır ve seçim gereksinimini açıklar', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: false,
      status: 409,
      json: async () => ({ error: 'policy required' }),
    })))
    render(<FethetClient />)

    fireEvent.click(await screen.findByRole('button', { name: /Tarih/ }))

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/questions/random?'),
        { cache: 'no-store' },
      )
    })
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('examRef=TYT'),
      { cache: 'no-store' },
    )
    expect(await screen.findByText(/Önce Çalış sayfasında TYT Sosyal/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Çalış sayfasına git' })).toHaveAttribute(
      'href',
      '/arena/calisma',
    )
  })

  it('learner rollout kapalıyken Sosyal legacy questions akışını kullanır', async () => {
    vi.stubEnv('NEXT_PUBLIC_TYT_SOCIAL_V2_ENABLED', 'false')
    mockFetchWith(WQ_QUESTIONS)
    render(<FethetClient />)

    fireEvent.click(await screen.findByRole('button', { name: /Tarih/ }))

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/questions?'),
        { cache: 'no-store' },
      )
    })
    expect(fetch).not.toHaveBeenCalledWith(expect.stringContaining('/api/questions/random?'), expect.anything())
    expect(localStorage.getItem('bilge-arena-fethet-v1')).toBeNull()
  })

  it('TYT Sosyal fetih ilerlemesini kullanıcı ve seçim olayına göre ayırır', async () => {
    localStorage.setItem(
      'bilge-arena-fethet-v2:social:user-2:tyt-social-2026-v1:2026-08-31T08:00:00+00:00:questions_16_20',
      JSON.stringify(['sosyal-tarih']),
    )
    render(<FethetClient />)
    const tarih = await screen.findByRole('button', { name: /Tarih/ })
    expect(tarih).not.toBeDisabled()
    expect(screen.queryByText('1/')).not.toBeInTheDocument()
  })

  it('diğer derslerin fetih ilerlemesini de kullanıcıya bağlar ve legacy Sosyal girdisini reddeder', async () => {
    localStorage.setItem(
      'bilge-arena-fethet-v2:user:user-2',
      JSON.stringify(['matematik-sayilar']),
    )
    localStorage.setItem(
      'bilge-arena-fethet-v2:user:user-1',
      JSON.stringify(['sosyal-tarih']),
    )

    render(<FethetClient />)

    expect(await screen.findByRole('button', { name: /Sayılar/ })).not.toBeDisabled()
    expect(screen.getByRole('button', { name: /Tarih/ })).not.toBeDisabled()
  })
})
