import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const sql = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '..', 'migrations', '129_session_coin_scale.sql'),
  'utf8',
)

function body(name, next) {
  const start = sql.indexOf(`CREATE OR REPLACE FUNCTION public.${name}(`)
  const end = next ? sql.indexOf(next, start + 1) : sql.length
  expect(start).toBeGreaterThanOrEqual(0)
  return sql.slice(start, end > start ? end : sql.length)
}

describe('129 session coin scale SQL contract', () => {
  it('removes the second payment point from complete_game_session', () => {
    const legacy = body(
      'complete_game_session',
      'CREATE OR REPLACE FUNCTION public.apply_verified_session_rewards',
    )
    // Odeme artik burada degil; hesap tek yerde durmali.
    expect(legacy).not.toContain('increment_coins(p_user_id, p_correct_count)')
    // XP odemesi burada kalmali - kaldirmak regresyon olurdu.
    expect(legacy).toContain("increment_xp(p_user_id, p_total_xp, 'session_complete'")
  })

  it('pays coins in the same statement as the ledger row', () => {
    const rewards = body('apply_verified_session_rewards', null)
    expect(rewards).toContain("'coin', 'correct_answers'")
    expect(rewards).toContain('PERFORM public.increment_coins(v_user_id, v_coin_amount)')
  })

  it('applies the agreed scale', () => {
    const rewards = body('apply_verified_session_rewards', null)
    expect(rewards).toMatch(/c_coin_per_correct constant integer := 3/)
    expect(rewards).toMatch(/c_session_bonus constant integer := 10/)
    expect(rewards).toMatch(/c_first_session_bonus constant integer := 15/)
    expect(rewards).toMatch(/c_daily_coin_cap constant integer := 80/)
  })

  it('caps the daily total and never pays a negative amount', () => {
    const rewards = body('apply_verified_session_rewards', null)
    expect(rewards).toContain('LEAST(v_coin_amount, GREATEST(c_daily_coin_cap - v_coins_today, 0))')
    // increment_coins p_amount <= 0'da RAISE eder; tavana takilan oturum
    // butun islemi geri almamali.
    expect(rewards).toContain('IF v_coin_amount > 0 THEN')
  })

  it('counts today by Istanbul day boundary, not UTC', () => {
    const rewards = body('apply_verified_session_rewards', null)
    expect(rewards).toContain("timezone('Europe/Istanbul'")
  })

  it('keeps the existing idempotency sentinel', () => {
    const rewards = body('apply_verified_session_rewards', null)
    expect(rewards).toContain('ON CONFLICT (source_type, source_id, reward_type, reward_key) DO NOTHING')
    expect(rewards).toContain('IF COALESCE(v_first_application, false) IS NOT TRUE THEN')
  })
})
