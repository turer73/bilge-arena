/**
 * Bilet kesimi başarısızlığının nerede olduğunu taşır. Mesaj sözleşmesi
 * (`verified_attempt_issue_failed`) değişmez; kullanıcıya hep aynı genel hata
 * döner. `stage` ve PostgreSQL/PostgREST `code` yalnız sunucu logu içindir ve
 * kişisel veri içermez. Eskiden her neden aynı mesaja çevrilip atılıyordu;
 * canlıdaki "Deneme başlatılamadı" hatalarının kaynağı bu yüzden görünmüyordu.
 *
 * Ayrı modül: route testleri `@/lib/verified-attempts`'i tümden mock'lar,
 * log özeti yine de gerçek kalmalı.
 */
export type VerifiedAttemptFailureStage =
  | 'request'
  | 'epoch'
  | 'rpc'
  | 'ticket'
  | 'expired'
  | 'snapshot'
  | 'unexpected'

export class VerifiedAttemptIssueError extends Error {
  constructor(
    message: 'verified_attempt_issue_failed' | 'verified_exam_attempt_issue_failed',
    readonly stage: VerifiedAttemptFailureStage,
    readonly code: string | null = null,
  ) {
    super(message)
    this.name = 'VerifiedAttemptIssueError'
  }
}

/** Log satırı için güvenli özet: aşama ve hata kodu, başka hiçbir şey. */
export function describeVerifiedAttemptFailure(error: unknown): {
  stage: VerifiedAttemptFailureStage | 'route_snapshot'
  code: string | null
} {
  if (error instanceof VerifiedAttemptIssueError) return { stage: error.stage, code: error.code }
  // Route'lar biletin soru sırasını yeniden doğrularken bu mesajı atar.
  if (error instanceof Error && error.message === 'verified_attempt_snapshot_mismatch') {
    return { stage: 'route_snapshot', code: null }
  }
  return { stage: 'unexpected', code: error instanceof Error ? error.name : null }
}
