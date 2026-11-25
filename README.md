# FlowPilot

A small subscription SaaS that audits a website on a schedule and suggests what to
update.

**Status:** in development. Authentication, roles, mock billing and website
management work in the API.
Website audits, scheduled jobs, AI suggestions and the dashboard are not built yet.

## Requirements

- Node.js 22.13 or newer
- Docker (for local MongoDB)

## Run locally

API, on http://localhost:4000:

```bash
cd server
npm install
cp .env.example .env   # then set JWT_ACCESS_SECRET (see the comment in the file)
npm run dev
```

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

## Checks

| Folder   | Commands                         |
| -------- | -------------------------------- |
| `server` | `npm run lint`, `npm test`       |
| `client` | `npm run lint`, `npm run build`  |
