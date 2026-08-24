import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

const sql = readFileSync(
  new URL('../migrations/155_institution_security_review_followup.sql', import.meta.url),
  'utf8',
)

describe('institution security review follow-up SQL', () => {
  it('enforces AAL2 in the shared platform, institution and teacher authorization gates', () => {
    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.institution_rpc_actor_has_aal2')
    expect(sql).toContain("current_setting('request.jwt.claims', true)")
    expect(sql.match(/public\.institution_rpc_actor_has_aal2\(p_user_id\)/g)?.length).toBeGreaterThanOrEqual(6)
    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.institution_pilot_payload_hash')
    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.teacher_classroom_payload_hash')
  })

  it('keeps tenant status in the legacy teacher authorization path', () => {
    expect(sql).toContain("institution.status IN ('pilot', 'active')")
  })

  it('exports subject-linked rows without treating teacher and author columns as ownership', () => {
    const exportBody = sql.slice(
      sql.indexOf('CREATE OR REPLACE FUNCTION public.export_account_data'),
      sql.indexOf('CREATE OR REPLACE FUNCTION public.audit_institution_pilot_request'),
    )
    expect(exportBody).not.toMatch(/'teacher_id'|'created_by'|'admin_id'|'actor_user_id'/)
    expect(exportBody).toContain("'user_id','student_id','owner_id','target_user_id','manager_user_id'")
  })

  it('creates hashed request tombstones before deleting expiring ledgers', () => {
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS public.institution_request_tombstones')
    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.reject_reused_institution_request_id')
    expect(sql.indexOf('INSERT INTO public.institution_request_tombstones')).toBeLessThan(
      sql.indexOf('DELETE FROM public.pilot_institution_requests'),
    )
  })

  it('records real exam-mode fields and review targets', () => {
    expect(sql).toContain("NEW.result ->> 'reviewRef'")
    expect(sql).toContain("NEW.result ->> 'examMode'")
    expect(sql).toContain("NEW.result ->> 'until'")
  })
})
