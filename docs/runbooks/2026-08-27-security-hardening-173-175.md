# Security hardening release: migrations 173–175

This release deliberately separates database preparation, application deploy,
and privilege revocation so `/api/questions` never loses its RPC caller.

## Preconditions

- Production and preview institution onboarding flags remain closed.
- The application commit containing the server-role public question reader has
  passed tests, type-check, migration lint and a production build.
- `get_public_profile` and `search_questions` signatures still match the
  verification blocks in migrations 173 and 174.
- `pg_trgm` and `unaccent` are relocatable and all six dependent indexes are
  valid before migration 175.

## Ordered release

1. Apply `173_public_definer_rpc_boundary.sql` only.
2. Confirm `service_role` can execute both RPCs while existing anonymous calls
   remain unchanged.
3. Deploy the application and wait for the production alias to become healthy.
4. Smoke `GET /api/questions?game=matematik&active=true&limit=1` as a guest and
   confirm HTTP 200 with no answer, solution, explanation or hint keys.
5. Smoke the authenticated admin question list with AAL2.
6. Apply `174_public_definer_rpc_cutover.sql`.
7. Confirm direct `anon` execution is denied for both RPCs while the two
   application routes remain healthy.
8. Apply `175_extension_schema_hardening.sql`.
9. Confirm `pg_trgm` and `unaccent` now live in `extensions`, the six indexes
   remain valid and accent-insensitive question search still returns HTTP 200.
10. Reload Security Advisor and record the remaining warnings. Auth leaked
    password protection is a Supabase Pro-plan control and cannot be enabled on
    the current Free organization without a billing decision.

## Rollback boundaries

- Before step 6, the application can be rolled back without a database grant
  change because migration 173 is additive.
- If the application must be rolled back after step 6, re-grant anonymous
  `EXECUTE` on `search_questions(text,text,text,integer,boolean,boolean,integer,integer)`
  before restoring the old deployment.
- Migration 175 rollback moves both extensions back to `public` and restores
  `immutable_unaccent` to call `public.unaccent('public.unaccent', $1)` in one
  transaction. Do this only if post-migration index or search verification fails.

## Evidence to retain

- PR checks and production deployment commit
- Before/after function privileges for `anon`, `authenticated`, `service_role`
- Before/after extension schemas and index validity
- Production CSP header plus zero nonce-less scripts on sensitive documents
- Post-release Security Advisor warning counts
