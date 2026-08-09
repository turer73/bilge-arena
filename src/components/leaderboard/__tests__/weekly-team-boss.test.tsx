import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { WeeklyTeamBoss } from '../weekly-team-boss'

const mocks = vi.hoisted(() => ({
  hook: vi.fn(),
  refresh: vi.fn(),
}))

vi.mock('@/lib/hooks/use-team-boss', () => ({
  useTeamBoss: () => mocks.hook(),
}))

const privacy = {
  cohortOnly: true,
  individualsHidden: true,
  verifiedOnly: true,
  rewardFree: true,
}

const active = {
  status: 'active',
  weekStart: '2026-08-10',
  boss: {
    name: 'Unutma Ejderi',
    phase: 'critical',
    target: 600,
    progress: 450,
    remaining: 150,
    progressPercent: 75,
    defeated: false,
  },
  team: { memberCount: 20, activeMemberCount: 7, ownerContribution: 30 },
  privacy,
}

describe('WeeklyTeamBoss', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.hook.mockReturnValue({
      result: { status: 'waiting', weekStart: null, boss: null, team: null, privacy },
      loading: false,
      error: null,
      refresh: mocks.refresh,
    })
  })

  it('does not duplicate waiting or opt-in surfaces', () => {
    const { container } = render(<WeeklyTeamBoss />)
    expect(container).toBeEmptyDOMElement()
  })

  it('shows aggregate progress, owner contribution, and no reward promise', () => {
    mocks.hook.mockReturnValue({ result: active, loading: false, error: null, refresh: mocks.refresh })
    render(<WeeklyTeamBoss />)

    expect(screen.getByRole('heading', { name: 'Takım Bossu' })).toBeInTheDocument()
    expect(screen.getByText('Unutma Ejderi')).toBeInTheDocument()
    expect(screen.getByText('Kritik')).toBeInTheDocument()
    expect(screen.getByText('450 / 600')).toBeInTheDocument()
    expect(screen.getByText('7 / 20 üye katkı verdi')).toBeInTheDocument()
    expect(screen.getByText('30 doğrulanmış puan')).toBeInTheDocument()
    expect(screen.getByText(/ekstra XP, coin veya bireysel sıralama üretmez/)).toBeInTheDocument()
    expect(screen.getByRole('progressbar', { name: 'Takım bossu ilerlemesi' })).toHaveAttribute('aria-valuenow', '450')
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuemax', '600')
    expect(screen.queryByText(/ödül kazandın/i)).not.toBeInTheDocument()
  })

  it('announces a finalized defeated team target without overkill', () => {
    mocks.hook.mockReturnValue({
      result: {
        ...active,
        status: 'finalized',
        boss: {
          ...active.boss,
          phase: 'defeated',
          progress: 600,
          remaining: 0,
          progressPercent: 100,
          defeated: true,
        },
      },
      loading: false,
      error: null,
      refresh: mocks.refresh,
    })
    render(<WeeklyTeamBoss />)
    expect(screen.getByText('Yenildi')).toBeInTheDocument()
    expect(screen.getByText('Takım hedefi tamamlandı')).toBeInTheDocument()
    expect(screen.getByText('Hafta tamamlandı')).toBeInTheDocument()
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '600')
  })

  it('provides an accessible retry when the strict response cannot be loaded', () => {
    mocks.hook.mockReturnValue({
      result: null,
      loading: false,
      error: 'Takım bossu alınamadı.',
      refresh: mocks.refresh,
    })
    render(<WeeklyTeamBoss />)
    expect(screen.getByRole('alert')).toHaveTextContent('Takım bossu alınamadı.')
    fireEvent.click(screen.getByRole('button', { name: 'Tekrar dene' }))
    expect(mocks.refresh).toHaveBeenCalledOnce()
  })
})
