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
