import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const sql = readFileSync(
  new URL('../migrations/176_storage_public_listing_lockdown.sql', import.meta.url),
  'utf8',
)

const listingPolicies = [
  'avatar_public_read',
  'badge_assets_public_read',
  'homepage_public_read',
  'video_backgrounds_public_read',
]

const unsafeHomepagePolicies = [
  'homepage_admin_insert',
  'homepage_admin_update',
  'homepage_admin_delete',
]

describe('storage public listing lockdown SQL', () => {
  it('drops every broad public listing policy', () => {
    for (const policy of listingPolicies) {
      expect(sql).toContain(`DROP POLICY IF EXISTS ${policy} ON storage.objects;`)
    }
  })

  it('drops browser-role homepage mutation policies', () => {
    for (const policy of unsafeHomepagePolicies) {
      expect(sql).toContain(`DROP POLICY IF EXISTS ${policy} ON storage.objects;`)
    }
  })

  it('keeps all four asset buckets public and verifies policy removal', () => {
    expect(sql).toContain("id IN ('avatars', 'badge-assets', 'homepage-assets', 'video-backgrounds')")
    expect(sql).toContain('AND public;')
    expect(sql).toContain('expected 4 public asset buckets')
    expect(sql).toContain('broad storage policies remain')
    expect(sql).not.toMatch(/UPDATE\s+storage\.buckets/i)
  })
})
