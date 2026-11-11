CREATE TABLE IF NOT EXISTS users (
  id            SERIAL PRIMARY KEY,
  username      TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  token_hash    TEXT UNIQUE,          -- SHA-256 of the MCP token, used for lookup
  token_enc     TEXT,                 -- the token encrypted with SESSION_SECRET, so the Connect page can show it
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS mocks (
  id            SERIAL PRIMARY KEY,
  user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  taken_on      DATE NOT NULL,
  has_time_data BOOLEAN NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS mocks_user_idx ON mocks(user_id);

CREATE TABLE IF NOT EXISTS questions (
  id               SERIAL PRIMARY KEY,
  mock_id          INTEGER NOT NULL REFERENCES mocks(id) ON DELETE CASCADE,
  q_no             INTEGER NOT NULL,
  topic            TEXT NOT NULL,
  text             TEXT NOT NULL,
  options          JSONB NOT NULL,
  correct_index    INTEGER NOT NULL,
  chosen_index     INTEGER,            -- null = skipped
  seconds          INTEGER,
  ideal_seconds    INTEGER NOT NULL,
  type_options     JSONB NOT NULL,
  type_answer      INTEGER NOT NULL,
  approach_options JSONB NOT NULL,
  approach_answer  INTEGER NOT NULL,
  solution_notes   TEXT NOT NULL DEFAULT '',
  type_tap         INTEGER,            -- review tap 1
  approach_tap     INTEGER,            -- review tap 2
  resolve_index    INTEGER,            -- re-solve answer for a skipped question
  resolve_seconds  INTEGER
);
CREATE INDEX IF NOT EXISTS questions_mock_idx ON questions(mock_id, q_no);

-- Google sign-in (added later; safe to re-run)
ALTER TABLE users ADD COLUMN IF NOT EXISTS google_sub TEXT UNIQUE;  -- Google account id ("sub")
ALTER TABLE users ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL;        -- Google-only users have no password

-- OAuth for MCP clients such as claude.ai custom connectors (added later; safe to re-run)
CREATE TABLE IF NOT EXISTS oauth_clients (      -- registered by the client itself (RFC 7591)
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  redirect_uris JSONB NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS oauth_codes (        -- one-time authorization codes, 10 minutes
  code_hash      TEXT PRIMARY KEY,
  client_id      TEXT NOT NULL REFERENCES oauth_clients(id) ON DELETE CASCADE,
  user_id        INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  redirect_uri   TEXT NOT NULL,
  code_challenge TEXT NOT NULL,
  expires_at     TIMESTAMPTZ NOT NULL
);
CREATE TABLE IF NOT EXISTS oauth_tokens (       -- access and refresh tokens, stored as SHA-256
  token_hash  TEXT PRIMARY KEY,
  kind        TEXT NOT NULL CHECK (kind IN ('access', 'refresh')),
  client_id   TEXT NOT NULL REFERENCES oauth_clients(id) ON DELETE CASCADE,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at  TIMESTAMPTZ NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS oauth_tokens_user_idx ON oauth_tokens(user_id);

-- Tier 2: question practice (safe to re-run)
CREATE TABLE IF NOT EXISTS practice_questions (
  id               SERIAL PRIMARY KEY,
  user_id          INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  topic            TEXT NOT NULL,
  difficulty       TEXT NOT NULL CHECK (difficulty IN ('easy', 'medium', 'hard')),
  text             TEXT NOT NULL,
  options          JSONB NOT NULL,
  correct_index    INTEGER NOT NULL,
  ideal_seconds    INTEGER NOT NULL,
  type_options     JSONB NOT NULL,
  type_answer      INTEGER NOT NULL,
  approach_options JSONB NOT NULL,
  approach_answer  INTEGER NOT NULL,
  solution_notes   TEXT NOT NULL DEFAULT '',
  hints            JSONB NOT NULL DEFAULT '[]',
  source           TEXT NOT NULL DEFAULT '',          -- e.g. "Assignment 3 PDF", "teacher screenshot"
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS practice_questions_user_topic_idx ON practice_questions(user_id, topic);

CREATE TABLE IF NOT EXISTS attempts (
  id            SERIAL PRIMARY KEY,
  user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  question_id   INTEGER NOT NULL REFERENCES practice_questions(id) ON DELETE CASCADE,
  topic         TEXT NOT NULL,                       -- copied at attempt time, for history
  chosen_index  INTEGER NOT NULL,
  correct       BOOLEAN NOT NULL,
  seconds       INTEGER NOT NULL,
  type_tap      INTEGER,
  approach_tap  INTEGER,
  error_class   TEXT CHECK (error_class IN ('A', 'B', 'C')),
  repeat        BOOLEAN,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS attempts_user_topic_idx ON attempts(user_id, topic, created_at DESC);

-- Tier 3: notes and flashcards (safe to re-run)
CREATE TABLE IF NOT EXISTS notes (
  id          SERIAL PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  topic       TEXT NOT NULL,
  title       TEXT NOT NULL,
  summary     TEXT NOT NULL,
  formulas    JSONB NOT NULL DEFAULT '[]',
  click_type  TEXT CHECK (click_type IN ('example', 'formula', 'diagram', 'shortcut', 'analogy')),
  source      TEXT NOT NULL DEFAULT '',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS notes_user_idx ON notes(user_id, topic);

CREATE TABLE IF NOT EXISTS flashcards (
  id          SERIAL PRIMARY KEY,
  note_id     INTEGER NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  front       TEXT NOT NULL,
  back        TEXT NOT NULL,
  streak      INTEGER NOT NULL DEFAULT 0,            -- right answers in a row
  due_on      DATE NOT NULL,
  reviews     INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS flashcards_due_idx ON flashcards(user_id, due_on);

-- Notes the student adds in the app (safe to re-run)
ALTER TABLE notes ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'summary';  -- summary (from Claude) | text | link | file
ALTER TABLE notes ADD COLUMN IF NOT EXISTS link_url TEXT;
CREATE TABLE IF NOT EXISTS note_files (
  id          SERIAL PRIMARY KEY,
  note_id     INTEGER NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  mime        TEXT NOT NULL,
  size        INTEGER NOT NULL,
  data        BYTEA NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS note_files_note_idx ON note_files(note_id);
