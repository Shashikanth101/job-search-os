# 0018: Review status model and single-shell UI

## Status
Accepted

## Context
The old dashboard (`/`) and the first review pages (`/review`, `/review/manual`) showed different, unlabeled populations:
the dashboard's "3535 not applied" counts every non-rejected job with `jobs.status = 'not_applied'` (1,098 unranked plus every
ranked job at any score), its "678 matches" is the India-only string filter plus `score >= 5 OR unranked` (111 ranked and 567
unranked/pending rows), while `/review` showed 112: ranked scraped jobs with score >= 7, all locations. Two UIs also meant
two status vocabularies and two ways to apply.

## Decision
- **Status model (unchanged storage, ADR 0009 stays authoritative):** the user-facing statuses are new, saved, applying,
  applied, skipped. `jobs.status` remains the only funnel state (applying = `in_process`, applied = `applied`; `closed` is shown
  only under All jobs). `job_triage` (migration 011) holds only `saved` / `skipped`; `new` is the absence of a row. The status is
  derived in SQL (`STATUS_SQL` in `src/review.js`), so the list, the detail and the counts cannot disagree.
- **One population, one rule:** the Jobs views show scraped jobs the model ranked plus every manual job, minus pre-filter
  rejects; the min-score filter (default 7) applies to scraped jobs only, manual jobs are always listed (a manual job may have no
  score). `GET /api/review/counts?minScore=` counts exactly that population per status (plus `all` and `manual`), so a sidebar
  count always equals the length of its list. Unranked scraped jobs (pending/failed) are not in any view; they are an Ops concern.
- **API additions (read-only except statuses and manual rows):** `GET /api/review/counts`, `GET /api/review/jobs/:id` (full
  description and application details), `origin=manual|scraped` on the list. Nothing triggers scraping or ranking.
- **UI structure:** one app shell with a left sidebar of real links (`/inbox /saved /applying /applied /skipped /all /manual
  /outreach /ops`; `/`, `/review`, `/review/manual` redirect) and `history.pushState` navigation; Express serves `index.html`
  for non-`/api` GETs. The Jobs view is a master-detail: one-line rows, a detail pane (a drawer below the `lg` breakpoint), the
  selection in the URL (`?job=ID`), keyboard j/k/a/s/x and `/` for search. "Add job" is a drawer with the manual form; manual
  jobs carry a "manual" chip and have an origin filter (the Manual sidebar item). Application details (applied date,
  follow-up, notes) live in the detail pane for applying/applied jobs; stats and follow-up reminders moved to Ops with the
  refresh status; Outreach also hosts the manual career links and uncovered-company lists.
- **Design tokens:** `frontend/src/index.css` defines one neutral palette (slate), one accent, one radius and 14px base text,
  and the shared classes `.panel .btn .btn-primary .btn-quiet .field .chip .label`. New UI uses those classes.
- **Retired:** the old dashboard job table/filters/manual-application form, the card-based review list, and the in-app resume
  generation UI (a disabled "Generate resume" placeholder remains; `POST /api/resume/generate` is untouched). The old
  `POST /api/jobs/manual` and `/api/jobs` endpoints still exist (unused by the frontend).

## Consequences
- The three earlier numbers become explainable from one definition; the dashboard-only "Not applied" stat on Ops is labeled as
  covering all open jobs including unranked.
- Resume generation has no UI until a later step re-enables it in the detail pane.

## Amendment: round 2 (counts, layout, description, grouping, archetypes, experience)
- **(Superseded by round 3 below.) Counts respected only status.** `GET /api/review/counts` took no parameters; its population is fixed at scraped score >= 7 plus all
  manual jobs (`COUNTS_MIN_SCORE`), which is the list's default view, so a count equals its list at default filters and never moves
  when a filter changes. Lowering the list's min score shows more rows than the sidebar count; that is intended. The frontend shows a
  dash (not 0) and an error banner when the counts request fails.
- **The "counts 0 / job could not be loaded" report was a stale API process**, not a code bug: the dev server (started before the
  endpoints existed) served `/api/review/refresh` but answered `/counts` and `/jobs/:id` with Express's HTML 404. Changes made so this
  fails loudly: unknown `/api` paths return a JSON 404, the frontend's error text says "HTTP 404: restart the API server", and
  `npm run dev` now runs `node --watch src/server.js`.
