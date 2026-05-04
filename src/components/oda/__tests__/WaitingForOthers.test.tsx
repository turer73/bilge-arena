/**
 * Bilge Arena Oda: WaitingForOthers smoke test
 * Async PR2 Faz C
 */

import { describe, test, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { WaitingForOthers } from '../WaitingForOthers'
import type { Member, Room } from '@/lib/rooms/room-state-reducer'

const baseRoom = (): Room => ({
  id: 'r1',
  code: 'BLZGE2',
  title: 'Async Test',
  state: 'active',
  mode: 'async',
  host_id: 'u1',
  category: 'genel-kultur',
  difficulty: 2,
  question_count: 10,
  max_players: 8,
  per_question_seconds: 20,
  created_at: '2026-05-04',
})

const member = (overrides: Partial<Member>): Member => ({
  user_id: 'u-default',
  display_name: 'Player',
  joined_at: '2026-05-04T00:00:00Z',
  is_host: false,
  is_kicked: false,
  ...overrides,
})

describe('WaitingForOthers', () => {
  test('1) Caller skoru ve tamamlanan soru sayisi gosterir', () => {
    const me = member({
      user_id: 'me',
      display_name: 'Me',
      score: 850,
      finished_at: '2026-05-04T00:05:00Z',
      current_round_index: 11, // question_count + 1 sembolik
    })
    render(
      <WaitingForOthers
        room={baseRoom()}
        members={[me]}
        viewerUserId="me"
      />,
    )
    expect(screen.getByText(/Tüm soruları tamamladın/)).toBeInTheDocument()
    expect(screen.getByText('850')).toBeInTheDocument()
    expect(screen.getByText(/10 sorudan 10 tanesini cevapladın/)).toBeInTheDocument()
  })

  test('2) Hala oynayan oyuncular listesi current_round_index goster', () => {
    const me = member({
      user_id: 'me',
      score: 800,
      finished_at: '2026-05-04T00:05:00Z',
      current_round_index: 11,
    })
    const playing1 = member({
      user_id: 'p1',
      display_name: 'Aysegul',
      current_round_index: 5,
      finished_at: null,
    })
    const playing2 = member({
      user_id: 'p2',
      display_name: 'Bot 1',
      is_bot: true,
      current_round_index: 3,
      finished_at: null,
    })
    render(
      <WaitingForOthers
        room={baseRoom()}
        members={[me, playing1, playing2]}
        viewerUserId="me"
      />,
    )
    expect(screen.getByText(/Hâlâ oynayan oyuncular \(2\)/)).toBeInTheDocument()
    expect(screen.getByText('Aysegul')).toBeInTheDocument()
    expect(screen.getByText('Bot 1')).toBeInTheDocument()
    expect(screen.getByText('BOT')).toBeInTheDocument()
    expect(screen.getByText('Soru 5 / 10')).toBeInTheDocument()
    expect(screen.getByText('Soru 3 / 10')).toBeInTheDocument()
  })

  test('3) Bitiren oyuncular skor sirali liste (caller highlight)', () => {
    const me = member({
      user_id: 'me',
      display_name: 'Me',
      score: 700,
      finished_at: '2026-05-04T00:05:00Z',
      current_round_index: 11,
    })
    const finished1 = member({
      user_id: 'p1',
      display_name: 'Top',
      score: 1200,
      finished_at: '2026-05-04T00:04:00Z',
      current_round_index: 11,
    })
    render(
      <WaitingForOthers
        room={baseRoom()}
        members={[me, finished1]}
        viewerUserId="me"
      />,
    )
    expect(screen.getByText(/Bitiren oyuncular \(2\)/)).toBeInTheDocument()
    // En yuksek skor #1
    expect(screen.getByText('Top')).toBeInTheDocument()
    expect(screen.getByText('1200')).toBeInTheDocument()
    // Caller "(Sen)" tag
    expect(screen.getByText('(Sen)')).toBeInTheDocument()
  })

  test('4) Tek finished -> "Bitiren" listesi gosterilmez', () => {
    const me = member({
      user_id: 'me',
      score: 500,
      finished_at: '2026-05-04T00:05:00Z',
      current_round_index: 11,
    })
    const playing = member({
      user_id: 'p1',
      finished_at: null,
      current_round_index: 5,
    })
    render(
      <WaitingForOthers
        room={baseRoom()}
        members={[me, playing]}
        viewerUserId="me"
      />,
    )
    expect(screen.queryByText(/Bitiren oyuncular/)).not.toBeInTheDocument()
    expect(screen.getByText(/Hâlâ oynayan oyuncular \(1\)/)).toBeInTheDocument()
  })

  test('5) is_kicked uyeler dahil edilmez', () => {
    const me = member({
      user_id: 'me',
      score: 500,
      finished_at: '2026-05-04T00:05:00Z',
      current_round_index: 11,
    })
    const kicked = member({
      user_id: 'kp',
      display_name: 'Kicked',
      is_kicked: true,
      finished_at: null,
      current_round_index: 3,
    })
    const playing = member({
      user_id: 'p1',
      display_name: 'Active',
      finished_at: null,
      current_round_index: 5,
    })
    render(
      <WaitingForOthers
        room={baseRoom()}
        members={[me, kicked, playing]}
        viewerUserId="me"
      />,
    )
    expect(screen.queryByText('Kicked')).not.toBeInTheDocument()
    expect(screen.getByText('Active')).toBeInTheDocument()
    expect(screen.getByText(/Hâlâ oynayan oyuncular \(1\)/)).toBeInTheDocument()
  })
})
