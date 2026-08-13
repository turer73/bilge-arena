import { afterEach, describe, expect, it } from 'vitest'
import { isInstitutionStudyProgramEnabled, isInstitutionTrackingEnabled } from '../server-security'

const previous = process.env.INSTITUTION_TRACKING_ENABLED
const previousProgram = process.env.INSTITUTION_STUDY_PROGRAM_ENABLED

afterEach(() => {
  if (previous === undefined) delete process.env.INSTITUTION_TRACKING_ENABLED
  else process.env.INSTITUTION_TRACKING_ENABLED = previous
  if (previousProgram === undefined) delete process.env.INSTITUTION_STUDY_PROGRAM_ENABLED
  else process.env.INSTITUTION_STUDY_PROGRAM_ENABLED = previousProgram
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

  it('keeps study-program writes behind an exact separate flag', () => {
    delete process.env.INSTITUTION_STUDY_PROGRAM_ENABLED
    expect(isInstitutionStudyProgramEnabled()).toBe(false)
    process.env.INSTITUTION_STUDY_PROGRAM_ENABLED = 'TRUE'
    expect(isInstitutionStudyProgramEnabled()).toBe(false)
    process.env.INSTITUTION_STUDY_PROGRAM_ENABLED = 'true'
    expect(isInstitutionStudyProgramEnabled()).toBe(true)
  })
})
