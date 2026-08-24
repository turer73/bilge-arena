-- Migration 147: least-privilege identity for the community quality worker.
-- The worker can claim/complete private verification jobs and record consensus;
-- it cannot publish, edit questions, manage users, or change rollout settings.
BEGIN;

INSERT INTO public.roles(slug,name,description,is_system)
VALUES(
  'question_quality_worker',
  'Soru Kalitesi Worker',
  'Topluluk soru kalitesi doğrulama ve mutabakat işleyicisi',
  true
)
ON CONFLICT(slug) DO NOTHING;

INSERT INTO public.role_permissions(role_id,permission)
SELECT role.id, permission.name
FROM public.roles AS role
CROSS JOIN (VALUES
  ('content.appeals.manage'),
  ('content.corrections.apply')
) AS permission(name)
WHERE role.slug='question_quality_worker'
ON CONFLICT(role_id,permission) DO NOTHING;

COMMIT;
