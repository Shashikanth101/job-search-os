# 0016: Ranking is a decoupled, idempotent state machine with hard spend guards

## Status
Accepted

## Context
`BaseScraper.run()` ranked every parsed job on every cron run and overwrote stored scores. A quota
failure was swallowed per job and written as score 0 / "Ranking failed" (2,583 of 3,256 jobs). There was
no retry limit, budget cap, lock, circuit breaker or usage record, and concurrency was unbounded.

## Decision
- **Scraping never calls the LLM.** `run()` is fetch → pre-filter → upsert. New rows are inserted with
  `rank_status = 'pending'` and a NULL score. The `ON CONFLICT` path only touches title, job_type,
  description, apply_url and posted_at (never `rank_*`, `relevance_*`, `prefilter_*`, location, status).
- **State machine on `jobs.rank_status`:** `pending → ranked`; `pending/failed → failed` (unusable model
  output after in-run retries; `rank_attempts++`, `rank_next_retry_at` = base × 4^(attempts-1), default base
  60 min); `failed → ranked` on a later success; `skipped` for pre-filter rejected rows. Infrastructure errors
  (auth, quota, 429, 5xx, timeout, network, kill switch) leave the job `pending` and never write a score.
  Supporting columns: `rank_last_error`, `rank_model`, `rank_prompt_version`, `rank_input_hash` (audit only),
  `ranked_at`.
- **`rankPending({maxJobs, maxUsd, concurrency, runId, dryRun})`** selects non-rejected `pending` rows and
  `failed` rows with attempts < `RANK_MAX_ATTEMPTS` whose retry time has passed. `ranked` and `skipped` rows
  are never selected; a ranked job is re-ranked only by the explicit `npm run rank -- --rerank-version N --run`
  (rows with an older `rank_prompt_version`; manual jobs excluded).
- **Guards (env, defaults):** `RANK_MAX_JOBS_PER_RUN=200`, `LLM_DAILY_BUDGET_USD=0.50` (sum of `llm_usage`
  since local midnight, plus an in-flight allowance), `RANK_CONCURRENCY=4` (bounded worker pool),
  `RANK_MAX_ATTEMPTS=3`, `LLM_DISABLED=1` kill switch. A DB run lock (`app_locks` name `rank`, 2 h TTL)
  makes a concurrent run skip rather than queue; the cron cycle and CLI both honor it.
- **Circuit breaker:** 401/402/403, billing/quota errors, other non-retryable 4xx and config errors abort the
  run immediately; 5 consecutive failures also abort. Transient 429/5xx/timeouts retry twice with exponential
  backoff and jitter inside the run.
- **LLM client:** errors carry `status`/`kind`; calls return token usage and are logged to `llm_usage` with
  an estimated cost from `src/llm/pricing.js` (unknown models use a conservative default and log a warning).
  Ranking requests are independent (system + one user message), temperature 0, `max_tokens` from `RANK_MAX_TOKENS` (600), strict JSON
  validated in code. A native Anthropic Messages provider was added. Under test (`NODE_ENV=test` or the node
  test runner) the real client throws unless a mock (`setLlmClient` or a mocked `fetch`) is installed.
- **Entry points:** the scheduler runs scrapers then `rankPending`; `npm run rank` (dry run by default:
  counts, token/cost estimate, applicable caps; `--run`, `--limit N`); `rerank.js` and
  `retry-workday-ranking.js` are thin wrappers. `POST /api/jobs/manual` ranks synchronously through the same
  client, ledger and failure semantics (an infrastructure error leaves the job `pending`).
- **Model output stored:** `jobs.rank_archetype` (frontend|fullstack|fde_applied_ai|product_engineer|backend|
  data_ml|infra|other) and `jobs.rank_seniority_fit` (under|fit|stretch|over), migration 006. Values outside the
  enums are stored NULL and the score is still accepted. `PROMPT_VERSION` is 3 (adds the non-engineering 1-2
  rule); `RANK_MAX_TOKENS` defaults to 600 (env) and a response truncated at `max_tokens` is a retryable `failed`.
- **Anthropic specifics:** `temperature` is never sent; only `text` content blocks are parsed (leading thinking
  blocks ignored); `output_tokens` already includes thinking and is what the ledger costs. Sending
  `thinking: {type: "disabled"}` on ranking calls is opt-in via `LLM_ANTHROPIC_DISABLE_THINKING=1` until
  verified for the model. Non-2xx errors surface `error.type: error.message`; a 400 mentioning a credit
  balance is a quota error that trips the breaker.
- **Graceful shutdown:** `rankPending` releases its lock in `finally` and on SIGINT/SIGTERM/SIGHUP, only if the
  lock row is still owned by its run id. The first signal stops claiming jobs, lets in-flight calls finish
  (up to 15 s, then aborts them via an `AbortController`), writes finished results normally, logs the summary
  with `aborted: true, abortReason: "signal:<NAME>"`, releases the lock and exits 130/143/129. A second signal
  releases the lock and exits immediately. An aborted call surfaces as `LlmError` kind `aborted`: the job stays
  `pending` with no attempt counted, no error recorded and no score.
- **Stale lock recovery:** `app_locks` stores `pid` and `hostname` (migration 007). An unexpired lock is
  reclaimed only when its hostname matches this machine and its pid is dead (`process.kill(pid, 0)` → ESRCH);
  a live pid, another host, or a legacy lock without a pid is respected until its 2 h TTL expires.
- Unranked jobs have a NULL score everywhere (never 0), sort last and display as "Not ranked yet".

## Consequences
- Worst-case daily spend is bounded by the budget plus a few in-flight calls; a quota outage costs at most one
  call per run instead of one per job.
- A new posting is not scored until the ranking step of the same cron cycle (or a manual `npm run rank --run`).
- Failed rows are no longer healed by re-scraping; they retry via backoff until `RANK_MAX_ATTEMPTS`.
- Budget accounting is estimated from configured prices, not provider invoices.
