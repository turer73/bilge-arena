import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const sql = readFileSync(
  new URL('../migrations/177_private_leaderboard_opt_in.sql', import.meta.url),
  'utf8',
)

describe('private leaderboard opt-in SQL', () => {
  it('uses a separate default-false disclosure preference without grandfathering', () => {
    expect(sql).toMatch(/leaderboard_opt_in boolean NOT NULL DEFAULT false/i)
    expect(sql).not.toMatch(/UPDATE\s+public\.profiles\s+SET\s+leaderboard_opt_in\s*=\s*true/i)
  })

  it('filters the weekly view and all-time index to explicit participants', () => {
    expect(sql).toContain('AND p.leaderboard_opt_in')
    expect(sql).toContain('WHERE leaderboard_opt_in')
    expect(sql).toContain('AND p.deleted_at IS NULL')
  })

  it('removes both table-level and column-level browser reads', () => {
    expect(sql).toContain('REVOKE SELECT ON TABLE public.profiles FROM PUBLIC, anon, authenticated;')
    expect(sql).toContain('REVOKE SELECT (%I) ON TABLE public.profiles FROM PUBLIC, anon, authenticated')
    expect(sql).toContain('REVOKE SELECT ON TABLE public.leaderboard_weekly FROM PUBLIC, anon, authenticated;')
    expect(sql).toContain('REVOKE ALL ON TABLE public.leaderboard_weekly_ranked')
  })

  it('keeps public delivery and profile search behind service routes', () => {
    expect(sql).toContain('GRANT SELECT ON TABLE public.leaderboard_weekly_ranked TO service_role;')
    expect(sql).toContain('GRANT EXECUTE ON FUNCTION public.search_profiles(text, uuid, integer)')
    expect(sql).toContain('TO service_role;')
  })

  it('records every actual visibility change in an RLS-protected evidence table', () => {
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS public.leaderboard_visibility_events')
    expect(sql).toContain('ALTER TABLE public.leaderboard_visibility_events ENABLE ROW LEVEL SECURITY;')
    expect(sql).toContain('AFTER UPDATE OF leaderboard_opt_in ON public.profiles')
    expect(sql).toContain('OLD.leaderboard_opt_in IS DISTINCT FROM NEW.leaderboard_opt_in')
  })
})
