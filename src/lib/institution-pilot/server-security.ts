export function isInstitutionPilotEnabled(): boolean {
  return process.env.INSTITUTION_PILOT_ENABLED === 'true'
}

export function isInstitutionOnboardingEnabled(): boolean {
  return process.env.INSTITUTION_ONBOARDING_ENABLED === 'true'
}

export function isInstitutionFreePilotEnabled(): boolean {
  return process.env.INSTITUTION_FREE_PILOT_ENABLED === 'true'
}
