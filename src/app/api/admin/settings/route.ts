import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { checkPermission } from '@/lib/supabase/admin'
import { NextResponse, type NextRequest } from 'next/server'

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
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // key->value map'e cevir
  const settingsMap: Record<string, unknown> = {}
  for (const s of settings ?? []) {
    settingsMap[s.key] = s.value
  }

  return NextResponse.json({ settings: settingsMap })
}

// ─── Setting Validasyon Kuralları ──────────────────────
const SETTING_VALIDATORS: Record<string, (v: unknown) => string | null> = {
  maintenance_mode: (v) => typeof v === 'boolean' ? null : 'Boolean olmalı',
  registration_enabled: (v) => typeof v === 'boolean' ? null : 'Boolean olmalı',
  daily_quest_count: (v) => {
    const n = Number(v)
    return Number.isInteger(n) && n >= 1 && n <= 10 ? null : '1-10 arası tam sayı olmalı'
  },
  max_chat_messages_guest: (v) => {
    const n = Number(v)
    return Number.isInteger(n) && n >= 0 && n <= 100 ? null : '0-100 arası tam sayı olmalı'
  },
  max_chat_messages_user: (v) => {
    const n = Number(v)
    return Number.isInteger(n) && n >= 1 && n <= 500 ? null : '1-500 arası tam sayı olmalı'
  },
}

export async function PATCH(request: NextRequest) {
  const supabase = await createClient()
  const admin = await checkPermission(supabase, 'admin.settings.edit')
  if (!admin) {
    return NextResponse.json({ error: 'Yetkisiz erişim' }, { status: 403 })
  }

  const body = await request.json()
  const { key, value } = body

  if (!key) {
    return NextResponse.json({ error: 'Missing key' }, { status: 400 })
  }

  // Validasyon — bilinmeyen key'leri reddet
  const validator = SETTING_VALIDATORS[key]
  if (!validator) {
    return NextResponse.json({ error: `Bilinmeyen ayar: ${key}` }, { status: 400 })
  }
  const err = validator(value)
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
    return NextResponse.json({ error: error.message }, { status: 500 })
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
