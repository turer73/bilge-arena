export function isBilgeTahtaPilotEnabled(): boolean {
  return process.env.BILGE_TAHTA_PILOT_ENABLED === 'true'
}

export function getBilgeTahtaPilotInstitutionId(): string | null {
  const value = process.env.BILGE_TAHTA_PILOT_INSTITUTION_ID?.trim().toLowerCase()
  return value && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value)
    ? value
    : null
}
