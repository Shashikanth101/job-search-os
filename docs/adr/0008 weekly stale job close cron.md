# 0008: Stale "applied" jobs are auto-closed by a weekly cron, not computed on-the-fly

## Status
Accepted

## Context
A job left in `STATUS = 'applied'` for 2–3 months with no update almost
always means a silent rejection. This needs to eventually flip to
`STATUS = 'closed'` so the dashboard's active-pipeline view stays accurate.
Two implementation options existed: (a) compute this on-the-fly in every
read query (`WHERE status = 'applied' AND applied_at < now() - 90 days`
treated as closed without ever writing it), or (b) a scheduled job that
writes the status change once.

## Decision
A `node-cron` job runs once a week (not daily — staleness doesn't need
same-day precision) alongside the existing twice-daily scraper cron, and
updates `JOBS.STATUS = 'closed'` for any row where `STATUS = 'applied'`
and `APPLIED_AT` is older than the threshold.

## Consequences
- The database reflects true state at all times — any query or stats
  calculation can trust `STATUS` directly without re-deriving staleness
  logic in every read path.
- Slight lag (up to a week) between a job technically becoming "stale" and
  the status actually flipping — acceptable given the use case doesn't
  need real-time precision.
- One more scheduled job to maintain, but it reuses the existing cron
  infrastructure already in place for scraping.