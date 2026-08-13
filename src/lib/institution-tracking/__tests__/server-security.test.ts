import { afterEach, describe, expect, it } from 'vitest'
import { isInstitutionTrackingEnabled } from '../server-security'

const previous = process.env.INSTITUTION_TRACKING_ENABLED

afterEach(() => {
  if (previous === undefined) delete process.env.INSTITUTION_TRACKING_ENABLED
  else process.env.INSTITUTION_TRACKING_ENABLED = previous
})

describe('institution tracking feature gate', () => {
  it('is fail-closed unless explicitly true', () => {
    delete process.env.INSTITUTION_TRACKING_ENABLED
    expect(isInstitutionTrackingEnabled()).toBe(false)
    process.env.INSTITUTION_TRACKING_ENABLED = 'TRUE'
    expect(isInstitutionTrackingEnabled()).toBe(false)
    process.env.INSTITUTION_TRACKING_ENABLED = 'true'
    expect(isInstitutionTrackingEnabled()).toBe(true)
  })
})
