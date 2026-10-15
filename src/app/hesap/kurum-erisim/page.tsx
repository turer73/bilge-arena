import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { InstitutionNoAccessPage } from '@/components/institution-tracking/institution-access-help'
import { INSTITUTION_NO_ACCESS_PATH } from '@/lib/auth/safe-next'

export const metadata: Metadata = {
  title: 'Kurum Paneli Erişimi | Bilge Arena',
  robots: { index: false, follow: false },
}

/**
 * Kurum girisinden sonra, hesapta kurum yetkisi yoksa auth callback buraya
 * yonlendirir. Sayfa hassas yuzey degildir (telemetri politikasina girmez)
 * ve iki adimli dogrulama istemez; yalniz oturum ister.
 */
export default async function InstitutionNoAccessRoute() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect(`/giris?next=${encodeURIComponent(INSTITUTION_NO_ACCESS_PATH)}`)
  return <InstitutionNoAccessPage email={user.email ?? null} />
}
