# FlowPilot

A small subscription SaaS that audits a website on a schedule and suggests what to
update.

**Status:** in development. Authentication, roles, mock billing, website
management, audits and scheduled background runs work in the API.
AI suggestions work in the API when `AI_API_KEY` (a free Gemini key) is set.
The dashboard is not built yet.

## Requirements

- Node.js 22.13 or newer
- Docker (for local MongoDB)

## Run locally

API, on http://localhost:4000:

```bash
cd server
npm install
cp .env.example .env
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

Put that value in `.env` as `JWT_ACCESS_SECRET` (at least 32 characters), then run
`npm run dev`.

Web app, on http://localhost:3000 (in a second terminal):

```bash
cd client
npm install
cp .env.example .env.local
npm run dev
```

Create an admin account with `ADMIN_EMAIL=... ADMIN_PASSWORD=... npm run create-admin`
from `server`. Server tests also need MongoDB running.

Local MongoDB (start this first):

```bash
docker run -d --name flowpilot-mongo -p 127.0.0.1:27017:27017 -v flowpilot-mongo-data:/data/db mongo:8
```

AI suggestions need `AI_API_KEY` in `server/.env`, from Google AI Studio. Without
it audits still work and suggestions are reported as not configured.

## Checks

| Folder   | Commands                         |
| -------- | -------------------------------- |
| `server` | `npm run lint`, `npm test`       |
| `client` | `npm run lint`, `npm run build`  |
