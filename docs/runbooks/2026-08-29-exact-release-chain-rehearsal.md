# Exact 187-204 release-chain rehearsal

This rehearsal is the same-schema PostgreSQL gate for migrations 187-204.
It must run against a **local disposable clone of the production/staging
database immediately after migration 186**, not an empty synthetic database.
The existing focused PostgreSQL fixtures remain valuable, but they do not
prove the physical 187-204 upgrade on one schema.

## Safety contract

- The host must be `localhost`, `127.0.0.1` or `::1`.
- The database name must match `bilge_exact_chain_test_*`.
- `BILGE_EXACT_CHAIN_TEST_DATABASE_DISPOSABLE=1` is mandatory.
- PostgreSQL 16 is the default. PostgreSQL 17 is allowed only when the approved
  dump header proves that its source is PostgreSQL 17 and
  `BILGE_EXACT_CHAIN_EXPECTED_POSTGRES_MAJOR=17` is explicitly set. Downgrading
  a PostgreSQL 17 dump into PostgreSQL 16 is not an exact rehearsal.
- No second session may use the clone.
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

`local` means that the runner and disposable PostgreSQL cluster execute on the
same host and communicate over loopback. An SSH tunnel that makes a remote
database appear as `localhost` does not satisfy this contract.

## Approved release input — 2026-08-29

- Dump: `/opt/backup/data/2026-08-29/bilge-arena.sql.gz`
- SHA-256: `09718557cee5cd1e2632678887499b1b5c4e2e575d14a411a01cf3f077184c2c`
- Header: database PostgreSQL 17.6, `pg_dump` 17.11
- Rehearsal image: `public.ecr.aws/supabase/postgres:17.6.1.140`
- OCI index digest:
  `sha256:6501843661b1f8ff97e85c02de33edc0ee2e2693888ad596ee86222f02dc8ecc`
- Required installed extensions include `supabase_vault 0.3.1`,
  `pg_stat_statements 1.11`, `pg_trgm 1.6`, `pgcrypto 1.3`, `unaccent 1.1`
  and `uuid-ossp 1.1`.

This dated evidence applies only while the dump hash and image digest match.
Any replacement dump or image requires a fresh provenance record.

## Run

1. Start a dedicated local PostgreSQL instance matching the approved dump's
   source major and create a database named, for example,
   `bilge_exact_chain_test_20260829`.
2. Restore the approved pre-187 staging/production dump plus required global
   roles into that database. Do not point this command at Supabase or another
   remote host.
3. Record the dump path, SHA-256, dump-header source version, container/image
   digest and available extension versions with the release evidence.
4. Set the process-scoped variables without putting production credentials in
   shell history. Omit the expected-major variable for the PG16 default; set it
   to `17` only for a header-proven PG17 dump:

```powershell
$env:BILGE_EXACT_CHAIN_TEST_DATABASE_URL = 'postgres://localhost/bilge_exact_chain_test_20260829'
$env:BILGE_EXACT_CHAIN_TEST_DATABASE_DISPOSABLE = '1'
$env:BILGE_EXACT_CHAIN_EXPECTED_POSTGRES_MAJOR = '17'
npm.cmd run test:release-chain:rehearsal
```

The JSON-line output records the verified server version, each exact filename,
SHA-256, duration and passed embedded postcheck. Preserve that output with the
release evidence. A failure is a stop condition; do not edit the clone or skip
an ordinal to make the chain continue. Restore a fresh clone after fixing the
forward migration.
