-- Generated from the text-free pilot manifest. Run only as a read-only export.
-- Export the result as JSON; never paste its content into Codex or a shell command.
WITH selected(revision_id, selection_order) AS (
  VALUES
    ('a41df11b-6ea8-4ed7-9774-d145aad1ac36'::uuid, 1),
    ('52e7db56-36e3-4ebe-9ad4-94e1051d04ac'::uuid, 2),
    ('d9cfbdd3-d1ea-49c1-9574-2f827a00f9ae'::uuid, 3),
    ('07b984b8-cfac-4168-81d6-1f4ae4b90f82'::uuid, 4),
    ('60540f71-a2d2-46ef-8c07-07e6cca2e650'::uuid, 5),
    ('d3c7640d-bf60-4b34-a423-7bb06dbd2169'::uuid, 6),
    ('b4019f3b-6747-438b-88d8-77f7dacaf1bd'::uuid, 7),
    ('e1c5bff4-b0b2-46b8-9fe0-b8d5b32315f4'::uuid, 8),
    ('7543b9e4-1fe9-49fa-9f25-5b9277c12992'::uuid, 9),
    ('4cdd2380-aafa-433d-a25c-00fae58810ee'::uuid, 10),
    ('47f17e4e-cb3a-4736-867b-b97160909516'::uuid, 11),
    ('4779961f-4c1f-4136-aad8-df28427356cf'::uuid, 12),
    ('8edcd381-51aa-4085-a441-a3551397d3d9'::uuid, 13),
    ('4ceb6f93-ac6f-45ed-be2d-93cc38647595'::uuid, 14),
    ('8d0e803d-3063-411e-be52-c19789b33d78'::uuid, 15),
    ('dc24abc8-429f-4e03-b5ab-c48913c6eb9d'::uuid, 16),
    ('26d5496f-8190-40a9-9fd7-650212d59480'::uuid, 17),
    ('1b2cd690-66b3-48a1-a2b6-b8d58f80a7d3'::uuid, 18),
    ('58856d05-a388-4e0b-bd56-d8ea466aa7c5'::uuid, 19),
    ('570bb288-3476-46c1-af7f-8a51c2f028ba'::uuid, 20)
)
SELECT
  r.question_id::text AS "questionId",
  r.id::text AS "revisionId",
  r.content_sha256 AS "contentSha256",
  co.title AS "outcomeTitle",
  r.content::text AS "contentJson"
FROM selected s
JOIN public.question_content_revisions r ON r.id = s.revision_id
JOIN public.questions q ON q.id = r.question_id
  AND q.published_revision_id = r.id
  AND q.is_active
JOIN public.question_revision_outcomes qro ON qro.revision_id = r.id
  AND qro.is_primary
JOIN public.curriculum_outcomes co ON co.id = qro.outcome_id
  AND co.is_active
WHERE r.status = 'published'
ORDER BY s.selection_order;
