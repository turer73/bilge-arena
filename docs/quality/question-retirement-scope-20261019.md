# Quarantined question retirement without invented outcomes

Ten out-of-scope retirement drafts were already quarantined but could not complete
stage two because an academic outcome was required even to keep the question
inactive. Adding an unrelated outcome would misrepresent the evidence.

Migration 227 permits empty outcomes only when the revision retires an already
inactive question, pins its current published base, and preserves every content
and metadata field. The content hash is checked again against that question.
Both stage-two review and publication enforce this predicate under row locks.
The normal outcome validator remains strict; an unmapped edit cannot publish.

Two independent reviewers remain mandatory. Author review, a single source-owner
acceptance, stale bases, content changes, metadata changes, and reactivation
between approval and publication do not qualify. The post-publication split-scope
check applies to active questions; retirement leaves no empty active projection.
Existing service-role-only ACLs are explicitly reasserted.

This migration approves and publishes no questions. Existing ten drafts can enter
the normal two-reviewer retirement flow without fabricated curriculum mappings.

Production ledger: `20261019045923 / 227_quarantined_retirement_scope` (179 entries).
Both function bodies matched the tested migration. The question-bank hash stayed
unchanged, with 6374 revisions, 101 approvals and 4509 quality decisions. Anonymous
and authenticated execution stayed denied; service-role execution remained enabled.

Validation: 29 native PostgreSQL 16.15 tests, 15 migration-order tests and four
fingerprint tests passed. A fresh disposable database applied all 250 migrations.
The retirement test exercises registered YDT scope, rejected bypasses, stale-base
rejection, replay, privileges, and migration replay. The migration-order test's
tail offset was updated after its first run exposed the newly appended entry.

The separate 19-question social screening is recorded in the private completion
package. It identifies 14 subject-scope holds and two content corrections; three
overlapping philosophy cases are retained. No source-origin declaration or human
review is inferred for those additional questions.
