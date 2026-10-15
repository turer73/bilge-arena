# Diagnostic coverage forward repair

This carries only the guarded diagnostic repair from PR #491 onto current master.
The old PR's 213 filename conflicts with the unrelated quality-model migration;
the Supabase CLI scaffold is now `20261013183312_adaptive_diagnostic_legacy_coverage_repair.sql`.
No historical migration is edited. Source/test provenance: `0debb88aa78a560a8af027ae4f29889cd2036251`.

The repair verifies the exact legacy CHECK and replacement constraints, enabled
triggers, counter columns, RLS and table topology before removing the old
`covered_outcomes <= 6` ceiling. Every other constraint, trigger, column, policy,
owner and ACL must remain identical. Unknown or renamed constraints fail closed.
The transaction uses a five-second lock timeout. No learner rows, RPCs, published
questions, blueprints, release flags or permissions are changed.

Acceptance includes the real 098-to-193 chain on an isolated test fixture, the
seventh YDT outcome failing before the repair, atomic answer/session rollback,
then 10/7 completion and idempotent replay after repair. Math 10/6, Fen 5/3,
schema drift, repeat application and lock contention are also covered. This is
focused PostgreSQL acceptance, not a full production database clone.

The existing required Question quality PostgreSQL CI job runs this integration
file via `npm run test:question-quality:pg`. Opt-in skips during ordinary unit
testing are not database acceptance.

## Separate production release boundary

Merging this PR does not apply its SQL. Before production execution, obtain a
fresh read-only catalog/ledger preflight, pin the exact SQL digest and approve
the migration release. Apply in a bounded transaction with the correct ledger
identity; then run `scripts/security/verify-adaptive-diagnostic-coverage.sql`
read-only. Confirm all protected catalog metadata and release flags unchanged.
Finally verify a new authorized YDT session and ordinary Math/Fen behavior.
Do not reopen expired sessions or advance learner counters manually.

Do not blindly restore the old CHECK after rollout: seven-outcome evidence may
already exist. Stop the affected entry flow and investigate while preserving data.
Social selection-epoch handling and its later preparation policy are a separate PR.

## Local verification, 13 October 2026

Node 22.23.2 and a newly initialized, loopback-only PostgreSQL 16.15 cluster:
27 integration cases and 6 static contracts passed, zero skips. The owned cluster
was stopped and its evidence retained locally. Migration idempotency and
SECURITY DEFINER grant/search_path lint also passed. These are local results;
production execution and acceptance remain outside this code-merge request.
