# Private leaderboard rollout (migration 177)

## Safety contract

- Public leaderboard participation is separate from profile discovery.
- Every existing and new profile starts with `leaderboard_opt_in = false`.
- No grandfathering is allowed.
- Browser roles cannot read `profiles`, `leaderboard_weekly`, or
  `leaderboard_weekly_ranked` directly.
- The public API exposes only opted-in rows and binds `is_me` to the verified
  session, never a query-string user ID.

## Mandatory order

1. Merge and deploy the application PR first.
2. Before migration 177, verify all three leaderboard routes return a safe
   empty response with `privacy_pending`/`privacyReady: false`. The application
   must not query the legacy leaderboard while the new column is absent.
3. Apply `database/migrations/177_private_leaderboard_opt_in.sql` to production.
4. Reload PostgREST schema (the migration sends `NOTIFY pgrst`).
5. Run the SQL and HTTP checks below.

Do not apply migration 177 before the application deployment. The previous
application fallback reads all-time profiles with the service role and does not
know the new opt-in rule.

## SQL verification

```sql
select
  count(*) as total_profiles,
  count(*) filter (where leaderboard_opt_in) as opted_in_profiles
from public.profiles
where deleted_at is null;

select count(*) as public_weekly_rows
from public.leaderboard_weekly_ranked;

select count(*) as visibility_events
from public.leaderboard_visibility_events;

select
  has_table_privilege('anon', 'public.profiles', 'SELECT') as anon_profiles,
  has_table_privilege('authenticated', 'public.profiles', 'SELECT') as auth_profiles,
  has_table_privilege('anon', 'public.leaderboard_weekly_ranked', 'SELECT') as anon_ranked,
  has_table_privilege('authenticated', 'public.leaderboard_weekly_ranked', 'SELECT') as auth_ranked,
  has_table_privilege('service_role', 'public.leaderboard_weekly_ranked', 'SELECT') as service_ranked;
```

Expected immediately after cutover:

- `opted_in_profiles = 0`
- `public_weekly_rows = 0`
- all four browser-role privileges are `false`
- `service_ranked = true`

Also simulate `SET LOCAL ROLE anon` and `SET LOCAL ROLE authenticated` in a
transaction. Selecting any profile column, weekly row, ranked-view row, or
visibility event must fail with PostgreSQL `42501`.

## HTTP and signed-in smoke

- `GET /api/leaderboard/landing` returns `200`, `privacyReady: true`, and only
  explicitly opted-in accounts.
- Anonymous `GET /api/leaderboard/full` and `/sidebar` return `200` without any
  internal user UUID.
- A signed-in opted-out account sees the switch off and has `myRank = 0`.
- Turning the switch on creates exactly one visibility event and makes only
  that account eligible for weekly/all-time results.
- Turning it off creates one further event and removes the account from both
  public result sets without affecting XP or learning history.
- Supplying a forged `currentUserId` query parameter never changes `is_me` or
  `myRank`; only the authenticated session can do so.
- User search still works through `/api/users/search` after its RPC becomes
  service-route-only.

## Rollback boundary

After migration 177, do not roll the application back to a build that uses the
legacy all-time fallback. Do not re-grant direct browser reads and do not drop
the preference/evidence data. If public ranking must be stopped, deploy a
fail-closed route hotfix that returns empty lists while preserving migration
177 and user choices.
