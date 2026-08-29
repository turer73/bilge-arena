import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { checkPermission } from '@/lib/supabase/admin'
import { checkAdminMutationRl } from '@/lib/utils/admin-rate-limit'
import { NextResponse, type NextRequest } from 'next/server'
import { dbErrorResponse } from '@/lib/utils/api-error'

export async function GET() {
  const supabase = await createClient()
  const admin = await checkPermission(supabase, 'admin.settings.view')
  if (!admin) {
    return NextResponse.json({ error: 'Yetkisiz erişim' }, { status: 403 })
  }

  const { data: settings, error } = await supabase
    .from('site_settings')
    .select('*')

  if (error) {
    return dbErrorResponse('admin/settings', error)
  }

  // key->value map'e cevir
  const settingsMap: Record<string, unknown> = {}
  for (const s of settings ?? []) {
    settingsMap[s.key] = s.value
  }

  return NextResponse.json({ settings: settingsMap })
}

// ─── Setting Validasyon Kuralları ──────────────────────
function validateSetting(key: string, value: unknown): string | null {
  if (key === 'maintenance_mode' || key === 'registration_enabled') {
    return typeof value === 'boolean' ? null : 'Boolean olmalı'
  }
  if (key === 'daily_quest_count') {
    const n = Number(value)
    return Number.isInteger(n) && n >= 1 && n <= 10 ? null : '1-10 arası tam sayı olmalı'
  }
  if (key === 'max_chat_messages_guest') {
    const n = Number(value)
    return Number.isInteger(n) && n >= 0 && n <= 100 ? null : '0-100 arası tam sayı olmalı'
  }
  if (key === 'max_chat_messages_user') {
    const n = Number(value)
    return Number.isInteger(n) && n >= 1 && n <= 500 ? null : '1-500 arası tam sayı olmalı'
  }
  return 'Bilinmeyen ayar'
}

export async function PATCH(request: NextRequest) {
  const supabase = await createClient()
  const admin = await checkPermission(supabase, 'admin.settings.edit')
  if (!admin) {
    return NextResponse.json({ error: 'Yetkisiz erişim' }, { status: 403 })
  }

  const rlRes = await checkAdminMutationRl(admin.id)
  if (rlRes) return rlRes

  const body = await request.json()
  const { key, value } = body

  if (!key) {
    return NextResponse.json({ error: 'Missing key' }, { status: 400 })
  }

  // Validasyon — bilinmeyen key'leri reddet
  if (typeof key !== 'string') {
    return NextResponse.json({ error: 'Geçersiz ayar anahtarı' }, { status: 400 })
  }
  const err = validateSetting(key, value)
  if (err === 'Bilinmeyen ayar') {
    return NextResponse.json({ error: `Bilinmeyen ayar: ${key}` }, { status: 400 })
  }
  if (err) {
    return NextResponse.json({ error: `Geçersiz değer: ${err}` }, { status: 400 })
  }

  const svc = createServiceRoleClient()
  const { error } = await svc
    .from('site_settings')
    .upsert({
      key,
      value: JSON.stringify(value),
      updated_by: admin.id,
    })

  if (error) {
    return dbErrorResponse('admin/settings', error)
  }

  // Admin log
  await svc.from('admin_logs').insert({
    admin_id: admin.id,
    action: 'update_setting',
    target_type: 'setting',
    target_id: key,
    details: { key, value },
  })

  return NextResponse.json({ success: true })
}
