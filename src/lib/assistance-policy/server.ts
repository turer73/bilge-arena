import 'server-only'
import {
  assistancePolicySchema,
  CLOSED_ASSISTANCE_POLICY,
  OPEN_ASSISTANCE_POLICY,
  type AssistancePolicy,
} from './contract'
import { createServiceRoleClient } from '@/lib/supabase/service-role'

export interface AssistancePolicyRead {
  policy: AssistancePolicy
  /** 503: politika okunamadı ve fail-closed uygulandı. */
  status: 200 | 503
}

/**
 * Öğrencinin sınav modu politikasını sunucuda okur. Hem politikayı istemciye
 * veren uç hem yardımcı uçları (`/api/chat`) bunu kullanır; istemci kapısı
 * doğrudan istekle atlanabildiği için asıl kapı burasıdır.
 *
 * Politika okunamazsa FAIL-CLOSED: sınav bütünlüğü ağ hatasına feda edilmez.
 */
export async function readAssistancePolicy(userId: string): Promise<AssistancePolicyRead> {
  try {
    const admin = createServiceRoleClient()
    const { data, error } = await admin.rpc('get_my_assistance_policy', {
      p_user_id: userId,
    })
    if (error) {
      // Migration 127 henuz uygulanmadiysa fonksiyon yoktur (42883 /
      // PGRST202). Bu durumda kapatilacak bir sinav da yoktur; fail-closed
      // uygulanirsa ozellik yokken butun platformda yardimcilar kapanirdi.
      // Diger hatalar (yetki, baglanti, sozlesme) fail-closed kalir.
      if (error.code === '42883' || error.code === 'PGRST202') {
        return { policy: OPEN_ASSISTANCE_POLICY, status: 200 }
      }
      return { policy: CLOSED_ASSISTANCE_POLICY, status: 503 }
    }

    const parsed = assistancePolicySchema.safeParse(data)
    return parsed.success
      ? { policy: parsed.data, status: 200 }
      : { policy: CLOSED_ASSISTANCE_POLICY, status: 503 }
  } catch {
    return { policy: CLOSED_ASSISTANCE_POLICY, status: 503 }
  }
}
