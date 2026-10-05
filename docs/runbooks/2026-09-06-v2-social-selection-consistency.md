# V2 Social selection consistency (disc 1698)

## Scope and authorization

Local branch: `fix/v2-social-policy-epoch`, based on
`029fcfb8f84ce7e46d25ed453ddbb9239d78bb40`.
The local package covers client state handling, migration 212, static SQL
contracts, focused disposable PostgreSQL 16 acceptance evidence, and the
separately authorized application adoption of its four service-role RPCs.
Feature flags, question content, publication, and production configuration are
unchanged. Local release-candidate commit creation is authorized. No push, PR,
deployment, production SQL execution, or release-host transfer is included.

The earlier release authorization explicitly excluded migration changes.
Authoring a new migration was rejected by the safety gate. The empty CLI
scaffold and dependent application drafts were removed from release source;
root drafts are retained under ignored `secure/entry-preview/social-epoch-drafts/`.
A bulk reverse patch was also rejected to protect other local edits. Exact
forward patches were backed up and checked before file-by-file restoration.
No unrelated changes were discarded.

## Client guarantees

- A Social policy PUT in flight is not a usable active selection. A failed or
  uncertain PUT also fails closed: the server may have committed before the
  response was lost. The pending intent retains its idempotency key for retry.
- An authoritative selection changes the client invalidation key used by the
  QuizEngine daily-plan and mastery hooks and the Study page's separate mastery
  card. Unsettled Social policy withholds the learning user identity so those
  hooks do not issue personal GETs while a write is pending. Old context data
  must not appear as data for a different account, exam, category, or selection.
- Completion is acknowledged by the server, never optimistically declared.
  Late acknowledgements must not update a different context or plan, and
  acknowledgements arriving out of order must not undo confirmed completion.
- These are client consistency protections, not database authorization or an
  atomic server-side selection contract.

## Database epoch boundary (implemented locally)

Migration 212 adds a local server contract for the previously separate
daily-plan, learning-reader, practice, and personalized-mock operations:

1. It reads context, scoped evidence, and allowed candidates from one database
   statement snapshot; do not fall back to legacy aggregates.
2. It compares the expected policy version and immutable selection-event UUID under
   the same per-user/policy lock used by the setter before creating a plan or
   issuing a new practice/mock attempt. A-to-B-to-A must reject the first A.
3. It returns SQLSTATE `40001` with a bounded stale-selection message and no
   question data.
4. It preserves existing legacy/source-plan definitions and immutable stored
   plan rows; it never retroactively relabels historical attempts.
5. A real two-client disposable PostgreSQL test proves that a selection committed
   while a writer waits on the policy lock is observed and aborts before writing.

Official section composition already uses an atomic database composer and is
not rewritten here. Application adoption is now implemented locally, as
recorded in the 2026-09-08 follow-up below. Neither this local source nor the
isolated DB proof closes disc 1698, authorizes production migration 212, or
establishes live behavior.

## Client verification

Final local validation is recorded after the last client patch. The first full
run found an account-switch saving-state regression (4177 passed, 1 failed);
it was not treated as a release pass. An added AbortError test initially used a
PUT-shaped response for a strict GET; the fixture was corrected, not the parser
relaxed. An intermediate full run was stopped after consumer wiring changed;
it is not counted as a final pass.

Exact Node 22.23.2: final focused suite 8 files / 135 tests passed. TypeScript
passed with `--noEmit --incremental false`; changed-file ESLint passed with
`--max-warnings=0`. Migration lint scanned 213 existing files and grant/search
path lint passed; neither operation executed SQL. Independent review approved
the bounded client behavior and both learning entry points, not DB atomicity.

Final full application suite: **462 files / 4190 tests passed**, zero failed,
Node 22.23.2, `vitest run --maxWorkers=4`, exit 0, 217.18 seconds. TypeScript
and warning-free changed-file lint were repeated after the final consumer wiring.
`git diff --check` was clean at the client milestone. No production smoke,
build, remote CI, or deployment was run for this local-only package.

