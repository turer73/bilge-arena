#!/usr/bin/env node
// Source review is post-blind, contains the key, and never writes to Supabase.
import { createServer } from 'vite'
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { createHash, randomUUID } from 'node:crypto'
import { resolve, join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const read = path => JSON.parse(readFileSync(path, 'utf8'))
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex')
const write = (path, value) => writeFileSync(path, JSON.stringify(value, null, 2) + '\n', { flag: 'wx' })

async function modules() {
  const server = await createServer({ root, configFile: false,
    cacheDir: join(root, 'secure/.vite-source-review'), optimizeDeps: { noDiscovery: true, include: [] },
    server: { middlewareMode: true, watch: null, hmr: false }, appType: 'custom' })
  try {
    return {
      source: await server.ssrLoadModule(join(root, 'src/lib/question-audit/question-source.ts')),
      review: await server.ssrLoadModule(join(root, 'src/lib/question-audit/source-comparison.ts')),
    }
  } finally { await server.close() }
}
export async function prepareSourceComparison(input, output, format = 'source-comparison@1') {
  if (!Array.isArray(input.rows) || input.rows.length < 1 || input.rows.length > 5000) throw new Error('Invalid rows')
  if (existsSync(output)) throw new Error('Use a new directory')
  const {source, review} = await modules()
  if (![review.SOURCE_COMPARISON_VERSION, review.SOURCE_COMPARISON_V2].includes(format)) throw new Error('Invalid format')
  const guidance = readFileSync(join(root, `docs/quality/antigravity/source-comparison-${format === review.SOURCE_COMPARISON_V2 ? 'v2' : 'v1'}.md`), 'utf8')
  const seen = new Set()
  const drafts = input.rows.map(row => {
    const result = source.toDraft(row, {strictExamOptionCount: true})
    if (!result.ok || !row.published_revision_id || !row.content_sha256) throw new Error('Pinned revision required')
    if (seen.has(result.draft.revisionId)) throw new Error('Duplicate revision')
    seen.add(result.draft.revisionId)
    return result.draft
  })
  mkdirSync(output, {recursive: true})
  const manifest = {version: format, runId: randomUUID(),
    candidateEvidenceOnly: true, containsAnswerKey: true, tasks: []}
  for (const draft of drafts) {
    const taskId = randomUUID()
    const task = review.buildSourceComparisonPrompt(draft, format)
    const folder = join(output, taskId)
    mkdirSync(folder)
    write(join(folder, 'task.json'), task)
    writeFileSync(join(folder, 'START.md'), guidance, {flag: 'wx'})
    manifest.tasks.push({taskId, inputSha256: hash(task)})
  }
  write(join(output, 'manifest.json'), manifest)
  return {runId: manifest.runId, questions: drafts.length, containsAnswerKey: true, databaseWrites: 0}
}
export async function validateSourceComparison(directory) {
  const {review} = await modules()
  const manifest = read(join(directory, 'manifest.json'))
  if (![review.SOURCE_COMPARISON_VERSION, review.SOURCE_COMPARISON_V2].includes(manifest.version) || !Array.isArray(manifest.tasks)) throw new Error('Invalid manifest')
  const seen = new Set()
  const results = []
  for (const task of manifest.tasks) {
    if (!/^[0-9a-f-]{36}$/.test(task.taskId) || seen.has(task.taskId)) throw new Error('Invalid task ID')
    seen.add(task.taskId)
    const folder = join(directory, task.taskId)
    const input = read(join(folder, 'task.json'))
    if (hash(input) !== task.inputSha256) throw new Error('Task changed')
    if (input.version !== manifest.version) throw new Error('Task format changed')
    if (!existsSync(join(folder, 'response.json'))) {
      results.push({questionId: input.question.questionId, status:'missing'}); continue
    }
    try {
      const response = read(join(folder, 'response.json'))
      if (response.format !== manifest.version) throw new Error('Response format changed')
      const exceptionPath=join(folder,'exception.json')
      results.push(review.evaluateSourceComparison(input.question, response, existsSync(exceptionPath)?read(exceptionPath):undefined))
    } catch {
      results.push({questionId: input.question.questionId, status:'invalid'})
    }
  }
  const report = {version:manifest.version, runId:manifest.runId,
    candidateEvidenceOnly:true, publicationAuthorized:false, results}
  const output = join(directory, 'source-summary-' + randomUUID() + '.json')
  write(output, report)
  return {output, totals: Object.fromEntries(
    ['missing','invalid','revision_mismatch','conflicting_evidence','insufficient_evidence','evidence_complete']
      .map(status => [status, results.filter(r => r.status === status).length])),
    databaseWrites:0}
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [command, input, output] = process.argv.slice(2)
  try {
    if (command === 'prepare' && input && output) console.log(JSON.stringify(await prepareSourceComparison(read(resolve(input)),resolve(output))))
    else if (command === 'prepare-v2' && input && output) console.log(JSON.stringify(await prepareSourceComparison(read(resolve(input)),resolve(output),'source-comparison@2')))
    else if (command === 'validate' && input && !output) console.log(JSON.stringify(await validateSourceComparison(resolve(input))))
    else throw new Error('Invalid command')
  } catch {
    console.error('Source review failed. Check pinned input/schema/paths. No database writes performed.')
    process.exitCode = 1
  }
}
