# Governed TYT Math publication

## Failure and bounded fix

Six reviewed Math revisions gained narrow canonical aliases alongside the existing
category proxies. The first publication rehearsal rolled back with SQLSTATE
22023: the legacy mapper counted both aliases and required exactly one outcome.
The prior governed-publication trigger exception covered TYT Social only.

Migration `20261011124426_governed_math_outcome_projection.sql`:

- Extends that private PID/transaction/question/publish-context branch to TYT Math.
  The current approved revision, content hash and valid outcomes are still required.
  The normal publisher remains responsible for copying the exact accepted mapping.
- Excludes canonical Math aliases from legacy category guesses. Unreviewed
  questions still need exactly one active legacy proxy; zero or two fails closed.
- Preserves exact already-published canonical Math mappings on maintenance.
  Missing/extra outcomes, changed weights/primary/content/hash or inactive outcomes
  fail closed rather than adding a broad category proxy to reviewed evidence.
- Keeps both helpers private, fixed search_path, and the existing publisher,
  source acceptance, quality policy, diagnostic flags and permissions unchanged.

No question IDs, approvals, publications, seed data or learner answers are shipped
by this migration. No trigger is disabled in production.

## Verification and release

Native disposable PostgreSQL tests load the real 142 write context, 164 outcome
validator, 217 publisher and 220 auto mapper. Source/RBAC are explicit fixture
seams: this is not the full migration chain. The old bug is reproduced before the
new functions are installed; ordinary Social publication remains a regression
suite. The new Math suite is mandatory in the source-review CI job.

Before release: required CI passes, save both live function definitions/ACLs,
apply through the migration ledger, verify exact bodies and private permissions,
then rehearse and publish the six exact accepted revisions via the normal RPC.
Check category integrity and retain old contents/outcomes/history. Measurement
form registration and authenticated/device acceptance remain separate.

Rollback is a reviewed forward migration restoring the captured function bodies,
not deleting question history. After canonical questions have been published,
do not restore the old mapper blindly: it is incompatible with those mappings.
Disable new measurement starts if needed and keep reviewed publications intact
while a forward correction is tested.

Evidence is private under `secure/math-owner-release-20261011/`; never commit
source reports, user attestations, credentials or raw question-bank contents.
