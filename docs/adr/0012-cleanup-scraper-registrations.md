# 0012 — Cleanup ATS registrations and discovery link

Date: 2026-09-24

Status: Accepted

## Decision

- Register DexCare on Lever as `dexcarehealth`.
- Register Hebbia on Ashby as `hebbia-ai`.
- Register Gamma on Ashby as `gamma`, preserving its supplied `departmentId`
  as an optional query parameter on the public posting API request.
- Leave Canonical's existing Greenhouse registration unfiltered. The current
  Greenhouse scraper has no department filter, and the public board API pattern
  used here does not provide a validated department-scoping contract.
- Add the Lightspeed Venture Partners portfolio board to manual discovery links.

## Gamma filter finding

The public Ashby posting endpoint returned 26 Gamma jobs both with and without
`departmentId=3e8c857e-1085-4c45-86f5-8d192d398ac2`. The parameter is retained
for traceability and future API support, but it does not narrow the current
public API response. Gamma therefore still relies on `pre-filter.js`.

Ashby's public API documentation lists the public job-board endpoint and
`includeCompensation` query option; it does not document department filtering.
