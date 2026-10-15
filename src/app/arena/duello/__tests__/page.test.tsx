import { render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import type { Challenge } from '@/types/database'

const auth = vi.hoisted(() => ({
  user: null as null | { id: string },
}))

vi.mock('@/stores/auth-store', () => ({
  useAuthStore: () => ({ user: auth.user }),
}))

import DuelloPage from '../page'

function challenge(overrides: Partial<Challenge> = {}): Challenge {
  return {
    id: 'duel-1',
    challenger_id: 'friend-1',
    opponent_id: 'user-1',
    game: 'matematik',
    category: null,
    status: 'pending',
    question_ids: ['q1', 'q2', 'q3'],
    challenger_score: null,
    opponent_score: null,
    winner_id: null,
    xp_reward: 50,
    created_at: '2026-09-20T12:00:00.000Z',
    expires_at: '2026-09-27T12:00:00.000Z',
    challenger: { id: 'friend-1', display_name: 'Deniz', username: 'deniz', avatar_url: null },
    opponent: { id: 'user-1', display_name: 'Arenacı', username: 'arenaci', avatar_url: null },
    ...overrides,
  }
}

describe('DuelloPage', () => {
  beforeEach(() => {
    auth.user = null
    vi.restoreAllMocks()
  })

  test('girişsiz kullanıcıya da Arena görsel diliyle açıklayıcı giriş sunar', () => {
    const { container } = render(<DuelloPage />)

    expect(screen.getByRole('heading', { name: 'Bilgini rakibinle karşılaştır.' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Giriş yap ve düelloya katıl/ })).toHaveAttribute('href', '/giris?next=%2Farena%2Fduello')
    expect(container.querySelector('[data-duel-hero]')).toBeInTheDocument()
  })

  test('boş durumda rakip seçme adımını görünür yapar', async () => {
    auth.user = { id: 'user-1' }
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ challenges: [] }) }))

    const { container } = render(<DuelloPage />)

    expect(await screen.findByRole('heading', { name: 'Arena seni ve rakibini bekliyor.' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Arkadaşlardan rakip seç/ })).toHaveAttribute('href', '/arena/arkadaslar')
    expect(container.querySelector('[data-duel-summary]')?.children).toHaveLength(3)
  })

  test('gelen, aktif ve tamamlanan karşılaşmaları ayrı durumlar olarak gösterir', async () => {
    auth.user = { id: 'user-1' }
    const challenges = [
      challenge(),
      challenge({ id: 'duel-2', challenger_id: 'user-1', opponent_id: 'friend-1', status: 'accepted' }),
      challenge({
        id: 'duel-3',
        challenger_id: 'user-1',
        opponent_id: 'friend-1',
        status: 'completed',
        challenger_score: { correct: 3, total: 3, time_sec: 20, xp: 50 },
        opponent_score: { correct: 2, total: 3, time_sec: 24, xp: 0 },
        winner_id: 'user-1',
      }),
    ]
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ challenges }) }))

    render(<DuelloPage />)

    await waitFor(() => expect(screen.getByRole('heading', { name: 'Gelen meydan okumalar' })).toBeInTheDocument())
    expect(screen.getByRole('heading', { name: 'Aktif düellolar' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Tamamlananlar' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Düelloyu oyna/ })).toHaveAttribute('href', '/arena/duello/duel-2')
    expect(screen.getByText('Kazandın · +50 XP')).toBeInTheDocument()
  })
})
