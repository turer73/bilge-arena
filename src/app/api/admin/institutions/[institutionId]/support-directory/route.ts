import { type NextRequest } from 'next/server'
import { z } from 'zod'
import { checkPermission, logAdminAction } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { institutionSupportDirectorySchema } from '@/lib/institution-admin/contracts'
import { institutionPilotNoStoreJson, institutionPilotRpcStatus } from '@/lib/institution-pilot/server-contract'
import { isInstitutionPilotEnabled } from '@/lib/institution-pilot/server-security'

const uuidSchema = z.string().uuid()

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ institutionId: string }> },
) {
  if (!isInstitutionPilotEnabled()) {
    return institutionPilotNoStoreJson({ error: 'Kurum pilotu yapılandırılmadı' }, { status: 503 })
  }
  const supabase = await createClient()
  const admin = await checkPermission(supabase, 'institution.support.access')
  if (!admin) return institutionPilotNoStoreJson({ error: 'Yetkisiz erişim' }, { status: 403 })

  const id = uuidSchema.safeParse((await params).institutionId)
  if (!id.success) return institutionPilotNoStoreJson({ error: 'Geçersiz kurum' }, { status: 400 })

  const { data, error } = await supabase.rpc('get_institution_support_directory', {
    p_admin_user_id: admin.id,
    p_institution_id: id.data,
  })
  if (error) {
    return institutionPilotNoStoreJson(
      { error: error.code === '42501' ? 'Kurum destek erişimi kapalı veya süresi dolmuş' : 'Destek görünümü alınamadı' },
      { status: institutionPilotRpcStatus(error.code) },
    )
  }
  const parsed = institutionSupportDirectorySchema.safeParse(data)
  if (!parsed.success) return institutionPilotNoStoreJson({ error: 'Destek görünümü doğrulanamadı' }, { status: 500 })

  const { error: auditError } = await logAdminAction(supabase, {
    adminId: admin.id,
    action: 'view_institution_support_directory',
    targetType: 'pilot_institution',
    targetId: id.data,
    details: { scope: 'read_only', expiresAt: parsed.data.access.expiresAt },
    request,
  })
  if (auditError) {
    return institutionPilotNoStoreJson({ error: 'Destek görüntüleme günlüğü yazılamadı' }, { status: 500 })
  }
  return institutionPilotNoStoreJson(parsed.data)
}
