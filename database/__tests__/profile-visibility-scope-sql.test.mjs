import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const sql = readFileSync(
  new URL('../migrations/185_profile_visibility_scope.sql', import.meta.url),
  'utf8',
)

describe('profile visibility scope SQL', () => {
  it('keeps search discovery separate from profile audience', () => {
    expect(sql).toMatch(/profile_visibility text NOT NULL DEFAULT 'private'/i)
    expect(sql).toContain("profile_visibility IN ('private', 'friends', 'public')")
    expect(sql).not.toMatch(/SET\s+is_discoverable\s*=/i)
    expect(sql).not.toMatch(/SET\s+profile_visibility\s*=\s*'public'/i)
  })

  it('allows friends only through an accepted relationship', () => {
    expect(sql).toContain("p.profile_visibility = 'friends'")
    expect(sql).toContain("friendship.status = 'accepted'")
    expect(sql).toContain('(friendship.user_id = p.id AND friendship.friend_id = p_viewer_id)')
    expect(sql).toContain('(friendship.user_id = p_viewer_id AND friendship.friend_id = p.id)')
  })

  it('denies blocked viewers for every audience', () => {
    expect(sql).toContain("blocked.status = 'blocked'")
    expect(sql).toContain('NOT EXISTS')
  })

  it('keeps the viewer-aware RPC behind the service route', () => {
    expect(sql).toContain('REVOKE ALL ON FUNCTION public.get_public_profile(text, uuid)')
    expect(sql).toContain('FROM PUBLIC, anon, authenticated;')
    expect(sql).toContain('GRANT EXECUTE ON FUNCTION public.get_public_profile(text, uuid)')
    expect(sql).toContain('TO service_role;')
  })

  it('keeps discovery useful without leaking private learning stats', () => {
    expect(sql).toContain('NULL::varchar AS display_name')
    expect(sql).toContain("CASE WHEN p.profile_visibility = 'public' THEN p.total_xp ELSE 0 END")
    expect(sql).toContain('AND p.is_discoverable')
  })
})
