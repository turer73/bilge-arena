# Social pilot — 6 October 2026 continuation

This is integration and source-evidence repair, not publication authorization.

## Code integration

PR #551 is refreshed from `2aca503` against master `119c294`.
The CI conflict is resolved by retaining **both** the isolated four-domain Social
PostgreSQL suite and the canonical identity/deduplicated-evidence suite added by
PR #574. No guard, approval requirement, source policy, or release flag is relaxed.

Local verification of the merged checkout:

- Social/app/API/source-review/canonical regression selection: 262 tests, 14 files.
- Four-domain Social discovery on a fresh private PostgreSQL 17.10 cluster: 16/16.
- Canonical catalog/PostgreSQL selection: 79 passed, 1 private-package test skipped.
- Merge pre-commit: lint and type check passed; 222 migrations passed the static linter.

These are scoped fixtures, not execution of the full historical production migration
chain. Normal pre-push build/full tests and the new head's CI remain separate checks.
This document does not claim that the PR has merged or that Social is enabled.

## Bounded source repair

The git-excluded operator package is `secure/social-source-repair-20261006/`.
Its predecessor is preserved in the Social worktree's
`secure/social-pilot-release-20261002/recheck-20261004T193500Z/`.

- 24 task/revision/content pins and the 120 existing option checks are unchanged.
- All 104 predecessor files are checked unchanged by byte hash.
- Four untraceable passages are replaced with actual, bounded source readings;
  26 earlier excerpt/receipt links retain their original access dates.
- Iğdır content claims point to the inspected geographic research paper, not to
  the curriculum excerpt or a KTB page that does not name Dilucu.
- SEP uses a successful parsed-text web reading, explicitly **not** a claimed
  local HTML download or raw-response hash. PDF extraction/rendering methods and
  the MEB two-column extraction are recorded separately.
- The exact Westphalia and terminology advisories are carried by actual task IDs.
- BCcampus edition/author and Nizâmiye Medresesi bibliographic errors are corrected.
  Chapters/adaptations are not promoted into additional independent witnesses.
- A date-only quote is not treated as proof of every solution detail. The Husserl
  quote is not treated as proof of four other philosophers' distractor concepts.

The source policy remains unchanged: **24 insufficient_evidence, 0 evidence_complete**.
The package is a repair of provenance defects, not a renewed full content review,
a license clearance, a blind judge run, or authorized source/curriculum acceptance.

## Remaining release boundary

The next content queue separates 18 candidates requiring claim-level independent
content/curriculum evidence from six sociology questions with a TYT scope hold.
The latter are not made eligible by adding citations. Reclassification, rewriting,
or choosing replacement questions is a separate pinned revision/scope step.

After evidence completion, use the current authorized governance workflow for
source/curriculum acceptance and `question-quality@2` decisions on exact pins.
The four-domain discovery pack additionally needs its own accepted 24-question
manifest and release. It is not the same as enabling full TYT Social mastery.

No production data, published question, review identity, quality decision,
diagnostic flag, or discovery-pack release is changed by this continuation.
