import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { checkPermission } from '@/lib/supabase/admin'
import { checkAdminMutationRl } from '@/lib/utils/admin-rate-limit'
import { isValidUuid } from '@/lib/utils/uuid'

interface PatchBody {
  action?: 'approve' | 'reject'
  note?: string
}

/**
 * PATCH /api/admin/submissions/[id] — UGC gönderimini onayla/reddet.
 *
 * approve: questions tablosuna source='ugc', is_active=FALSE ile kopyalar
 * (aktivasyon mevcut /admin/sorular kalite kapısından geçer — AI-üretim
 * akışıyla aynı çift-kapı) ve gönderiyi approved işaretler.
 * reject: durum + opsiyonel not.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createClient()
  const admin = await checkPermission(supabase, 'admin.questions.edit')
  if (!admin) {
    return NextResponse.json({ error: 'Yetkisiz erişim' }, { status: 403 })
  }

  const rlRes = await checkAdminMutationRl(admin.id)
  if (rlRes) return rlRes

  const { id } = await params
  if (!isValidUuid(id)) {
    return NextResponse.json({ error: 'Geçersiz id' }, { status: 400 })
  }

  let body: PatchBody
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Geçersiz JSON' }, { status: 400 })
  }
  if (body.action !== 'approve' && body.action !== 'reject') {
    return NextResponse.json({ error: 'action approve|reject olmalı' }, { status: 400 })
  }
  const note = typeof body.note === 'string' ? body.note.slice(0, 500) : null

  const svc = createServiceRoleClient()

  // 1) ATOMIK CLAIM (Codex P1): pending satırı tek UPDATE ile sahiplen.
  //    Eski akış (önce oku, sonra insert, sonra update) iki eşzamanlı onayda
  //    İKİSİNİN de questions'a insert etmesine izin veriyordu — kaybeden
  //    update 0 satır etkileyip yine 200 dönüyordu (duplicate + yanlış başarı).
  //    Şimdi: claim'i kazanamayan hiç insert ETMEZ.
  const newStatus = body.action === 'approve' ? 'approved' : 'rejected'
  const { data: claimed, error: claimErr } = await svc
    .from('question_submissions')
    .update({
      status: newStatus,
      review_note: note,
      reviewed_by: admin.id,
      reviewed_at: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('status', 'pending')
    .select('id, game, category, difficulty, content')
    .maybeSingle()

  if (claimErr) {
    console.error('[admin/submissions] claim hatası:', claimErr.code)
    return NextResponse.json({ error: 'Güncelleme başarısız' }, { status: 500 })
  }
  if (!claimed) {
    // Satır yok VEYA başka admin önce davrandı — ikisi de "değerlendirilemez"
    return NextResponse.json({ error: 'Gönderim bulunamadı veya zaten değerlendirilmiş' }, { status: 409 })
  }

  // 2) Approve ise soruyu OLUŞTUR (claim bizde — yarış yok)
  let questionId: string | null = null
  if (body.action === 'approve') {
    const { data: inserted, error: qErr } = await svc
      .from('questions')
      .insert({
        game: claimed.game,
        category: claimed.category,
        difficulty: claimed.difficulty,
        content: claimed.content,
        source: 'ugc',
        is_active: false,
      })
      .select('id')
      .single()

    if (qErr || !inserted) {
      // Insert düştü: claim'i geri al ki gönderi kuyruğa dönsün (yarı-onay kalmasın)
      console.error('[admin/submissions] questions insert hatası:', qErr?.code)
      await svc
        .from('question_submissions')
        .update({ status: 'pending', review_note: null, reviewed_by: null, reviewed_at: null })
        .eq('id', id)
        .eq('status', newStatus)
      return NextResponse.json({ error: 'Soru oluşturulamadı' }, { status: 500 })
    }
    questionId = inserted.id

    // 3) İzlenebilirlik: oluşan question_id'yi gönderiye bağla
    await svc
      .from('question_submissions')
      .update({ question_id: questionId })
      .eq('id', id)
  }

  // Admin log (mevcut pattern)
  await svc.from('admin_logs').insert({
    admin_id: admin.id,
    action: body.action === 'approve' ? 'approve_submission' : 'reject_submission',
    target_type: 'question_submission',
    target_id: id,
    details: { question_id: questionId, note },
  })

  return NextResponse.json({
    status: body.action === 'approve' ? 'approved' : 'rejected',
    question_id: questionId,
  })
}
