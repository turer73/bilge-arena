import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role'

/**
 * PATCH /api/challenges/[id] — Duello kabul/reddet
 * Body: { action: 'accept' | 'decline' }
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Yetkisiz' }, { status: 401 })

  const { id } = await params
  const { action } = await req.json()

  if (!['accept', 'decline'].includes(action)) {
    return NextResponse.json({ error: 'Gecersiz aksiyon' }, { status: 400 })
  }

  const svc = createServiceRoleClient()

  // Duelloyu bul
  const { data: challenge } = await svc
    .from('challenges')
    .select('*')
    .eq('id', id)
    .eq('opponent_id', user.id) // Sadece rakip kabul/reddet yapabilir
    .eq('status', 'pending')
    .single()

  if (!challenge) {
    return NextResponse.json({ error: 'Duello bulunamadi veya zaten cevaplanmis' }, { status: 404 })
  }

  // Suresi dolmus mu?
  if (new Date(challenge.expires_at) < new Date()) {
    await svc.from('challenges').update({ status: 'expired' }).eq('id', id)
    return NextResponse.json({ error: 'Duellonun suresi dolmus' }, { status: 400 })
  }

  const newStatus = action === 'accept' ? 'accepted' : 'declined'
  await svc.from('challenges').update({ status: newStatus }).eq('id', id)

  return NextResponse.json({ status: newStatus })
}
