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
