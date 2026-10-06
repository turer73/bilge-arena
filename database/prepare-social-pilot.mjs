#!/usr/bin/env node
// Offline preparation only. No DB credentials, publication, or runtime flag changes.
import { createServer } from 'vite'
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { prepareSourceComparison } from './source-comparison-review.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const [input, output, holdsFile, ...extra] = process.argv.slice(2)
try {
  if (!input || !output || extra.length) throw new Error('Usage: prepare-social-pilot.mjs input.json new-output-directory [holds.json]')
  const server = await createServer({ root, configFile: false,
    cacheDir: join(root, 'secure/.vite-social-prepare'), optimizeDeps: { noDiscovery: true, include: [] },
    server: { middlewareMode: true, watch: null }, appType: 'custom' })
  let pilot
  try {
    const { prepareSocialPilot } = await server.ssrLoadModule(join(root, 'src/lib/diagnostic/social-pilot.ts'))
    const data = JSON.parse(readFileSync(resolve(input), 'utf8'))
    if (!Array.isArray(data.rows)) throw new Error('Expected rows array')
    if (holdsFile && data.holds !== undefined) throw new Error('Provide holds only once')
    const holds = holdsFile ? JSON.parse(readFileSync(resolve(holdsFile), 'utf8')) : data.holds
    pilot = prepareSocialPilot(data.rows, holds === undefined ? [] : holds)
  } finally { await server.close() }
  const result = await prepareSourceComparison({ rows: pilot.rows }, resolve(output))
  writeFileSync(join(resolve(output), 'pilot.json'), JSON.stringify({ ...pilot.manifest, reviewRunId: result.runId }, null, 2) + '\n', { flag: 'wx' })
  console.log(JSON.stringify({ ...result, runtimeEnabled: false, publicationAuthorized: false }))
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Pilot preparation failed')
  process.exitCode = 1
}
