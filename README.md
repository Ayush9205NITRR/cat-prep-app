# CAT Prep — mock analysis from Claude

Upload a CAT mock report (PDF, photos, screenshots) to Claude and say **“Analyse my mock”**. Claude reads every
question and sends it to this app through MCP. The mock appears in the app, where you can correct any cell, review
wrong answers with two taps, and re-solve skipped questions. The analysis is plain rules — there is no AI inside the app.

- Live app: `https://<your-app>.vercel.app`
- Students: open the app and click **Create account** (username + password). Each student gets their own token and only sees their own mocks.
- Test login: **demo** / **catprep-demo-2026**
- MCP URL: `https://<your-app>.vercel.app/api/mcp` with header `Authorization: Bearer <token>` (token on the Connect page)

## Connect Claude (3 steps)

1. Log in, open **Connect Claude**, copy the MCP URL and your token.
2. In Claude: **Settings → Connectors → Add custom connector**, name it *CAT Prep*, paste the URL.
3. Add the header `Authorization: Bearer <your token>`, save, and turn the connector on in a chat.

Claude Code:

```bash
claude mcp add --transport http cat-prep https://<your-app>.vercel.app/api/mcp --header "Authorization: Bearer <your token>"
```

## MCP tools

| Tool | Does |
|---|---|
| `save_mock` | Saves a mock and its questions; returns `mock_id`, score and the app link |
| `get_report` | Score, reachable score, bucket counts, deficit split, top 3 fixes |

`topic` is an enum of the 38 fixed topics (7 areas), so Claude cannot invent topics. Wrong or missing token → 401.

## Rules (all numbers in `shared/config.ts`, logic in `shared/analysis.ts`)

- Score = correct × 3 − incorrect × 1.
- Buckets: **Pocket** (correct, ≤ ideal), **Over time** (correct, > ideal; only with time data), **Incorrect**,
  **Could have solved** (skipped, right in the re-solve within ideal time), **Not solved**.
- A / B / C for Incorrect and Over-time questions: tap 1 (type) wrong → A; tap 2 (approach) wrong → B; both right → C (Incorrect only).
- Deficit: C × 4 and could-have-solved × 3 (fixable now); A and B × 4 (needs practice); over-time extra minutes.
- Reachable score = score + C × 4 + could-have-solved × 3. Top 3 fixes = three biggest deficit parts.

## Deploy

**Database: Neon (Lakebase Postgres), already set up.** Project `lucky-butterfly-77600910`, branch `production`
(`aws-us-east-2`), linked by `neon init` and provisioned with `neon deploy` from `neon.ts` (Postgres only).
To get the connection strings on your machine:

```bash
npm i -g neon@latest
```
```bash
neon login
```
```bash
neon env pull
```

That writes `DATABASE_URL` (pooled, used by the app) and `DATABASE_URL_UNPOOLED` (direct, used for migrations).

**Vercel:** import this GitHub repo and set three environment variables:
`DATABASE_URL`, `DATABASE_URL_UNPOOLED` (from `neon env pull` or the Neon console → Connect) and
`SESSION_SECRET` (any long random string, e.g. `openssl rand -hex 32`). Deploy.

Every Vercel build runs `db:migrate` (idempotent, over the direct URL), then `db:seed` (resets the demo account's
sample mock; the demo token is printed in the build log), then builds the UI. `SESSION_SECRET` must stay the same
between deploys: tokens are stored encrypted with it so the Connect page can show them.

The app uses `pg` (node-postgres) with `attachDatabasePool` from `@vercel/functions`, as Neon recommends for Vercel.

**Claude:** Settings → Connectors → Add custom connector → URL `https://<app>/api/mcp`, header `Authorization: Bearer <token>`.

## Local development

Needs Node 22 or newer (Vercel builds with Node 26). Run `neon env pull` (or copy `.env.example` to `.env` and point it at any Postgres) and add `SESSION_SECRET`, then:

```bash
npm install && npm run db:migrate && npm run db:seed
```
```bash
npm run dev
```
```bash
npm test
```

## Layout

```
api/            Vercel Functions: mcp, auth, mocks, questions, token
api/_lib/       DB, auth (bcrypt, signed cookie, token hash), data access, MCP server, schema.sql
shared/         topics, config, analysis rules, sample mock (used by UI, API and tests)
src/            React UI: Login, Mocks list, Mock page, Review, Re-solve, Connect Claude
scripts/        migrate, seed, local dev server; neon-ws-preload (sandbox-only test shim, see the file)
neon.ts         Neon services for this project (Postgres only)
tests/          analysis unit tests
```
