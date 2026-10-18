# Quiz order and exponent acceptance findings

## Confirmed failure: discovery 2646

The logged-in production acceptance on 2026-10-18 played one wrong answer
followed by nine correct answers. The browser estimated a maximum streak of
nine and 300 XP. The saved result contained a maximum streak of eight and
290 XP. The result screen displayed the saved XP alongside the local streak.

The question endpoint issued a larger candidate pool before the client mixed
review questions, selected deneme categories and shuffled the played order.
Session scoring correctly used immutable snapshot positions, so the two orders
produced different streak bonuses. The client also discarded `maxStreak` from
the successful save acknowledgement.

## Change

- Compose the actual played list on the server before issuing the attempt.
  Review selection, deduplication, deneme category quotas and final shuffle all
  precede snapshot creation. Return only this selected list, in its bound order.
- Request the actual question count and preserve the returned question order
  through the fetch helper and quiz hook. Answer-option shuffling is unchanged.
- Parse the canonical saved streak and pass it to the result screen. Legacy or
  invalid acknowledgements hide the streak after save rather than presenting a
  stale local value.
- Preserve the separate governed TYT Social official-section endpoint and the
  server's existing canonical answer ordering and replay protections.

No schema migration or scoring-formula change is required. An already-open tab
must reload to use the corrected client. Existing completed sessions are not
rewritten.

## Validation

241 targeted route, fetch, hook, parser and result tests pass and cover the exact issue order,
review inclusion/exclusion, deneme distribution, canonical streak propagation
and mismatched-snapshot rejection. TypeScript passes. Two negative controls
restore the previous route/client separately: each new regression test fails
against the old implementation, then the corrected files are restored exactly.
The first full run exposed three old response-contract assertions; these were
updated to check inclusion/exclusion in the composed list and the additional
canonical result prop. The full-suite rerun and release verification are recorded
in the acceptance report after completion.

## Separate content finding: discovery 2645

Three production math questions and their solutions encode squares as plain `2`
(including `f(3)=32=9`). Exact rows and current published revision IDs were
confirmed read-only. A private, revision/hash-pinned proposal package replaces
only those exponents with `²`; answers and options remain identical.

Private evidence and the before/after review sheet are under
`secure/quiz-order-exponents-20261018/`. The offline preview validates all three
proposals. It is not a database draft or a publication. Content work overlaps
active claim 103552; coordination note 103557 requests ownership clarification.
The existing governed publication path requires two independent human reviews.
This source change does not publish or modify question content.
