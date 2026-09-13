# 0003: Manually added jobs bypass the relevancy-score and location filters

## Status
Accepted

## Context
`GET /api/jobs` filters the feed by `minScore` and by location (India-only
toggle). A manually added job (e.g. "HP Enterprise — Agentic AI Software
Engineer") was correctly ranked low by the LLM and had a NULL location
(the manual-add form didn't collect one at the time), so it was silently
excluded from the feed even though the row existed in the database and the
stats count reflected it. The user had no way to discover the job had
"disappeared" or why.

## Decision
Any job with `SOURCE = 'manual'` is always included in `GET /api/jobs`
results, regardless of `RELEVANCY_SCORE` or `LOCATION`. The score/location
filters continue to apply strictly to `SOURCE = 'scraped'` jobs.

## Consequences
- A user who deliberately adds a job already made the relevance judgment
  themselves by choosing to add it — the automated filters exist to reduce
  noise from bulk-scraped postings, not to second-guess an intentional
  manual action.
- Manual jobs can still be sorted by relevancy score alongside scraped jobs
  (NULLS LAST); they're just never excluded from the result set entirely.
- This does not loosen filtering behavior for auto-discovered jobs.