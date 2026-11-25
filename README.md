# FlowPilot

A small subscription SaaS that audits a website on a schedule and suggests what to
update.

**Status:** early development. The server and client skeletons, lint, tests and CI
are in place. Features are added stage by stage.

## Requirements

- Node.js 22.13 or newer
- Docker (for local MongoDB, needed once data features land)

## Run locally

API, on http://localhost:4000:

```bash
cd server
npm install
cp .env.example .env
npm run dev
```

Web app, on http://localhost:3000 (in a second terminal):

```bash
cd client
npm install
cp .env.example .env.local
npm run dev
```

Local MongoDB:

```bash
docker run -d --name flowpilot-mongo -p 127.0.0.1:27017:27017 -v flowpilot-mongo-data:/data/db mongo:8
```

## Checks

| Folder   | Commands                         |
| -------- | -------------------------------- |
| `server` | `npm run lint`, `npm test`       |
| `client` | `npm run lint`, `npm run build`  |
