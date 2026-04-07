import { createClient } from './server'
import type { Role } from '@/types/database'
import type { User } from '@supabase/supabase-js'

type SupabaseClient = Awaited<ReturnType<typeof createClient>>

/**
 * Kullanicinin belirli bir izne sahip olup olmadigini kontrol eder.
 * user_roles → role_permissions join ile dogrulama yapar.
 * Izni varsa User nesnesini doner, yoksa null.
 */
export async function checkPermission(
  supabase: SupabaseClient,
  requiredPermission: string
): Promise<User | null> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data } = await supabase
    .from('role_permissions')
    .select('permission, role_id!inner(id)')
    .eq('permission', requiredPermission)
    .in(
      'role_id',
      // Alt sorgu: kullanicinin rolleri
      (await supabase
        .from('user_roles')
        .select('role_id')
        .eq('user_id', user.id)
      ).data?.map(ur => ur.role_id) || []
    )
    .limit(1)

  return data && data.length > 0 ? user : null
}

/**
 * Kullanicinin tum izinlerini doner (flat string dizisi).
 * Admin sidebar filtreleme ve client-side kontroller icin.
 */
export async function getUserPermissions(
  supabase: SupabaseClient,
  userId: string
): Promise<string[]> {
  // Kullanicinin rol ID'lerini al
  const { data: userRoles } = await supabase
    .from('user_roles')
    .select('role_id')
    .eq('user_id', userId)

  if (!userRoles || userRoles.length === 0) return []

  const roleIds = userRoles.map(ur => ur.role_id)

  // Bu rollerin tum izinlerini al
  const { data: permissions } = await supabase
    .from('role_permissions')
    .select('permission')
    .in('role_id', roleIds)

  if (!permissions) return []

  // Tekrarlari kaldir (birden fazla rol ayni izne sahip olabilir)
  return Array.from(new Set(permissions.map(p => p.permission)))
}

/**
 * Kullanicinin atanmis rollerini doner.
 */
export async function getUserRoles(
  supabase: SupabaseClient,
  userId: string
): Promise<Role[]> {
  const { data } = await supabase
    .from('user_roles')
    .select('role_id, roles:role_id(id, slug, name, description, is_system, created_at)')
    .eq('user_id', userId)

  if (!data) return []
  return data.map((ur: Record<string, unknown>) => ur.roles).filter(Boolean) as Role[]
}

/**
 * Admin log kaydeder — IP ve user-agent bilgisi dahil.
 * Tüm admin operasyonlarında tutarlı log formatı sağlar.
 */
export async function logAdminAction(
  supabase: SupabaseClient,
  opts: {
    adminId: string
    action: string
    targetType: string
    targetId: string
    details?: Record<string, unknown>
    request?: Request
  },
) {
  const ip = opts.request?.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null
  const userAgent = opts.request?.headers.get('user-agent')?.slice(0, 256) || null

  await supabase.from('admin_logs').insert({
    admin_id: opts.adminId,
    action: opts.action,
    target_type: opts.targetType,
    target_id: opts.targetId,
    details: { ...opts.details, ip, user_agent: userAgent },
  })
}

/**
 * Geriye uyumlu admin kontrolu.
 * Mevcut admin API route'lari bu fonksiyonu kullanir.
 * Artik RBAC uzerinden calisir: admin.dashboard.view izni yeterli.
 */
export async function checkAdmin(supabase: SupabaseClient) {
  return checkPermission(supabase, 'admin.dashboard.view')
}
