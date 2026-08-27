import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

const baselines = ['schema.sql', 'full-schema.sql'].map((name) => ({
  name,
  sql: readFileSync(new URL(`../${name}`, import.meta.url), 'utf8'),
}))

describe('schema baselines preserve the server-owned state boundary', () => {
  for (const { name, sql } of baselines) {
    it(`${name} never recreates trusted user state with FOR ALL`, () => {
      for (const policy of [
        'sessions_own', 'answers_own', 'badges_own', 'topic_own',
        'daily_own', 'xp_own', 'qhist_own',
      ]) {
        expect(sql).not.toMatch(new RegExp(`CREATE POLICY "${policy}"[^;]+FOR ALL`, 'i'))
      }
      expect(sql).not.toMatch(/CREATE POLICY "lb_own(?:_update)?"/i)
    })
  }

  it('full-schema keeps evidence and telemetry inserts service-only', () => {
    const sql = baselines.find(({ name }) => name === 'full-schema.sql').sql
    expect(sql).toMatch(/Service can insert consent logs[\s\S]+TO service_role/i)
    expect(sql).toMatch(/Service can insert logs[\s\S]+TO service_role/i)
    expect(sql).not.toMatch(/Anyone can insert consent logs"[^;]+CREATE POLICY/i)
    expect(sql).not.toMatch(/Service can insert logs"[\s\S]{0,120}TO authenticated/i)
  })

  it('full-schema does not restore legacy browser audit, settings, like, or XP writers', () => {
    const sql = baselines.find(({ name }) => name === 'full-schema.sql').sql
    expect(sql).not.toMatch(/CREATE POLICY "admin_logs_insert"/i)
    expect(sql).not.toMatch(/CREATE POLICY "site_settings_(?:insert|update)"/i)
    expect(sql).not.toMatch(/CREATE POLICY "comment_likes_(?:insert|delete)"/i)
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION increment_xp\(uuid, integer\) FROM PUBLIC, anon, authenticated;/i)
  })
})
