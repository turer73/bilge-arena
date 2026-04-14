import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { createRateLimiter } from '@/lib/utils/rate-limit'

const deleteLimiter = createRateLimiter('account-delete', 1, 300_000) // 5 dk'da 1

// POST: Hesap silme istegi (soft delete + anonymize)
export async function POST() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Yetkisiz' }, { status: 401 })
  }

  const rl = await deleteLimiter.check(user.id)
  if (!rl.success) return NextResponse.json({ error: 'Cok hizli istek' }, { status: 429 })

  const svc = createServiceRoleClient()

  const { error } = await svc.rpc('soft_delete_user', { p_user_id: user.id })

  if (error) {
    console.error('[Account Delete] soft_delete_user hatasi:', error.message)
    return NextResponse.json({ error: 'Hesap silinemedi' }, { status: 500 })
  }

  // Supabase oturumunu sonlandir
  await supabase.auth.signOut()

  return NextResponse.json({ message: 'Hesabiniz 30 gun icinde kalici olarak silinecektir.' })
}
