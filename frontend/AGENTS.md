> Supplements the root AGENTS.md (Node version, ES modules, provider-call 
> rules still apply). This file governs frontend/src/ structure specifically.

## Frontend structure (frontend/src/)

- `App.jsx` is composition-only: local UI state (active tab, filters, form-open
  flags), hook calls, thin glue functions that adapt form events into hook
  calls, and a `return` that wires components together. It must never contain
  raw `fetch()` calls or a section's full JSX markup.

- `hooks/` — one hook per data resource or per cohesive action set.
  - Read hooks (`useJobs`, `useStats`, `useManualLinks`, `useOutreach`) own
    fetching + loading/error state for one resource and expose a `refetchX`
    function. They do not know about other hooks.
  - Action hooks (`useApplicationActions`) own POST/PATCH/mutation logic and
    take callbacks (e.g. `setJobs`, `refetchStats`) as dependencies instead of
    owning that state themselves — keeps them reusable and testable in
    isolation.
  - A hook with a raw `fetch()` inside a component instead of a hook is a
    refactor smell — pull it out immediately, don't let it accumulate.

- `components/ui/` — generic, domain-agnostic primitives only (Button,
  FormField, ErrorBanner, ToggleSwitch, SegmentedControl, ScoreBadge,
  LoadingSkeletonCards). If a component needs to know what a "job" or an
  "application" is, it does not belong here.

- `components/applications/` and `components/outreach/` (and any new domain
  folder) — one component per section of the UI, each doing exactly one job.
  A component that both fetches data and renders more than one unrelated
  section needs to be split.

- `components/layout/` — page-level chrome (header, tab nav) with no
  domain-fetching logic.

- `utils/` — pure functions only (date formatting, constants). No React,
  no fetch.

## Conventions to hold the line on

- No file over ~150–200 lines. If a component grows past that, split it
  before adding more to it — don't wait for a dedicated refactor pass.
- Every component's props get a JSDoc block describing their shape, even
  for "obvious" props — this is how a fresh session (yours or an agent's)
  understands a component without reading its parent.
- Preserve existing Tailwind class strings exactly when moving JSX into a
  new component. Don't "clean up" or unify near-duplicate styles
  (e.g. two visually-different form inputs) as a side effect of an
  unrelated change — that's a visual behavior change in disguise, do it as
  its own explicit step.
- State lives at the lowest common ancestor that actually needs it. Before
  lifting a new piece of state into App.jsx, check whether it's really
  needed by more than one section — if not, it belongs in the component
  that uses it.
- ES modules only (import/export), never require — this repo runs on
  Node 20 LTS.
- Frontend never calls provider/LLM APIs directly — only this app's own
  `/api/*` backend endpoints.
- When adding a new fetched resource, add a new hook rather than extending
  an existing one — one hook, one resource (or one action group).