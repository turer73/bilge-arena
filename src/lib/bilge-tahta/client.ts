export function isBilgeTahtaEnabled(): boolean {
  return process.env.NEXT_PUBLIC_BILGE_TAHTA_ENABLED === 'true'
}
