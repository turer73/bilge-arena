export function isInstitutionTrackingEnabled(): boolean {
  return process.env.INSTITUTION_TRACKING_ENABLED === 'true'
}

export function isInstitutionStudyProgramEnabled(): boolean {
  return process.env.INSTITUTION_STUDY_PROGRAM_ENABLED === 'true'
}
