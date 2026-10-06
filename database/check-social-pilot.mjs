#!/usr/bin/env node
// Read-only preflight. No credentials, DB writes, report writes or publication.
import { readFileSync, existsSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const read = path => JSON.parse(readFileSync(path, 'utf8'))
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex')

export async function checkSocialPilot({ inputPath, holdsPath, reviewDirectory, currentPath }) {
  const input = read(inputPath)
  const fresh = read(currentPath)
  if (!Array.isArray(input.rows) || !Array.isArray(fresh.rows)) throw new Error('Expected rows arrays')
  if (holdsPath && input.holds !== undefined) throw new Error('Provide holds only once')
  const holds = holdsPath ? read(holdsPath) : input.holds
  const manifest = read(join(reviewDirectory, 'manifest.json'))
  if (manifest.version !== 'source-comparison@1' || manifest.candidateEvidenceOnly !== true
    || manifest.containsAnswerKey !== true || !Array.isArray(manifest.tasks)
    || manifest.tasks.length !== 24) throw new Error('Expected 24 pinned source tasks')
  const reviews = Object.create(null)
  const seenTasks = new Set()
  const taskQuestions = new Map()
  for (const entry of manifest.tasks) {
    if (typeof entry.taskId !== 'string' || !/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/.test(entry.taskId)
      || seenTasks.has(entry.taskId)) throw new Error('Invalid or duplicate task ID')
    seenTasks.add(entry.taskId)
    const folder = join(reviewDirectory, entry.taskId)
    const task = read(join(folder, 'task.json'))
    if (hash(task) !== entry.inputSha256) throw new Error('Task changed')
    const question = task.question
    if (!question?.questionId || taskQuestions.has(question.questionId)) throw new Error('Invalid or duplicate task question')
    taskQuestions.set(question.questionId, question)
    const response = join(folder, 'response.json')
    if (existsSync(response)) {
      // A malformed report is an item-level failure, not a dropped task.
      try { reviews[question.questionId] = read(response) } catch { reviews[question.questionId] = null }
    }
  }
  const server = await createServer({ root, configFile: false,
    cacheDir: join(root, 'secure/.vite-social-preflight'), optimizeDeps: { noDiscovery: true, include: [] },
    server: { middlewareMode: true, watch: null }, appType: 'custom' })
  try {
    const { prepareSocialPilot } = await server.ssrLoadModule(join(root, 'src/lib/diagnostic/social-pilot.ts'))
    const { toDraft } = await server.ssrLoadModule(join(root, 'src/lib/question-audit/question-source.ts'))
    const { assessSocialPilotReadiness } = await server.ssrLoadModule(join(root, 'src/lib/diagnostic/social-pilot-readiness.ts'))
    const selected = prepareSocialPilot(input.rows, holds ?? []).rows
    for (const row of selected) {
      const expected = toDraft(row, { strictExamOptionCount: true })
      const question = taskQuestions.get(row.id)
      if (!expected.ok || !question || hash(question) !== hash(expected.draft)) throw new Error('Review package does not match selected pilot')
    }
    return assessSocialPilotReadiness({ rows: input.rows, holds, currentRows: fresh.rows, reviews })
  } finally { await server.close() }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [input, reviewDirectory, current, holds, ...extra] = process.argv.slice(2)
  try {
    if (!input || !reviewDirectory || !current || extra.length) {
      throw new Error('Usage: check-social-pilot.mjs input.json review-directory current-export.json [holds.json]')
    }
    const report = await checkSocialPilot({ inputPath: resolve(input), reviewDirectory: resolve(reviewDirectory),
      currentPath: resolve(current), holdsPath: holds ? resolve(holds) : undefined })
    console.log(JSON.stringify(report, null, 2))
    if (!report.sourcePackageComplete) process.exitCode = 2
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'Pilot preflight failed')
    process.exitCode = 1
  }
}
