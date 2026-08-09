import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { WeeklyLearningLeague } from '../weekly-learning-league'

const mocks = vi.hoisted(() => ({
  hook: vi.fn(),
  updatePreference: vi.fn(),
  refresh: vi.fn(),
}))

vi.mock('@/lib/hooks/use-social-league', () => ({
  useSocialLeague: () => mocks.hook(),
}))

describe('WeeklyLearningLeague', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.hook.mockReturnValue({
      result: {
        status: 'opted_out',
        optedIn: false,
        effectiveWeekStart: null,
        week: null,
        entries: [],
        privacy: { bottomHidden: true, sessionCap: 15, dailyCap: 30 },
      },
      loading: false,
      updating: false,
      error: null,
      refresh: mocks.refresh,
      updatePreference: mocks.updatePreference,
    })
  })

  it('requires explicit consent before opt-in', () => {
    render(<WeeklyLearningLeague />)
    const button = screen.getByRole('button', { name: 'Gelecek haftanın ligine katıl' })
    expect(button).toBeDisabled()
    fireEvent.click(screen.getByRole('checkbox'))
    expect(button).toBeEnabled()
    fireEvent.click(button)
    expect(mocks.updatePreference).toHaveBeenCalledWith(true)
  })

  it('renders only privacy-safe rivals and explains the hidden bottom zone', () => {
    mocks.hook.mockReturnValue({
      result: {
        status: 'active',
        optedIn: true,
        effectiveWeekStart: '2026-08-10',
        week: {
          startsOn: '2026-08-10',
          endsOn: '2026-08-17',
          tier: 'gumus',
          memberCount: 24,
          points: 18,
          rank: 7,
          zone: 'safe',
          isFinal: false,
        },
        entries: [
          { rank: 1, name: 'Birinci', avatarUrl: null, points: 30, activeDays: 2, isMe: false, zone: 'promotion' },
          { rank: 7, name: 'Ben', avatarUrl: null, points: 18, activeDays: 1, isMe: true, zone: 'safe' },
        ],
        privacy: { bottomHidden: true, sessionCap: 15, dailyCap: 30 },
      },
      loading: false,
      updating: false,
      error: null,
      refresh: mocks.refresh,
      updatePreference: mocks.updatePreference,
    })
    render(<WeeklyLearningLeague />)
    expect(screen.getByText('Gümüş')).toBeInTheDocument()
    expect(screen.getByText('Ben (Sen)')).toBeInTheDocument()
    expect(screen.getByText(/Başka oyuncuların düşme bölgesi gizlidir/)).toBeInTheDocument()
    expect(screen.getByRole('table')).toHaveAccessibleName(/Yükselme bölgesi/)
  })

  it('shows a private demotion warning without another bottom member row', () => {
    mocks.hook.mockReturnValue({
      result: {
        status: 'active',
        optedIn: true,
        effectiveWeekStart: '2026-08-10',
        week: {
          startsOn: '2026-08-10', endsOn: '2026-08-17', tier: 'bronz',
          memberCount: 20, points: 0, rank: 20, zone: 'demotion', isFinal: false,
        },
        entries: [],
        privacy: { bottomHidden: true, sessionCap: 15, dailyCap: 30 },
      },
      loading: false,
      updating: false,
      error: null,
      refresh: mocks.refresh,
      updatePreference: mocks.updatePreference,
    })
    render(<WeeklyLearningLeague />)
    expect(screen.getByText(/Bu bilgi yalnız sana gösterilir/)).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })
})
