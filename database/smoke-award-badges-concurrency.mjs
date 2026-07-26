#!/usr/bin/env node
// Opt-in production smoke test for the award_badges concurrency guarantee.
//
// This script never selects an existing user. When explicitly enabled, it
// creates one uniquely named synthetic auth user, runs two competing RPC calls,
// verifies the winner/loser contract, then deletes that same auth user in
// finally (the profile and related rows cascade from auth.users).

import { randomUUID } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const CONFIRMATION = 'I_UNDERSTAND_PROD_WRITE'
const PROFILE_WAIT_MS = 20_000
const PROFILE_POLL_MS = 400

function fail(message) {
  throw new Error(`[award_badges concurrency smoke] ${message}`)
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function extractAward(result) {
  if (result.error) {
    fail(`award_badges RPC failed: ${result.error.message}`)
  }

  const row = result.data?.[0]
  if (!row || !Array.isArray(row.awarded_codes) || typeof row.total_xp_earned !== 'number') {
    fail(`award_badges returned an unexpected payload: ${JSON.stringify(result.data)}`)
  }

  return row
}

async function waitForProfile(supabase, userId) {
  const deadline = Date.now() + PROFILE_WAIT_MS
  let lastError

  while (Date.now() < deadline) {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, total_xp')
      .eq('id', userId)
      .maybeSingle()

    if (data) return data
    if (error) lastError = error.message
    await sleep(PROFILE_POLL_MS)
  }

  fail(`profile trigger did not create ${userId} within ${PROFILE_WAIT_MS}ms${lastError ? ` (${lastError})` : ''}`)
}

async function main() {
  if (process.env.ALLOW_PROD_BADGE_SMOKE !== CONFIRMATION) {
    console.error(`Refusing to run. Set ALLOW_PROD_BADGE_SMOKE=${CONFIRMATION} to allow a synthetic production write.`)
    process.exitCode = 1
    return
  }

  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceRoleKey) {
    fail('SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL) and SUPABASE_SERVICE_KEY (or legacy SUPABASE_SERVICE_ROLE_KEY) are required')
  }

  const supabase = createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const runId = randomUUID()
  const email = `badge-concurrency-smoke+${runId}@example.invalid`
  const password = `Smoke-${randomUUID()}-9a!`
  let syntheticUserId
  let workError

  try {
    const { data, error } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { smoke_test: 'award_badges_concurrency', run_id: runId },
    })
    if (error || !data.user) {
      fail(`could not create synthetic auth user: ${error?.message ?? 'empty response'}`)
    }
    syntheticUserId = data.user.id

    const beforeProfile = await waitForProfile(supabase, syntheticUserId)
    const beforeXp = Number(beforeProfile.total_xp ?? 0)

    const [first, second] = await Promise.all([
      supabase.rpc('award_badges', { p_user_id: syntheticUserId, p_badge_codes: ['first_game'] }),
      supabase.rpc('award_badges', { p_user_id: syntheticUserId, p_badge_codes: ['first_game'] }),
    ])
    const awards = [extractAward(first), extractAward(second)]
    const winners = awards.filter((award) =>
      award.total_xp_earned === 50 && award.awarded_codes.length === 1 && award.awarded_codes[0] === 'first_game',
    )
    const losers = awards.filter((award) =>
      award.total_xp_earned === 0 && award.awarded_codes.length === 0,
    )
    if (winners.length !== 1 || losers.length !== 1) {
      fail(`expected exactly one 50-XP winner and one 0-XP loser, got ${JSON.stringify(awards)}`)
    }

    const { count: achievementCount, error: achievementError } = await supabase
      .from('user_achievements')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', syntheticUserId)
      .eq('achievement_id', 'first_game')
    if (achievementError) fail(`could not count synthetic achievement: ${achievementError.message}`)
    if (achievementCount !== 1) fail(`expected exactly one first_game achievement, got ${achievementCount}`)

    const { count: xpLogCount, error: xpLogError } = await supabase
      .from('xp_log')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', syntheticUserId)
      .eq('reason', 'badge_earned')
      .eq('amount', 50)
    if (xpLogError) fail(`could not count synthetic XP ledger rows: ${xpLogError.message}`)
    if (xpLogCount !== 1) fail(`expected exactly one badge_earned XP log row with amount 50, got ${xpLogCount}`)

    const { data: afterProfile, error: profileError } = await supabase
      .from('profiles')
      .select('total_xp')
      .eq('id', syntheticUserId)
      .single()
    if (profileError || !afterProfile) fail(`could not read synthetic profile after RPC: ${profileError?.message ?? 'empty response'}`)
    const afterXp = Number(afterProfile.total_xp ?? 0)
    if (afterXp !== beforeXp + 50) {
      fail(`expected total_xp ${beforeXp + 50}, got ${afterXp}`)
    }

    console.log(`PASS: ${syntheticUserId} had one winner, one loser, one achievement, one XP ledger row, and +50 XP.`)
  } catch (error) {
    workError = error
    throw error
  } finally {
    if (syntheticUserId) {
      const { error } = await supabase.auth.admin.deleteUser(syntheticUserId, false)
      if (error) {
        const cleanupError = new Error(`cleanup failed for synthetic auth user ${syntheticUserId}: ${error.message}`)
        if (workError) {
          console.error(cleanupError.message)
        } else {
          throw cleanupError
        }
      }
    }
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
