#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createServer } from 'vite'

function valuesOf(name) {
  const values = []
  for (let i = 0; i < process.argv.length; i++) if (process.argv[i] === name && process.argv[i + 1]) values.push(process.argv[++i])
  return values
}

function valueOf(name, required = true) {
  const values = valuesOf(name)
  if (required && values.length === 0) throw new Error(`${name} zorunlu`)
  return values[0] ?? null
}

const reviewPaths = valuesOf('--review')
if (reviewPaths.length !== 2) throw new Error('tam iki --review <json> zorunlu')
const adjudicationPaths = valuesOf('--adjudication')
if (adjudicationPaths.length > 1) throw new Error('en fazla bir --adjudication <json> kabul edilir')
const adjudicationPath = adjudicationPaths[0] ?? null
const outPath = resolve(valueOf('--out'))
const files = [...reviewPaths, ...(adjudicationPath ? [adjudicationPath] : [])]
  .map((path) => JSON.parse(readFileSync(resolve(path), 'utf8')))

const server = await createServer({ root: resolve('.'), server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' })
try {
  const mod = await server.ssrLoadModule('/src/lib/question-audit/gold-set.ts')
  const labels = mod.buildHumanGoldSet(files)
  writeFileSync(outPath, `${JSON.stringify(labels, null, 2)}\n`)
  console.log(JSON.stringify({ out: outPath, labels: labels.length, disputed: labels.filter((label) => label.adjudication === 'adjudicated').length }))
} finally {
  await server.close()
}
