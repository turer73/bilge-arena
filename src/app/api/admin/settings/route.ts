import { createClient } from '@/lib/supabase/server'
import { checkAdmin } from '@/lib/supabase/admin'
import { NextResponse, type NextRequest } from 'next/server'

export async function GET() {
  const supabase = await createClient()
  const admin = await checkAdmin(supabase)
  if (!admin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
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
  maintenance_mode: (v) => typeof v === 'boolean' ? null : 'Boolean olmali',
  registration_enabled: (v) => typeof v === 'boolean' ? null : 'Boolean olmali',
  daily_quest_count: (v) => {
    const n = Number(v)
    return Number.isInteger(n) && n >= 1 && n <= 10 ? null : '1-10 arasi tam sayi olmali'
  },
  max_chat_messages_guest: (v) => {
    const n = Number(v)
    return Number.isInteger(n) && n >= 0 && n <= 100 ? null : '0-100 arasi tam sayi olmali'
  },
  max_chat_messages_user: (v) => {
    const n = Number(v)
    return Number.isInteger(n) && n >= 1 && n <= 500 ? null : '1-500 arasi tam sayi olmali'
  },
}

export async function PATCH(request: NextRequest) {
  const supabase = await createClient()
  const admin = await checkAdmin(supabase)
  if (!admin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
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
    return NextResponse.json({ error: `Gecersiz deger: ${err}` }, { status: 400 })
  }

  const { error } = await supabase
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
  await supabase.from('admin_logs').insert({
    admin_id: admin.id,
    action: 'update_setting',
    target_type: 'setting',
    target_id: key,
    details: { key, value },
  })

  return NextResponse.json({ success: true })
}
