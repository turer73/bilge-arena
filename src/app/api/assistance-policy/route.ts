import {
  OPEN_ASSISTANCE_POLICY,
  type AssistancePolicy,
} from '@/lib/assistance-policy/contract'
import { readAssistancePolicy } from '@/lib/assistance-policy/server'
import { createClient } from '@/lib/supabase/server'

function policyResponse(policy: AssistancePolicy, status = 200): Response {
  return Response.json(policy, {
    status,
    headers: {
      'Cache-Control': 'private, no-store',
      'Referrer-Policy': 'no-referrer',
      'X-Content-Type-Options': 'nosniff',
    },
  })
}

/**
 * GET /api/assistance-policy
 *
 * Ogrencinin gordugu yardimci politikasi. Sinif uyeligi olmayan ya da
 * giris yapmamis kullanicida yardimcilar aciktir; politika okunamazsa
 * FAIL-CLOSED davranilir (sinav butunlugu ag hatasina feda edilmez).
 */
export async function GET() {
  const cookieClient = await createClient()
  const { data: { user } } = await cookieClient.auth.getUser()
  // Giris yapmamis kullanici hicbir sinifin uyesi olamaz; sinav modu
  // kavrami onun icin tanimsizdir.
  if (!user) return policyResponse(OPEN_ASSISTANCE_POLICY)

  const { policy, status } = await readAssistancePolicy(user.id)
  return policyResponse(policy, status)
}
