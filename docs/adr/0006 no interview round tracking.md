# 0006: Interview rounds are not individually tracked

## Status
Accepted

## Context
A job can involve multiple interview rounds (phone screen, system design,
hiring manager, etc.), each with its own outcome. A fully normalized design
would need an `INTERVIEW_ROUNDS` child table keyed off `INTERVIEWS`.

## Decision
`INTERVIEWS` stores one row per job, not one row per round. Round-level
detail (what happened in each specific round, feedback received, etc.) is
tracked manually by the user outside the system (notes, memory, or the
free-text `COMMENTS` field), not modeled as structured data.

## Consequences
- Simpler schema, no child table or round-numbering logic needed.
- Acceptable because interview volume in an active job search is low
  enough (a handful at a time) that manual tracking of round-level detail
  isn't a real burden.
- If interview volume increases substantially in the future, or the user
  wants round-level analytics (e.g. "which round do I fail most often"),
  this decision should be revisited.