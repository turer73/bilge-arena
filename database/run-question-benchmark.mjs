#!/usr/bin/env node
/**
 * Saklanmış kalibrasyon raporunu insan-adjudikasyonlu altın kümeyle ölçer.
 * LLM veya Supabase çağrısı yapmaz. Başarısız terfi kapısı exit code 2 döner;
 * böylece model/prompt sürümü CI ya da release akışında yanlışlıkla terfi etmez.
 *
 * Kullanım:
 *   npm run audit:benchmark -- --labels labels.json --report report.json
 *   npm run audit:benchmark -- --labels labels.json --report report.json --out benchmark.json
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createServer } from 'vite'

function valueOf(name) {
  const index = process.argv.indexOf(name)
  if (index === -1 || !process.argv[index + 1]) throw new Error(`${name} zorunlu`)
  return process.argv[index + 1]
}

const labelsPath = resolve(valueOf('--labels'))
const reportPath = resolve(valueOf('--report'))
const outIndex = process.argv.indexOf('--out')
const outPath = outIndex === -1 ? null : resolve(process.argv[outIndex + 1])
const labels = JSON.parse(readFileSync(labelsPath, 'utf8'))
const calibration = JSON.parse(readFileSync(reportPath, 'utf8'))

if (!Array.isArray(calibration.items)) {
  throw new Error('kalibrasyon raporu items dizisi icermiyor; guncel audit:calibrate ile yeniden uretin')
}
if (typeof calibration.reliability?.failureRate !== 'number') {
  throw new Error('kalibrasyon raporu reliability.failureRate icermiyor')
}

const server = await createServer({ root: resolve('.'), server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' })
try {
  const mod = await server.ssrLoadModule('/src/lib/question-audit/benchmark.ts')
  const benchmark = mod.evaluateBenchmark(labels, calibration.items, calibration.reliability.failureRate)
  const output = {
    subject: {
      policyVersion: calibration.policyVersion,
      providerIds: calibration.providerIds,
      modelIds: calibration.modelIds,
      promptVersions: calibration.promptVersions,
      config: calibration.config,
    },
    benchmark,
  }
  const json = JSON.stringify(output, null, 2)
  if (outPath) writeFileSync(outPath, json)
  console.log(json)
  if (!benchmark.promotion.passed) process.exitCode = 2
} finally {
  await server.close()
}
