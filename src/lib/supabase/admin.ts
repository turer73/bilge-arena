import { createClient } from './server'
import type { Profile } from '@/types/database'

/**
 * Admin kontrolu — tum admin API route'larinda paylasilan yardimci fonksiyon.
 * Supabase client'i alir, kullaniciyi dogrular ve admin rolunu kontrol eder.
 * Admin ise user nesnesini doner, degilse null.
 */
export async function checkAdmin(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  // Supabase tip cikarimini manuel olarak cozumluyoruz
  const profile = data as Profile | null
  return profile?.role === 'admin' ? user : null
}
