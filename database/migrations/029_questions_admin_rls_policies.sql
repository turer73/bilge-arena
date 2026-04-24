-- Migration 029: questions table admin RLS policies (UPDATE + DELETE + admin SELECT)
--
-- Bug: /admin/sorular Pasif -> Aktif toggle silently fails. When the admin
--   clicks the toggle, /api/questions PATCH runs `supabase.from('questions')
--   .update({ is_active: ... })` using the user-scope client. The questions
--   table has RLS enabled but only a SELECT policy ("questions_select_all"
--   with `is_active = TRUE`). Without an UPDATE policy, PostgREST returns
--   0 rows affected and error=null — the API returns 200, the optimistic
--   UI update sticks, but the database row is unchanged. After refresh,
--   the question is still Pasif.
--
--   The same path affects the "Duzenle" modal: editing question content,
--   difficulty, or category silently fails for the same reason.
--
--   INSERT is unaffected because /api/admin/generate-questions uses
--   createServiceRoleClient() which bypasses RLS.
--
-- Root cause: Migration 011 (schema hardening) enabled RLS on questions
--   and added only a SELECT-active policy. No UPDATE/DELETE policy was
--   added because at that time there was no admin UI writing to the
--   table directly — all writes went through service_role paths. When
--   the admin questions management UI (/admin/sorular) was added, the
--   PATCH route /api/questions was implemented with the user client
--   (to leverage session-based auth), but the matching UPDATE policy
--   was not introduced.
--
-- Fix: Add has_permission()-based policies for UPDATE, DELETE, and a
--   SELECT policy that exposes inactive rows to admins with the
--   admin.questions.view permission. Same RBAC pattern as migration
--   016b (homepage_sections) and 025 (error_reports).
--
-- Related work:
--   - Permission seeds: 016_rbac.sql (admin.questions.view/edit/generate)
--   - Policy pattern:   016b_fix_rls_recursion.sql, 025_fix_error_reports_rls_rbac.sql
--   - has_permission(): 016b_fix_rls_recursion.sql line 11
--
-- Compatibility: CREATE POLICY fails if the policy already exists, so
--   each policy has a matching DROP POLICY IF EXISTS for idempotency.
--   The existing "questions_select_all" policy is preserved — it still
--   allows anon + authenticated users to read active questions.
--
-- Rollback:
--   BEGIN;
--     DROP POLICY IF EXISTS "questions_update_admin_rbac" ON public.questions;
--     DROP POLICY IF EXISTS "questions_delete_admin_rbac" ON public.questions;
--     DROP POLICY IF EXISTS "questions_select_admin_rbac" ON public.questions;
--   COMMIT;


BEGIN;

-- UPDATE: admins with admin.questions.edit can modify any question
DROP POLICY IF EXISTS "questions_update_admin_rbac" ON public.questions;
CREATE POLICY "questions_update_admin_rbac" ON public.questions
  FOR UPDATE
  USING (public.has_permission(auth.uid(), 'admin.questions.edit'))
  WITH CHECK (public.has_permission(auth.uid(), 'admin.questions.edit'));

-- DELETE: admins with admin.questions.edit can delete questions
DROP POLICY IF EXISTS "questions_delete_admin_rbac" ON public.questions;
CREATE POLICY "questions_delete_admin_rbac" ON public.questions
  FOR DELETE
  USING (public.has_permission(auth.uid(), 'admin.questions.edit'));

-- SELECT: admins with admin.questions.view can see inactive rows too.
-- The existing "questions_select_all" policy only exposes is_active=TRUE
-- rows to non-admin sessions, so this adds visibility for admin direct
-- table queries (complements the admin_view path in search_questions RPC).
DROP POLICY IF EXISTS "questions_select_admin_rbac" ON public.questions;
CREATE POLICY "questions_select_admin_rbac" ON public.questions
  FOR SELECT
  USING (public.has_permission(auth.uid(), 'admin.questions.view'));

COMMIT;


-- Verification (manual, not part of migration)
-- As a non-admin authenticated user:
--   UPDATE questions SET is_active = FALSE WHERE id = '<some-id>';
--   -- expected: UPDATE 0 (RLS denies)
--
-- As an admin with admin.questions.edit:
--   UPDATE questions SET is_active = NOT is_active WHERE id = '<some-id>';
--   -- expected: UPDATE 1
--
-- UI smoke test:
--   1. /admin/sorular -> filter "Pasif"
--   2. Click a question's status toggle -> should flip to "Aktif"
--   3. Refresh the page -> the question should still be "Aktif"
--   4. Open "Duzenle" modal -> change the question text -> save
--   5. Refresh -> the new text should persist
