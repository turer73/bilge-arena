import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const sql = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '..', 'migrations', '134_institution_teacher_lifecycle_guards.sql'),
  'utf8',
)

describe('134 institution teacher lifecycle guards SQL contract', () => {
  it('resolves only a verified existing account after manager authorization', () => {
    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.add_my_institution_teacher_by_email')
    expect(sql).toMatch(/membership\.role = 'manager'[\s\S]+institution\.staff\.manage/)
    expect(sql).toMatch(/FROM auth\.users AS auth_user[\s\S]+lower\(auth_user\.email\) = v_email[\s\S]+email_confirmed_at IS NOT NULL[\s\S]+auth_user\.deleted_at IS NULL/)
    expect(sql).toContain('RETURN public.add_pilot_institution_teacher(')
  })

  it('serializes teacher-owned classroom creation with membership removal', () => {
    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.create_teacher_classroom')
    expect(sql).toMatch(/membership\.user_id = p_user_id[\s\S]+membership\.status = 'active'[\s\S]+FOR UPDATE OF membership/)
    expect(sql).toContain('v_institution_id := v_membership.institution_id')
  })

  it('refuses to orphan an active classroom when removing a teacher', () => {
    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.remove_pilot_institution_teacher')
    expect(sql).toMatch(/member_ref = p_member_ref[\s\S]+FOR UPDATE/)
    expect(sql).toMatch(/classroom\.institution_id = p_institution_id[\s\S]+classroom\.teacher_id = v_membership\.user_id[\s\S]+classroom\.status = 'active'/)
    expect(sql).toContain("RAISE EXCEPTION 'teacher has active classrooms' USING ERRCODE = 'P0003'")
  })

  it('keeps both lifecycle writes service-role only', () => {
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION[\s\S]+FROM PUBLIC, anon, authenticated, service_role/)
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION[\s\S]+TO service_role/)
  })
})
