import { createHash } from 'node:crypto'
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { createRateLimiter } from '@/lib/utils/rate-limit'
import { trDayString } from '@/lib/utils/tr-date'

const questsLimiter = createRateLimiter('quests', 30, 60_000) // 30 req/dk
const QUESTS_PER_DAY = 3

// (kullanici, gun, gorev) tohumlu sira: ayni gun icin her istek ayni gorevleri
// secer, gunler ve kullanicilar arasinda ise dagilim karisik kalir.
function questRank(userId: string, day: string, questId: string): string {
  return createHash('sha256').update(`${userId}:${day}:${questId}`).digest('hex')
}

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

  // Atama paralel isteklerde tek sonuç verir. Önceden her istek rastgele
  // karıştırıp ekliyordu; 30 paralel istek günü 6 görevle açabiliyordu (derin
  // inceleme 2026-10-15 §4.2). Artık seçim gün için deterministik ve
  // UNIQUE(user_id, quest_id, date) üzerinde ON CONFLICT DO NOTHING ile
  // yazılıyor: paralel istekler aynı 3 satırı üretir, ikinci yazım yutulur.
  const selected = [...allQuests]
    .sort((left, right) => (
      questRank(user.id, today, left.id) < questRank(user.id, today, right.id) ? -1 : 1
    ))
    .slice(0, QUESTS_PER_DAY)

  const inserts = selected.map((q) => ({
    user_id: user.id,
    quest_id: q.id,
    date: today,
    current_value: 0,
    is_completed: false,
    xp_claimed: false,
  }))

  const { error } = await svc
    .from('user_daily_quests')
    .upsert(inserts, { onConflict: 'user_id,quest_id,date', ignoreDuplicates: true })

  if (error) {
    console.error('[Quests API] Insert error:', error)
    return NextResponse.json({ error: 'Görev atanamadı' }, { status: 500 })
  }

  // Paralel bir isteğin yazdığı satırlar da dahil, günün atanmış görevleri.
  const { data: assigned, error: readError } = await svc
    .from('user_daily_quests')
    .select('*, quest:daily_quests(*)')
    .eq('user_id', user.id)
    .eq('date', today)

  if (readError) {
    console.error('[Quests API] Read error:', readError)
    return NextResponse.json({ error: 'Görev atanamadı' }, { status: 500 })
  }

  return NextResponse.json({ quests: assigned ?? [] })
}

// Görev ilerlemesi yalnız migration 093'ün doğrulanmış-session transaction'ında
// güncellenir. İstemciden gelen sessionData hiçbir zaman ödül kaynağı olamaz.
export async function PATCH() {
  return NextResponse.json(
    { error: 'Görev ilerlemesi yalnız doğrulanmış oturumla güncellenir' },
    { status: 405, headers: { Allow: 'GET' } },
  )
}
