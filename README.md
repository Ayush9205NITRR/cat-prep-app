# CAT Prep — mock analysis from Claude

Upload a CAT mock report (PDF, photos, screenshots) to Claude and say **“Analyse my mock”**. Claude reads every
question and sends it to this app through MCP. The mock appears in the app, where you can correct any cell, review
wrong answers with two taps, and re-solve skipped questions. The analysis is plain rules — there is no AI inside the app.

- Live app: `https://<your-app>.vercel.app`
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

1. **Neon:** create a free project, copy the **pooled** connection string.
2. **Vercel:** import this GitHub repo, set `DATABASE_URL` and `SESSION_SECRET` (any long random string), deploy.
3. Run migrations and the seed once from your machine (prints the demo password and token):
   ```bash
   npm install
   ```
   ```bash
   DATABASE_URL='<neon pooled url>' SESSION_SECRET='<same as on Vercel>' npm run db:migrate
   ```
   ```bash
   DATABASE_URL='<neon pooled url>' SESSION_SECRET='<same as on Vercel>' npm run db:seed
   ```
   `SESSION_SECRET` must match Vercel's: the token is stored encrypted with it so the Connect page can show it.
4. **Claude:** Settings → Connectors → Add custom connector → URL `https://<app>/api/mcp`, header `Authorization: Bearer <token>`.

## Local development

Needs Node 20 and a Postgres database. Copy `.env.example` to `.env` and fill it in, then:

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
scripts/        migrate, seed, local dev server
tests/          analysis unit tests
```
