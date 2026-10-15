# Revision-bound Fen quality rollout

The default publication policy remains `question-quality@2`. The new audit code
emits `question-quality@5`; it must never be relabeled as @2 to satisfy a gate.
The new migration adds an initially empty, DB-owner-only, append-only binding
table. A binding applies only to an exact unpublished LGS Fen revision, content
hash and APPROVED decision under @5, while the enforced global policy remains @2.
The paid v7 executions remain @4. A separately recorded offline replay under @5
rechecks all raw outputs with the compact-answer fix; it does not claim a new
model run. Both execution/decision policies and code commits are recorded.

The existing source readiness predicate, publisher decision lock and table
trigger all use the same effective-policy resolver. Missing/downgraded/replaced
bound decisions fail closed; they cannot fall back to an old @2 approval.
Binding and publication also require all five successful raw agents (three blind,
one adversarial, one verifier) with exact revision/hash/run, provider/model/prompt
and generation configuration. Missing, malformed, duplicate or changed rows close
the gate. Publication takes share locks on these rows through the projection write.
Changing the global policy invalidates the binding and requires that new policy.
Binding insertion shares the revision and runtime locks used by publication;
application roles cannot insert, modify or delete bindings or invoke helpers.

Benchmark/evidence paths and hashes are operator receipts, not files retrieved
by PostgreSQL and not proof of independent review. Deployment inserts no binding,
decision, source acceptance or question. Source, outcome/year and actor gates
remain unchanged; all releases still use the normal governance RPCs.

The admin validation queue defaults to the live global policy (explicit version
queries still work). Per-revision model reports use the bound policy/run where
present (original execution @4 and derived decision @5 remain distinguishable),
and parse historical prompts using their stored contracts. They do not
silently invalidate old @2 evidence when the local audit default moves to @5.
Missing binding-table errors alone support deploy-before-migration reads; other
policy read failures close with 503. A single Gemini cohort remains 1/5 models,
not five independent reviewers.

## Release sequence

1. Freeze the exact model/prompt/config, controls and revision hashes before
   inference. Preserve earlier failed experiments. Promote only the matching run.
2. Obtain explicit accountable owner source/year acceptance for the actual
   review packet. This does not become independent human expert review.
3. Pass local/native tests and required CI; merge and verify deployment.
4. Apply the migration; read back function bodies, ACLs and the unchanged runtime.
5. Re-read exact revisions, source fingerprints and old published pointers.
   Persist genuine @4 audit rows and exact replayed @5 decisions; then bind them.
   Every preregistered release condition needs exactly one matching passed check;
   per-question checks are retained separately, not substituted for that coverage.
6. Rehearse normal source acceptance and publication in a rollback transaction,
   including deferred constraints, old revisions, mappings and learner history.
7. Execute the same checked transaction, read back all 28 targets, and compare
   unrelated policy state and historical rows. No direct content overwrite.

No new paid model call is part of this rollout. The Fen v7 experiment used 132
controls from ten correlated known families, not an independent conceptual gold
set, and 28 target revisions. Its passing benchmark is not curriculum acceptance
or learner calibration. Preparation use is not an official 2027 exam certificate.

## Tests and rollback

`revision-bound-fen-quality-policy.test.mjs` uses a disposable native PostgreSQL
cluster and the real publisher/readiness/validation trigger. Report/actor/RBAC
fixture seams are explicit; it is not the entire historical migration chain.
CI requires native PostgreSQL and must not silently skip this test.

Before binding, the empty-table migration leaves old policy behavior intact.
After publication, do not restore an old pointer or delete history. A defective
item is quarantined through normal governance and gets a new corrected revision.
A policy problem requires a reviewed forward migration (or a deliberate global
policy transition with its broader impact understood), not an application-role
DELETE of bindings or disabling the publication gate.