- **Layout:** list and detail each take half the width on wide screens; the detail pane is always open, sticky and scrolls
  independently; the first row is selected on load; below `lg` the pane is a drawer opened by a row click.
- **Detail content:** required experience chip, actions, score and reason, then the description rendered as formatted text. Stored
  descriptions are flat text (no markup, almost no newlines), so plain text is split at bullets, recognizable headings (known
  phrases ending in a colon, ALL-CAPS runs) and sentence boundaries, and rendered as React elements. HTML (if a source ever stores it)
  goes through DOMPurify with an allow-list (no script/style/iframe/handlers, only `href`, http(s)/mailto URLs) and fails closed
  (escaped) when no DOM is available. Nothing unsanitized is injected as HTML.
- **Keyboard:** ArrowUp/ArrowDown replace j/k. Details are cached in memory (200 entries) and the neighbors are prefetched, so moving
  the selection is instant; status changes and application saves update the cache.
- **Grouping:** None / Company / Score on every list view, collapsible with counts, remembered across tabs in localStorage. Grouping
  applies to the current page (25 rows); grouping by Company sorts the page query by company so a company is not split across pages.
- **Archetype filter:** multi-select (checkbox dropdown, default all) listing only archetypes present in the view, from
  `GET /api/review/facets?status&origin&minScore`; the list accepts `archetype=a,b`.
- **Seniority filter removed**, replaced by required experience in each row (`5+ yrs`, `3-5 yrs`, `4 yrs`, blank). It is derived at read
  time by `extractExperience` in `src/scrapers/pre-filter.js` (same segment/window/optional-text rules as `extractMinYears`, which now
  shares the scanner), no LLM and no schema change. Roughly two thirds of default-view rows are blank because many descriptions do
  not state years (or are cut off before the requirements).

## Amendment: round 3 (one filter builder, grouped pagination, tiers)
- **Counts and list share one filter builder** (`parseFilters` in `src/review-query.js`). The round-2 counts used a fixed score >= 7 population
  while the list used the UI's min score, so the header said Inbox 244 (min score 5) and the sidebar said 111 / 113. Now
  `GET /api/review/counts` takes the same filter parameters as the list (min score, archetype list, location group, company, search) and
  applies them to every bucket, ignoring only the status bucket and origin (they are the route). `All` is the union of the buckets, so
  Inbox <= All always, and a list total equals its sidebar count for the same filters (asserted for 12 filter sets in `tests/review.test.js`).
  `totals` in the response is the same tally with no filters, used for "N jobs of M in this bucket". The sidebar re-fetches, debounced
  (250 ms), when any filter changes; the filters live in the root component so they persist across tabs.
- **Grouped pagination is on the server** (`groupBy=none|score|company`, `pageSize` 25/50/100, default 50). Rows are ordered by group and then
  score, a page is a slice of rows, `groupCounts` carries the full size of every group, and `continued` says the first group began on the
  previous page. The client draws a header whenever the group changes and adds "(continued)" at the top of such a page. Page controls
  (previous / next / page N of M / rows per page) sit under the list in all views and the page resets when filters, grouping or size change.
- **Default grouping is Score** (10 down), persisted in localStorage (with try/catch) along with the page size.
- **Company grouping is not alphabetical:** groups are ordered by tier ascending, the group's best score descending, job count descending,
  then name (`orderCompanyGroups`). Tiers come from `src/config/company-tiers.json` (`{tier1, tier2, tier3}`, matched case-insensitively and
  alias-aware, e.g. "Anysphere (Cursor)" matches Anysphere or Cursor; unlisted = tier 3), loaded once when the review router is created at
  server start. Seed provenance: the existing priority field in `src/config/manual-links.js` notes ("Priority 1" -> tier1, "Priority 2" -> tier2,
  "Priority 3/4" -> tier3); every other target company (scraper configs, `linkedin-outreach.js`, `job_hunt_context.md`) -> tier2. Result:
  tier1 9, tier2 302, tier3 66 names. Tier 1 holds only companies without scraper coverage, so today every company with ranked jobs is
  tier 2 and ordering is effectively best score, then count, then name until the file is edited.
- **Ops shows company counts** from `GET /api/review/companies`: distinct companies with at least one ranked job, and distinct companies overall.

