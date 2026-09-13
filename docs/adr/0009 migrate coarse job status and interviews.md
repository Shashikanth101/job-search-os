# 0009: Migrate to coarse JOBS.STATUS, build INTERVIEWS table, retire applications.status

## Status
Accepted

## Context
ADR 0007 specified a coarse `JOBS.STATUS` (`not_applied | applied | in_process 
| closed`) with granular interview detail owned exclusively by a separate 
`INTERVIEWS` table. In practice, the live schema had drifted from this 
design without either party noticing: `jobs.status` didn't exist as a 
column at all, and the actual status tracking lived in 
`applications.status` with six values (`saved, applied, interviewing, 
rejected, offer, followed_up`) — a granular, ungoverned enum sitting on 
the wrong table, with no `INTERVIEWS` table to hand detail off to.

This was discovered incidentally while redesigning the jobs feed UI, when 
the new compact table needed a status dropdown and the "coarse funnel" 
design from ADR 0007 didn't match what the API actually returned.

## Decision
1. Add `jobs.status` with the original coarse 4-value constraint from 
   ADR 0007.
2. Create the `INTERVIEWS` table as originally designed (one row per job, 
   per ADR 0006 — no round-level tracking).
3. Migrate existing `applications.status` values to the new model:
   - `saved` -> `not_applied`
   - `applied` -> `applied`
   - `followed_up` -> `applied` (follow-up timing already tracked via a 
     separate due-date field; no data loss)
   - `interviewing` -> `in_process`, plus a new `interviews` row with 
     `status = 'ongoing'`
   - `offer` -> `closed`, plus a new `interviews` row with 
     `status = 'offer-received'`
   - `rejected` -> `closed`, with **no** `interviews` row created — assumed 
     to represent silent application rejections with no actual interview, 
     since the legacy data can't distinguish the two cases and the actual 
     live data confirmed this assumption was safe (zero rejected rows 
     existed at migration time)
4. `applications.status` is retired from active use: no runtime code reads 
   or writes it going forward. The column is **not dropped** from the 
   schema (no destructive migration), since the one-time migration script 
   itself still needs to read historical values, and dropping it added 
   risk with no real benefit.
5. Stats counts and follow-up reminder logic, which previously read 
   `applications.status`, were updated to read `jobs.status` exclusively — 
   this was a real bug introduced mid-migration (both fields existed 
   simultaneously and silently diverged) and had to be fixed before this 
   ADR could be considered resolved.
6. A parallel `resume_path` duplication was discovered and resolved the 
   same way: `applications.resume_path` (manually editable, unused by any 
   serving route) was removed from the UI entirely in favor of 
   `jobs.resume_path` (the real, auto-populated path used by resume 
   generation and viewing).

## Consequences
- `jobs.status` is now the single, sole source of truth for application 
  funnel state, matching the original ADR 0007 intent.
- `INTERVIEWS` exists and is populated for jobs migrated from 
  `interviewing`/`offer`, but has no dedicated UI yet — it's currently 
  populated by migration only, not by any user-facing flow. Building that 
  UI (viewing/editing interview records, creating new ones as jobs move to 
  `in_process`) is separate future work.
- The "silent rejection" assumption for legacy `rejected` rows means any 
  jobs that genuinely did have an interview before being rejected, prior 
  to this migration, have no `INTERVIEWS` record. This was accepted as a 
  reasonable tradeoff given zero rejected rows existed in the live data at 
  migration time — the assumption was effectively untested in practice but 
  carried no real risk.
- This migration surfaced a broader lesson: a schema decision documented in 
  an ADR is not guaranteed to reflect what the running code actually does. 
  Periodic reconciliation between ADRs and live schema (e.g. before major 
  UI work that depends on a documented-but-unverified data model) would 
  have caught this drift earlier.