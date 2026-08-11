# Curated Coach Pilot

This directory implements the accepted 20-question, staging-only pilot. The
pipeline deliberately separates database reads, model generation, human review,
and governed publication.

1. Run `candidate-export.sql` in the production SQL editor as a read-only query
   and export JSON or CSV. The result contains identifiers and dimensions only;
   it contains no question text, option text, solution, or answer key.
2. Build the deterministic manifest:

   `node database/discover-coach-eligible.mjs --input <candidate-export> --output <manifest.json>`

   This writes the manifest, its SHA-256 sidecar, a review template, and a
   manifest-bound read-only source export query.
3. Outside Codex, rotate/inject `DEEPSEEK_API_KEY` into a narrow executor. Run
   the generated source export query and export its result as JSON. Do not paste
   that file, its question content, or the key into Codex or shell history.
4. In that executor, validate inputs first with `--dry-run`, then generate the
   staging JSONL. `database/generate-coach-hints.mjs` has no Supabase dependency
   or database write path. Only after all 20 records validate, build a review
   template cryptographically bound to those exact staging records:

   `node database/build-coach-review-template.mjs --manifest <manifest.json> --source <source.json> --staging <staging.jsonl> --output <review.json>`

5. A subject curator and an independent contract/security reviewer complete that
   staging-bound review template. Validate the source, staging, and approvals together:

   `node database/validate-coach-pilot.mjs --manifest <manifest.json> --source <source.json> --staging <staging.jsonl> --review <completed-review.json>`

6. Only an accepted pilot may be converted to migration 106 governed revision
   payloads. Preparation, stage-one review, stage-two independent review, and
   publication remain separate service-only operations. Direct updates to
   `questions.content` are forbidden.

The production runtime flag `COACH_AI_ENABLED` remains off; this pilot creates
curated static content, not runtime model access.
