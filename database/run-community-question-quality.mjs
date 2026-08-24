#!/usr/bin/env node
import { randomUUID } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'
import { createServer } from 'vite'

const confirm = process.argv.includes('--confirm')
const limitArg = process.argv.indexOf('--limit')
const limit = limitArg >= 0 ? Math.max(1, Math.min(100, Number(process.argv[limitArg + 1]) || 10)) : 10
const config = {
  modelA: process.env.QUESTION_QUALITY_MODEL_A || 'gemini-2.5-pro',
  modelB: process.env.QUESTION_QUALITY_MODEL_B || 'deepseek-v4-pro',
  researchModel: process.env.QUESTION_QUALITY_RESEARCH_MODEL || 'gemini-2.5-flash',
}

console.log(JSON.stringify({ confirm, limit, ...config }))
if (!confirm) {
  console.log('DRY-RUN: --confirm verilmedi; kuyruk alınmadı ve model çağrısı yapılmadı.')
  process.exit(0)
}

const required = [
  'SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'QUESTION_QUALITY_WORKER_ACTOR_ID',
  'GEMINI_API_KEY', 'DEEPSEEK_API_KEY',
]
for (const name of required) if (!process.env[name]) throw new Error(`${name} zorunlu`)

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
})
const actorId = process.env.QUESTION_QUALITY_WORKER_ACTOR_ID
const rpc = async (name, args) => {
  const { data, error } = await supabase.rpc(name, args)
  if (error) throw new Error(`${name}: ${error.code ?? 'unknown'} ${error.message}`)
  return data
}

const sourceRoot = fileURLToPath(new URL('../src', import.meta.url))
const vite = await createServer({
  root: process.cwd(),
  resolve: { alias: { '@': sourceRoot } },
  server: { middlewareMode: true },
  appType: 'custom',
  logLevel: 'error',
})
let processed = 0
let consensusProcessed = 0
let failures = 0
try {
  const providerModule = await vite.ssrLoadModule('/src/lib/question-audit/provider.ts')
  const workerModule = await vite.ssrLoadModule('/src/lib/question-quality/worker.ts')
  const modelA = providerModule.createGeminiProvider({
    apiKey: process.env.GEMINI_API_KEY, modelId: config.modelA,
  })
  const modelB = providerModule.createOpenAiCompatibleProvider({
    apiKey: process.env.DEEPSEEK_API_KEY, modelId: config.modelB,
  })

  for (const role of ['model_a', 'model_b', 'research']) {
    for (let index = 0; index < limit; index++) {
      const job = await rpc('claim_question_quality_verification', { p_actor_id: actorId, p_role: role })
      if (!job) break
      let result
      try {
        result = await workerModule.processVerificationJob({
          job, modelA, modelB,
          researchApiKey: process.env.GEMINI_API_KEY,
          researchModelId: config.researchModel,
        })
      } catch (error) {
        failures++
        result = {
          status: 'failed', providerId: role === 'model_b' ? `deepseek:${config.modelB}` : `gemini:${config.modelA}`,
          modelId: role === 'model_b' ? config.modelB : config.modelA,
          promptVersion: 'community-worker@1', direction: 'inconclusive', strength: 0,
          predictedAnswerIndex: null, findingCodes: [], evidence: {}, sources: [], inputSha256: null,
          error: error instanceof Error ? error.message : String(error),
        }
      }
      await rpc('complete_question_quality_verification', {
        p_actor_id: actorId, p_verification_id: job.verificationId,
        p_status: result.status, p_provider_id: result.providerId, p_model_id: result.modelId,
        p_prompt_version: result.promptVersion, p_direction: result.direction, p_strength: result.strength,
        p_predicted_answer_index: result.predictedAnswerIndex, p_finding_codes: result.findingCodes,
        p_evidence: result.evidence, p_sources: result.sources, p_input_sha256: result.inputSha256,
        p_error: result.error,
      })
      await rpc('record_question_quality_consensus', {
        p_actor_id: actorId, p_case_id: job.caseId,
        p_policy_version: 'community-quality@1', p_request_id: randomUUID(),
      })
      processed++
      console.log(JSON.stringify({ caseId: job.caseId, role, status: result.status, direction: result.direction }))
    }
  }

  // Human claims can arrive after all three model/research jobs have already
  // completed. Drain the separate dirty-case queue so 5/3 consensus cannot
  // remain unrecorded merely because no verification job is pending.
  for (let index = 0; index < limit * 3; index++) {
    const job = await rpc('claim_question_quality_consensus_job', { p_actor_id: actorId })
    if (!job) break
    try {
      const decision = await rpc('record_question_quality_consensus', {
        p_actor_id: actorId, p_case_id: job.caseId,
        p_policy_version: 'community-quality@1', p_request_id: randomUUID(),
      })
      consensusProcessed++
      console.log(JSON.stringify({ caseId: job.caseId, consensus: decision.state }))
    } catch (error) {
      failures++
      console.error(JSON.stringify({
        caseId: job.caseId,
        consensusError: error instanceof Error ? error.message : String(error),
      }))
    }
  }
} finally {
  await vite.close()
}

console.log(JSON.stringify({ processed, consensusProcessed, failures }))
if (failures > 0) process.exitCode = 2
