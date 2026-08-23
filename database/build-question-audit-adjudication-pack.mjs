#!/usr/bin/env node
import { randomBytes } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createServer } from 'vite'

function valueOf(name) {
  const index = process.argv.indexOf(name)
  const value = index === -1 ? null : process.argv[index + 1]
  if (!value || value.startsWith('--')) throw new Error(`${name} <deger> zorunlu`)
  return value
}

function writeJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`)
}

const packet = JSON.parse(readFileSync(resolve(valueOf('--packet')), 'utf8'))
const reviews = [valueOf('--review'), valueOf('--review-b')].map((path) => JSON.parse(readFileSync(resolve(path), 'utf8')))
const outDir = resolve(valueOf('--out-dir'))
if (existsSync(outDir)) throw new Error(`cikti dizini zaten var; ustune yazilmadi: ${outDir}`)
if (!packet || packet.schemaVersion !== 'question-audit-blind-pack@1' || !Array.isArray(packet.items)) {
  throw new Error('blind review packet gecersiz')
}

const server = await createServer({ root: resolve('.'), server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' })
try {
  const mod = await server.ssrLoadModule('/src/lib/question-audit/gold-set.ts')
  const disputes = mod.findHumanGoldDisputes(reviews)
  const disputeKeys = new Set(disputes.map((item) => `${item.questionId}:${item.contentSha256}`))
  const items = packet.items.filter((item) => disputeKeys.has(`${item.questionId}:${String(item.contentSha256).toLowerCase()}`))
  if (items.length !== disputes.length) throw new Error('ayrisan maddeler blind packet ile tam eslesmiyor')
  const existingRefs = new Set(reviews.map((review) => String(review.reviewerRef).toLowerCase()))
  let reviewerRef
  do reviewerRef = randomBytes(32).toString('hex')
  while (existingRefs.has(reviewerRef))

  mkdirSync(outDir, { recursive: true })
  writeJson(resolve(outDir, 'adjudicator-packet.json'), {
    schemaVersion: 'question-audit-blind-pack@1',
    selectionId: packet.selectionId,
    items,
  })
  writeJson(resolve(outDir, 'adjudicator.labels.json'), {
    schemaVersion: 'question-audit-review@1',
    reviewerRef,
    role: 'adjudicator',
    labels: items.map((item) => ({ questionId: item.questionId, contentSha256: item.contentSha256, flawCodes: null })),
  })
  writeJson(resolve(outDir, 'coordinator-disputes.json'), {
    schemaVersion: 'question-audit-disputes@1',
    selectionId: packet.selectionId,
    disputes,
  })
  console.log(JSON.stringify({ outDir, disputes: disputes.length, adjudicationRequired: disputes.length > 0 }))
} finally {
  await server.close()
}
