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
- Trade-off: two browser tabs refreshing at the same moment look like reuse and log
  the user out. The web app must send one refresh request at a time.
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
