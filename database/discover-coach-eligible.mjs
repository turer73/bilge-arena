#!/usr/bin/env node
/**
 * Builds a deterministic, text-free coach pilot manifest from a read-only
 * candidate export. This process has no database client and no write path.
 *
 * Usage:
 *   node database/discover-coach-eligible.mjs \
 *     --input C:\secure\coach-candidates.json \
 *     --output database/coach-pilot/2026-08-11-manifest.json
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { extname } from 'node:path'
import {
  buildPilotManifest,
} from './lib/coach-curation.mjs'

function usage(message) {
  if (message) process.stderr.write(`${message}\n\n`)
  process.stderr.write('Usage: node database/discover-coach-eligible.mjs --input <json|jsonl|csv> --output <manifest.json> [--limit 20] [--force]\n')
  process.exit(2)
}

function parseArgs(argv) {
  const values = new Map()
  const flags = new Set()
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index]
    if (token === '--force') {
      flags.add(token)
      continue
    }
    if (!['--input', '--output', '--limit'].includes(token)) usage(`Unknown argument: ${token}`)
    const value = argv[index + 1]
    if (!value || value.startsWith('--')) usage(`Missing value for ${token}`)
    values.set(token, value)
    index += 1
  }
  const input = values.get('--input')
  const output = values.get('--output')
  if (!input || !output) usage('--input and --output are required')
  const limit = values.has('--limit') ? Number(values.get('--limit')) : 20
  if (!Number.isInteger(limit) || limit < 1) usage('--limit must be a positive integer')
  return { input, output, limit, force: flags.has('--force') }
}

function parseCsv(text) {
  const rows = []
  let row = []
  let field = ''
  let quoted = false
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index]
    if (quoted) {
      if (character === '"' && text[index + 1] === '"') {
        field += '"'
        index += 1
      } else if (character === '"') quoted = false
      else field += character
    } else if (character === '"') quoted = true
    else if (character === ',') {
      row.push(field)
      field = ''
    } else if (character === '\n') {
      row.push(field.replace(/\r$/, ''))
      rows.push(row)
      row = []
      field = ''
    } else field += character
  }
  if (quoted) throw new Error('CSV has an unterminated quoted field')
  if (field || row.length) {
    row.push(field.replace(/\r$/, ''))
    rows.push(row)
  }
  if (rows.length < 2) throw new Error('CSV candidate export has no data rows')
  const headers = rows.shift().map((header) => header.replace(/^\uFEFF/, ''))
  return rows
    .filter((fields) => fields.some((value) => value !== ''))
    .map((fields) => Object.fromEntries(headers.map((header, index) => [header, fields[index] ?? ''])))
}

function readCandidates(path) {
  const text = readFileSync(path, 'utf8')
  const extension = extname(path).toLowerCase()
  let rows
  if (extension === '.csv' || /^\uFEFF?questionId,revisionId,contentSha256,/.test(text)) rows = parseCsv(text)
  else if (extension === '.jsonl' || extension === '.ndjson') {
    rows = text.split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line))
  } else {
    const value = JSON.parse(text)
    rows = Array.isArray(value) ? value : value.items
  }
  if (!Array.isArray(rows)) throw new Error('candidate export must be an array or an object with items')
  return rows.map((row) => ({
    questionId: row.questionId,
    revisionId: row.revisionId,
    contentSha256: row.contentSha256,
    game: row.game,
    category: row.category,
    difficulty: Number(row.difficulty),
    examRef: row.examRef === null || row.examRef === '' ? null : row.examRef,
    optionCount: Number(row.optionCount),
  }))
}

function buildSourceExportSql(items) {
  const values = items
    .map((item, index) => `    ('${item.revisionId}'::uuid, ${index + 1})`)
    .join(',\n')
  return `-- Generated from the text-free pilot manifest. Run only as a read-only export.\n-- Export the result as JSON; never paste its content into Codex or a shell command.\nWITH selected(revision_id, selection_order) AS (\n  VALUES\n${values}\n)\nSELECT\n  r.question_id::text AS "questionId",\n  r.id::text AS "revisionId",\n  r.content_sha256 AS "contentSha256",\n  co.title AS "outcomeTitle",\n  r.content::text AS "contentJson"\nFROM selected s\nJOIN public.question_content_revisions r ON r.id = s.revision_id\nJOIN public.questions q ON q.id = r.question_id\n  AND q.published_revision_id = r.id\n  AND q.is_active\nJOIN public.question_revision_outcomes qro ON qro.revision_id = r.id\n  AND qro.is_primary\nJOIN public.curriculum_outcomes co ON co.id = qro.outcome_id\n  AND co.is_active\nWHERE r.status = 'published'\nORDER BY s.selection_order;\n`
}

function main() {
  const args = parseArgs(process.argv.slice(2))
  if (!existsSync(args.input)) usage(`Candidate export does not exist: ${args.input}`)
  const sidecar = `${args.output}.sha256`
  const sourceQueryPath = args.output.replace(/\.json$/i, '') + '.source-export.sql'
  for (const path of [args.output, sidecar, sourceQueryPath]) {
    if (existsSync(path) && !args.force) usage(`Refusing to overwrite ${path}; pass --force for a deterministic rebuild`)
  }

  const candidates = readCandidates(args.input)
  const manifest = buildPilotManifest(candidates, args.limit)
  writeFileSync(args.output, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
  writeFileSync(sidecar, `${manifest.manifestSha256}  ${args.output.replace(/^.*[\\/]/, '')}\n`, 'utf8')
  writeFileSync(sourceQueryPath, buildSourceExportSql(manifest.items), 'utf8')

  const coverage = (field) => new Set(manifest.items.map((item) => String(item[field] ?? '(none)'))).size
  process.stdout.write([
    `Eligible candidates: ${manifest.eligibleCount}`,
    `Pilot sample: ${manifest.sampleSize}`,
    `Coverage: games=${coverage('game')} categories=${coverage('category')} difficulties=${coverage('difficulty')} examRefs=${coverage('examRef')} optionCounts=${coverage('optionCount')}`,
    `Manifest SHA-256: ${manifest.manifestSha256}`,
    'No question text was read from the candidate export or written to the manifest.',
  ].join('\n') + '\n')
}

try {
  main()
} catch (error) {
  process.stderr.write(`Coach manifest build failed: ${error.message}\n`)
  process.exitCode = 1
}
