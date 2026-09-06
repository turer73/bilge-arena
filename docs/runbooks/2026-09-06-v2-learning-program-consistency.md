# V2 learning/program consistency — local closeout

## Scope and status

This is a local implementation and verification record, not a production release
or a declaration that all V2 work is finished.

- Worktree: `D:\Projelerim\bilge-arena-v2-consistency`
- Branch: `fix/v2-learning-program-consistency`
- Base: `7a85692294ef417f0a4937173c084e653e9ba923`
- New forward migration: `211_institution_program_completion_integrity.sql`
- Existing migration files, old dirty worktrees, production data, credentials,
  feature flags and learner profile preferences were not changed.
- This batch is prepared as a local release candidate. No push, PR, deployment,
  release-host transfer or production SQL is authorized by this local closeout.

## 1. One learning decision for the map and daily plan

`summarizeLearningStatus` is now the common V2 evidence decision used by both
`buildMasteryMapResponse` and outcome-based daily-plan targeting. Both apply
difficulty-weighted evidence, hint dependence, delayed retrieval and the existing
minimum of three distinct verified Istanbul calendar dates. Three dates do not
prove a 7–14-day interval or psychometric validity.

- A V1/raw-accuracy result can no longer suppress a daily target that the V2 map
  still considers developing or insufficient.
- The plan reads the complete V2 state, including `verified_evidence_days`.
- Raw-accuracy ordering, weak-target minimum of three attempts, selected-category
  priority, cold-start targets and slot composition remain unchanged.
- Existing daily plans are immutable: they return their stored items before
  new evidence/context reads. New semantics affect newly composed plans only.
- The map's bounded pre-202 column fallback still awards zero distinct-day
  progress; it is not used by the TYT Social scoped reader.

For enabled TYT Social personalization, both endpoints use the strict shared
policy context parser and scoped outcome-state RPC. They never fall back to
legacy aggregate Social evidence. Wrong/missing context or malformed scoped
state is rejected without a private payload or cached error response. Exact
taxonomy and allowed categories remain enforced; alternate-policy questions are
still validated by the existing database issuance contract.

The two migration-208 RPC client types were added to `database.client.ts` from
their actual SQL signatures. The generated database type file was not hand-edited.

## 2. Observation is not completion

Migration 211 preserves the existing review eligibility window (14 days and at
least one real completed execution). It separates that observation from the
stronger program completion claim:

1. The exact number of snapshot items must exist.
2. Every item must be completed, not pending or skipped.
3. Every item must match its completed server-owned execution and actual scoped
   verified-practice/diagnostic source with sufficient answers.
4. A matching teacher review must exist.

Only then can a published program become completed. The review RPC returns
`programStatus`; the UI no longer invents completed status when saving a review.
Historical idempotency receipts stay immutable, so that field is optional for a
rolling deploy and a missing value does not imply completion. Replaying an older
receipt may conservatively show its earlier state until history is reloaded.

The sync path preserves actor, tenant, operational institution, active membership,
classroom and tombstone checks. It never activates draft/archived programs.
Private helpers have no PUBLIC/anon/authenticated/service-role EXECUTE grant;
only the existing review RPC remains service-role callable. Deferred constraints
protect the four program tables against an unbacked completed state. Review and
completion use migration 201's common advisory lock order.

Existing invalid completed rows are a stop condition. Migration 211 does not
silently repair, relabel or remove historical user data. Its precheck, postcheck,
10-second lock timeout and 15-minute statement timeout are mandatory.

The file originated from the Supabase CLI migration scaffold
`20260906073559_institution_program_completion_integrity.sql`, then was renamed
to the repository's ordinal convention. Migrations 193 and 201 were not weakened.

### Real calendar versus test clock

Normal task start is limited to the program week, executions expire after three
hours, and observation review opens after 14 days. The normal flow is therefore
task completion first, review later. A reviewed but incomplete old program is
not labelled fully completed.

The concurrency tests deliberately adjust only synthetic fixture calendar dates
after valid current-week starts to exercise both ordering paths. They prove
locking, atomicity and source checks, not that an execution can last 14 real days
or that an expired week's tasks can be started. No production time gate changed.

## Local verification — 2026-09-06

Runtime: exact Node `22.23.2`, PostgreSQL `16.14`, Next.js `16.3.3`.

| Check | Result |
| --- | --- |
| Full application tests | 457/457 files, 4035/4035 tests passed on the final rerun |
| Database contract suite | 116 files / 645 tests passed; 25 DB-dependent files / 212 tests skipped without their opt-in environments |
| Institution real PostgreSQL | 44/44 passed: 23 existing + 9 completion + 12 independent inspection cases |
| Daily plan, mastery evidence, curriculum scopes real PostgreSQL | 3 files / 34 tests passed |
| Type-check | Passed with `--noEmit --incremental false` |
| Full source ESLint | 0 errors; 21 warnings in untouched files |
| Migration lint | 213 files scanned, no new ordinal/idempotency violation |
| SECURITY DEFINER grant/search-path lint | Passed |
| Supabase security advisors on the disposable fixture | No warn/error issues (`--type security --level warn --fail-on error`), exit 0 |
| Production-mode local build | Passed, Turbopack, 220/220 static pages |

The build used a loopback placeholder Supabase URL, no service credential or
Sentry upload token, and disabled TYT Social flags. It proves compilation, not an
authenticated live backend flow. Existing module-type and Edge-runtime build
warnings were not changed by this batch.

