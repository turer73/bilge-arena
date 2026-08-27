import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database.client'

/**
 * Deployment compatibility gate for migration 177.
 *
 * The application is deployed first. Until the default-private column exists,
 * leaderboard routes fail closed with an empty response instead of querying
 * the legacy public view/table shape.
 */
export async function isPublicLeaderboardPrivacyReady(
  client: SupabaseClient<Database>,
): Promise<boolean> {
  const { error } = await client
    .from('profiles')
    .select('leaderboard_opt_in')
    .limit(1)

  return error === null
}
