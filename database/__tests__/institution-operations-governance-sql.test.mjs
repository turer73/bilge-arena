import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const sql = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '..', 'migrations', '145_institution_operations_governance.sql'),
  'utf8',
)

describe('145 institution operations governance SQL contract', () => {
  it('serializes a same-tenant manager transfer and preserves a teacher path', () => {
    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.transfer_my_pilot_institution_manager')
    expect(sql).toMatch(/membership\.user_id = p_user_id[\s\S]+membership\.role = 'manager'[\s\S]+FOR UPDATE OF membership/)
    expect(sql).toMatch(/membership\.member_ref = p_new_manager_member_ref[\s\S]+membership\.role = 'teacher'[\s\S]+FOR UPDATE OF membership/)
    expect(sql).toContain("'institution-manager:' || v_current.institution_id::text")
    expect(sql).toMatch(/SET role = 'teacher'[\s\S]+SET role = 'manager'/)
    expect(sql).toMatch(/v_current\.id, v_teacher_role_id[\s\S]+v_next\.id, v_manager_role_id/)
    expect(sql).toContain("operation = 'transfer_manager'")
  })

  it('enforces one tenant-wide distinct-student quota under an institution lock', () => {
    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.accept_teacher_classroom_invite')
    expect(sql).toContain("'institution-students:' || v_classroom.institution_id::text")
    expect(sql).toMatch(/SELECT count\(DISTINCT membership\.student_id\)[\s\S]+classroom\.institution_id = v_institution\.id/)
    expect(sql).toMatch(/NOT v_student_already_counted[\s\S]+v_student_count >= v_institution\.student_limit/)
    expect(sql).toContain("RAISE EXCEPTION 'institution student capacity reached' USING ERRCODE = '23514'")
  })

  it('keeps an immutable, tenant-scoped and replay-deduplicated audit trail', () => {
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS public.institution_operation_events')
    expect(sql).toContain('BEFORE UPDATE OR DELETE ON public.institution_operation_events')
    expect(sql).toContain('UNIQUE (source, actor_user_id, event_type, request_id)')
    expect(sql).toContain('AFTER INSERT ON public.pilot_institution_requests')
    expect(sql).toContain('AFTER INSERT ON public.teacher_classroom_requests')
    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.get_my_institution_operation_events')
    expect(sql).toMatch(/membership\.role = 'manager'[\s\S]+institution\.roles\.manage/)
    expect(sql).not.toMatch(/jsonb_build_object\([\s\S]{0,120}'userId'/)
  })

  it('exposes only service-role RPCs while the raw event table remains private', () => {
    expect(sql).toMatch(/REVOKE ALL ON TABLE public\.institution_operation_events[\s\S]+FROM PUBLIC, anon, authenticated, service_role/)
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION[\s\S]+transfer_my_pilot_institution_manager[\s\S]+get_my_institution_operation_events[\s\S]+TO service_role/)
  })
})
