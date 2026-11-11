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
