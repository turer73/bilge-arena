import {
  assistancePolicySchema,
  CLOSED_ASSISTANCE_POLICY,
  OPEN_ASSISTANCE_POLICY,
  type AssistancePolicy,
} from '@/lib/assistance-policy/contract'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
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

  try {
    const admin = createServiceRoleClient()
    const { data, error } = await admin.rpc('get_my_assistance_policy', {
      p_user_id: user.id,
    })
    if (error) return policyResponse(CLOSED_ASSISTANCE_POLICY, 503)

    const parsed = assistancePolicySchema.safeParse(data)
    return parsed.success
      ? policyResponse(parsed.data)
      : policyResponse(CLOSED_ASSISTANCE_POLICY, 503)
  } catch {
    return policyResponse(CLOSED_ASSISTANCE_POLICY, 503)
  }
}
