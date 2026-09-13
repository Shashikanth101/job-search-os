# 0004: Pure-code pre-filter runs before any LLM relevancy scoring

## Status
Accepted

## Context
Scoring every scraped posting from every target company with an LLM call
is unnecessary cost and latency. Most postings can be classified as
relevant/irrelevant by department using title keywords alone (e.g. "Sales
Development Representative" or "Site Reliability Engineer" don't require an
LLM to reject).

## Decision
A pure-code keyword allowlist/denylist runs on the job title before any LLM
call:
- Denylist match (Sales, Customer Success, Data Engineer, DevOps, SRE,
  Cloud Infra, Mobile-only, QA, Marketing, Recruiter, etc.) → reject
  immediately, no LLM call.
- Allowlist match (Frontend Engineer, Full Stack, SDE 2/3, AI Engineer, AI
  Agents Engineer, Harness Engineer, Forward Deployed Engineer, etc.) →
  proceed to Job Relevancy Scoring (still needs an LLM score for fit
  quality, just skips the department-ambiguity question).
- No match on either list → batched to the LLM (grouped by company) for a
  combined department + fit judgment.

A hard location filter also runs at this stage: job must resolve to India
or one of {Singapore, UAE, Netherlands, UK}. Ambiguous "Remote" postings
(no country specified) are included only if the parent company has
`HIRES_REMOTE_IN_INDIA = true` (see ADR 0005).

## Consequences
- LLM calls scale with genuine title ambiguity, not with total scraped
  volume — most postings resolve in code with zero cost.
- The allowlist/denylist will need periodic maintenance as new target role
  titles or edge-case department names show up (e.g. "Member of Technical
  Staff" gives no signal and always falls to the ambiguous bucket).
- Department classification accuracy depends on keyword list quality; this
  is an accepted tradeoff for the cost/latency savings.