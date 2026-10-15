import { describe, expect, it } from 'vitest'
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { prepareSourceComparison } from '../source-comparison-review.mjs'
import { checkSocialPilot } from '../check-social-pilot.mjs'

describe('social pilot package preflight', () => {
  it('binds selected items, original tasks, raw responses and fresh rows without changing the package', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'bilge-social-preflight-'))
    const reviewDirectory = join(dir, 'review')
    const inputPath = join(dir, 'input.json')
    const currentPath = join(dir, 'current.json')
    const rows = ['tarih', 'cografya', 'felsefe', 'sosyoloji'].flatMap((category, c) =>
      [1, 2, 3, 3, 4, 5].map((difficulty, i) => ({
        id: `11111111-1111-4111-8111-${String(c * 6 + i).padStart(12, '0')}`,
        published_revision_id: `22222222-2222-4222-8222-${String(c * 6 + i).padStart(12, '0')}`,
        content_sha256: (c * 6 + i + 1).toString(16).padStart(64, '0'),
        game: 'sosyal', exam_ref: 'TYT', category, difficulty,
        content: { question: 'TEST ONLY', options: ['A', 'B', 'C', 'D', 'E'], answer: 0, solution: 'TEST ONLY' },
      })))
    const write = (path, data) => writeFileSync(path, JSON.stringify(data))
    const run = () => checkSocialPilot({ inputPath, reviewDirectory, currentPath })
    try {
      write(inputPath, { rows }); write(currentPath, { rows: rows.map(r => ({ ...r, is_active: true })) })
      await prepareSourceComparison({ rows }, reviewDirectory)
      const manifestPath = join(reviewDirectory, 'manifest.json')
      const originalManifest = readFileSync(manifestPath, 'utf8')
      const manifest = JSON.parse(originalManifest)
      expect(await run()).toMatchObject({ sourcePackageComplete: false, totals: { missing: 24 } })
      expect(readFileSync(manifestPath, 'utf8')).toBe(originalManifest)

      const first = join(reviewDirectory, manifest.tasks[0].taskId)
      writeFileSync(join(first, 'response.json'), '{broken')
      expect(await run()).toMatchObject({ totals: { invalid: 1, missing: 23 } })

      write(manifestPath, { ...manifest, tasks: manifest.tasks.slice(1) })
      await expect(run()).rejects.toThrow('Expected 24 pinned source tasks')
      write(manifestPath, { ...manifest, tasks: [manifest.tasks[0], ...manifest.tasks.slice(0, 23)] })
      await expect(run()).rejects.toThrow('Invalid or duplicate task ID')
      writeFileSync(manifestPath, originalManifest)

      write(inputPath, { rows: rows.map((r, i) => i === 0 ? { ...r, content_sha256: 'e'.repeat(64) } : r) })
      await expect(run()).rejects.toThrow('Review package does not match selected pilot')
      write(inputPath, { rows })

      write(join(first, 'task.json'), {})
      await expect(run()).rejects.toThrow('Task changed')
    } finally { rmSync(dir, { recursive: true, force: true }) }
  }, 30000)
})
