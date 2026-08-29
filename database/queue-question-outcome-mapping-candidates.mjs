#!/usr/bin/env node
import { randomUUID } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'

const args = process.argv.slice(2)
const apply = args.includes('--apply')
const confirmProduction = args.includes('--confirm-production')
const requestIndex = args.indexOf('--request-id')
const requestId = requestIndex >= 0 ? args[requestIndex + 1] : randomUUID()
const allowedArgs = new Set(['--apply', '--confirm-production', '--request-id'])
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

for (let index = 0; index < args.length; index += 1) {
  const arg = args[index]
  if (!allowedArgs.has(arg) && args[index - 1] !== '--request-id') {
    throw new Error(`Bilinmeyen arguman: ${arg}`)
  }
  if (arg === '--request-id') index += 1
}
if (!uuidPattern.test(requestId ?? '')) throw new Error('--request-id gecerli bir UUID olmali')
if (apply && (!confirmProduction || process.env.APPLY_QUESTION_OUTCOME_CANDIDATES !== '1')) {
  throw new Error('Yazma icin --confirm-production ve APPLY_QUESTION_OUTCOME_CANDIDATES=1 birlikte zorunlu')
}

const required = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'QUESTION_OUTCOME_CANDIDATE_ACTOR_ID']
for (const name of required) if (!process.env[name]) throw new Error(`${name} zorunlu`)
const actorId = process.env.QUESTION_OUTCOME_CANDIDATE_ACTOR_ID
if (!uuidPattern.test(actorId)) throw new Error('QUESTION_OUTCOME_CANDIDATE_ACTOR_ID gecerli bir UUID olmali')

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
})
const rpc = async (name, params) => {
  const { data, error } = await supabase.rpc(name, params)
  if (error) throw new Error(`${name}: ${error.code ?? 'unknown'} ${error.message}`)
  return data
}

const before = await rpc('get_question_outcome_mapping_candidate_summary', {
  p_actor_user_id: actorId,
})
if (!apply) {
  console.log(JSON.stringify({ mode: 'inspect', changed: false, summary: before }, null, 2))
  console.log('DRY-RUN: aday kuyruguna yazilmadi. Yazmak icin explicit apply kapilarini kullanin.')
  process.exit(0)
}

const enqueue = await rpc('enqueue_question_outcome_mapping_candidates', {
  p_actor_user_id: actorId,
  p_request_id: requestId,
})
const after = await rpc('get_question_outcome_mapping_candidate_summary', {
  p_actor_user_id: actorId,
})

// Yalnız sayım ve request kimliği yazdırılır; soru içeriği/cevabı RPC
// sözleşmesinde bulunmaz.
console.log(JSON.stringify({
  mode: 'apply',
  changed: enqueue.inserted > 0 || enqueue.staled > 0 || enqueue.reopened > 0,
  requestId,
  before,
  enqueue,
  after,
}, null, 2))
