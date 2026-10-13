# TYT Social selection epoch: current-master forward port

This replaces the Social part of draft PR #491 without merging its stale branch.
Original code: `336320ba`; original no-skip CI gate: `a032109c`.
Base master: `3cc32fee`. Diagnostic coverage is a separate change (#606).

## Current-master differences retained

- Migration `212` is already occupied. New Supabase CLI scaffold:
  `20261013184551_tyt_social_learning_epoch_forward.sql`.
- Both policy queries exclude `rules.purpose = reviewed_preparation` at the
  same trusted cutoff. The official policy and reviewed preparation may coexist.
- Migration 221's four official TYT categories remain intact. Sociology is not
  reintroduced into the official scope or client context.
- Canonical LGS mastery/plans, the four-domain Social pilot, reviewed preparation
  card, exact 20-item official section and current Supabase publishable-key
  configuration remain unchanged. No generated schema snapshot is overwritten.
- Existing preparation functions, grants and receipt-bound definitions are not
  replaced. Six new functions expose only four service-role entry points.

## Contract

The stable reader resolves policy, exact immutable selection event, question
eligibility and evidence under one statement snapshot. Writers carry that event
and acquire the same policy lock as the setter. After waiting they recheck fresh
time, refuse stale selections (SQLSTATE 40001), and postcheck the stored event.
READ COMMITTED is required. An A-B-A choice is a new event, not the old A epoch.
Previously issued immutable daily-plan replay remains its separate contract.

Client hooks invalidate on the selection epoch and hide unsettled state.
An uncertain selection PUT does not leave the old selection usable. A late
completion acknowledgement cannot mark a different plan/context complete.
Completion is shown only after a valid server acknowledgement.
The current desktop home shares its one policy state with the tools slot through
an actor/game/exam-scoped context. Mastery hides during an unsettled selection,
without a duplicate policy fetch. Closed-flag preparation/pilot behavior remains.
GET completion IDs are projected onto unique current-plan IDs; stale or foreign
PATCH acknowledgements are rejected rather than applying optimistic progress.

## Verification and limits

Focused, disposable PostgreSQL 16 acceptance installs unchanged 205-210 and 221,
plus the exact current preparation guard/resolver/variant functions. Academic
pool-integrity and pre-205 dependencies are explicitly synthetic fixture seams;
this is **not full production-chain or academic release proof**.

The 18 database cases include actor binding, four service-only entry grants,
READ COMMITTED, A-B-A, idempotent attempt replay, a selection committed during a
lock wait, preparation-only and coexistence cases, unchanged preparation
definitions/grants, same-purpose overlap rejection, and real joined evidence
which must not cross selection events. 13 SQL contracts and 24 CI contracts
check the boundary and the exact 18/18, zero-skipped report.

CI's required Build depends on the Social PostgreSQL job. A skipped/failed
dependency explicitly fails Build; opt-in tests being discovered is insufficient.
Current preparation and canonical acceptance jobs remain in CI.

## Production order (separate authorization)

Read-only Vercel project check on 2026-10-13 confirmed both
`TYT_SOCIAL_V2_LEARNER_ENABLED` and `NEXT_PUBLIC_TYT_SOCIAL_V2_ENABLED` were
`false` for production and preview. No values were changed. Configuration can
drift: recheck immediately before any later activation.

1. Keep both V2 flags closed; do not activate from this PR.
2. Inspect live prerequisites, ledger and function signatures, then separately
   authorize/apply the timestamped migration. Historical 212/213 are untouched.
3. Read back the six definitions, service-only grants, private helper revocations
   and existing preparation boundary hash. Reload the PostgREST schema cache
   and verify the four new service RPCs before any application activation.
4. Verify actual policy/scope evidence, official/preparation separation and
   actor-scoped smoke behavior. Local fixtures and CI are not those approvals.
5. Only a separately authorized rollout may enable official V2. On a regression,
   keep/return V2 closed and revert the application change; do not rewrite or
   delete immutable selections, question revisions, plans or learner evidence.

Merging source does not execute SQL, publish questions, certify/calibrate the
Social pilot or grant source/curriculum acceptance.
