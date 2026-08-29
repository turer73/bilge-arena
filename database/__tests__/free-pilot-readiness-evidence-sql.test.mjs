import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

const sql = readFileSync(
  new URL('../migrations/167_free_pilot_readiness_evidence_gate.sql', import.meta.url),
  'utf8',
)
const replaySql = readFileSync(
  new URL('../migrations/168_free_pilot_closed_gate_replay.sql', import.meta.url),
  'utf8',
)

describe('free pilot readiness evidence SQL boundary', () => {
  it('creates no evidence while requiring every external readiness reference', () => {
    expect(sql).toContain('institution_free_pilot_readiness_attestations')
    for (const column of [
      'legal_approval_ref',
      'institution_dpa_ref',
      'retention_decision_ref',
      'vendor_register_ref',
      'tenant_ab_evidence_ref',
      'credential_rotation_ref',
      'backup_restore_ref',
      'account_readiness_ref',
      'accountable_owner_ref',
    ]) {
      expect(sql).toMatch(new RegExp(`${column} text NOT NULL`))
    }
    expect(sql).toContain("valid_until <= created_at + interval '7 days'")
    expect(sql).not.toMatch(
      /INSERT INTO public\.institution_free_pilot_readiness_attestations/i,
    )
  })

  it('binds an audited control opening to a fresh and unconsumed attestation', () => {
    expect(sql).toContain("current_setting('app.institution_control_change_ref', true)")
    expect(sql).toContain("current_setting('app.institution_readiness_ref', true)")
    expect(sql).toContain('free pilot readiness attestation required')
    expect(sql).toContain('attestation.valid_until > clock_timestamp()')
    expect(sql).toContain('institution_free_pilot_readiness_consumptions')
    expect(sql).toMatch(
      /INSERT INTO public\.institution_pilot_control_events\([\s\S]*?readiness_ref/,
    )
    expect(sql).toContain('institution_control_free_readiness_once')
  })

  it('enforces the same one-shot evidence on direct inserts and closes on retry', () => {
    expect(sql).toContain('public.enforce_institution_provisioning_control()')
    expect(sql).toContain('free pilot readiness gate is missing, expired or consumed')
    expect(sql).toContain('public.consume_free_pilot_readiness()')
    expect(sql).toContain('AFTER INSERT ON public.pilot_institutions')
    expect(sql).toContain("'MIGRATION-167-READINESS-GATE-' || txid_current()::text")
    expect(sql).toMatch(
      /UPDATE public\.institution_pilot_controls[\s\S]*?control_key = 'free_provisioning'[\s\S]*?AND enabled;/,
    )
  })

  it('keeps evidence, consumption and trigger functions away from browser roles', () => {
    expect(sql).toMatch(
      /REVOKE ALL ON TABLE public\.institution_free_pilot_readiness_attestations[\s\S]*?FROM PUBLIC, anon, authenticated, service_role;/,
    )
    expect(sql).toMatch(
      /REVOKE ALL ON TABLE public\.institution_free_pilot_readiness_consumptions[\s\S]*?FROM PUBLIC, anon, authenticated, service_role;/,
    )
    for (const fn of [
      'protect_free_pilot_readiness_attestation',
      'protect_free_pilot_readiness_consumption',
      'audit_institution_pilot_control_change',
      'enforce_institution_provisioning_control',
      'consume_free_pilot_readiness',
    ]) {
      expect(sql).toMatch(
        new RegExp(`REVOKE ALL ON FUNCTION public\\.${fn}\\(\\)[\\s\\S]*?FROM PUBLIC, anon, authenticated, service_role;`),
      )
    }
  })

  it('returns only an actor-bound exact replay before consulting the closed gate', () => {
    const actorCheck = replaySql.indexOf('auth.uid() IS DISTINCT FROM p_user_id')
    const replayLookup = replaySql.indexOf('SELECT * INTO v_request')
    const payloadCheck = replaySql.indexOf('v_request.payload_hash <> v_hash')
    const gateLookup = replaySql.indexOf('SELECT control.enabled')
    expect(actorCheck).toBeGreaterThan(-1)
    expect(actorCheck).toBeLessThan(replayLookup)
    expect(replayLookup).toBeLessThan(payloadCheck)
    expect(payloadCheck).toBeLessThan(gateLookup)
    expect(replaySql).toContain("RETURN v_request.result || jsonb_build_object('replayed', true)")
    expect(replaySql).toMatch(
      /REVOKE ALL ON FUNCTION public\.provision_free_pilot_institution\([\s\S]*?FROM PUBLIC, anon, authenticated, service_role;/,
    )
    expect(replaySql).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.provision_free_pilot_institution\([\s\S]*?TO authenticated;/,
    )
  })
})
