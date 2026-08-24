import { afterEach, describe, expect, it } from 'vitest'
import {
  isInstitutionOnboardingEnabled,
  isInstitutionPilotEnabled,
} from '../server-security'

const previousPilot = process.env.INSTITUTION_PILOT_ENABLED
const previousOnboarding = process.env.INSTITUTION_ONBOARDING_ENABLED

afterEach(() => {
  if (previousPilot === undefined) delete process.env.INSTITUTION_PILOT_ENABLED
  else process.env.INSTITUTION_PILOT_ENABLED = previousPilot

  if (previousOnboarding === undefined) delete process.env.INSTITUTION_ONBOARDING_ENABLED
  else process.env.INSTITUTION_ONBOARDING_ENABLED = previousOnboarding
})

describe('institution pilot security switches', () => {
  it('keeps the pilot disabled unless the value is exactly true', () => {
    delete process.env.INSTITUTION_PILOT_ENABLED
    expect(isInstitutionPilotEnabled()).toBe(false)
    process.env.INSTITUTION_PILOT_ENABLED = 'TRUE'
    expect(isInstitutionPilotEnabled()).toBe(false)
    process.env.INSTITUTION_PILOT_ENABLED = 'true'
    expect(isInstitutionPilotEnabled()).toBe(true)
  })

  it('keeps paid onboarding disabled unless separately and explicitly enabled', () => {
    delete process.env.INSTITUTION_ONBOARDING_ENABLED
    expect(isInstitutionOnboardingEnabled()).toBe(false)
    process.env.INSTITUTION_ONBOARDING_ENABLED = 'TRUE'
    expect(isInstitutionOnboardingEnabled()).toBe(false)
    process.env.INSTITUTION_ONBOARDING_ENABLED = 'true'
    expect(isInstitutionOnboardingEnabled()).toBe(true)
  })
})
