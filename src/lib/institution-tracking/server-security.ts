export function isInstitutionTrackingEnabled(): boolean {
  return process.env.INSTITUTION_TRACKING_ENABLED === 'true'
}