PostgreSQL listened only on `127.0.0.1:55469`. Fixtures were restricted to new
disposable `bilge_inst_test_v2_a1936c2d` and `bilge_r02_test_v2_a1936c2d` databases.
This is synthetic PG16 integration, not an exact production-dump rehearsal.
The disposable PostgreSQL server was stopped after testing; absence of a
listener on port 55469 was verified. Test files/data were retained locally.

Migration 211 local file SHA-256:
`d30371d06673f9dc09d75721049e4add54ed8ecc1fb82a34907965d5505dec8f`.
This is a local file identity, not approval or proof of a production ledger entry.

### Failed attempts retained in the record

- Initial `npm.cmd ci` selected the globally installed Node 24 despite PATH.
  Dependencies were reinstalled with explicit Node 22 and the unchanged lockfile.
- The sandbox-created PostgreSQL cluster could not start under Windows restricted
  process context; a separate fresh local cluster was started in the approved
  user context. No existing server or database was reused/deleted.
- The first new institution cases tried to start mature, past-week programs and
  correctly failed. The fixture now starts tasks in the current week before the
  explicit test-clock shift.
- A foreign-manager test initially reused a manager deactivated by an earlier
  historical case. A fresh operational foreign-tenant fixture now isolates BOLA.
- Initial type-check identified the two missing migration-208 RPC client types;
  explicit client contracts fixed this without changing generated types.
- CLI advisor help initially required its user-cache write permission. Its first
  connection then failed because the disposable loopback server has no TLS;
  explicit `sslmode=disable` was used only for `127.0.0.1:55469`. The security
  advisor passed there. No remote or production TLS setting was weakened, and
  this synthetic result is not a production security audit.

No security gate was relaxed to make a failed test pass.

## Remaining release and product gates

### Independent SQL Editor inspection

The following complete files are read-only checks, not migration runners:

- `database/checks/211_institution_program_completion_preflight.sql`
- `database/checks/211_institution_program_completion_postcheck.sql`

Run each alone, outside an existing transaction, under an authorized inspection
role with unrestricted row visibility. A restricted/RLS-filtered empty result
must never be treated as proof. These checks do not grant inspection privileges.

Each opens its own repeatable-read, read-only transaction, applies bounded
timeouts, raises an error on failed assertions and ends with `ROLLBACK`.
Successful output is aggregate-only (`passed`, `read_only`, checked program count)
with `production_readiness_proof=false`. There are no row/advisory locks, schema
changes or calls to the migration's completion helper.

The preflight recomputes evidence independently and works before 211 exists.
The postcheck also verifies helper/RPC privileges, SECURITY DEFINER/search-path
metadata and the exact trigger contracts. Neither replaces the migration ledger,
deployment/flag checks, exact artifact identity, a production-clone rehearsal or
authorized application smoke. After any SQL error, explicitly roll back the
failed transaction before investigating; do not continue the migration chain.

Tests run complete files outside transactions for clean pre/post states. Negative
tests execute the exact assertion blocks inside rollback-only disposable test
transactions after deliberate fixture drift. Such drift is never written to
production and is not permission to disable an existing production guard.

The final local PostgreSQL 16 run passed all 44 institution cases. The added
checks passed before migration 211 and after applying it twice; deliberate
data/ACL/trigger drift was detected with rollback-only test changes. Eight new
static contracts also passed. These counts are not added to earlier overlapping
institution runs.

Inspection file SHA-256 identities:

- Preflight: `d3c3e8109249d8ad3101d709c878e3684db669589dbbc686634688b663684747`
- Postcheck: `0df46d20b9c1071c9c9f28dfb2327830b2b8728085af42d62fa87d1ae1d3d982`

### Release sequence

Before deploying this batch, obtain exact release authority for the reviewed
commit/branch/PR and migration 211, rerun mandatory CI (including PostgreSQL 16),
and rehearse 211 on an approved disposable clone of the current production schema.
Read the authoritative production ledger and capability/flag state anew. Do not
replay already installed migrations 187–210 or reinterpret older ledger gaps.

Keep institution program/onboarding and TYT Social rollout gates closed during
the app-first deployment and migration validation. Verify exact artifacts,
transaction/ledger recording, independent postcheck, schema refresh, and real
authorized learner/teacher smoke before any canary. Stop on drift, invalid
historical completed rows, failed checks or unexpected flag state. A migration
rollback is not an authorized way to discard reviews or execution evidence.

Specific work still outside this local batch:

- TYT Social content approval, mapping/role coverage and controlled learner rollout.
- A single selection-epoch-bound Social personalization read: context, state and
  creation currently use separate DB snapshots. Existing issuance locks prevent
  forbidden question branches, but a policy switch during composition still needs
  a race test and atomic epoch contract before canary enablement.
- Future owner-level changes to source answer/evidence tables and retention/purge
  must revalidate completed programs; the new constraints attach to the four
  program tables, not every source table. Existing retention restrictions remain.
- Main learning-entry UX, remaining course/exam content coverage, age/AI safety
  acceptance and 7–14-day independent learning measurement from the broader V2 plan.
- A real institution pilot and observed outcomes. No pilot execution is a
  `not tested` state, not proof that the implementation is defective or effective.

No new learner-level validity, official MEB coverage, causal program effect or
full V2 completion claim follows from these local green tests.
