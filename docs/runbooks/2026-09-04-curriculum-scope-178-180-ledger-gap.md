# Migration 178-180 ledger gap: state-equivalence record

Date: 2026-09-04
Production project: `lvnmzdowhfzmpkueurih`

## Decision

Migration 178-180 are classified as:

`ledger-absent, object-and-invariant-consistent`

This is deliberately **not** the same as `applied`. Production has objects,
data and security boundaries consistent with the intended effects, but the
migration ledger has no matching rows. Current state cannot distinguish an
exact execution from manual SQL, a restore or a later migration that recreated
the same effects.

Do not rerun 178-180 and do not add ledger rows by hand.

## Locked repository inputs

| Migration | SHA-256 |
| --- | --- |
| `178_curriculum_scope_release_registry.sql` | `1c20619814cff4a563ea895ca90fdea8d71e2e70345f8e0f07d89ca8e9d108d7` |
| `179_release_tyt_fen_mastery_scope.sql` | `e173d1c85217511bde1848ca8c331219c25c549ecbdcfbec194b828470cad060` |
| `180_backfill_released_tyt_fen_mastery_evidence.sql` | `3ea839b13954680c664c5a6e4eae529521e76bbc724197ff7ad68fd9d5564fb0` |

These hashes bind the reviewed repository files only. They are not production
execution receipts.

## Production evidence observed on 2026-09-04

- Matching migration ledger rows: `0`.
- `curriculum_scope_releases` and
  `curriculum_scope_evidence_repairs`: PostgreSQL-owned, RLS enabled and no
  table privileges for `anon`, `authenticated` or `service_role`.
- TYT Mathematics scope: released, registry `diagnostic_enabled=true`,
  integrity `630/630` with all error counters zero.
- TYT Science scope: released, registry `diagnostic_enabled=true`, integrity
  `757/757` with all error counters zero. This registry flag does not, by
  itself, prove that a student-facing diagnostic blueprint, API and UI are
  available.
- TYT Science repair receipt: 9 attempts, 98 answers, 98 candidate evidence
  rows, 98 inserted rows, 5 users.
- Remaining rows matching the one-time Fen repair predicate without evidence:
  `0`.
- The five relevant definer routines are PostgreSQL-owned and pin
  `search_path=pg_catalog`. Anonymous and authenticated execution remains
  closed. Service-role execution is limited to the three read-only scope
  resolver/integrity routines.

Run
[`database/verification/178_180_curriculum_scope_state_equivalence.sql`](../../database/verification/178_180_curriculum_scope_state_equivalence.sql)
to reproduce the fail-closed, repeatable-read and rollback-only attestation.
The query emits current function-definition MD5 values for comparison, but
does not treat them as historical proof because later migrations redefine some
of those routines.

## History repair gate

Supabase provides `supabase migration repair <version> --status applied` to
insert a missing migration-history entry. That operation changes history; it
does not execute or prove the corresponding SQL.

Only consider a separate, explicitly approved history-repair operation when
all of the following are available:

1. An authoritative production execution receipt identifies each exact
   migration version and execution time.
2. The receipt is cryptographically or independently tied to the repository
   file hashes above.
3. A disposable clone proves how this repository's ordinal filenames map to
   the remote ledger with the pinned Supabase CLI.
4. The proposed repair changes only migration history and a postcheck confirms
   no schema or data drift.

Without that evidence, retain the state-equivalence classification. This keeps
future release decisions honest and avoids manufacturing provenance.
