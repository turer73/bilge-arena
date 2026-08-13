import { afterEach, describe, expect, it } from 'vitest'
import {
  getBilgeTahtaPilotInstitutionId,
  isBilgeTahtaPilotEnabled,
} from '../server'

const previousEnabled = process.env.BILGE_TAHTA_PILOT_ENABLED
const previousInstitutionId = process.env.BILGE_TAHTA_PILOT_INSTITUTION_ID

afterEach(() => {
  if (previousEnabled === undefined) delete process.env.BILGE_TAHTA_PILOT_ENABLED
  else process.env.BILGE_TAHTA_PILOT_ENABLED = previousEnabled
  if (previousInstitutionId === undefined) delete process.env.BILGE_TAHTA_PILOT_INSTITUTION_ID
  else process.env.BILGE_TAHTA_PILOT_INSTITUTION_ID = previousInstitutionId
})

describe('Bilge Tahta server pilot scope', () => {
  it('enables the server switch only for exact true', () => {
    delete process.env.BILGE_TAHTA_PILOT_ENABLED
    expect(isBilgeTahtaPilotEnabled()).toBe(false)
    process.env.BILGE_TAHTA_PILOT_ENABLED = 'true'
    expect(isBilgeTahtaPilotEnabled()).toBe(true)
  })

  it('accepts a valid private institution id and rejects unsafe values', () => {
    process.env.BILGE_TAHTA_PILOT_INSTITUTION_ID = ' 22222222-2222-4222-8222-222222222222 '
    expect(getBilgeTahtaPilotInstitutionId()).toBe('22222222-2222-4222-8222-222222222222')

    process.env.BILGE_TAHTA_PILOT_INSTITUTION_ID = 'all-users'
    expect(getBilgeTahtaPilotInstitutionId()).toBeNull()
  })
})
