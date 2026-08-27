import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const sql = readFileSync(
  new URL('../migrations/186_atomic_friend_requests.sql', import.meta.url),
  'utf8',
)

describe('atomic friend request SQL', () => {
  it('serializes both directions of the same user pair', () => {
    expect(sql).toContain('pg_advisory_xact_lock')
    expect(sql).toContain("p_requester::text || ':' || p_target::text")
    expect(sql).toContain("p_target::text || ':' || p_requester::text")
  })

  it('keeps search discovery independent and checks existing relationships', () => {
    expect(sql).not.toContain('target.is_discoverable')
    expect(sql).toContain('target.deleted_at IS NULL')
    expect(sql).toContain("IF v_status = 'blocked'")
    expect(sql).toContain("IF v_status = 'accepted'")
    expect(sql).toContain("IF v_status = 'pending'")
  })

  it('keeps mutation behind the service route', () => {
    expect(sql).toContain('REVOKE ALL ON TABLE public.friendships FROM PUBLIC, anon, authenticated;')
    expect(sql).toContain('GRANT EXECUTE ON FUNCTION public.request_friendship(uuid, uuid)')
    expect(sql).toContain('TO service_role;')
  })
})
