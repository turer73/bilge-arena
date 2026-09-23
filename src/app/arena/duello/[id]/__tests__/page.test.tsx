import { render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import type { Challenge, Question } from '@/types/database'

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  playSound: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  useParams: () => ({ id: 'duel-1' }),
  useRouter: () => ({ push: mocks.push }),
}))

vi.mock('@/stores/auth-store', () => ({
  useAuthStore: () => ({ user: { id: 'user-1' } }),
}))

vi.mock('@/lib/utils/sounds', () => ({ playSound: mocks.playSound }))
vi.mock('@/stores/toast-store', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))

import DuelloGamePage from '../page'

const challenge: Challenge = {
  id: 'duel-1',
  challenger_id: 'user-1',
  opponent_id: 'friend-1',
  game: 'matematik',
  category: 'sayilar',
  status: 'accepted',
  question_ids: ['q1'],
  challenger_score: null,
  opponent_score: null,
  winner_id: null,
  xp_reward: 50,
  created_at: '2026-09-20T12:00:00.000Z',
  expires_at: '2026-09-27T12:00:00.000Z',
  challenger: { id: 'user-1', display_name: 'Arenacı', username: 'arenaci', avatar_url: null },
  opponent: { id: 'friend-1', display_name: 'Deniz', username: 'deniz', avatar_url: null },
}

const question: Question = {
  id: 'q1',
  external_id: null,
  game: 'matematik',
  category: 'sayilar',
  subcategory: null,
  topic: null,
  difficulty: 2,
  level_tag: null,
  content: {
    question: 'Üç basamaklı en küçük sayı kaçtır?',
    options: ['10', '99', '100', '101'],
    answer: 2,
  },
  base_points: 20,
  is_active: true,
  is_boss: false,
  times_answered: 0,
  times_correct: 0,
  source: 'test',
  exam_ref: 'TYT',
  created_at: '2026-09-20T12:00:00.000Z',
  updated_at: '2026-09-20T12:00:00.000Z',
}

describe('DuelloGamePage', () => {
  beforeEach(() => {
    mocks.push.mockReset()
    mocks.playSound.mockReset()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ challenge, questions: [question] }),
    }))
  })

  test('soru ekranını VS bilgisi, ilerleme ve güvenlik notuyla kurar', async () => {
    const { container } = render(<DuelloGamePage />)

    expect(await screen.findByRole('heading', { name: 'Üç basamaklı en küçük sayı kaçtır?' })).toBeInTheDocument()
    expect(screen.getByText('deniz')).toBeInTheDocument()
    expect(screen.getByText('Cevaplar tur bitene kadar gizli')).toBeInTheDocument()
    expect(screen.getByText('Doğru cevap rakibine gösterilmez.')).toBeInTheDocument()
    expect(container.querySelector('[data-duel-versus]')).toBeInTheDocument()
    expect(container.querySelectorAll('[data-quiz-option]')).toHaveLength(4)
    await waitFor(() => expect(fetch).toHaveBeenCalledWith('/api/challenges/duel-1', { cache: 'no-store' }))
  })
})