The client milestone alone did not complete the wider V2 roadmap. The later,
separately authorized local database proof is recorded below.

## Local database follow-up: safety stop (historical), 2026-09-06

The subsequent local-only approval was received and CLAIM 101051 was acquired.
The Supabase CLI created scaffold `20260906180531`; it was moved to
`database/migrations/212_tyt_social_learning_selection_epoch.sql`. It contains
only two comments, not executable SQL. The proposed migration body and its new
static test were rejected together by the action reviewer, which still applied
the earlier explicit migration prohibition. Neither rejected target changed.
No alternative write path or database execution was attempted.

An ignored local runner was prepared at
`secure/entry-preview/run-social-epoch-local-pg.mjs`. Syntax validation passed.
It requires the exact local Node 22.23.2 and PostgreSQL 16.15 installations,
creates a unique loopback-only cluster with an ephemeral password, rejects
skipped tests and input drift, and stops its own cluster in cleanup. **It has
not been executed**, and no cluster or test database was created in this step.

Read-only dependency and lock-order reviews were completed. Existing Social
foundation, mastery-reader, and official-composer static SQL tests passed:
**3 files / 29 tests**, Node 22.23.2. These are regression checks of existing SQL,
not acceptance of migration 212. `git diff --check` passed. Real concurrency,
ABA-event, actor/ACL, rollback, and immutable historical-plan acceptance remain
pending. Application API adoption and production application remain out of
scope. Disc 1698 is not resolved by this stopped preparation.

## Local database follow-up: completed proof, 2026-09-07

The later explicit authorization lifted the local migration restriction only.
Migration 212 now installs six new functions: two private epoch/context helpers
and four service-role entry points for the combined reader, daily-plan writer,
practice issuer, and smart-mock issuer. It modifies no legacy function body or
grant. The wrappers require `READ COMMITTED`, bind both policy version and the
immutable selection-event UUID, share the setter's policy lock, and return the
bounded `40001` stale-epoch failure before persisting a mixed epoch.

The focused fixture is explicitly not a Supabase/production clone. It reuses
the previously proven pre-205 PostgreSQL contract, applies the unchanged
migration bodies 205-210 and 212, and supplies only a labelled test adapter for
the older immutable-revision snapshot trigger. Its empty release gate is
deliberately bypassed only inside the disposable writer test; this is not
content-pool or production release evidence.

Final real acceptance evidence:

- exact Node `v22.23.2` and PostgreSQL `16.15`;
- unique database `bilge_r44_test_96da4bff58c90090` on `127.0.0.1` only;
- no preload libraries and no production/provider connection variables;
- 13/13 passed, zero failed/skipped;
- real plan, practice, 40-question smart-mock, actor/ACL, `READ COMMITTED`,
  A-B-A event identity, and a two-client lock-wait race;
- all test, fixture, and migration 205-210/212 inputs hash-checked before and
  after execution;
- owned cluster stopped after proof;
- evidence directory:
  `secure/entry-preview/social-epoch-pg16-1788781142571-75f8f2d796/`.

Failed attempts remain part of the audit trail. Two early runners used an
over-broad historical migration fixture; later attempts stopped on eager test
parameter evaluation, a parameterized multi-command fixture seed, and an
ambiguous same-millisecond A-B-A test timestamp. Every owned cluster stopped;
the fixes narrowed the fixture and made the evidence deterministic rather than
relaxing migration 212.

Cross-checks after the SQL change: TYT Social static SQL contracts 46/46;
database suite 657 passed with 226 opt-in integration tests skipped; migration
lint scanned 214 files; function grant/search-path lint passed; TypeScript
passed; source ESLint exited zero with 21 unrelated existing warnings; and
`git diff --check` passed.

This completed the authorized **local migration and isolated database proof**.
At that milestone, application routes still called the legacy filter/create/
issue RPCs and migration 212 was uncommitted. The next local milestone below
adopts the new RPCs; production application and live smoke remain unperformed.

## Local application adoption, 2026-09-08

