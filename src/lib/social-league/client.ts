import {
  learningSpotlightsResultSchema,
  socialLeaguePreferenceResultSchema,
  socialLeagueResultSchema,
  teamBossResultSchema,
  type LearningSpotlightsResult,
  type SocialLeagueResult,
  type TeamBossResult,
} from './server-contract'

export function isSocialLeagueUiEnabled(): boolean {
  return process.env.NEXT_PUBLIC_SOCIAL_LEAGUE_ENABLED === 'true'
}

export function isLearningSpotlightsUiEnabled(): boolean {
  return isSocialLeagueUiEnabled()
    && process.env.NEXT_PUBLIC_SOCIAL_SPOTLIGHTS_ENABLED === 'true'
}

export function isTeamBossUiEnabled(): boolean {
  return isSocialLeagueUiEnabled()
    && process.env.NEXT_PUBLIC_SOCIAL_TEAM_BOSS_ENABLED === 'true'
}

export async function fetchSocialLeague(signal?: AbortSignal): Promise<SocialLeagueResult> {
  const response = await fetch('/api/social/league', {
    cache: 'no-store',
    signal,
  })
  if (!response.ok) throw new Error('league_fetch_failed')
  const parsed = socialLeagueResultSchema.safeParse(await response.json().catch(() => null))
  if (!parsed.success) throw new Error('league_contract_invalid')
  return parsed.data
}

export async function fetchLearningSpotlights(
  signal?: AbortSignal,
): Promise<LearningSpotlightsResult> {
  const response = await fetch('/api/social/league/spotlights', {
    cache: 'no-store',
    signal,
  })
  if (!response.ok) throw new Error('learning_spotlights_fetch_failed')
  const parsed = learningSpotlightsResultSchema.safeParse(
    await response.json().catch(() => null),
  )
  if (!parsed.success) throw new Error('learning_spotlights_contract_invalid')
  return parsed.data
}

export async function fetchTeamBoss(signal?: AbortSignal): Promise<TeamBossResult> {
  const response = await fetch('/api/social/league/team-boss', {
    cache: 'no-store',
    signal,
  })
  if (!response.ok) throw new Error('team_boss_fetch_failed')
  const parsed = teamBossResultSchema.safeParse(await response.json().catch(() => null))
  if (!parsed.success) throw new Error('team_boss_contract_invalid')
  return parsed.data
}

export async function saveSocialLeaguePreference(input: {
  optedIn: boolean
  requestId: string
}) {
  const response = await fetch('/api/social/league/preference', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  if (!response.ok) throw new Error('league_preference_failed')
  const parsed = socialLeaguePreferenceResultSchema.safeParse(
    await response.json().catch(() => null),
  )
  if (!parsed.success) throw new Error('league_preference_contract_invalid')
  return parsed.data
}
