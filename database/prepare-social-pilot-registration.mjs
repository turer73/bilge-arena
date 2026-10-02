#!/usr/bin/env node
// Offline DRAFT registration plan only. Never connects, approves or releases.
import { readFileSync, writeFileSync } from 'node:fs'
import { createHash, randomUUID } from 'node:crypto'
import { resolve, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { checkSocialPilot } from './check-social-pilot.mjs'

const uuid = value => typeof value === 'string' && /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/.test(value)
const sha = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value)
export function renderSocialPilotDraft({ packId, version, sourcePackageSha256, preflight }) {
  if (!uuid(packId) || !sha(sourcePackageSha256) || !/^[a-z0-9][a-z0-9._-]{0,119}$/.test(version)) throw new Error('Invalid draft identity')
  const results = preflight.results
  if (preflight.candidateCount !== 24 || !Array.isArray(results) || results.length !== 24
    || preflight.unexpectedReviewIds?.length || new Set(results.map(row => row.questionId)).size !== 24
    || results.some(row => !uuid(row.questionId) || !uuid(row.revisionId) || !sha(row.contentSha256)
      || !['conflicting_evidence', 'insufficient_evidence', 'evidence_complete'].includes(row.status))) {
    throw new Error('24 current pinned raw source reports required; draft does not imply acceptance')
  }
  // Category/difficulty are read from the exact revision; the trigger compares
  // current publication/activity and copies content. No answers in this file.
  const pins = results.map(row => `('${row.questionId}'::uuid,'${row.revisionId}'::uuid,'${row.contentSha256}')`).join(',\n    ')
  return `-- OFFLINE DRAFT ONLY. This file neither approves nor releases a pack.
-- Source gate complete: ${preflight.sourcePackageComplete === true}.
-- Source conflicts/coverage issues must be adjudicated before acceptance.
BEGIN;
INSERT INTO public.social_discovery_packs(id,version,source_package_sha256)
VALUES('${packId}'::uuid,'${version}','${sourcePackageSha256}');
WITH pins(question_id,revision_id,content_sha256) AS (VALUES
    ${pins}
)
INSERT INTO public.social_discovery_pack_candidates(
  pack_id,question_id,revision_id,content_sha256,category,difficulty)
SELECT '${packId}'::uuid,pins.question_id,pins.revision_id,pins.content_sha256,
  revision.category,revision.difficulty
FROM pins JOIN public.question_content_revisions AS revision ON revision.id=pins.revision_id;
SELECT public.validate_social_discovery_pack('${packId}'::uuid);
COMMIT;
`
}

export async function prepareSocialPilotRegistration({ inputPath, reviewDirectory, currentPath, holdsPath, outputPath }) {
  const preflight = await checkSocialPilot({ inputPath, reviewDirectory, currentPath, holdsPath })
  const manifest = JSON.parse(readFileSync(join(reviewDirectory, 'manifest.json'), 'utf8'))
  const evidence = manifest.tasks.map(task => ({ taskId: task.taskId, inputSha256: task.inputSha256,
    responseSha256: createHash('sha256').update(readFileSync(join(reviewDirectory, task.taskId, 'response.json'))).digest('hex') }))
  const sourcePackageSha256 = createHash('sha256').update(JSON.stringify({ manifest, evidence })).digest('hex')
  const packId = randomUUID()
  const version = `social-four-domain-${packId}`
  const sql = renderSocialPilotDraft({ packId, version, sourcePackageSha256, preflight })
  writeFileSync(outputPath, sql, { flag: 'wx' })
  return { packId, version, sourcePackageSha256, sourcePackageComplete: preflight.sourcePackageComplete,
    sourceTotals: preflight.totals, outputPath, status: 'draft', databaseWrites: 0, publicationAuthorized: false }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [input, review, current, output, holds, ...extra] = process.argv.slice(2)
  try {
    if (!input || !review || !current || !output || extra.length) throw new Error('Usage: input.json review-directory current.json new-draft.sql [holds.json]')
    console.log(JSON.stringify(await prepareSocialPilotRegistration({ inputPath: resolve(input), reviewDirectory: resolve(review),
      currentPath: resolve(current), outputPath: resolve(output), holdsPath: holds ? resolve(holds) : undefined }), null, 2))
  } catch (error) { console.error(error instanceof Error ? error.message : 'Draft registration failed'); process.exitCode = 1 }
}