The separately authorized application work uses all four migration 212 entry
points without changing migration 212 or any existing feature flag:

- The mastery map, new daily plan, practice/review pools, and personalized mock
  use `read_tyt_social_learning_snapshot`. Context, scoped evidence, and
  candidate eligibility come from the same database statement snapshot.
- New daily plans, practice attempts, and smart mocks pass that snapshot's
  policy version and immutable selection-event UUID to the corresponding
  epoch-bound writer. Issuers receiving that pair do not re-read selection and
  silently replace it with a newer event.
- Only an epoch-bound writer's exact `40001` plus
  `TYT Social selection epoch changed` becomes a sanitized, non-cacheable 409.
  Missing/failed RPCs and malformed responses fail closed with no retry through
  a legacy writer or unscoped aggregate. Valid missing selection and unavailable
  scope are distinguished from malformed data and transport failures.
- The combined reader rejects inconsistent context, unknown envelope/state
  fields, duplicate or foreign candidate IDs, incomplete state rows, and
  duplicate/invalid outcome IDs. A valid active snapshot may have no evidence
  or no candidates; absence of evidence is not a protocol error or mastery.
- Stored daily-plan replay deliberately keeps its immutable source-plan
  issuance path. It does not replace the historical plan header with today's
  preference. The official 20-question composer also remains unchanged.
- The four new service RPC signatures are declared in `database.client.ts`.
  Production-generated DB types are not rewritten to pretend the migration
  is already live. Private answers and policy provenance stay server-side.

Intermediate failures were useful checks, not passes: old route fixtures first
failed after the RPC contract changed; a test user UUID was invalid; and a new
unknown-state-field regression exposed a permissive parser. Fixtures were
corrected and the parser tightened. Independent review also identified and
closed over-broad serialization-conflict classification, malformed inactive
context handling, and an uncaught daily-plan writer Promise rejection.

Final targeted checks: helper 80/80, mastery/today routes 104/104, and random/
FSRS/personalized-mock routes 66/66. The prior real PostgreSQL 16 proof's nine
input hashes were initially revalidated. Final staging then detected a trailing
blank line at the end of the previously untracked fixture. Only that blank
line was removed; to bind evidence to the final bytes, the acceptance test was
rerun in a fresh loopback-only PostgreSQL 16.15 cluster: **13/13 passed**, zero
failed/skipped, and the owned cluster stopped. The final evidence is
`secure/entry-preview/social-epoch-pg16-1788844369867-b1a720ca28/evidence.json`,
database `bilge_r44_test_cf3e614f0952d46b`. It remains a focused synthetic
fixture, not a production clone. Its final fixture SHA-256 is
`d018588d156c41f9b9566c8b99e505436c4f24bdef873aeb0a6c8f998055308e`.

Migration 212 SHA-256 is unchanged:
`8a6e4d82ad665be9e8e078d62e73356cac66d89ff7635508f723dc4dab47583d`.
The final database suite passes 657 tests in 117 files; 226 opt-in integration
tests in 26 files are skipped and are not counted as acceptance. TypeScript
(`--noEmit --incremental false`) and all changed TypeScript/TSX files plus the
new integrity test pass ESLint with zero warnings. Migration lint scans 214
files and the grant/search-path lint passes. Static React review found no
additional change needed; current-context and functional-state protections
remain covered by the hook tests.

The final full application run passes **462 files / 4247 tests**, zero failed,
on exact Node 22.23.2 (`vitest run --maxWorkers=4`, exit 0, 233.61 seconds).
Only documentation and that fixture's trailing blank line changed after this
run; no application source changed. No production build, browser smoke, remote
CI, push, deployment, or production migration was performed.

Disc 1698 stays open for deployment. A future separately authorized release
must check remote base/CI, migration ledger and flags, rehearse the exact
production baseline, establish all four new RPCs before enabling governed
flows, refresh PostgREST, and verify real sessions. This local milestone does
not complete the wider V2 roadmap or establish actual pilot/learning outcomes.
