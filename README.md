# FlowPilot

A small subscription SaaS that audits a website on a schedule and tells the owner
what to update.

**Live app:** https://flowpilot-assessment.vercel.app  
**API health:** https://flowpilot-api-wx5l.onrender.com/api/health

## Try it

The API runs on a free host that sleeps when idle, so the first request can take
about a minute.

| Account | Email | Password |
| --- | --- | --- |
| Demo user (Pro plan, two audited websites) | `demo@example.com` | `FlowDemo-2026` |
| Administrator | Sent with the submission, not published here | |

You can also sign up with any email address. No email is sent or verified.

**Test payment:** open Billing, choose a plan and press "Pay successfully" or
"Simulate failed payment". Billing is a mock gateway, so no card is needed and no
money moves.

Suggested walk-through:

1. Sign up. The account starts on Free: one website, daily audits.
2. Add a real website. A fake domain is rejected with a reason.
3. Wait about a minute and open the website to see its report.
4. Upgrade to Pro in Billing.
5. Press "Generate suggestions" on the report.
6. Cancel the subscription. Extra websites are paused, not deleted.

Password reset links are not emailed. They are written to the API server log.

## Features

- Sign up, login, rotating refresh tokens, password reset, user and admin roles
- Free, Pro and Business plans with limits enforced on the server
- Signed billing webhooks that tolerate repeats and wrong order
- Website checks with protection against server-side request forgery
- Audits of the home page and up to five more pages, scored from 0 to 100
- Scheduled background runs with locking, retries and history
- AI suggestions from the saved report (Pro and Business)
- Dashboard that works on mobile, and an admin panel

## Structure

```
client/                Next.js web app; /api is forwarded to the server
server/src/
  routes/              HTTP and input validation
  services/            business rules
  models/              Mongoose schemas
  audit/               crawler, rules and scoring
  jobs/                background worker
  lib/net/             safe outbound requests
  providers/           billing, AI and email
server/tests/          API and unit tests
```

## Run locally

You need Node.js 22.13 or newer and Docker.

### 1. Database

```bash
docker run -d --name flowpilot-mongo -p 127.0.0.1:27017:27017 -v flowpilot-mongo-data:/data/db mongo:8
```

### 2. API on http://localhost:4000

```bash
cd server
npm install
cp .env.example .env
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

Put that value in `.env` as `JWT_ACCESS_SECRET`. For AI suggestions also set
`AI_API_KEY` to a free key from Google AI Studio. Then:

```bash
npm run dev
```

### 3. Web app on http://localhost:3000

In a second terminal:

```bash
cd client
npm install
cp .env.example .env.local
npm run dev
```

### 4. Administrator (optional)

From `server`, in bash:

```bash
ADMIN_EMAIL=admin@example.com ADMIN_PASSWORD=choose-a-password npm run create-admin
```

In PowerShell:

```powershell
$env:ADMIN_EMAIL="admin@example.com"; $env:ADMIN_PASSWORD="choose-a-password"; npm run create-admin
```

## Settings

| Variable (server) | Purpose | Default |
| --- | --- | --- |
| `JWT_ACCESS_SECRET` | Signs access tokens, 32 characters or more | required |
| `MONGODB_URI` | Database | local MongoDB |
| `APP_URL` | Web app address, used in checkout and reset links | `http://localhost:3000` |
| `CORS_ORIGINS` | Allowed browser origins | `http://localhost:3000` |
| `AI_API_KEY`, `AI_MODELS` | Gemini key and models, tried in order | no key |
| `BILLING_WEBHOOK_SECRET` | Signs mock webhooks | random at start |
| `RAZORPAY_*` | Five settings that switch billing to Razorpay, see DECISIONS.md | unset (mock) |
| `TRUST_PROXY` | Number of proxies in front of the API | `0` |
| `RUN_WORKER` | Set `false` to run without background jobs | `true` |

The web app has one setting, `API_URL`, read when it is built. All server settings
are listed in `server/.env.example`.

## Checks

| Folder | Commands |
| --- | --- |
| `server` | `npm run lint`, `npm test` (needs MongoDB running) |
| `client` | `npm run lint`, `npm run build` |

GitHub Actions runs lint and tests on every push, and builds the web app.

## More

- [DECISIONS.md](DECISIONS.md): choices, trade-offs, scoring and scaling
- [SECURITY.md](SECURITY.md): measures and known gaps
