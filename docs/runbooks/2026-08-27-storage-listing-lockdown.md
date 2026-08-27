# Storage public listing lockdown (migration 176)

The four asset buckets remain public for CDN delivery, but browser roles no
longer need a broad `SELECT` policy on `storage.objects`. Supabase public URLs
do not require `storage.objects` permissions. Homepage uploads are moved to the
same server-owned service-role pattern already used by badges and video
backgrounds.

Reference: <https://supabase.com/docs/reference/javascript/file-buckets-getpublicurl>

## Ordered release

1. Deploy the application change that makes
   `POST /api/admin/homepage/upload` use `createServiceRoleClient()` only after
   caller permission and rate-limit checks pass.
2. Smoke the deployed route as an unauthorized caller and confirm HTTP 403.
3. Apply `database/migrations/176_storage_public_listing_lockdown.sql`.
4. Confirm the seven broad policies are absent and all four buckets remain
   public.
5. Simulate `anon` and `authenticated` reads against `storage.objects`; neither
   role may list objects in the four buckets.
6. Fetch one known public object URL and confirm HTTP 200.
7. Refresh Security Advisor and confirm all four
   `Public Bucket Allows Listing` warnings are gone.

## Rollback boundary

Do not restore the broad homepage DML policies. If the deployed upload route
must be rolled back, pause homepage uploads until the service-role route is
restored. Public object delivery is independent of these policies and should
remain available throughout.
