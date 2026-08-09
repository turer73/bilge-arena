import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { WeeklyLearningSpotlights } from '../weekly-learning-spotlights'

const mocks = vi.hoisted(() => ({
  hook: vi.fn(),
  refresh: vi.fn(),
}))

vi.mock('@/lib/hooks/use-learning-spotlights', () => ({
  useLearningSpotlights: () => mocks.hook(),
}))

const privacy = {
  cohortOnly: true,
  positiveOnly: true,
  verifiedOnly: true,
  fullTableHidden: true,
}
const emptyBoard = { me: { eligible: false, rank: null, value: null }, entries: [] }

describe('WeeklyLearningSpotlights', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.hook.mockReturnValue({
      result: {
        status: 'waiting',
        weekStart: null,
        boards: { improved: emptyBoard, consistent: emptyBoard, comeback: emptyBoard },
        privacy,
      },
      loading: false,
      error: null,
      refresh: mocks.refresh,
    })
  })

  it('does not duplicate the league waiting or opt-in surface', () => {
    const { container } = render(<WeeklyLearningSpotlights />)
    expect(container).toBeEmptyDOMElement()
  })

  it('shows only positive top rows and the owner row with human-readable metrics', () => {
    mocks.hook.mockReturnValue({
      result: {
        status: 'active',
        weekStart: '2026-08-10',
        boards: {
          improved: {
            me: { eligible: true, rank: 5, value: 240 },
            entries: [
              { rank: 1, name: 'Ada', avatarUrl: null, value: 620, isMe: false },
              { rank: 5, name: 'Sen', avatarUrl: null, value: 240, isMe: true },
            ],
          },
          consistent: {
            me: { eligible: true, rank: 2, value: 4 },
            entries: [{ rank: 2, name: 'Sen', avatarUrl: null, value: 4, isMe: true }],
          },
          comeback: emptyBoard,
        },
        privacy,
      },
      loading: false,
      error: null,
      refresh: mocks.refresh,
    })

    render(<WeeklyLearningSpotlights />)
    expect(screen.getByRole('heading', { name: 'Olumlu Öğrenme Spotları' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'En Çok Gelişen' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'En Düzenli' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'En İyi Geri Dönüş' })).toBeInTheDocument()
    expect(screen.getAllByText('Sen (Sen)')).toHaveLength(2)
    expect(screen.getByText('+2,4 puan')).toBeInTheDocument()
    expect(screen.getByText('4 aktif gün')).toBeInTheDocument()
    expect(screen.getByText(/Eksik çalışma, alt sıralar ve ara verilen gün sayısı paylaşılmaz/)).toBeInTheDocument()
    expect(screen.queryByText(/gün ara/)).not.toBeInTheDocument()
  })

  it('renders a supportive empty state instead of a negative ranking', () => {
    mocks.hook.mockReturnValue({
      result: {
        status: 'finalized',
        weekStart: '2026-08-10',
        boards: { improved: emptyBoard, consistent: emptyBoard, comeback: emptyBoard },
        privacy,
      },
      loading: false,
      error: null,
      refresh: mocks.refresh,
    })
    render(<WeeklyLearningSpotlights />)
    expect(screen.getAllByText(/henüz yeterli doğrulanmış örnek yok/)).toHaveLength(3)
    expect(screen.getByText('Hafta tamamlandı')).toBeInTheDocument()
  })

  it('provides an accessible retry when the strict response cannot be loaded', () => {
    mocks.hook.mockReturnValue({
      result: null,
      loading: false,
      error: 'Spotlar alınamadı.',
      refresh: mocks.refresh,
    })
    render(<WeeklyLearningSpotlights />)
    expect(screen.getByRole('alert')).toHaveTextContent('Spotlar alınamadı.')
    fireEvent.click(screen.getByRole('button', { name: 'Tekrar dene' }))
    expect(mocks.refresh).toHaveBeenCalledOnce()
  })
})
