import { describe, expect, it } from 'vitest'
import { getTytSocialAllowedCategories, getTytSocialSectionCategories,
  TYT_SOCIAL_SUPPORTED_POLICY_VERSION as version } from '../tyt-social-contract'
import { parseActiveTytSocialMasteryContext } from '../../mastery/tyt-social-context'

describe('formal TYT Social scope', () => {
  it.each(['questions_16_20', 'questions_21_25'] as const)('excludes sociology for %s', variant => {
    expect(getTytSocialAllowedCategories(version, variant)).not.toContain('sosyoloji')
    const categories = getTytSocialSectionCategories(version, variant)
    expect(categories).toHaveLength(20)
    expect(categories.slice(0, 5)).toEqual(Array(5).fill('tarih'))
    expect(categories.slice(5, 10)).toEqual(Array(5).fill('cografya'))
    expect(categories.slice(10, 15)).toEqual(Array(5).fill('felsefe'))
    expect(categories.slice(15)).toEqual(Array(5).fill(variant === 'questions_16_20' ? 'din_kulturu' : 'felsefe'))
  })
  it('does not treat 2026 evidence as a 2027 release', () => {
    expect(getTytSocialSectionCategories('tyt-social-2027-v1', 'questions_16_20')).toEqual([])
    expect(getTytSocialAllowedCategories('tyt-social-2027-v1', 'questions_16_20')).toEqual([])
  })
  it.each(['questions_16_20', 'questions_21_25'] as const)('rejects old sociology mastery categories for %s', variant => {
    const context = { status: 'active', available: true, reason: null, policyVersion: version,
      taxonomyVersion: 'ba-tyt-sosyal-v1', variant,
      selectionEventId: '30000000-0000-4000-8000-000000000001',
      selectionEffectiveAt: '2026-10-06T12:00:00Z',
      allowedCategories: getTytSocialAllowedCategories(version, variant),
      rebuildRequired: false, legacyAggregateUsed: false }
    expect(parseActiveTytSocialMasteryContext(context)).not.toBeNull()
    expect(parseActiveTytSocialMasteryContext({ ...context, policyVersion: 'tyt-social-2027-v1' })).toBeNull()
    expect(parseActiveTytSocialMasteryContext({ ...context,
      allowedCategories: [...context.allowedCategories, 'sosyoloji'] })).toBeNull()
  })
})
