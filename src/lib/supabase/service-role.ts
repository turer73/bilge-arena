import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database.client'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co'
// Yeni isim (sb_secret_*) onceliklidir, eski legacy JWT format fallback
const SUPABASE_SERVICE_KEY =
  process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || ''

/**
 * Supabase admin client — service_role key ile.
 * RLS'yi bypass eder, sadece server-side API route'larda kullanılmalı.
 * Kullanım: auth.admin.inviteUserByEmail, auth.admin.deleteUser vb.
 */
export function createServiceRoleClient() {
  if (!SUPABASE_SERVICE_KEY) {
    throw new Error('SUPABASE_SERVICE_KEY (veya legacy SUPABASE_SERVICE_ROLE_KEY) tanımlı değil')
  }

  return createClient<Database>(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
}
