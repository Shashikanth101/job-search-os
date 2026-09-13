# 0007: JOBS.STATUS is a coarse funnel state; INTERVIEWS owns granular stage detail

## Status
Accepted

## Context
The original design had overlapping status enums on both `JOBS`
(`pending | applied | short-listed | rejected`) and `INTERVIEWS`
(`shortlisted | ongoing | rejected | offer-received | accepted`). This
creates two places that can each claim a "rejected" or "shortlisted" state
for the same underlying application, with no guarantee they stay in sync
(e.g. a job marked `short-listed` with no corresponding interview row yet,
or an interview marked `rejected` while the job still shows `applied`).

## Decision
`JOBS.STATUS` is narrowed to a coarse funnel state only:
`not_applied | applied | in_process | closed`. All granular interview-stage
detail (shortlisted, ongoing, offer received, accepted, rejected at a
specific stage) lives exclusively in `INTERVIEWS.STATUS`.

## Consequences
- Single source of truth per concern: `JOBS.STATUS` answers "where is this
  application in the broad funnel," `INTERVIEWS.STATUS` answers "what's
  the detailed outcome of the interview process," and they never compete
  to represent the same fact.
- `JOBS.STATUS = 'closed'` is a terminal state reachable two ways: an
  explicit rejection/withdrawal, or automatic staleness closure (see
  ADR 0008).
- UI or stats logic that wants a detailed pipeline view must join to
  `INTERVIEWS` rather than reading `JOBS.STATUS` alone.