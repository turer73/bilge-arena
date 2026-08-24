#!/usr/bin/env node
/**
 * Produces staging-only coach JSONL from a manifest-bound immutable revision
 * bundle. It never imports a database client, loads .env files, or writes to
 * Supabase. Run it in a separate narrow executor so DEEPSEEK_API_KEY never
 * enters Codex commands or transcripts.
 *
 * Usage:
 *   node database/generate-coach-hints.mjs \
 *     --manifest pilot-manifest.json \
 *     --source immutable-revisions.jsonl \
 *     --output coach-staging.jsonl \
 *     --model deepseek-chat
 */

import { appendFileSync, closeSync, existsSync, openSync, readFileSync } from 'node:fs'
import {
  STAGING_SCHEMA,
  VALIDATOR_VERSION,
  buildCoachPrompt,
  parseCoachResponse,
  sha256Hex,
  validateImmutableSourceRow,
  validateManifest,
  validateStagingRecord,
} from './lib/coach-curation.mjs'

const DEEPSEEK_URL = 'https://api.deepseek.com/chat/completions'

function usage(message) {
  if (message) process.stderr.write(`${message}\n\n`)
  process.stderr.write('Usage: node database/generate-coach-hints.mjs --manifest <json> --source <jsonl> --output <jsonl> --model <model> [--dry-run] [--resume]\n')
  process.exit(2)
}

function parseArgs(argv) {
  const values = new Map()
  const flags = new Set()
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index]
    if (['--dry-run', '--resume'].includes(token)) {
      flags.add(token)
      continue
    }
    if (!['--manifest', '--source', '--output', '--model'].includes(token)) usage(`Unknown argument: ${token}`)
    const value = argv[index + 1]
    if (!value || value.startsWith('--')) usage(`Missing value for ${token}`)
    values.set(token, value)
    index += 1
  }
  for (const required of ['--manifest', '--source', '--output', '--model']) {
    if (!values.get(required)) usage(`${required} is required`)
  }
  return {
    manifest: values.get('--manifest'),
    source: values.get('--source'),
    output: values.get('--output'),
    model: values.get('--model'),
    dryRun: flags.has('--dry-run'),
    resume: flags.has('--resume'),
  }
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'))
}

function readJsonl(path) {
  const text = readFileSync(path, 'utf8').trim()
  if (!text) return []
  try {
    const value = JSON.parse(text)
    if (Array.isArray(value)) return value
    if (Array.isArray(value?.items)) return value.items
  } catch {
    // JSONL is parsed one line at a time below.
  }
  return text.split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line))
}

function readJsonlIfExists(path) {
  try {
    return readJsonl(path)
  } catch (error) {
    if (error?.code === 'ENOENT') return []
    throw error
  }
}

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds))
}

async function generate(prompt, apiKey, model) {
  const response = await fetch(DEEPSEEK_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    signal: AbortSignal.timeout(45_000),
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 1400,
      temperature: 0.2,
      stream: false,
      response_format: { type: 'json_object' },
    }),
  })
  if (!response.ok) throw new Error(`DeepSeek API returned HTTP ${response.status}`)
  const payload = await response.json()
  const raw = payload?.choices?.[0]?.message?.content
  if (typeof raw !== 'string' || !raw.trim()) throw new Error('DeepSeek returned an empty response')
  return raw
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  for (const path of [args.manifest, args.source]) {
    if (!existsSync(path)) usage(`Required input does not exist: ${path}`)
  }
  if (!args.dryRun && !process.env.DEEPSEEK_API_KEY) {
    usage('DEEPSEEK_API_KEY must be injected by the external narrow executor')
  }

  const manifest = validateManifest(readJson(args.manifest))
  const rawSources = readJsonl(args.source)
  if (rawSources.length !== manifest.items.length) throw new Error('source bundle row count must equal manifest sample size')
  const sourceByRevision = new Map()
  for (const item of manifest.items) {
    const row = rawSources.find((candidate) => candidate?.revisionId?.toLowerCase() === item.revisionId)
    if (!row) throw new Error('source bundle is missing a manifest revision')
    const source = validateImmutableSourceRow(row, item)
    if (sourceByRevision.has(item.revisionId)) throw new Error('source bundle repeats a revision')
    sourceByRevision.set(item.revisionId, source)
  }

  const outputFd = args.dryRun
    ? null
    : openSync(args.output, args.resume ? 'a+' : 'wx+', 0o600)
  try {
    const existingRecords = args.dryRun
      ? readJsonlIfExists(args.output)
      : args.resume
        ? readJsonl(outputFd)
        : []
    const completed = new Set()
    for (const record of existingRecords) {
      validateStagingRecord(record, manifest, sourceByRevision)
      if (completed.has(record.revisionId)) throw new Error('staging output repeats a revision')
      completed.add(record.revisionId)
    }

    process.stdout.write(`Manifest ${manifest.manifestSha256}; immutable rows ${sourceByRevision.size}; already staged ${completed.size}.\n`)
    if (args.dryRun) {
      process.stdout.write('Dry run passed. No model call or file write occurred.\n')
      return
    }

    let failed = 0
    for (let index = 0; index < manifest.items.length; index += 1) {
      const item = manifest.items[index]
      if (completed.has(item.revisionId)) continue
      const source = sourceByRevision.get(item.revisionId)
      try {
        const raw = await generate(buildCoachPrompt(source.content, source.outcomeTitle), process.env.DEEPSEEK_API_KEY, args.model)
        const coach = parseCoachResponse(raw, source.content)
        const record = {
          schemaVersion: STAGING_SCHEMA,
          manifestSha256: manifest.manifestSha256,
          questionId: item.questionId,
          revisionId: item.revisionId,
          contentSha256: item.contentSha256,
          model: args.model,
          generatedAt: new Date().toISOString(),
          rawResponseSha256: sha256Hex(raw),
          validatorVersion: VALIDATOR_VERSION,
          coach,
        }
        appendFileSync(outputFd, `${JSON.stringify(record)}\n`, 'utf8')
        process.stdout.write(`[${index + 1}/${manifest.items.length}] staged and validated\n`)
      } catch (error) {
        failed += 1
        process.stderr.write(`[${index + 1}/${manifest.items.length}] failed: ${error.message}\n`)
      }
      await sleep(300)
    }
    process.stdout.write(`Staging finished: ${manifest.items.length - completed.size - failed} new, ${completed.size} resumed, ${failed} failed.\n`)
    if (failed > 0) process.exitCode = 1
  } finally {
    if (outputFd !== null) closeSync(outputFd)
  }
}

main().catch((error) => {
  process.stderr.write(`Coach staging failed: ${error.message}\n`)
  process.exitCode = 1
})
