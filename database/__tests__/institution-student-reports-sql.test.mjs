import {describe,expect,it} from 'vitest'
import {readFileSync} from 'node:fs'
const sql=readFileSync(new URL('../migrations/124_institution_student_reports.sql',import.meta.url),'utf8')
describe('institution student reports migration',()=>{
  it('stores immutable identifier-minimal snapshots',()=>{expect(sql).toContain('CREATE TABLE IF NOT EXISTS public.institution_student_reports');expect(sql).toContain('pg_column_size(p_snapshot)>100000');expect(sql).toContain('(studentId|userId|memberRef|email|phone|note|followupRef|programRef)');expect(sql).not.toContain('UPDATE public.institution_student_reports')})
  it('binds report identity to the assigned active teacher and member',()=>{expect(sql).toContain("WHERE id=p_classroom_id AND teacher_id=p_user_id AND status='active'");expect(sql).toContain("p_snapshot->>'studentAlias' IS DISTINCT FROM public.teacher_classroom_safe_alias");expect(sql).toContain('public.teacher_classroom_is_blocked')})
  it('is idempotent, RLS-protected and service-only',()=>{expect(sql).toContain("operation='create_student_report'");expect(sql).toContain('ENABLE ROW LEVEL SECURITY');expect(sql).toContain('TO service_role')})
})
