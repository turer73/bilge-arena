import type { createServiceRoleClient } from './service-role'
import { PLATFORM_ADMIN_ENTRY_PERMISSIONS } from '@/lib/admin/platform-permissions'

type ServiceRoleClient = ReturnType<typeof createServiceRoleClient>
type FetchLike = typeof fetch

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

/**
 * Tombstoned profiles must not be able to continue using an already issued
 * Auth session. This check intentionally fails closed: a missing service key,
 * REST error, malformed response, or missing profile is not an active account.
 * Keep it REST-based because proxy runs before route handlers and must not
 * depend on a server-only Supabase client runtime.
 */
export type UserProfileAccessState = 'active' | 'deleted' | 'unavailable'

export async function getUserProfileAccessStateViaRest({
  supabaseUrl,
  serviceKey,
  userId,
  fetchImpl = fetch,
}: {
  supabaseUrl: string
  serviceKey: string
  userId: string
  fetchImpl?: FetchLike
}): Promise<UserProfileAccessState> {
  if (!supabaseUrl || !serviceKey || !userId || !uuidPattern.test(userId)) return 'unavailable'

  try {
    const profileUrl = new URL(`${supabaseUrl.replace(/\/$/, '')}/rest/v1/profiles`)
    profileUrl.searchParams.set('id', `eq.${userId}`)
    profileUrl.searchParams.set('select', 'id,deleted_at')
    profileUrl.searchParams.set('limit', '1')
    const response = await fetchImpl(profileUrl, {
      headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
      cache: 'no-store',
    })
    if (!response.ok) return 'unavailable'
    const rows = await response.json() as unknown
    if (!Array.isArray(rows) || rows.length !== 1) return 'unavailable'
    const row = rows[0] as { id?: unknown; deleted_at?: unknown }
    if (row.id !== userId || !Object.prototype.hasOwnProperty.call(row, 'deleted_at')) {
      return 'unavailable'
    }
    return row.deleted_at === null ? 'active' : 'deleted'
  } catch {
    return 'unavailable'
  }
}

export async function userHasAnyPlatformPermission(
  client: ServiceRoleClient,
  userId: string,
  permissions: readonly string[],
): Promise<boolean> {
  if (permissions.length === 0) return false

  const { data: assignments, error: assignmentError } = await client
    .from('user_roles')
    .select('role_id')
    .eq('user_id', userId)

  if (assignmentError || !assignments?.length) return false

  const roleIds = Array.from(new Set(assignments.map((assignment) => assignment.role_id)))
  const { data: matches, error: permissionError } = await client
    .from('role_permissions')
    .select('role_id')
    .in('role_id', roleIds)
    .in('permission', [...permissions])
    .limit(1)

  return !permissionError && !!matches?.length
}
export function userHasPlatformAdminAccess(
  client: ServiceRoleClient,
  userId: string,
): Promise<boolean> {
  return userHasAnyPlatformPermission(client, userId, PLATFORM_ADMIN_ENTRY_PERMISSIONS)
}

export async function userHasAnyPlatformPermissionViaRest({
  supabaseUrl,
  serviceKey,
  userId,
  permissions,
  fetchImpl = fetch,
}: {
  supabaseUrl: string
  serviceKey: string
  userId: string
  permissions: readonly string[]
  fetchImpl?: FetchLike
}): Promise<boolean> {
  if (!supabaseUrl || !serviceKey || !userId || permissions.length === 0) return false

  const headers = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` }

  try {
    const assignmentsUrl = new URL(`${supabaseUrl.replace(/\/$/, '')}/rest/v1/user_roles`)
    assignmentsUrl.searchParams.set('user_id', `eq.${userId}`)
    assignmentsUrl.searchParams.set('select', 'role_id')

    const assignmentsResponse = await fetchImpl(assignmentsUrl, {
      headers,
      cache: 'no-store',
    })
    if (!assignmentsResponse.ok) return false

    const assignments = await assignmentsResponse.json() as Array<{ role_id?: unknown }>
    const roleIds = Array.from(new Set(
      assignments
        .map((assignment) => assignment.role_id)
        .filter((roleId): roleId is string => typeof roleId === 'string' && uuidPattern.test(roleId)),
    ))
    if (roleIds.length === 0) return false

    const permissionsUrl = new URL(`${supabaseUrl.replace(/\/$/, '')}/rest/v1/role_permissions`)
    permissionsUrl.searchParams.set('role_id', `in.(${roleIds.join(',')})`)
    permissionsUrl.searchParams.set('permission', `in.(${permissions.join(',')})`)
    permissionsUrl.searchParams.set('select', 'role_id')
    permissionsUrl.searchParams.set('limit', '1')

    const permissionsResponse = await fetchImpl(permissionsUrl, {
      headers,
      cache: 'no-store',
    })
    if (!permissionsResponse.ok) return false

    const matches = await permissionsResponse.json()
    return Array.isArray(matches) && matches.length > 0
  } catch {
    return false
  }
}
