// Shared UI/API contract. Confirmation is deliberate intent, not authorization.
export const ACCOUNT_DELETION_CONFIRMATION = 'HESABIMI SIL'

export function isAccountDeletionConfirmed(value: unknown): value is {
  confirmation: string
  acknowledged: true
  expectedUserId: string
} {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const input = value as Record<string, unknown>
  return typeof input.confirmation === 'string'
    && input.confirmation.trim() === ACCOUNT_DELETION_CONFIRMATION
    && input.acknowledged === true
    && typeof input.expectedUserId === 'string'
    && input.expectedUserId.length > 0
}
