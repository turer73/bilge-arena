export function isInstitutionPilotEnabled(): boolean {
  return process.env.INSTITUTION_PILOT_ENABLED === 'true'
}
