import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { createRateLimiter } from '@/lib/utils/rate-limit'
import { trDayString } from '@/lib/utils/tr-date'

const questsLimiter = createRateLimiter('quests', 30, 60_000) // 30 req/dk

// GET: Kullanıcının bugünkü günlük görevlerini getir (yoksa oluştur)
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Yetkisiz' }, { status: 401 })
  }

  const rl = await questsLimiter.check(user.id)
  if (!rl.success) {
    return NextResponse.json({ error: 'Çok fazla istek' }, { status: 429 })
  }

  const svc = createServiceRoleClient()
  const today = trDayString(new Date())

  // Bugünkü görevleri kontrol et
  const { data: existing } = await svc
    .from('user_daily_quests')
    .select('*, quest:daily_quests(*)')
    .eq('user_id', user.id)
    .eq('date', today)

  if (existing && existing.length > 0) {
    return NextResponse.json({ quests: existing })
  }

  // Bugün için görev yok — rastgele 3 görev ata
  const { data: allQuests } = await svc
    .from('daily_quests')
    .select('*')
    .eq('is_active', true)

  if (!allQuests || allQuests.length === 0) {
    return NextResponse.json({ quests: [] })
  }

  // Rastgele 3 görev seç
  const shuffled = allQuests.sort(() => Math.random() - 0.5)
  const selected = shuffled.slice(0, Math.min(3, shuffled.length))

  const inserts = selected.map((q) => ({
    user_id: user.id,
    quest_id: q.id,
    date: today,
    current_value: 0,
    is_completed: false,
    xp_claimed: false,
  }))

  const { data: created, error } = await svc
    .from('user_daily_quests')
    .insert(inserts)
    .select('*, quest:daily_quests(*)')

  if (error) {
    console.error('[Quests API] Insert error:', error)
    return NextResponse.json({ error: 'Görev atanamadı' }, { status: 500 })
  }

  return NextResponse.json({ quests: created })
}

// Görev ilerlemesi yalnız migration 093'ün doğrulanmış-session transaction'ında
// güncellenir. İstemciden gelen sessionData hiçbir zaman ödül kaynağı olamaz.
export async function PATCH() {
  return NextResponse.json(
    { error: 'Görev ilerlemesi yalnız doğrulanmış oturumla güncellenir' },
    { status: 405, headers: { Allow: 'GET' } },
  )
}
