# Decisions

Working notes, expanded as the project is built.

## Stack

| Choice | Why | Trade-off |
| --- | --- | --- |
| Next.js (App Router) and Tailwind | Preferred stack | Newer major version, so APIs need checking against its bundled docs |
| Express 5 with routes → services → data layers | Preferred stack, testable without a listening port | More files than a single-file server |
| JavaScript (ES modules) | Fits the short timeline and a MERN codebase | No static type checking |
| Vitest and Supertest | Fast, native ES module support | Needs a path-casing wrapper on Windows (`server/scripts/test.js`) |

## Same-origin API proxy

The browser calls `/api` on the web app's origin and Next.js rewrites it to the
Express server. Auth cookies can then stay same-origin when the two apps are on
different hosts. The trade-off is one extra network hop, and `API_URL` is read when
the client is built.

## Authentication and token rotation

- Passwords are hashed with argon2id.
- Access tokens are 15 minute JWTs (HS256, algorithm pinned), returned in the
  response body and sent as a Bearer header.
- Refresh tokens are random 32 byte values in an HttpOnly, SameSite=Strict cookie
  scoped to `/api/auth`. Only their SHA-256 hash is stored.
- Every refresh issues a new token and revokes the old one. Tokens from one login
  share a family. Presenting a revoked token revokes the whole family.
- The replacement token is written before the old one is claimed atomically, so a
  revocation that races with a rotation also covers the replacement.
- Two refreshes at the same moment would look like reuse and log the user out. The
  web app shares one refresh request per tab and uses the Web Locks API so tabs take
  turns. Browsers without Web Locks keep that risk across tabs.
- The user is loaded on each authenticated request, so disabling an account is
  immediate. The cost is one database read per request.
- Password reset tokens are hashed, expire after 30 minutes and are claimed
  atomically. A reset ends all refresh sessions.
- Email is mocked: the reset link is printed to the server log.

## Billing and webhook sync

- Billing sits behind a provider interface. The current provider is a mock that
  signs webhooks with HMAC-SHA256. Razorpay test mode is planned.
- Starting checkout grants nothing. Only a verified webhook changes a plan.
- Signatures are checked on the raw request body, before JSON parsing.
- Each event ID is stored under a unique index and marked processed only after it
  is fully applied, so a crash leaves it open for the provider's retry.
- Events older than the last applied one are ignored. Cancellation is final
  whatever order it arrives in.
- The user's plan is derived from their subscriptions rather than from one event,
  so repeated processing gives the same result.
- A newly activated subscription cancels older ones.
- A failed renewal keeps access (`past_due`) until the provider cancels. A failed
  first payment grants nothing.

## Plan limits and downgrade

Limits are enforced on the server. On a downgrade nothing is deleted: the oldest
active websites stay active up to the new limit, the rest are paused and marked
`plan_limit`, and faster schedules are slowed to the fastest one allowed. An
upgrade does not resume paused sites automatically; the owner chooses which.

## Website checks and SSRF protection

- Adding a site validates the URL, resolves the domain and makes a real request.
  A 401, 403 or 429 counts as existing, so sites that block bots can be added.
- The outbound client uses Node's `http` and `https` modules instead of axios, to
  control the DNS lookup used for the actual connection, each redirect and the
  decompressed size.
- The website limit is re-counted after inserting. Parallel requests can never
  exceed it, though in a rare race they may both be refused.

## Audit scope and scoring

- The home page and up to 5 internal pages are fetched one at a time, with at most
  10 internal links requested in total and a 90 second budget. Only a home page
  failure fails the run.
- robots.txt is applied to every request, including redirects. A 5xx robots.txt
  response blocks the audit, as RFC 9309 describes.
- Each category starts at 100 and loses the penalty of every issue found in it,
  with a floor of 0. Page issues are scaled by the share of pages affected, image
  alt text by the share of images, and broken links by the share of links checked.
- Overall score = SEO 30%, performance 25%, accessibility 20%, content 15%,
  technical 10%. Rules and penalties are in `server/src/audit/rules.js`.
- Scoring is deterministic, so a changed score means the site or its response
  changed.
- Limits: no JavaScript is executed, so client rendered sites can look thin.
  "Performance" is server response time, HTML size and compression only. PageSpeed
  Insights and Core Web Vitals were skipped, as optional.

## Background jobs and idempotency

- The `runs` collection is the source of truth. Agenda only delivers run IDs to a
  worker, so a lost or duplicated job cannot lose or duplicate results.
- A scheduler tick (every 30 seconds) turns due websites into runs. The run key is
  website ID plus scheduled time under a unique index, written before the schedule
  advances. A crash in between repeats the step with the same key.
- A worker claims a run atomically and holds a 5 minute lock. Only the lock owner
  can close the run. An expired lock lets another worker take over; such runs are
  handed out again within about 10 minutes.
- Reports are upserted by run ID, so repeating a run replaces its report.
- Temporary failures (timeouts, connection errors, 429, 5xx) are retried after 1,
  5 and 15 minutes, 4 attempts in total. Other failures end the run at once with a
  reason. Retries are driven by the tick, not by the job that failed.
- Business runs get high job priority. The scheduler applies the plan's minimum
  interval even if a stored schedule is faster.
- The first audit is queued as soon as a website is added.
- The worker runs inside the API process to fit free hosting (`RUN_WORKER`). On a
  host that sleeps when idle, jobs wait until it wakes; each overdue site then gets
  one catch-up run rather than one per missed slot.
- Likely first bottleneck at scale: audits sharing one process and a concurrency of
  3. Next step would be separate worker instances, which the claim logic supports.

## AI suggestions

- Google Gemini (free tier) behind a provider interface. The model list is set by
  `AI_MODELS`; a busy, rate limited or missing model, a timeout or an unusable
  answer moves on to the next one.
- The model receives a trimmed copy of the saved report, never raw HTML.
- The answer is requested as JSON and validated against a schema before storage.
- A suggestion is its own job, one per report under a unique index, with the same
  lock, retry and backoff rules as audits. An audit stays successful when the AI
  fails.
- Only Pro and Business reports are sent. The plan is checked again when the job
  runs.
- An owner can request suggestions for an existing report, which also restarts a
  failed one. A finished suggestion is not regenerated.
- One suggestion job runs at a time to stay within free rate limits. This is the
  first part that would slow down with many users.

## Dashboard

- Pages are client components that call the API. The access token is kept in memory
  only, and a reload restores the session from the refresh cookie.
- Pending audits and suggestions are polled every 5 seconds. Polling stops when
  nothing is pending. Push updates were not worth the extra moving parts here.
- Adding, pausing, rescheduling, deleting and disabling update the screen at once
  and roll back if the server refuses. A new website shows as pending until the
  reachability check finishes.
- Sign-in forms appear only after the app has loaded, so credentials can never be
  submitted as a plain page request.
- Checked in headless Chrome at 1280 px and 360 px. There are no automated browser
  tests in the repository.
