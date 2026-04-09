import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

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

  const body = await req.json()
  const { username, display_name, city, grade } = body

  // Sadece izin verilen alanlari guncelle
  const updates: Record<string, unknown> = {}
  if (typeof username === 'string') {
    const trimmed = username.trim()
    if (trimmed.length < 2 || trimmed.length > 30) {
      return NextResponse.json({ error: 'Isim 2-30 karakter olmali' }, { status: 400 })
    }
    updates.username = trimmed
  }
  if (typeof display_name === 'string') {
    updates.display_name = display_name.trim().slice(0, 50) || null
  }
  if (typeof city === 'string') {
    updates.city = city.trim().slice(0, 50) || null
  }
  if (grade !== undefined) {
    const g = Number(grade)
    updates.grade = (g >= 9 && g <= 13) ? g : null
  }
  if (body.onboarding_completed === true) {
    updates.onboarding_completed = true
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'Guncellenecek alan yok' }, { status: 400 })
  }

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
