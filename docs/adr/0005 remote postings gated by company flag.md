# 0005: Ambiguous "Remote" postings are included only via a company-level flag

## Status
Accepted

## Context
Job postings sometimes list "Remote" with no country specified. This is
ambiguous — it could mean remote-within-India, remote-from-anywhere, or
remote-within-the-hiring-country only. A single posting doesn't reliably
indicate a company's actual remote-hiring policy for India specifically.

## Decision
Add `COMPANIES.HIRES_REMOTE_IN_INDIA: boolean` (manually set, default
false). An ambiguous "Remote" job (no resolvable country) is included in
the location-filtered feed only if its parent company has this flag set to
true. The flag is never inferred automatically from a job posting — it's
set deliberately as the user learns a company's actual policy.

## Consequences
- Avoids false positives from one-off "Remote" postings that don't
  actually apply to India-based candidates.
- Requires manual upkeep: the flag has to be set per company as the user
  discovers the policy (e.g. through research, a job description that
  does specify India, or personal knowledge).
- Companies default to excluded for ambiguous remote postings until
  explicitly flagged, which is the safer default (avoids noise) at the
  cost of possibly missing a real match until the flag is set.