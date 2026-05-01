/**
 * Bilge Arena Oda: SonucView smoke test
 * Sprint 1 PR4e-4
 */

import { describe, test, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { SonucView } from '../SonucView'
import type { RoomState } from '@/lib/rooms/room-state-reducer'

const baseState = (overrides: Partial<RoomState['current_round']> = {}): RoomState => ({
  room: {
    id: 'r1',
    code: 'BLZGE2',
    title: 'Test Sonuç',
    state: 'reveal',
    mode: 'sync',
    host_id: 'h1',
    category: 'genel-kultur',
    difficulty: 2,
    question_count: 10,
    max_players: 8,
    per_question_seconds: 20,
    created_at: '2026-04-30',
  },
  members: [
    {
      user_id: 'u1',
      display_name: 'Ali',
      joined_at: '2026-04-30T00:00:00Z',
      is_host: false,
      is_kicked: false,
      score: 25,
    },
  ],
  current_round: {
    round_index: 4,
    question_id: 'q1',
    started_at: '2026-04-30T00:00:00Z',
    ends_at: '2026-04-30T00:00:20Z',
    revealed_at: '2026-04-30T00:00:25Z',
    question_text: 'Türkiye’nin başkenti neresidir?',
    options: ['İstanbul', 'Ankara', 'İzmir', 'Bursa'],
    correct_answer: 'Ankara',
    explanation: 'Ankara 1923’te başkent ilan edildi.',
    ...overrides,
  },
  answers_count: 0,
  my_answer: null,
  scoreboard: [],
  online: new Set<string>(),
  isStale: false,
})

describe('SonucView', () => {
  test('1) reveal -> dogru cevap (Ankara) emerald highlight + explanation', () => {
    render(<SonucView state={baseState()} userId="u1" />)
    expect(screen.getByText('Türkiye’nin başkenti neresidir?')).toBeInTheDocument()

    // Ankara dogru cevap (aria-label="Doğru cevap")
    const correctRow = screen.getByLabelText('Doğru cevap')
    expect(correctRow).toHaveTextContent('Ankara')

    // Explanation
    expect(screen.getByText(/1923’te başkent/)).toBeInTheDocument()

    // Skor
    expect(screen.getByText('25')).toBeInTheDocument()

    // Sonuç badge
    expect(screen.getByText('Sonuç 4 / 10')).toBeInTheDocument()
  })

  test('2) son tur (round_index >= question_count) -> "Son tur" uyari mesaji', () => {
    render(
      <SonucView state={baseState({ round_index: 10 })} userId="u1" />,
    )
    expect(screen.getByText(/Son tur!/i)).toBeInTheDocument()
  })

  test('3) PR4f: my_answer wrong -> "Senin Cevabın" red marker, my_answer null -> "cevap vermedin" warning', () => {
    // Yanlis cevap: Istanbul (correct=Ankara)
    const wrongState = baseState()
    wrongState.my_answer = {
      answer_value: 'İstanbul',
      is_correct: false,
      points_awarded: 0,
      response_ms: 12000,
    }
    const { rerender } = render(<SonucView state={wrongState} userId="u1" />)
    expect(screen.getByLabelText(/Senin yanlış cevabın/i)).toBeInTheDocument()
    expect(
      screen.getAllByText('Senin Cevabın')[0],
    ).toBeInTheDocument()

    // Cevap vermemis
    const noAnswerState = baseState()
    noAnswerState.my_answer = null
    rerender(<SonucView state={noAnswerState} userId="u1" />)
    expect(screen.getByText(/cevap vermedin/i)).toBeInTheDocument()
  })
})
