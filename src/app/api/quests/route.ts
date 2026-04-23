import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { createRateLimiter } from '@/lib/utils/rate-limit'
import { questProgressSchema } from '@/lib/validations/schemas'

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
  const today = new Date().toISOString().split('T')[0]

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

// PATCH: Görev ilerlemesini güncelle
export async function PATCH(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Yetkisiz' }, { status: 401 })
  }

  const body = await request.json()
  const parsed = questProgressSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Eksik veri' }, { status: 400 })
  }
  const { sessionData } = parsed.data

  const svc = createServiceRoleClient()
  const today = new Date().toISOString().split('T')[0]

  const { data: userQuests } = await svc
    .from('user_daily_quests')
    .select('*, quest:daily_quests(*)')
    .eq('user_id', user.id)
    .eq('date', today)
    .eq('is_completed', false)

  if (!userQuests || userQuests.length === 0) {
    return NextResponse.json({ updated: [] })
  }

  const results = []
  for (const uq of userQuests) {
    const quest = uq.quest as { quest_type: string; target_value: number; target_game?: string } | null
    if (!quest) continue

    let newValue = uq.current_value
    switch (quest.quest_type) {
      case 'play_sessions': newValue += 1; break
      case 'correct_answers': newValue += (sessionData.correctAnswers ?? 0); break
      case 'streak_maintain': newValue = Math.max(newValue, sessionData.maxStreak ?? 0); break
      case 'accuracy': newValue = Math.max(newValue, sessionData.accuracy ?? 0); break
      case 'specific_game': if (sessionData.game === quest.target_game) newValue += 1; break
    }

    const isCompleted = newValue >= quest.target_value
    const { data } = await svc
      .from('user_daily_quests')
      .update({
        current_value: newValue,
        is_completed: isCompleted,
        completed_at: isCompleted ? new Date().toISOString() : null,
      })
      .eq('id', uq.id)
      .select('*, quest:daily_quests(*)')
      .single()

    if (data) results.push(data)
  }

  return NextResponse.json({ updated: results })
}
