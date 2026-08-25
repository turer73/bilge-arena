import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

const sql = readFileSync(
  new URL('../migrations/154_institution_review_closure.sql', import.meta.url),
  'utf8',
)

describe('institution production review closure SQL', () => {
  it('resolves invite-only audit results through the invite reference', () => {
    expect(sql).toContain('FROM public.teacher_classroom_invites')
    expect(sql).toContain("WHERE invite_ref = NEW.result ->> 'inviteRef'")
  })

  it('keeps archived institutions visible to the platform directory', () => {
    expect(sql).toContain("institution.status IN ('pilot', 'active', 'suspended', 'archived')")
  })

  it('exports all directly subject-linked tables plus indirect answer rows', () => {
    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.export_account_data')
    expect(sql).toContain("'user_id','student_id','teacher_id','owner_id','created_by','admin_id'")
    expect(sql).toContain('FROM public.session_answers AS answer_row')
    expect(sql).toContain('FROM public.teacher_assignment_submission_items AS item_row')
    expect(sql).toContain('GRANT EXECUTE ON FUNCTION public.export_account_data(uuid) TO service_role')
  })
})
