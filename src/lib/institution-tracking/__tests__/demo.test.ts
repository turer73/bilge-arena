import { afterEach, describe, expect, it } from 'vitest'

import { isInstitutionDemoEnabled } from '../demo'

const previous = process.env.INSTITUTION_DEMO_ENABLED

afterEach(() => {
  if (previous === undefined) {
    delete process.env.INSTITUTION_DEMO_ENABLED
  } else {
    process.env.INSTITUTION_DEMO_ENABLED = previous
  }
})

describe('institution synthetic demo gate', () => {
  it('fails closed unless the server flag is exactly true', () => {
    delete process.env.INSTITUTION_DEMO_ENABLED
    expect(isInstitutionDemoEnabled()).toBe(false)

    process.env.INSTITUTION_DEMO_ENABLED = 'TRUE'
    expect(isInstitutionDemoEnabled()).toBe(false)

    process.env.INSTITUTION_DEMO_ENABLED = 'true'
    expect(isInstitutionDemoEnabled()).toBe(true)
  })
})
