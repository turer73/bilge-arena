import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createRateLimiter } from '@/lib/utils/rate-limit'
import { profileUpdateSchema } from '@/lib/validations/schemas'

const profileLimiter = createRateLimiter('profile-update', 10, 60_000)

/**
 * PATCH /api/profile — Profil bilgilerini guncelle
 * Body: { display_name?, city?, grade? }
 */
export async function PATCH(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Yetkisiz' }, { status: 401 })
  }

  const rl = await profileLimiter.check(user.id)
  if (!rl.success) return NextResponse.json({ error: 'Cok hizli istek' }, { status: 429 })

  const body = await req.json()
  const parsed = profileUpdateSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message || 'Gecersiz veri' }, { status: 400 })
  }

  const { username, display_name, city, grade, onboarding_completed } = parsed.data
  const updates: Record<string, unknown> = {}
  if (username) updates.username = username
  if (display_name !== undefined) updates.display_name = display_name || null
  if (city !== undefined) updates.city = city || null
  if (grade !== undefined) updates.grade = grade
  if (onboarding_completed) updates.onboarding_completed = true

  const { data, error } = await supabase
    .from('profiles')
    .update(updates)
    .eq('id', user.id)
    .select('id, display_name, city, grade, avatar_url')
    .single()

  if (error) {
    console.error('[Profile PATCH] Hata:', error)
    return NextResponse.json({ error: 'Profil guncellenemedi' }, { status: 500 })
  }

  return NextResponse.json(data)
}
