/**
 * Bilge Arena Oda: HostGameActions smoke test
 * Sprint 1 PR4e-3 + Codex P1 PR #51 fix (bootstrap advance)
 */

import { describe, test, expect, vi, afterEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'

const { mockUseActionState, mockAdvance, mockReveal, mockCancel } = vi.hoisted(
  () => ({
    mockUseActionState: vi.fn(),
    mockAdvance: vi.fn(),
    mockReveal: vi.fn(),
    mockCancel: vi.fn(),
  }),
)

vi.mock('react', async () => {
  const actual = await vi.importActual<typeof import('react')>('react')
  return { ...actual, useActionState: mockUseActionState }
})

vi.mock('@/lib/rooms/actions', () => ({
  advanceRoundAction: mockAdvance,
  revealRoundAction: mockReveal,
  cancelRoomAction: mockCancel,
}))

import { HostGameActions } from '../HostGameActions'
import type { CurrentRound } from '@/lib/rooms/room-state-reducer'

const formAction = vi.fn()

const activeRound: CurrentRound = {
  round_index: 1,
  question_id: 'q1',
  started_at: '2026-04-30T00:00:00Z',
  ends_at: '2026-04-30T00:00:20Z',
  revealed_at: null,
}

describe('HostGameActions', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.clearAllMocks()
  })

  test('1) isHost=false -> null', () => {
    mockUseActionState.mockReturnValue([{}, formAction, false])
    const { container } = render(
      <HostGameActions
        isHost={false}
        roomId="r1"
        roomState="active"
        currentRound={activeRound}
      />,
    )
    expect(container.firstChild).toBeNull()
  })

  test('2) active + currentRound exists -> "Cevabı Göster"', () => {
    mockUseActionState.mockReturnValue([{}, formAction, false])
    render(
      <HostGameActions
        isHost={true}
        roomId="r1"
        roomState="active"
        currentRound={activeRound}
      />,
    )
    expect(
      screen.getByRole('button', { name: /Cevabı Göster/i }),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: /Sonraki Tura/i }),
    ).not.toBeInTheDocument()
  })

  test('3) reveal -> "Sonraki Tura Geç"', () => {
    mockUseActionState.mockReturnValue([{}, formAction, false])
    render(
      <HostGameActions
        isHost={true}
        roomId="r1"
        roomState="reveal"
        currentRound={activeRound}
      />,
    )
    expect(
      screen.getByRole('button', { name: /Sonraki Tura/i }),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: /Cevabı Göster/i }),
    ).not.toBeInTheDocument()
  })

  test('4) lobby -> null', () => {
    mockUseActionState.mockReturnValue([{}, formAction, false])
    const { container } = render(
      <HostGameActions
        isHost={true}
        roomId="r1"
        roomState="lobby"
        currentRound={null}
      />,
    )
    expect(container.firstChild).toBeNull()
  })

  test('5) Codex P1 PR#51 fix: active + currentRound=null -> "İlk Soruyu Başlat" (bootstrap advance)', () => {
    mockUseActionState.mockReturnValue([{}, formAction, false])
    render(
      <HostGameActions
        isHost={true}
        roomId="r1"
        roomState="active"
        currentRound={null}
      />,
    )
    expect(
      screen.getByRole('button', { name: /İlk Soruyu Başlat/i }),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: /Cevabı Göster/i }),
    ).not.toBeInTheDocument()
  })

  test('6) 2026-05-03 stuck-state escape: active state -> "Odayı İptal Et" host icin gorunur', () => {
    mockUseActionState.mockReturnValue([{}, formAction, false])
    render(
      <HostGameActions
        isHost={true}
        roomId="r1"
        roomState="active"
        currentRound={activeRound}
      />,
    )
    expect(
      screen.getByRole('button', { name: /Odayı İptal Et/i }),
    ).toBeInTheDocument()
  })

  test('7) reveal state -> "Odayı İptal Et" yine gorunur (stuck-state escape)', () => {
    mockUseActionState.mockReturnValue([{}, formAction, false])
    render(
      <HostGameActions
        isHost={true}
        roomId="r1"
        roomState="reveal"
        currentRound={activeRound}
      />,
    )
    expect(
      screen.getByRole('button', { name: /Odayı İptal Et/i }),
    ).toBeInTheDocument()
  })

  test('8) PR #97 auto-reveal: herkes cevap verdiyse 1sn grace sonra reveal fire eder', () => {
    vi.useFakeTimers()
    // Tek formAction mock: hem advance hem reveal hem cancel ortak,
    // useActionState her cagrida yeni formAction olusturur ama mock
    // hep ayni vi.fn() doner. Reveal'in cagirildigini bu shared
    // formAction ile dogrulayacagiz.
    const sharedFormAction = vi.fn()
    mockUseActionState.mockReturnValue([{}, sharedFormAction, false])

    // currentRound: round_id var (auto-reveal guard ref icin), ends_at far future
    const round = {
      ...activeRound,
      round_id: 'rnd-1',
      ends_at: new Date(Date.now() + 60_000).toISOString(),
    }

    render(
      <HostGameActions
        isHost={true}
        roomId="r1"
        roomState="active"
        currentRound={round}
        answersCount={4}
        totalActiveMembers={4}
      />,
    )

    // 1sn grace gecmeden auto-reveal yok
    act(() => {
      vi.advanceTimersByTime(500)
    })
    expect(sharedFormAction).not.toHaveBeenCalled()

    // 1sn grace sonrasi auto-reveal fire
    act(() => {
      vi.advanceTimersByTime(600)
    })
    // formAction FormData ile cagrilir
    expect(sharedFormAction).toHaveBeenCalledTimes(1)
    const callArg = sharedFormAction.mock.calls[0][0] as FormData
    expect(callArg.get('room_id')).toBe('r1')
  })

  test('9) PR #97 auto-reveal: sure dolduktan 1.5sn sonra reveal fire eder', () => {
    vi.useFakeTimers()
    const sharedFormAction = vi.fn()
    mockUseActionState.mockReturnValue([{}, sharedFormAction, false])

    const round = {
      ...activeRound,
      round_id: 'rnd-2',
      // 500ms sonra deadline
      ends_at: new Date(Date.now() + 500).toISOString(),
    }

    render(
      <HostGameActions
        isHost={true}
        roomId="r1"
        roomState="active"
        currentRound={round}
        answersCount={1} // herkes cevap vermedi
        totalActiveMembers={4}
      />,
    )

    // Deadline + 1.5sn = 2sn toplam
    act(() => {
      vi.advanceTimersByTime(1900)
    })
    expect(sharedFormAction).not.toHaveBeenCalled()

    act(() => {
      vi.advanceTimersByTime(200)
    })
    expect(sharedFormAction).toHaveBeenCalledTimes(1)
  })

  test('10) PR #97 auto-reveal: revealed_at varsa fire etmez (idempotent)', () => {
    vi.useFakeTimers()
    const sharedFormAction = vi.fn()
    mockUseActionState.mockReturnValue([{}, sharedFormAction, false])

    const round = {
      ...activeRound,
      round_id: 'rnd-3',
      revealed_at: '2026-04-30T00:00:00Z', // already revealed
      ends_at: new Date(Date.now() - 1000).toISOString(),
    }

    render(
      <HostGameActions
        isHost={true}
        roomId="r1"
        roomState="active"
        currentRound={round}
        answersCount={4}
        totalActiveMembers={4}
      />,
    )

    act(() => {
      vi.advanceTimersByTime(5000)
    })
    expect(sharedFormAction).not.toHaveBeenCalled()
  })

  test('11) PR #97 auto-reveal: isHost=false ise fire etmez', () => {
    vi.useFakeTimers()
    const sharedFormAction = vi.fn()
    mockUseActionState.mockReturnValue([{}, sharedFormAction, false])

    const round = {
      ...activeRound,
      round_id: 'rnd-4',
      ends_at: new Date(Date.now() + 60_000).toISOString(),
    }

    render(
      <HostGameActions
        isHost={false}
        roomId="r1"
        roomState="active"
        currentRound={round}
        answersCount={4}
        totalActiveMembers={4}
      />,
    )

    act(() => {
      vi.advanceTimersByTime(2000)
    })
    expect(sharedFormAction).not.toHaveBeenCalled()
  })
})
