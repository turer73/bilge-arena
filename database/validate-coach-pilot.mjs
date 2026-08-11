#!/usr/bin/env node

import { existsSync, readFileSync } from 'node:fs'
import { evaluatePilotReview, validateStagingBundle } from './lib/coach-curation.mjs'

function argument(name) {
  const index = process.argv.indexOf(name)
  return index >= 0 ? process.argv[index + 1] : null
}

const manifestPath = argument('--manifest')
const sourcePath = argument('--source')
const stagingPath = argument('--staging')
const reviewPath = argument('--review')
if (
  !manifestPath || !sourcePath || !stagingPath || !reviewPath
  || !existsSync(manifestPath) || !existsSync(sourcePath)
  || !existsSync(stagingPath) || !existsSync(reviewPath)
) {
  process.stderr.write('Usage: node database/validate-coach-pilot.mjs --manifest <manifest.json> --source <json|jsonl> --staging <jsonl> --review <completed-review.json>\n')
  process.exit(2)
}

function readRows(path) {
  const text = readFileSync(path, 'utf8').trim()
  if (!text) return []
  try {
    const value = JSON.parse(text)
    if (Array.isArray(value)) return value
    if (Array.isArray(value?.items)) return value.items
  } catch {
    // JSONL is parsed below.
  }
  return text.split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line))
}

try {
  const bundle = validateStagingBundle(
    JSON.parse(readFileSync(manifestPath, 'utf8')),
    readRows(sourcePath),
    readRows(stagingPath),
  )
  const review = JSON.parse(readFileSync(reviewPath, 'utf8'))
  const result = evaluatePilotReview(bundle.manifest, review, bundle.records)
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
  if (!result.accepted) process.exitCode = 1
} catch (error) {
  process.stderr.write(`Pilot review validation failed: ${error.message}\n`)
  process.exitCode = 1
}
