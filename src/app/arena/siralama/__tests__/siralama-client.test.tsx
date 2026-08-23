import { render, screen, waitFor } from '@testing-library/react'
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import SiralamaClient from '../siralama-client'

const mocks = vi.hoisted(() => ({ user: { id: '11111111-2222-4333-8444-555555555555' } }))

vi.mock('@/stores/auth-store', () => ({
  useAuthStore: () => ({ user: mocks.user }),
}))
vi.mock('@/components/leaderboard/weekly-learning-league', () => ({
  WeeklyLearningLeague: () => <section aria-label="Yakın Rakip Ligi fixture" />,
}))
vi.mock('@/components/leaderboard/weekly-learning-spotlights', () => ({
  WeeklyLearningSpotlights: () => <section aria-label="Olumlu Öğrenme Spotları fixture" />,
}))
vi.mock('@/components/leaderboard/weekly-team-boss', () => ({
  WeeklyTeamBoss: () => <section aria-label="Takım Bossu fixture" />,
}))
vi.mock('@/components/leaderboard/leaderboard-table', () => ({
  LeaderboardTable: ({ title }: { title: string }) => <div>{title}</div>,
}))

const oldFlag = process.env.NEXT_PUBLIC_SOCIAL_LEAGUE_ENABLED
const oldSpotlightsFlag = process.env.NEXT_PUBLIC_SOCIAL_SPOTLIGHTS_ENABLED
const oldBossFlag = process.env.NEXT_PUBLIC_SOCIAL_TEAM_BOSS_ENABLED

describe('SiralamaClient social league gate', () => {
  beforeEach(() => {
    delete process.env.NEXT_PUBLIC_SOCIAL_TEAM_BOSS_ENABLED
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      players: [], myRank: 0, source: 'empty',
    }), { status: 200 })))
  })

  afterAll(() => {
    vi.unstubAllGlobals()
    if (oldFlag === undefined) delete process.env.NEXT_PUBLIC_SOCIAL_LEAGUE_ENABLED
    else process.env.NEXT_PUBLIC_SOCIAL_LEAGUE_ENABLED = oldFlag
    if (oldSpotlightsFlag === undefined) delete process.env.NEXT_PUBLIC_SOCIAL_SPOTLIGHTS_ENABLED
    else process.env.NEXT_PUBLIC_SOCIAL_SPOTLIGHTS_ENABLED = oldSpotlightsFlag
    if (oldBossFlag === undefined) delete process.env.NEXT_PUBLIC_SOCIAL_TEAM_BOSS_ENABLED
    else process.env.NEXT_PUBLIC_SOCIAL_TEAM_BOSS_ENABLED = oldBossFlag
  })

  it('keeps the existing screen when the public gate is off', async () => {
    delete process.env.NEXT_PUBLIC_SOCIAL_LEAGUE_ENABLED
    delete process.env.NEXT_PUBLIC_SOCIAL_SPOTLIGHTS_ENABLED
    render(<SiralamaClient />)
    expect(screen.queryByLabelText('Yakın Rakip Ligi fixture')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Olumlu Öğrenme Spotları fixture')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Takım Bossu fixture')).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Lig' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /Haftalık sıralamada yerini al/ })).toBeInTheDocument()
    expect(screen.getByRole('navigation', { name: 'Sıralama dönemi' })).toBeInTheDocument()
    expect(document.querySelector('[data-ranking-screen]')).toHaveClass('pb-24', 'lg:pb-10')
    expect(document.querySelector('[data-ranking-overview]')).toHaveClass('lg:grid-cols-[minmax(0,1fr)_320px]', 'lg:items-start')
    expect(document.querySelector('[data-ranking-hero]')).toHaveClass('min-h-[176px]', 'lg:min-h-[156px]')
    expect(document.querySelector('[data-ranking-status]')).toHaveClass('min-h-[156px]')
    expect(document.querySelector('[data-ranking-layout]')).toHaveClass('lg:grid-cols-[minmax(0,1fr)_320px]')
    expect(document.querySelector('style')?.textContent).toContain('max-width: 1023px')
    await waitFor(() => expect(screen.queryByText(/Henüz kimse/)).toBeInTheDocument())
  })

  it('shows the relative league first and labels XP as a separate metric', async () => {
    process.env.NEXT_PUBLIC_SOCIAL_LEAGUE_ENABLED = 'true'
    delete process.env.NEXT_PUBLIC_SOCIAL_SPOTLIGHTS_ENABLED
    render(<SiralamaClient />)
    expect(screen.getByLabelText('Yakın Rakip Ligi fixture')).toBeInTheDocument()
    expect(screen.queryByLabelText('Olumlu Öğrenme Spotları fixture')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Takım Bossu fixture')).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /Öğren, puan topla, yüksel/ })).toBeInTheDocument()
    expect(screen.getByText(/XP tablosu ile yakın rakip ligin ayrı hesaplanır/i)).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByText(/Henüz kimse/)).toBeInTheDocument())
  })

  it('shows positive spotlights only when both public gates are on', async () => {
    process.env.NEXT_PUBLIC_SOCIAL_LEAGUE_ENABLED = 'true'
    process.env.NEXT_PUBLIC_SOCIAL_SPOTLIGHTS_ENABLED = 'true'
    render(<SiralamaClient />)
    expect(screen.getByLabelText('Yakın Rakip Ligi fixture')).toBeInTheDocument()
    expect(screen.getByLabelText('Olumlu Öğrenme Spotları fixture')).toBeInTheDocument()
    expect(screen.queryByLabelText('Takım Bossu fixture')).not.toBeInTheDocument()
    await waitFor(() => expect(screen.queryByText(/Henüz kimse/)).toBeInTheDocument())
  })

  it('shows the team boss only when its public gate and the league gate are on', async () => {
    process.env.NEXT_PUBLIC_SOCIAL_LEAGUE_ENABLED = 'true'
    process.env.NEXT_PUBLIC_SOCIAL_TEAM_BOSS_ENABLED = 'true'
    render(<SiralamaClient />)
    expect(screen.getByLabelText('Yakın Rakip Ligi fixture')).toBeInTheDocument()
    expect(screen.getByLabelText('Takım Bossu fixture')).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByText(/Henüz kimse/)).toBeInTheDocument())
  })
})
