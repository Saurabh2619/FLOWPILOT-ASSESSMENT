# Decisions

## Built and skipped

| Area | Built | Skipped or simplified, and why |
| --- | --- | --- |
| Accounts | Sign up, login, rotation, logout, reset, roles, admin disable | Email verification and MFA: outside the brief |
| Billing | Provider interface, mock checkout, signed webhooks, limits, downgrade, Razorpay provider (off, not run with real keys) | Live gateway connection: see "Mocked and changed" |
| Audit | Home page and up to 5 pages, all listed checks, scoring | PageSpeed and Core Web Vitals: optional. No JavaScript rendering: too heavy for a free host |
| Jobs | Schedules, run keys, locks, backoff, history, priority | Separate worker service: free hosting |
| AI | Gemini with model fallback, schema check, separate retries | Regenerating a finished suggestion |
| Web app | All listed screens, mobile layout, optimistic updates | Automated browser tests: time |
| Delivery | Vercel, Render, Atlas, CI for lint and tests | Uptime pings |

## Mocked and changed

| Item | What | Why | Trade-off |
| --- | --- | --- | --- |
| Billing | Mock gateway instead of Razorpay test mode | Opening the merchant account required a PAN | Scores below a real gateway; checkout is simulated |
| Email | Reset links written to the server log | No free sender set up | Reviewers cannot receive a reset link |
| HTTP client | Node `http`/`https` instead of axios | Control of DNS, redirects and size for SSRF safety | More code to maintain |

## Three hardest trade-offs

### 1. Own run records instead of trusting the job library

Agenda can lock jobs, but a job can still be delivered twice or lost between steps.
The `runs` collection holds the state, the unique run key and the lock, and Agenda
only delivers IDs. This makes duplicates and crash recovery testable without the
queue. The cost is extra code, a delay of up to 30 seconds before a due run starts,
and about 10 minutes before a run from a dead worker is handed out again.

### 2. Strict refresh token reuse detection

Revoking the whole token family on reuse limits the damage from a stolen cookie.
It also punishes an honest client that refreshes twice at once, for example from two
tabs. The server stays strict, and the web app serialises refreshes with a shared
promise and the Web Locks API. Browsers without Web Locks can still be logged out.

### 3. Background jobs inside the API process

One process fits the free plan and is simple to deploy. The cost is that audits
compete with API requests, and nothing runs while the host sleeps. A catch-up run on
wake keeps history honest without creating a flood of missed runs. The claim logic
already allows several workers, so splitting them out needs no data change.

## Scaling to 10,000 users

These are estimates, not load tests. Assume 80% Free with one daily site, 15% Pro
with three hourly sites and 5% Business with ten sites every 15 minutes. That is
about 600,000 audits a day, or 7 a second.

1. **First bottleneck: audit workers.** One process runs 3 audits at a time. At
   about 15 to 40 seconds each, that is under 20,000 a day. Meeting the load needs
   100 to 300 audits in flight: separate worker services, higher concurrency, and
   limits per target host.
2. **Scheduler.** It takes at most 200 due websites every 30 seconds, under 580,000
   a day. It needs batching until nothing is due, or partitioning by website ID.
3. **AI.** One suggestion job at a time on a free tier cannot keep up. It needs a
   paid quota, and a new suggestion only when the report has changed.
4. **Storage.** Reports would pass the 512 MB free database within hours. It needs a
   paid cluster, retention rules and summaries for old history.
5. **API.** Rate limit counters need a shared store, and website list queries need
   the latest score stored on the website.

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

- Billing sits behind a provider interface. The provider in use is a mock that
  signs webhooks with HMAC-SHA256. Razorpay test mode was not connected, because
  opening the merchant account required a PAN. See "Razorpay provider" below.
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

## Razorpay provider

`server/src/providers/billing/razorpay.js` creates and cancels subscriptions,
verifies webhook signatures and maps Razorpay events to the four internal ones. It
was written from Razorpay's documentation and is tested against simulated
responses only. It has never called Razorpay.

It is off by default. To try it:

1. In Razorpay test mode, create monthly plans matching the prices on the billing
   screen.
2. Set `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`,
   `RAZORPAY_PLAN_PRO` and `RAZORPAY_PLAN_BUSINESS`. With all five the app uses
   Razorpay, with none the mock, and with only some it refuses to start.
3. Add a webhook for `<API address>/api/webhooks/billing` with the same secret and
   the subscription events.
4. Make a test payment and check the plan changes.

Expected follow-up work:

- Checkout opens Razorpay's hosted page, which does not send the user back to the
  app.
- After cancelling, the plan changes when the webhook arrives, so the billing screen
  needs to refresh or poll.
- `subscription.halted` is treated like a failed renewal, so access continues until
  a cancellation.
- Subscriptions are created for 120 monthly cycles.

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
- Scaling limits are described under "Scaling to 10,000 users".

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

## Deployment

- Web app on Vercel (`client`, `API_URL` set to the API), API on Render's free plan
  in Singapore (`server`), database on MongoDB Atlas M0 in Mumbai.
- The browser only talks to the Vercel origin, which forwards `/api` to Render.
- `TRUST_PROXY` is 3 on Render. With 1, rate limits were keyed on Render's internal
  proxy addresses. With 3, a direct request is keyed on the caller's address and a
  forged `X-Forwarded-For` header is ignored. This was checked on the live API.
- The free API instance sleeps when idle. Scheduled audits wait until it wakes.
- Both hosts deploy automatically when `main` is pushed. The deploy does not wait
  for CI.
