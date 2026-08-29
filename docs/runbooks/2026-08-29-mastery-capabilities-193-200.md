# Mastery capability release 193-200

This runbook publishes three independent capabilities for each proven scope:

1. the learner mastery/discovery graph from the curriculum release,
2. a short ten-question starting screen from an immutable diagnostic blueprint,
3. privacy-bounded institution student/cohort analysis.

The short screen is an initial estimate, not an official diagnosis. The
Wordquest scope is an internal English skill taxonomy displayed under YDT for
compatibility; it is not evidence that the bank represents the official YDT
distribution.

## Capability matrix after a successful release

| Scope | Mastery graph | Ten-question screen | Institution analysis | Reports/programs |
| --- | --- | --- | --- | --- |
| Mathematics / TYT | existing | existing | existing | existing Math-only flow |
| Science / TYT | 179-181 | 195 | 196 | disabled |
| Turkish / TYT | 189-190 | 197 | 198 | disabled |
| Wordquest / YDT display | 187-188 | 199 | 200 | disabled |
| Social / TYT | draft | disabled | disabled | disabled |

Social must remain draft until reviewed Din Culture content and the
candidate-specific extra-Philosophy policy have their own forward release.
Neither missing content nor a UI flag is permission to publish it.

## Required migration order

Apply one migration at a time and stop on the first failed statement or
postcheck:

1. 187, 188
2. 189, 190
3. 191, 192 — on the current incomplete Social bank these advance the chain
   without publishing or repairing Social
4. 193 — immutable diagnostic blueprint registry and V3 RPCs
5. 194 — immutable institution capability registry and exact-scope V2 RPCs
6. 195, then 196 — Science diagnostic, then institution analysis
7. 197, then 198 — Turkish diagnostic, then institution analysis
8. 199, then 200 — internal Wordquest diagnostic, then institution analysis

Application consumers may deploy before 193/194: the missing-RPC fallback is
bounded to the existing Mathematics/TYT contract. Do not apply a subject
capability migration before the application build that understands its exact
scope has reached production.

## Read-only preflight

Refresh this evidence in the same maintenance window. Stored notes or local
JSON counts are not production proof.

```sql
SELECT game, display_exam_ref, question_exam_ref, taxonomy_version,
       release_status, diagnostic_enabled, released_at
FROM public.curriculum_scope_releases
WHERE (game, display_exam_ref) IN (
  ('matematik','TYT'), ('fen','TYT'), ('turkce','TYT'),
  ('wordquest','YDT'), ('sosyal','TYT')
)
ORDER BY game, display_exam_ref;

SELECT target.game, target.display_exam_ref, target.taxonomy_version,
       public.curriculum_scope_integrity(
         target.game, target.display_exam_ref, target.taxonomy_version
       ) AS integrity
FROM (VALUES
  ('fen','TYT','ba-tyt-fen-v1'),
  ('turkce','TYT','ba-tyt-turkce-v2'),
  ('wordquest','YDT','ba-ydt-eng-v1')
) AS target(game,display_exam_ref,taxonomy_version);
```

Every target integrity object must satisfy:

```text
total > 0
mapped = total
unmapped = 0
scopeMismatch = 0
nodeOrphan = 0
outcomeOrphan = 0
primaryMismatch = 0
emptyOutcome = 0
```

After inserting each validating blueprint but before making it public, its
`adaptive_diagnostic_scope_integrity` result must have `clean=true`, the exact
expected outcome count, zero empty candidate outcomes and candidate capacity at
least ten. The release migrations additionally require at least two exact,
published, revision-bound candidates for every outcome. Candidate mappings
must be the single primary `taxonomy_auto` mapping. Science must contain
exactly `fizik`, `kimya`, `biyoloji`; Turkish must contain its five canonical
categories; internal Wordquest must contain its seven versioned skill
categories. Science/Turkish revisions must carry exact `TYT`; Wordquest
question storage must be physical SQL `NULL` (not blank text), while its
revision snapshot may carry SQL `NULL` or the YDT display scope.

## Postchecks after each pair

Run as a trusted database operator; these resolver RPCs are not public client
interfaces.

```sql
SELECT public.resolve_released_diagnostic_scope('fen','TYT');
SELECT public.resolve_released_diagnostic_scope('turkce','TYT');
SELECT public.resolve_released_diagnostic_scope('wordquest','YDT');

SELECT public.resolve_released_institution_scope('fen','TYT');
SELECT public.resolve_released_institution_scope('turkce','TYT');
SELECT public.resolve_released_institution_scope('wordquest','YDT');
SELECT public.list_released_institution_scopes();

SELECT game, display_exam_ref, capability_status,
       student_analysis_enabled, aggregate_enabled,
       report_enabled, program_enabled
FROM public.institution_scope_capabilities
ORDER BY game, display_exam_ref;
```

Expected blueprint shapes:

```text
fen       TYT  TYT   ba-tyt-fen-v1      10 / 3 / max 4
turkce    TYT  TYT   ba-tyt-turkce-v2   10 / 5 / max 2
wordquest YDT  NULL  ba-ydt-eng-v1       10 / 7 / max 2
```

Expected new institution rows have `analysis=true`, `aggregate=true`,
`report=false`, `program=false`. There must be no released Social diagnostic
blueprint or Social institution capability.

## Production smoke

- Open Science, Turkish and English from both desktop and mobile lobbies.
- Confirm the mastery card carries the exact game and display exam in its
  mastery, practice and starting-screen links.
- Start and finish one ten-question screen per released scope. Confirm resume
  and duplicate answer request handling are idempotent and no answer key is in
  the public question payload.
- Switch institution analysis between Mathematics, Science, Turkish and
  English. A scope change must clear stale results before the new response.
- Confirm classes with fewer than three active students receive no aggregate
  counts or evidence.
- Confirm report, follow-up and program controls remain hidden for the three new
  scopes.
- Confirm Social exposes neither the starting-screen action nor an institution
  analysis scope.
- Confirm the forty-question Smart Mock remains a separate practice surface and
  never describes itself as the starting screen or a mastery diagnosis.

## Emergency containment

The short screen can be hidden without mutating its immutable blueprint:

```sql
BEGIN;
SET LOCAL lock_timeout = '10s';
UPDATE public.curriculum_scope_releases
SET diagnostic_enabled = false, updated_at = clock_timestamp()
WHERE game = 'REPLACE_GAME'
  AND display_exam_ref = 'REPLACE_EXAM'
  AND release_status = 'released';
NOTIFY pgrst, 'reload schema';
COMMIT;
```

Use only an exact reviewed game/exam pair. Replaying the complete 195-200 chain
revalidates blueprint, candidate, curriculum and institution proofs without
turning an emergency-disabled diagnostic back on or changing proof timestamps.
The diagnostic resolver stays `NULL`; the independently released institution
analysis remains available and reports `diagnosticEnabled=false`. Institution
capability history is immutable; do not retire or alter a released row as an
ad-hoc rollback. Contain an institution issue at the application/pilot gate and
ship a reviewed forward migration.

## External release boundary

Local tests do not authorize GitHub or production changes. Before rollout,
record exact approval for the commit/repository/branch push, PR merge/deploy,
and the specific production migration ordinals. Report code review, local
tests, PostgreSQL 16, CI, deploy and live smoke as separate gates.
