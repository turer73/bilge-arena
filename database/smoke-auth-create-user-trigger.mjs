#!/usr/bin/env node
// Opt-in production smoke test for migration 089.
// It creates exactly one unique synthetic auth user with a long email local-part
// and display name, asserts the generated profile, then deletes only that
// profile before deleting the auth user (profiles.id FK is ON DELETE RESTRICT).

import { randomUUID } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const CONFIRMATION = 'I_UNDERSTAND_PROD_WRITE'
const PROFILE_WAIT_MS = 20_000
const PROFILE_POLL_MS = 400

function fail(message) {
  throw new Error(`[auth create-user trigger smoke] ${message}`)
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function retryCleanup(label, action, syntheticUserId, email) {
  let lastError
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const { error } = await action()
    if (!error) return
    lastError = error.message
    if (attempt < 3) await sleep(attempt * 500)
  }
  fail(
    `${label} failed after 3 attempts for ${syntheticUserId}: ${lastError}. `
      + `Manual cleanup required for synthetic email ${email}.`,
  )
}

async function waitForProfile(supabase, userId) {
  const deadline = Date.now() + PROFILE_WAIT_MS
  let lastError

  while (Date.now() < deadline) {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, username, display_name, referral_code')
      .eq('id', userId)
      .maybeSingle()
    if (data) return data
    if (error) lastError = error.message
    await sleep(PROFILE_POLL_MS)
  }

  fail(`profile trigger did not create ${userId} within ${PROFILE_WAIT_MS}ms${lastError ? ` (${lastError})` : ''}`)
}

async function main() {
  if (process.env.ALLOW_PROD_AUTH_CREATE_SMOKE !== CONFIRMATION) {
    console.error(`Refusing to run. Set ALLOW_PROD_AUTH_CREATE_SMOKE=${CONFIRMATION} to allow a synthetic production write.`)
    process.exitCode = 1
    return
  }

  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) {
    fail('SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL) and SUPABASE_SERVICE_KEY (or legacy SUPABASE_SERVICE_ROLE_KEY) are required')
  }

  const supabase = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const runId = randomUUID()
  // RFC email local-parts are at most 64 characters. Keep this fixture valid
  // while still crossing the old VARCHAR(32) pre-truncation failure boundary.
  const longLocalPart = `auth-create-smoke-${randomUUID().replaceAll('-', '')}`
  const fullName = `Long profile name ${'x'.repeat(96)}`
  if (longLocalPart.length <= 32 || longLocalPart.length > 64) {
    fail(`invalid smoke local-part length: ${longLocalPart.length}`)
  }
  const email = `${longLocalPart}@example.com`
  let syntheticUserId
  let workError

  try {
    const { data, error } = await supabase.auth.admin.createUser({
      email,
      password: `Smoke-${randomUUID()}-9a!`,
      email_confirm: true,
      user_metadata: { full_name: fullName, smoke_test: 'handle_new_user_089', run_id: runId },
    })
    if (error || !data.user) {
      fail(`could not create synthetic auth user: ${error?.message ?? 'empty response'}`)
    }
    syntheticUserId = data.user.id

    const profile = await waitForProfile(supabase, syntheticUserId)
    if (profile.username.length > 32) fail(`username exceeds 32 characters: ${profile.username.length}`)
    if (profile.display_name !== fullName.slice(0, 64)) {
      fail(`display_name was not truncated safely: ${JSON.stringify(profile.display_name)}`)
    }
    if (typeof profile.referral_code !== 'string' || profile.referral_code.length !== 8) {
      fail(`referral_code was not generated: ${JSON.stringify(profile.referral_code)}`)
    }

    console.log(`PASS: created profile ${syntheticUserId} with a ${longLocalPart.length}-character local-part and safely truncated display name.`)
  } catch (error) {
    workError = error
    throw error
  } finally {
    if (syntheticUserId) {
      try {
        await retryCleanup(
          'synthetic profile cleanup',
          () => supabase.from('profiles').delete().eq('id', syntheticUserId),
          syntheticUserId,
          email,
        )
        await retryCleanup(
          'synthetic auth user cleanup',
          () => supabase.auth.admin.deleteUser(syntheticUserId, false),
          syntheticUserId,
          email,
        )
      } catch (cleanupError) {
        if (workError) console.error(cleanupError instanceof Error ? cleanupError.message : cleanupError)
        else throw cleanupError
      }
    }
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
