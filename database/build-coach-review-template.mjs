#!/usr/bin/env node

import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { buildReviewTemplate } from './lib/coach-curation.mjs'

function argument(name) {
  const index = process.argv.indexOf(name)
  return index >= 0 ? process.argv[index + 1] : null
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

const manifestPath = argument('--manifest')
const sourcePath = argument('--source')
const stagingPath = argument('--staging')
const outputPath = argument('--output')
if (
  !manifestPath || !sourcePath || !stagingPath || !outputPath
  || !existsSync(manifestPath) || !existsSync(sourcePath) || !existsSync(stagingPath)
) {
  process.stderr.write('Usage: node database/build-coach-review-template.mjs --manifest <json> --source <json|jsonl> --staging <jsonl> --output <review.json>\n')
  process.exit(2)
}
try {
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  const template = buildReviewTemplate(manifest, readRows(sourcePath), readRows(stagingPath))
  writeFileSync(outputPath, `${JSON.stringify(template, null, 2)}\n`, { encoding: 'utf8', flag: 'wx', mode: 0o600 })
  process.stdout.write(`Review template bound to ${template.items.length} validated staging records.\n`)
} catch (error) {
  if (error?.code === 'EEXIST') {
    process.stderr.write(`Refusing to overwrite review file: ${outputPath}\n`)
    process.exitCode = 2
  } else {
    process.stderr.write(`Review template build failed: ${error.message}\n`)
    process.exitCode = 1
  }
}
