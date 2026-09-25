# Private-repository security gates

GitHub CodeQL upload and Dependency Review are unavailable in this personal
private repository. The PR checks retain their existing context names because
the active master ruleset (21302881) requires them, but they **do not run
CodeQL or GitHub Dependency Review**. The workflow steps identify the actual
scanners. Change the ruleset and check names together in a separate,
explicitly approved operation.

- `Dependency review`: `npm ci --ignore-scripts --no-audit` validates the
  lockfile, then `npm audit --audit-level=high --include=dev` blocks known
  high/critical npm advisories across the complete dependency tree. This is
  not a PR-only dependency diff review and does not cover non-npm ecosystems.
- `CodeQL (actions)`: zizmor 1.30.1 scans local workflow definitions offline,
  fails on high-severity findings and malformed workflow collection. Existing
  first-party `actions/*` release tags are permitted; third-party actions
  require immutable commit pins.
- `CodeQL (javascript-typescript)`: Semgrep CE 1.163.0 runs the public
  `p/security-audit` ruleset against `src`, with metrics disabled. Findings
  and scanner warnings/errors fail the job. It is not equivalent to CodeQL
  cross-file analysis. `.semgrepignore` lists parser exceptions explicitly;
  revisit them when upgrading Semgrep.

No source is uploaded to GitHub code scanning or a Semgrep account. The
Semgrep job downloads public rules from the Semgrep registry; the npm job
queries the configured npm audit registry. Scheduled scans detect newly
published advisories or rule findings even without a dependency change.
