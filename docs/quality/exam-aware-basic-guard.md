# Exam-aware database basic-content guard

Bug #2330: migration 079 required five options even when an immutable revision
had `exam_ref=LGS`. Source and quality acceptance could report ready, but the
normal publication RPC then failed with SQLSTATE 23514. No review bypass is
needed: the table's structural guard must understand the exam.

## Contract

- `question_content_basic_guard_for_exam(game, content, exam_ref)` is a pure,
  immutable, invoker-rights predicate. Trimmed, uppercase **exact LGS** requires
  four options and numeric integer answer 0..3. Everything else retains the
  legacy five-option requirement, including absent/unknown metadata.
- TYT, AYT and AYT-* stay at five, answer 0..4. Existing WordQuest nested-content
  exemption is unchanged. No new exam alias or broad four-or-five allowance.
- The old two-argument function remains callable and defaults to five. It is
  not an exam-aware readiness check. Both predicates retain the legacy public
  execution contract: they only inspect supplied JSON, never stored records.
- The existing trigger checks inserts and changes to **content, game or
  exam_ref**. Old malformed records can still have unrelated metadata toggled;
  a no-op update does not silently revalidate historical content.
- Other length, type, forbidden-option and Roman-premise checks are carried
  forward from 079. Its locale-dependent non-ASCII case folding is not repaired
  here: PostgreSQL initialized with C/`--no-locale` does not fold uppercase Ç in
  `HİÇBİRİ`. Tests explicitly compare that legacy behavior rather than claiming
  a new language-normalization guarantee.

## Verification and rollout

`question-basic-guard-postgres.test.mjs` reproduces old failure, applies the new
migration twice, checks that existing rows do not change, validates valid and
invalid exam/index combinations, and exercises INSERT/content/game/exam and
metadata-only UPDATE paths. The source-review PostgreSQL suite now includes
the actual 079 trigger plus the new migration, including normal publication of
a changed four-option LGS draft through the explicit AI-owner path. Quality,
source/year, permissions and old-content preservation assertions remain.

Use `SOURCE_REVIEW_PG_BIN` for isolated native PostgreSQL. CI sets
`SOURCE_REVIEW_PG_REQUIRED=1`; missing binaries must fail, not skip. The fixture
is intentionally narrow, not a full historical schema replay. Real production
function definitions/permissions and the exact target revision readback must
be checked before and after migration/publication.

The migration performs no question, approval, decision or history data writes.
It leaves the installed trigger in place and replaces its invoker function.
Short lock and statement timeouts bound the DDL transaction. Publish only the
two already authorized Kader-Kaza and Nisap revisions via the existing RPC,
reusing the saved request IDs after checking pins and stored decisions.

Rollback must not revert content or delete quality evidence. Restore the saved
previous guard/trigger definitions in a separately reviewed migration if needed;
that would again prevent future four-option LGS edits/publications. Existing
published four-option questions and unrelated metadata updates remain intact.
The two-argument guard and source-only `readyToPublish` are not substitutes for
an actual successful publication and readback.
