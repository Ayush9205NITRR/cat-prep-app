# CAT Prep App — build brief for Claude Code

Build exactly what is written here, in tier order. Do not add features that are not listed. If something is unclear, ask before adding.

## The assignment rules (Volopay) — these decide everything

- **Works from Claude:** the user types a request in Claude, and something real is created in the app.
- **A person can change it:** open the app, see what Claude created, edit it.
- **Live on the internet**, so reviewers can try it themselves.
- **No AI inside:** no OpenAI, Anthropic or other AI keys anywhere in the app.
- **Keep it small:** one thing that works well beats many things that half work.
- **Deliver:** the live app link + a **test username and password**, and the MCP link with simple connect steps.
- Demo in the video: type a request in Claude → it appears in the app → edit it.

So: **ship Tier 1 fully, deployed and tested, before starting Tier 2.** Tier 3 only if time is left.

## What the app is

A CAT prep app. Claude (the student's own plan) reads uploads (PDF, photos, screenshots) and sends structured data to the app through MCP tools. The app stores it, lets the student edit it, and runs the analysis with plain rules.

## Stack (all free)

| Part | Choice |
|---|---|
| Language | TypeScript, Node 20 |
| Hosting | **Vercel Hobby** (free). Vite + React UI as static files; API and MCP as Vercel Functions in `/api` |
| Database | **Neon Postgres, Free plan** (scales to zero after 5 min idle; wakes on the next query). Use the pooled connection string |
| MCP | `@modelcontextprotocol/sdk`: `McpServer` + `StreamableHTTPServerTransport`, **stateless** (`sessionIdGenerator: undefined`), new server per request, at `/api/mcp` |
| Validation | zod |
| UI | React + Vite + Tailwind + Recharts. Reuse components and the topic list from the Game Changer repo (`app/src/schema.js`, dashboard components) |

Env vars: `DATABASE_URL`, `SESSION_SECRET`. Nothing else. No AI keys.

## Auth

- **App login:** username + password (bcrypt hash), session cookie. Seed a test account `demo` / a password set in the seed script, with sample data. Reviewers use this.
- **MCP:** each user has a personal token (`tok_` + 32 random chars, store a SHA-256 hash), shown on the Connect page. Sent as the header `Authorization: Bearer <token>`. Never in the URL. Wrong or missing → 401.

## Topics

Fixed list copied from the Game Changer repo's `schema.js` (7 areas, 38 topics). In every MCP tool, `topic` is a zod enum of these names, so Claude cannot invent topics.

---

## TIER 1 — Mock upload and analysis (must ship)

**Flow:** student in Claude: "Analyse my mock" + PDF or images → Claude reads every question, the student's answer, the correct answer, time per question (if the report has it) → `save_mock` → the mock appears in the app → student edits any row → analysis recalculates.

### MCP tools

| Tool | Input | Does |
|---|---|---|
| `save_mock` | name, taken_on, has_time_data, rows[{ q_no, topic, text, options[], correct_index, chosen_index (null = skipped), seconds?, ideal_seconds, type_options[3], type_answer, approach_options[3], approach_answer, solution_notes }] | Saves the mock and its questions; returns mock_id, score and the app link to the mock |
| `get_report` | mock_id | Score, reachable score, bucket counts, deficit split, top 3 fixes |

Server instructions (send word for word):
1. Read every question in the upload. Map each to one allowed topic; if unsure, ask the student.
2. Estimate `ideal_seconds` for each question and write 3 type options and 3 approach options with the right one marked.
3. After saving, tell the student what you read (count, anything unreadable) and give the app link so they can correct it.
4. Do not grade or analyse yourself; use `get_report`.

### Rules (app logic)

- Score = correct × 3 − incorrect × 1.
- Buckets:
  - **Pocket:** correct, seconds ≤ ideal_seconds
  - **Over time:** correct, seconds > ideal_seconds (only if has_time_data; otherwise skip this bucket and say so)
  - **Incorrect:** attempted, wrong
  - **Could have solved:** skipped, then solved in the app's re-solve within ideal time
  - **Not solved:** skipped and not solved in re-solve
- **A / B / C** for each Incorrect and Over-time question, from two taps in the app:
  - Tap 1 "Which type of question is this?" wrong → **A** (Comprehension)
  - Tap 1 right, tap 2 "Which is the fastest approach?" wrong → **B** (Optimal approach)
  - Both right → **C** (Mistake) — only for Incorrect
- Time delta = seconds − ideal_seconds.
- Deficit: C × 4 and could-have-solved × 3 (fixable now); A and B incorrect × 4 (needs practice); over-time extra minutes.
- Reachable score = score + C × 4 + could-have-solved × 3.
- Top 3 fixes = the three biggest deficit parts, in words.
- All numbers in one `config.ts`.

### Screens

1. **Login** (username + password).
2. **Mocks list.**
3. **Mock page:** editable table (topic, chosen answer, correct answer, seconds, ideal seconds — every cell editable, saves on blur), then score, reachable score, the five buckets, time-delta table, deficit split, top 3 fixes. Recalculates after every edit.
4. **Review:** one wrong or over-time question at a time → tap 1 → tap 2 → shows A/B/C and the solution notes. **Re-solve** skipped questions with a timer, no hints.
5. **Connect Claude:** the MCP URL, the user's token (copy button), and the 3 connect steps.

### Tier 1 checks (all must pass before Tier 2)

- [ ] Sample mock as a unit test: 12 correct, 6 wrong (A 2, B 1, C 3), 2 could-have-solved → score 30, reachable 48.
- [ ] MCP Inspector connects with the demo token; 401 without it.
- [ ] Deployed on Vercel; `https://<app>/api/mcp` added in claude.ai as a custom connector with the token header.
- [ ] In Claude: upload a mock PDF → mock appears in the app → edit a cell → numbers change.
- [ ] Reviewer can log in with `demo` and see a sample mock.

---

## TIER 2 — Question upload and practice (only after Tier 1 ships)

**Flow:** screenshot of a teacher's question, or an assignment PDF → Claude → `save_question` → question set in the app → timed practice, no hints → A/B/C on wrong answers.

| Tool | Does |
|---|---|
| `save_question` | Saves one question (same fields as a mock row + difficulty easy/medium/hard, hints[]). Called once per question for a PDF |
| `next_question` | Returns one question for a topic, without answer, solution or hints |
| `submit_answer` | Saves the attempt; returns correct and whether it repeats an earlier error |
| `get_topic_history` | Last 20 attempts and errors for a topic, so Claude can explain |

Rules: timer on, no hints while solving; A/B/C taps after a wrong answer; hints only in the review, one at a time; **repeat** = same topic and same error in the last 10 attempts. Screen: question sets by topic and difficulty, practice screen, edit any saved question.

---

## TIER 3 — Notes (only if time is left)

**Flow:** photo of lecture notes, a text dump or a transcript → Claude writes a summary, formulas and 5–8 flashcards → `save_notes` → topic page in the app; one required tap "How did this click?" (example, formula, diagram, shortcut, analogy); flashcards due on a doubling schedule (1, 2, 4, 8 days; wrong → tomorrow). Every note and card editable.

---

## Do not build

Payments, emails, comparison with other students, topic score and mastery levels, a 21-day check, doubt tracking, a large seeded question bank, any AI call inside the app.

## Deploy steps (for the README)

1. Neon: create a free project, copy the pooled connection string.
2. Vercel: import the GitHub repo, set `DATABASE_URL` and `SESSION_SECRET`, deploy.
3. Run migrations and the seed once (`npm run db:migrate && npm run db:seed`), which prints the demo password and token.
4. Claude: Settings → Connectors → Add custom connector → URL `https://<app>/api/mcp`, header `Authorization: Bearer <token>`.
