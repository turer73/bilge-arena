# V2 session save integrity (disc 1696)

## Incident and scope

Base: `5b5ca737e7c53319099d3013a54bb1790516961f` (PR #479).
An authenticated Turkish/LGS daily-plan smoke reached 15 answers, 14 correct,
and 360 provisional XP. Completion returned PostgreSQL `22023`; the UI still
claimed the progress was saved. The failed request did not prove any persisted
session or reward. Do not retry or alter the historical attempt to manufacture
a successful result.

The confirmed arithmetic mismatch was `floor(360 * 0.7) = 251` in JavaScript
versus 252 with PostgreSQL numeric arithmetic. The earlier difficulty-4 pricing
hypothesis was disproved: migration 106's immutable verified snapshot uses
50 base points. That policy remains unchanged.

## Application contract

- The server reads base points from the issued immutable revision snapshot,
  never from the client score or a difficulty filter. The integer split is
  `floor(totalXP * 7 / 10)`; bonus is the remainder. Thus 360 splits to 252/108.
- The browser uses issued public `base_points` for a provisional XP display.
  This is not authorization to grant a reward.
- Saving is pending, saved, failed, or not applicable. Only a valid server
  acknowledgement permits a saved claim, canonical XP/counts, coins, and
  authenticated result sharing. Empty acknowledgement IDs are rejected.
- Failed transport means unconfirmed, not necessarily rolled back: a response
  can be lost after a commit. No automatic retry has been added.
- Request generation, user/attempt context, and mounted guards discard stale
  responses, including A-to-B-to-A transitions. Profile refresh checks that
  same guard before writing to the global store.
- After confirmed persistence, a profile refresh, callback, or notification
  failure cannot change saved into failed.
- Both the result statistics and share-card props use canonical correct/wrong
  counts and XP after acknowledgement. Sharing must not retain the local score.

## Preserved security boundaries

No migration, grant, RLS, immutable snapshot, first-answer binding, quarantine,
idempotent completion RPC, limiter, feature flag, question publication, or model
provider change is included. No production credentials are used for local tests.

## Local PostgreSQL acceptance

Exact Node 22.23.2 and PostgreSQL 16.15 were used with fresh synthetic databases,
SCRAM authentication, a random IPv4-loopback-only port, and an empty preload
list. No Windows service was installed. The test server was stopped afterward.

- Content-governance fixture: 14/14 passed, zero skipped. This executes the
  immutable revision triggers and proves 360/252/108 acceptance and rollback
  of 360/251/109 with no residual rejected attempt/session/answer rows.
- Separate verified-attempt fixture: 6/6 passed, zero skipped. Actual migrations
  081/091/092 exercise owner/game/mode/expiry boundaries, completion, replay,
  concurrency, and one-session/one-reward behavior.
- These are two separate synthetic fixtures, not a combined full production
  migration-chain rehearsal, HTTP smoke, or proof of live persistence.

The first Windows launcher retained child output handles and was stopped before
tests. The next identity check rejected PostgreSQL's `127.0.0.1/32` text form;
using `host(inet_server_addr())` preserves exact loopback comparison. A subsequent
real test caught eight unmapped parity seeds entering an unrelated queue. They
were given valid matching primary outcomes; the existing queue assertion and
all SQL security constraints were preserved. Final fresh reruns passed.

Luna's independent review found the stale share-score prop. Its regression test
failed against the old prop and passed after correction. Terra reviewed the
database fixture and corrected the seed isolation after the real failing run.
Machine-readable reports and the local launcher remain under ignored
`secure/entry-preview/`, outside the release source.

Final application validation: 461 files / 4,174 tests passed on Node 22.23.2.
Static SQL contracts: 116 files / 645 tests passed. The general SQL run skips
213 opt-in PostgreSQL cases; the 14 + 6 acceptance tests above were explicitly
run against PostgreSQL separately. These counts must not be summed as if all
213 optional database tests executed. TypeScript passed without incremental
cache. The final webpack production build passed with 221/221 static pages and
dummy unreachable-loopback Supabase settings; it did not use live credentials.
Full ESLint had zero errors and 21 existing warnings. Migration ordinal and
SECURITY DEFINER grant/search-path lint passed. Existing Edge Runtime/Sentry and
module-type deprecation warnings are outside this scoped fix.

## Release and production smoke gate

Before push, present the exact local commit, branch, and scope for approval.
Require all mandatory Node 22 CI and PostgreSQL checks, exact deployed SHA, and
closed institution/TYT Social flags. This application fix needs no new SQL
migration; do not replay old migrations or change flag values.

After a separately approved release, complete one valid authenticated daily
plan. Verify the POST response and returned canonical session ID/counts/XP,
then independently read the persisted session, answers, daily-plan completion,
XP/coin ledger, and profile. Verify there is one session/reward, no duplicate,
and that pending/failure UI never claims a save. Do not force production errors
or edit real content merely to recreate a test case. Stop on any failed gate.

Disc 1696 remains open until that live smoke passes. V2 overall is not complete:
TYT Social policy-selection epoch consistency, approved content coverage, human
question approval, real institution pilot use, and 7-14 day learning-outcome
evidence are separate gates; local code/tests cannot substitute for them.
