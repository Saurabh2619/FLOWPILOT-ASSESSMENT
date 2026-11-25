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
