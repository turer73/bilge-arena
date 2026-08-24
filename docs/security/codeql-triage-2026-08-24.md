# CodeQL triage — 2026-08-24

The first full CodeQL scan exposed 33 findings in previously unscanned code. This
record separates remediated application/security defects from expected data flows
in maintainer-only scripts. Dismissal is allowed only for the exact alert instances
listed below; the queries remain enabled for future code.

## Remediated

- `js/request-forgery` (alerts 12–13): OG font requests now use a fixed HTTPS
  origin instead of the request `Host` value.
- `js/unvalidated-dynamic-method-call` (alert 11): admin setting validation uses
  an explicit allowlist branch and rejects non-string/unknown keys.
- `js/incomplete-sanitization` (alerts 14–15): SQL `LIKE` escaping now escapes
  the escape character before `%` and `_`, with regression coverage.
- `js/file-system-race` (alerts 17–19): outputs use exclusive file creation or
  one opened descriptor; generated media sizes are calculated from the buffers
  that are uploaded.
- `actions/missing-workflow-permissions` (alerts 1–9): workflows declare
  read-only repository contents permission.
- `actions/unpinned-tag` (alert 10): Codecov is pinned to the verified v7 commit.
- `js/regex/missing-regexp-anchor` (alert 29): the test asserts an exact URL
  substring instead of applying an unsafe host-shaped regular expression.
- `js/identity-replacement` (alert 16): the no-op replacement was removed.
- `js/log-injection` (alert 33): downloaded error messages are reduced to one
  log line before output.

## Expected, narrowly scoped data flows

Alerts 20–28 (`js/file-access-to-http`) cover explicit operator workflows that
read reviewed migration/question material and send it to a fixed Supabase,
DeepSeek, or Gemini HTTPS endpoint. They are CLI scripts, are not reachable from
the web application, require operator-injected credentials, and intentionally
transfer the selected file content. These instances may be dismissed as
`won't fix`; new instances must be reviewed independently.

Alerts 30–32 (`js/http-to-file-access`) cover explicit CLI generation/judging
workflows that persist provider output as staging artifacts. They are not web
routes. Output is constrained to repository-local paths or an explicit operator
path; coach staging now opens the destination once with exclusive creation for a
new run. These instances may be dismissed as `won't fix`; new instances must be
reviewed independently.

Dismissal comments must link to this record and must not describe the real data
flow as a false positive.
