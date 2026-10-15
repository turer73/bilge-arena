import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { createRateLimiter } from '@/lib/utils/rate-limit'
import { isAccountDeletionConfirmed } from '@/lib/account-deletion'

const deleteLimiter = createRateLimiter('account-delete', 1, 300_000) // 5 dk'da 1

// POST: Close the profile, revoke sessions, then scrub the Auth identity.
// Related learner/audit records and backups are NOT physically purged here.
export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Yetkisiz' }, { status: 401 })
  }

  const input: unknown = await request.json().catch(() => null)
  if (!isAccountDeletionConfirmed(input)) {
    return NextResponse.json(
      { error: 'Hesabı silmek için açıklamayı onaylayıp HESABIMI SIL yazmalısınız.', code: 'account_deletion_confirmation_required' },
      { status: 400, headers: { 'Cache-Control': 'private, no-store' } },
    )
  }
  // The submitted ID only guards account switching. It never selects a subject.
  if (input.expectedUserId !== user.id) {
    return NextResponse.json(
      { error: 'Oturumunuzdaki hesap değişti. Profil sayfasını yenileyip yeniden onaylayın.', code: 'account_deletion_subject_changed' },
      { status: 409, headers: { 'Cache-Control': 'private, no-store' } },
    )
  }

  const rl = await deleteLimiter.check(user.id)
  if (!rl.success) {
    const unavailable = rl.reason === 'backend_unavailable'
    return NextResponse.json(
      { error: unavailable ? 'Güvenlik servisi geçici olarak kullanılamıyor' : 'Çok hızlı istek' },
      { status: unavailable ? 503 : 429, headers: { 'Retry-After': String(rl.retryAfter ?? 60) } },
    )
  }

  const svc = createServiceRoleClient()

  const { error } = await svc.rpc('soft_delete_user', { p_user_id: user.id })

  if (error) {
    console.error('[Account Delete] soft_delete_user hatasi:', error.message)
    return NextResponse.json({ error: 'Hesap silinemedi' }, { status: 500 })
  }

  // Supabase oturumunu sonlandir
  const { error: signOutError } = await supabase.auth.signOut({ scope: 'global' })
  if (signOutError) {
    // Soft-delete succeeded, but do not claim the browser session was cleaned
    // up when global revocation failed. The response remains no-store so the
    // caller can retry the cleanup without caching an ambiguous result.
    console.error('[Account Delete] global signOut hatasi:', signOutError.message)
    return NextResponse.json(
      {
        error: 'Hesabınız kapatıldı ancak oturum tamamen kapatılamadı; lütfen tekrar deneyin.',
        code: 'account_session_cleanup_pending',
        erasure: { complete: false, profile: 'closed', authIdentity: 'pending', relatedRecords: 'pending_retention_review' },
      },
      { status: 503, headers: { 'Cache-Control': 'private, no-store' } },
    )
  }

  // Explicit true preserves FK/evidence tombstones. Never default to hard delete.
  try {
    const { error: identityError } = await svc.auth.admin.deleteUser(user.id, true)
    if (identityError) throw new Error('auth_identity_cleanup_failed')
  } catch {
    console.error('[Account Delete] Auth identity cleanup failed')
    return NextResponse.json(
      {
        error: 'Hesabınız kapatıldı ancak giriş kimlik bilgileriniz temizlenemedi. iletisim@bilgearena.com üzerinden bize ulaşabilirsiniz.',
        code: 'account_identity_cleanup_pending',
        erasure: { complete: false, profile: 'closed', authIdentity: 'pending', relatedRecords: 'pending_retention_review' },
      },
      { status: 503, headers: { 'Cache-Control': 'private, no-store' } },
    )
  }

  return NextResponse.json(
    {
      message: 'Hesabınız kapatıldı ve giriş kimlik bilgileriniz temizlendi.',
      erasure: {
        complete: false,
        profile: 'closed',
        authIdentity: 'scrubbed',
        relatedRecords: 'pending_retention_review',
        processorsAndBackups: 'not_verified',
        physicalPurgePerformed: false,
      },
    },
    { headers: { 'Cache-Control': 'private, no-store' } },
  )
}
