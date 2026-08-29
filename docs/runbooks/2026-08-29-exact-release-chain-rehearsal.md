# Exact 187-204 release-chain rehearsal

This rehearsal is the same-schema PostgreSQL 16 gate for migrations 187-204.
It must run against a **local disposable clone of the production/staging
database immediately after migration 186**, not an empty synthetic database.
The existing focused PostgreSQL fixtures remain valuable, but they do not
prove the physical 187-204 upgrade on one schema.

## Safety contract

- The host must be `localhost`, `127.0.0.1` or `::1`.
- The database name must match `bilge_exact_chain_test_*`.
- `BILGE_EXACT_CHAIN_TEST_DATABASE_DISPOSABLE=1` is mandatory.
- PostgreSQL major version must be 16 and no second session may use the clone.
  The cluster must be dedicated: migration 204 changes the cluster-wide
  `authenticator` role, so any other non-template application database is a
  hard stop (`postgres` itself is the only allowed companion database).
- The restored Supabase migration ledger must prove migration 186 and contain
  none of 187-204. Required Supabase roles must also be restored locally.
- The runner never writes `supabase_migrations.schema_migrations`.
- Every migration owns its transaction and embedded postcheck. The runner
  stops on the first error and leaves the disposable clone for inspection.
- After 191 and 192, TYT Social must still be `draft`, diagnostic-disabled and
  unreleased. The final check also requires no Social diagnostic/institution
  capability and keeps new institution report/program flags closed.

## Run

1. Start a dedicated local PostgreSQL 16 instance and create a database named,
   for example, `bilge_exact_chain_test_20260829`.
2. Restore the approved pre-187 staging/production dump plus required global
   roles into that database. Do not point this command at Supabase or another
   remote host.
3. Set the two process-scoped variables without putting production credentials
   in shell history:

```powershell
$env:BILGE_EXACT_CHAIN_TEST_DATABASE_URL = 'postgres://localhost/bilge_exact_chain_test_20260829'
$env:BILGE_EXACT_CHAIN_TEST_DATABASE_DISPOSABLE = '1'
npm.cmd run test:release-chain:rehearsal
```

The JSON-line output records each exact filename, SHA-256, duration and passed
embedded postcheck. Preserve that output with the release evidence. A failure
is a stop condition; do not edit the clone or skip an ordinal to make the chain
continue. Restore a fresh clone after fixing the forward migration.
