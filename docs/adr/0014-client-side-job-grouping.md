# 0014 — Client-side job grouping and per-group pagination

Date: 2026-09-24

Status: Accepted

## Decision

Keep None as the default, rendering the existing JobsTable unchanged. Add
By Company and By Score in a JobsTableView with local presentation state.
Operate on the already filtered/sorted jobs passed by App; no API or backend
changes. Pure grouping and full-group status counts live in utils/groupJobs.js.

The actual Score column currently displays job.relevance_score, not a combined
company/job score. Group and average that displayed value without introducing
a second scoring formula. Sort company groups by mean descending, with name
ties; sort score groups numerically descending. Keep unscored jobs in a distinct
last group; exclude missing values from company means. Preserve row order.

Both grouping modes reuse JobGroupTable, JobsTable and JobRow. Pagination is
local to each group: seven rows for company groups, ten for score groups.
Clamp pages when filters shrink a group. Switching grouping mode resets group
pages. Applied counts include in_process; pending includes missing status as
the existing row does; show closed counts only when nonzero. Count all group
members, not just the current page. Use unique headings for each mini table.

## Consequences

The shared row action callbacks continue to own mutations. Switching modes and
pages performs no network requests. Expanded rows retain the existing local
state semantics: leaving their table/page unmounts them. The flat table retains
its current score, row order, filtering and action behavior.
