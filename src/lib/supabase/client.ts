import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
  // Not: Database generic yerine interface'leri dogrudan kullaniyoruz
  // cunku el yazması tip tanimlari supabase-js v2.98'in karmasik
  // conditional type'lari ile tam uyumlu degil.
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}
