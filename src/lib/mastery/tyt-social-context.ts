const TYT_SOCIAL_CATEGORIES = [
  'tarih',
  'cografya',
  'felsefe',
  'sosyoloji',
  'din_kulturu',
] as const
export type TytSocialCategory = (typeof TYT_SOCIAL_CATEGORIES)[number]

export interface ActiveTytSocialMasteryContext {
  policyVersion: string
  taxonomyVersion: 'ba-tyt-sosyal-v1'
  variant: 'questions_16_20' | 'questions_21_25'
  selectionEventId: string
  selectionEffectiveAt: string
  allowedCategories: TytSocialCategory[]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function hasOnlyKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const keys = Object.keys(value)
  return keys.length === expected.length && keys.every((key) => expected.includes(key))
}

function isUuid(value: unknown): value is string {
  return typeof value === 'string'
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

export function parseActiveTytSocialMasteryContext(
  value: unknown,
): ActiveTytSocialMasteryContext | null {
  if (!isRecord(value) || !hasOnlyKeys(value, [
    'status',
    'available',
    'reason',
    'policyVersion',
    'taxonomyVersion',
    'variant',
    'selectionEventId',
    'selectionEffectiveAt',
    'allowedCategories',
    'rebuildRequired',
    'legacyAggregateUsed',
  ])) return null
  if (
    value.status !== 'active'
    || value.available !== true
    || value.reason !== null
    || typeof value.policyVersion !== 'string'
    || !/^tyt-social-[0-9]{4}-v[0-9]+$/.test(value.policyVersion)
    || value.taxonomyVersion !== 'ba-tyt-sosyal-v1'
    || (value.variant !== 'questions_16_20' && value.variant !== 'questions_21_25')
    || !isUuid(value.selectionEventId)
    || typeof value.selectionEffectiveAt !== 'string'
    || !Number.isFinite(Date.parse(value.selectionEffectiveAt))
    || value.rebuildRequired !== false
    || value.legacyAggregateUsed !== false
    || !Array.isArray(value.allowedCategories)
  ) return null

  const allowedCategories = value.allowedCategories
  if (
    allowedCategories.some((category) => (
      typeof category !== 'string'
      || !TYT_SOCIAL_CATEGORIES.includes(category as TytSocialCategory)
    ))
    || new Set(allowedCategories).size !== allowedCategories.length
  ) return null

  const expected = value.variant === 'questions_16_20'
    ? new Set<TytSocialCategory>(TYT_SOCIAL_CATEGORIES)
    : new Set<TytSocialCategory>(['tarih', 'cografya', 'felsefe', 'sosyoloji'])
  if (
    allowedCategories.length !== expected.size
    || allowedCategories.some((category) => !expected.has(category as TytSocialCategory))
  ) return null

  return {
    policyVersion: value.policyVersion,
    taxonomyVersion: value.taxonomyVersion,
    variant: value.variant,
    selectionEventId: value.selectionEventId,
    selectionEffectiveAt: value.selectionEffectiveAt,
    allowedCategories: allowedCategories as TytSocialCategory[],
  }
}
