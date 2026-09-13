# 0002: Company and job relevancy scores are computed fully independently

## Status
Accepted

## Context
Since the final displayed score averages a company-level and a job-level
score (see ADR 0001), the two LLM scoring calls could theoretically share
context — e.g. passing the company's existing relevancy score into the
prompt that scores an individual job at that company.

## Decision
The Job Relevancy Scorer never receives the company's relevancy score (or
any signal derived from it) as input. Company scoring and job scoring run
as two completely separate LLM calls with no shared context between them.

## Consequences
- Avoids a halo effect where a highly-rated company causes individual roles
  to be scored more generously than their actual fit warrants (and the
  inverse: a low company score dragging down an otherwise strong role fit).
- The two scores remain genuinely independent signals, which is what makes
  averaging them meaningful in the first place — averaging two correlated
  signals would just reproduce one of them.
- Slightly more LLM calls than a shared-context approach would need, but
  the volume is low enough (batched company scoring done once, job scoring
  batched per scraper run) that this isn't a meaningful cost concern.