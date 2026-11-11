# CAT Prep — mocks, practice and notes from Claude

Claude reads what the student uploads and sends structured data to this app through MCP. The app stores it, lets the
student edit everything, and runs the analysis with plain rules — there is no AI inside the app.

- **Mocks:** upload a mock report → “Analyse my mock” → editable table, score, reachable score, buckets, deficit, top 3 fixes; two-tap review (A/B/C) and timed re-solve.
- **Practice:** a teacher’s question or an assignment PDF → “Save these for practice” → question sets by topic and difficulty, timed practice with no hints, A/B/C taps after a wrong answer, hints one at a time in review, repeat-error flag.
- **New note (in the app):** one box — type or paste; a lone URL is saved as a link, anything else as text — or add a photo/screenshot/PDF (choose, drag, or paste from the clipboard; big photos are shrunk in the browser; files up to 3 MB, type checked by content). Stored as given; no AI in the app.
- **Notes:** photo of lecture notes, a text dump or a transcript → “Make notes and flashcards” → topic page with summary, formulas and 5–8 flashcards; one required tap “How did this click?”; cards due on a 1, 2, 4, 8-day schedule (wrong → tomorrow).

- Live app: `https://<your-app>.vercel.app`
- Students: open the app and click **Continue with Google**. Username + password is folded under “Use a username and password instead” (reviewers use it for `demo`). Each student gets their own token and only sees their own mocks.
- Test login: **demo** / **catprep-demo-2026** (has a sample mock, 6 practice questions in 2 topics and a sample note with flashcards)
- MCP URL: `https://<your-app>.vercel.app/api/mcp` — add it in Claude and click Connect (OAuth sign-in). Claude Code: header `Authorization: Bearer <token>` (token on the Connect page)

## Connect Claude (3 steps)

1. In Claude (claude.ai or the desktop app): **Settings → Connectors → Add custom connector**.
2. Name it *CAT Prep*, paste `https://<your-app>/api/mcp`, click **Add**. Leave the OAuth fields empty.
3. Click **Connect**, log in to CAT Prep (Google or password), click **Allow**. Turn the connector on in a chat.

claude.ai connectors sign in with OAuth: the app is its own OAuth 2.1 server for MCP (discovery via
`/.well-known/oauth-protected-resource`, dynamic client registration, PKCE S256, rotating refresh tokens).
No token is copied and nothing goes in the URL.

Claude Code or MCP Inspector can use the personal token from the Connect page as a header instead:

```bash
claude mcp add --transport http cat-prep https://<your-app>.vercel.app/api/mcp --header "Authorization: Bearer <your token>"
```

## MCP tools

| Tool | Does |
|---|---|
| `save_mock` | Saves a mock and its questions; returns `mock_id`, score and the app link |
| `get_report` | Score, reachable score, bucket counts, deficit split, top 3 fixes |
| `save_question` | Saves one practice question (mock-row fields + difficulty, hints). Once per question for a PDF |
| `next_question` | One question for a topic (and difficulty): never tried first, then last-wrong. No answer, solution or hints |
| `submit_answer` | Saves the attempt → correct or not. If wrong, returns the two tap questions; a second call with the taps returns A/B/C and whether it repeats an error |
| `get_topic_history` | Last 20 attempts and errors for a topic |
| `save_notes` | Summary, formulas and 5–8 flashcards for a topic |

`topic` is an enum of the 38 fixed topics (7 areas), so Claude cannot invent topics. Wrong or missing token → 401
with `WWW-Authenticate: Bearer resource_metadata=…` so OAuth clients find the sign-in.

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

Every **production** Vercel build runs `db:migrate` (idempotent, over the direct URL), then `db:seed` (resets the demo password,
keeps its token and sample mock — `npm run db:seed -- --reset-sample` gives a fresh copy; the token is printed in the build log), then builds the UI. Preview builds only build the UI, so they never touch the live database. `SESSION_SECRET` must stay the same
between deploys: tokens are stored encrypted with it so the Connect page can show them.

The app uses `pg` (node-postgres) with `attachDatabasePool` from `@vercel/functions`, as Neon recommends for Vercel.

**Claude:** Settings → Connectors → Add custom connector → URL `https://<app>/api/mcp`, header `Authorization: Bearer <token>`.

**Google sign-in (optional).** In Google Cloud Console: create a project → APIs & Services → OAuth consent screen
(External; app name; your email) and **Publish app** so any Google account can sign in → Credentials → Create
credentials → OAuth client ID → Web application, with the authorised redirect URI `https://<app>/api/google`.
Put the client ID and secret in Vercel as `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` and redeploy. The button
appears once both are set. A Google login with an email that a password account already uses as its username gets
its own new account; it never takes over the existing one.

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
api/            Vercel Functions: mcp, auth, google, oauth, mocks, questions (mock rows), practice, notes, token
api/_lib/       DB, auth (bcrypt, signed cookie, token hash), data access, MCP server, schema.sql
shared/         topics, config, rules (analysis, practice, flashcards), demo samples (used by UI, API and tests)
src/            React UI: Login, Mocks, Mock page, Review, Re-solve, Practice, Practice session, Question editor, Notes, Note page, Flashcard review, Connect
scripts/        migrate, seed, local dev server; neon-ws-preload (sandbox-only test shim, see the file)
neon.ts         Neon services for this project (Postgres only)
tests/          analysis unit tests
```
