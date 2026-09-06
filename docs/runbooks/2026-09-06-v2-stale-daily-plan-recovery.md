# V2 stale daily-plan recovery (disc 1695)

## Scope and evidence boundary

Base: `3d0d8ec9fbc9b04afd214585eb409f7ab633a505` (PR #478).
The preceding authenticated production smoke found an immutable Mathematics/LGS
plan with 15 IDs: 14 active questions and 1 quarantined question. The database
issuer correctly rejected the full set. The application presented a generic 500.
This document records a local application fix, not a production data repair or
evidence of completed V2/pilot/learning-outcome validation.

## Recovery contract

- Read the complete saved question set in its immutable order. Require exact
  cardinality, raw `is_active === true`, game and exam scope (including NULL for
  Wordquest), unique matching IDs and valid question content.
- If a question is missing, inactive, invalid or outside the saved scope, return
  `409 / daily_plan_content_unavailable`, `Cache-Control: no-store`, and
  `recovery: manual_practice`. Return no question, item, completion or ticket data.
- Never shorten/refill a saved plan, erase an item, manufacture completion, or
  unquarantine a question. The same boundary applies to an atomic-create winner.
- If issuance fails after the first read, perform one eligibility re-read. A
  newly unavailable question yields the same 409. Intact data or an unreadable
  database remains 500. No issuance retry loop and no weaker fallback issuer.
- Preserve all auth, rate-limit, governance, SQL and verified-attempt checks.
- The student sees an explicit unavailable message and can choose a topic in
  the same game/exam. This is separate practice, not a repaired daily plan.
  Direct `start=today-plan` is consumed once without starting a broken plan.
- Do not imply a quality-review schedule or guaranteed automatic repair. The
  immutable historical plan remains unavailable until its original content is
  valid again; a later date uses the existing new-plan composition rules.

## Verification and release gate

Local tests cover the exact 14-active/1-inactive shape, legacy and V2 plans,
missing/invalid/scope-drift rows, Wordquest NULL scope, eligibility/issuance races,
infrastructure errors, response privacy, unchanged completion/issuer contracts,
and context-safe unavailable UI.

Local validation on Node `22.23.2`:

- Full application suite: 460 files / 4,129 tests passed.
- Focused server/hook/Focus/lobby/issuer suite: 182 tests passed (included above,
  not additional independent tests).
- Existing daily-plan and verified-attempt SQL contracts: 2 files / 22 tests
  passed. These are static contract checks, not live PostgreSQL acceptance.
- Changed-file ESLint, TypeScript `--noEmit --incremental false`, diff check,
  213-migration ordinal/idempotency lint and function-grant lint passed.
- Local `next build --webpack` passed, including TypeScript and 221/221 static
  pages. It used an unreachable loopback Supabase URL and non-secret placeholders,
  not production credentials. Webpack is used locally because `node_modules` is
  a junction to the verified shared toolchain; normal CI/Vercel builds remain
  separate acceptance gates. Existing Edge Runtime/Sentry deprecation notices
  were not changed in this scoped fix.
- Terra's independent final review: no P0/P1 blocker found. Luna implemented the
  UI/hook portion; the parent added negative and delayed-JSON regressions.
- Initial route tests exposed old mocks returning TYT rows for an unscoped
  request and not supplying the new eligibility re-read. Fixtures were corrected
  and queued issuer mocks reset between tests; production guards were not weakened.

The saved local logs are under ignored `secure/entry-preview/`. Build/release
status must be checked separately; these results do not assert a live fix.

No migration, production SQL, feature flag, source-rights assertion, question
approval, provider call or automatic publication is part of this change.
Before release: review the final diff, run Node 22 validation, obtain the release
authority for the exact commit, then require all mandatory CI checks and deploy
verification. No previous migration is to be replayed.

After release: verify the new 409/no-store for a still-stale plan if one exists;
verify that no partial plan/ticket or completion increase is returned; use the
explicit same-exam manual-practice recovery. Separately finish a valid plan and
verify server-persisted completion/rewards. If today's plan has expired, do not
alter production content merely to recreate the historical incident.
