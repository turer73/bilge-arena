import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// GET: Kullanıcının bugünkü günlük görevlerini getir (yoksa oluştur)
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Yetkisiz' }, { status: 401 })
  }

  const today = new Date().toISOString().split('T')[0]

  // Bugünkü görevleri kontrol et
  const { data: existing } = await supabase
    .from('user_daily_quests')
    .select('*, quest:daily_quests(*)')
    .eq('user_id', user.id)
    .eq('date', today)

  if (existing && existing.length > 0) {
    return NextResponse.json({ quests: existing })
  }

  // Bugün için görev yok — rastgele 3 görev ata
  const { data: allQuests } = await supabase
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

  const { data: created, error } = await supabase
    .from('user_daily_quests')
    .insert(inserts)
    .select('*, quest:daily_quests(*)')

  if (error) {
    console.error('[Quests API] Insert error:', error)
    return NextResponse.json({ error: 'Gorev atanamadi' }, { status: 500 })
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
  const { sessionData } = body

  if (!sessionData) {
    return NextResponse.json({ error: 'Eksik veri' }, { status: 400 })
  }

  const today = new Date().toISOString().split('T')[0]

  // Bugünkü görevleri al
  const { data: userQuests } = await supabase
    .from('user_daily_quests')
    .select('*, quest:daily_quests(*)')
    .eq('user_id', user.id)
    .eq('date', today)
    .eq('is_completed', false)

  if (!userQuests || userQuests.length === 0) {
    return NextResponse.json({ updated: [] })
  }

  const updates: Array<{ id: string; current_value: number; is_completed: boolean; completed_at: string | null }> = []

  for (const uq of userQuests) {
    const quest = uq.quest
    if (!quest) continue

    let newValue = uq.current_value

    switch (quest.quest_type) {
      case 'play_sessions':
        newValue += 1
        break
      case 'correct_answers':
        newValue += (sessionData.correctAnswers ?? 0)
        break
      case 'streak_maintain':
        newValue = Math.max(newValue, sessionData.maxStreak ?? 0)
        break
      case 'accuracy':
        newValue = Math.max(newValue, sessionData.accuracy ?? 0)
        break
      case 'specific_game':
        if (sessionData.game === quest.target_game) {
          newValue += 1
        }
        break
    }

    const isCompleted = newValue >= quest.target_value

    updates.push({
      id: uq.id,
      current_value: newValue,
      is_completed: isCompleted,
      completed_at: isCompleted ? new Date().toISOString() : null,
    })
  }

  // Tüm güncellemeleri yap
  const results = []
  for (const upd of updates) {
    const { data } = await supabase
      .from('user_daily_quests')
      .update({
        current_value: upd.current_value,
        is_completed: upd.is_completed,
        completed_at: upd.completed_at,
      })
      .eq('id', upd.id)
      .select('*, quest:daily_quests(*)')
      .single()

    if (data) results.push(data)
  }

  return NextResponse.json({ updated: results })
}
