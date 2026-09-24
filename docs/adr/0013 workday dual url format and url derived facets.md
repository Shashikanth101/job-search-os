# 0010: Workday scraper supports two URL formats and extracts facets directly from source URLs

## Status
Accepted

## Context
Workday-hosted career sites don't follow one consistent URL pattern. Most 
companies use `{tenant}.wd{N}.myworkdayjobs.com/{siteName}`, but at least 
one target company (Wells Fargo) uses an alternate format: 
`wd{N}.myworkdaysite.com/recruiting/{tenant}/{siteName}`. Additionally, 
Workday's internal job-search API accepts optional location/department 
facets as GUID-style IDs, which are already embedded in the career page 
URLs each company naturally produces (e.g. via their own site's location/ 
department filter UI) — but these values are long, opaque, and highly 
error-prone to transcribe by hand.

## Decision
- The Workday scraper (`src/scrapers/workday.js`) supports both known URL 
  formats, resolving either to the same underlying tenant API.
- Facets (locationCountry, locations, jobFamilyGroup, Business_Area, etc.) 
  are parsed programmatically from each company's full source URL rather 
  than manually re-typed into scraper config. This avoids transcription 
  errors on GUID-style facet values.
- When a company's URL has no useful facets, the scraper fetches 
  unfiltered and relies entirely on the existing pre-filter.js for 
  eligibility — this is an accepted fallback, not a failure state.

## Consequences
- Applying facets where available meaningfully reduces fetch/processing 
  volume (e.g. Cisco: 1,357 unfiltered postings vs. 194 with India + 
  Engineering facets applied) — lower LLM ranking cost, faster scraper 
  runs.
- A new target company on Workday requires only its real career-page URL 
  (with whatever filters the user naturally applies while browsing) — no 
  manual facet-ID lookup or Workday API knowledge needed to onboard it.
- Facet meaning is company-specific and not standardized across Workday 
  tenants (the same facet key can carry different semantics per company) — 
  this is treated as opaque, pass-through configuration per company, not 
  a shared schema.
- If Workday's URL format changes again in the future, both current 
  formats need to be checked against real career pages before assuming 
  either still works — same "diagnose before fixing" principle applied 
  throughout this project.