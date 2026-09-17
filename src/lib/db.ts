import "server-only";
import postgres from "postgres";

const SCHEMA = `
-- Wait only briefly for locks: if another session is mid-DDL (or stuck), fail
-- and let the next request retry instead of queueing every page behind it.
-- LOCAL keeps these to this transaction, so they can't leak through the pooler.
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '10s';

CREATE TABLE IF NOT EXISTS questions (
  id                 SERIAL PRIMARY KEY,
  title              TEXT NOT NULL,
  body               TEXT NOT NULL DEFAULT '',
  tag                TEXT NOT NULL,
  author             TEXT NOT NULL DEFAULT '',
  image_url          TEXT,
  owner_id           TEXT NOT NULL,
  member_id          INTEGER,
  recovery_hash      TEXT,
  ip_hash            TEXT NOT NULL,
  score              INTEGER NOT NULL DEFAULT 0,
  answer_count       INTEGER NOT NULL DEFAULT 0,
  accepted_answer_id INTEGER,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  edited_at          TIMESTAMPTZ,
  -- visible | pending (waiting for a tutor) | hidden (auto-hidden by reports)
  status             TEXT NOT NULL DEFAULT 'visible',
  status_reason      TEXT,
  reviewed_at        TIMESTAMPTZ,
  -- Set by a tutor to keep something at the top of the feed.
  pinned_at          TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS questions_created_idx ON questions (created_at DESC);
CREATE INDEX IF NOT EXISTS questions_tag_idx ON questions (tag, created_at DESC);
CREATE INDEX IF NOT EXISTS questions_recovery_idx ON questions (recovery_hash);

CREATE TABLE IF NOT EXISTS answers (
  id            SERIAL PRIMARY KEY,
  question_id   INTEGER NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  body          TEXT NOT NULL,
  author        TEXT NOT NULL DEFAULT '',
  image_url     TEXT,
  owner_id      TEXT NOT NULL,
  member_id     INTEGER,
  recovery_hash TEXT,
  ip_hash       TEXT NOT NULL,
  score         INTEGER NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  edited_at     TIMESTAMPTZ,
  status        TEXT NOT NULL DEFAULT 'visible',
  status_reason TEXT,
  reviewed_at   TIMESTAMPTZ,
  pinned_at     TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS answers_question_idx ON answers (question_id, created_at);
CREATE INDEX IF NOT EXISTS answers_recovery_idx ON answers (recovery_hash);

CREATE TABLE IF NOT EXISTS votes (
  target_type TEXT NOT NULL,
  target_id   INTEGER NOT NULL,
  voter_id    TEXT NOT NULL,
  ip_hash     TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (target_type, target_id, voter_id)
);
CREATE INDEX IF NOT EXISTS votes_ip_idx ON votes (target_type, target_id, ip_hash);

-- Browsers that unlocked a post with its recovery code (in addition to the original author).
CREATE TABLE IF NOT EXISTS claims (
  target_type TEXT NOT NULL,
  target_id   INTEGER NOT NULL,
  visitor_id  TEXT NOT NULL,
  PRIMARY KEY (target_type, target_id, visitor_id)
);

-- Recent actions, used only for rate limits. Rows older than two days are pruned.
CREATE TABLE IF NOT EXISTS activity (
  kind       TEXT NOT NULL,
  ip_hash    TEXT NOT NULL,
  visitor_id TEXT NOT NULL DEFAULT '',
  bytes      INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS activity_created_idx ON activity (created_at);

CREATE TABLE IF NOT EXISTS reports (
  target_type TEXT NOT NULL,
  target_id   INTEGER NOT NULL,
  reporter_id TEXT NOT NULL,
  reason      TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (target_type, target_id, reporter_id)
);

-- Admin-editable settings; see src/lib/settings.ts. Values are JSON text.
CREATE TABLE IF NOT EXISTS settings (
  key            TEXT PRIMARY KEY,
  default_value  TEXT,
  override_value TEXT,
  override_until TIMESTAMPTZ
);

-- People a tutor vouched for: they get a badge on their posts, and sign in with
-- a code an admin gives them. Rotating the code keeps the same member, so their
-- old posts keep the badge.
CREATE TABLE IF NOT EXISTS members (
  id             SERIAL PRIMARY KEY,
  title          TEXT NOT NULL,
  color          TEXT NOT NULL DEFAULT 'green',
  note           TEXT NOT NULL DEFAULT '',
  code_hash      TEXT NOT NULL,
  code_version   INTEGER NOT NULL DEFAULT 1,
  relaxed_limits BOOLEAN NOT NULL DEFAULT FALSE,
  skip_review    BOOLEAN NOT NULL DEFAULT FALSE,
  active         BOOLEAN NOT NULL DEFAULT TRUE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS members_code_idx ON members (code_hash);

-- Server-generated secrets: the session signing key, the IP hash salt, and the
-- hashed tutor password. Never leaves the server.
CREATE TABLE IF NOT EXISTS secrets (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Admin additions to the profanity filter: extra blocked words, and built-in words to allow.
CREATE TABLE IF NOT EXISTS filter_words (
  word     TEXT NOT NULL,
  list     TEXT NOT NULL,
  added_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (word, list)
);

-- Columns added after the first deploy. CREATE TABLE only runs on an empty
-- database, so every new column also needs a line here to reach one that
-- already has data. These are cheap no-ops once applied.
ALTER TABLE questions ADD COLUMN IF NOT EXISTS member_id INTEGER;
ALTER TABLE questions ADD COLUMN IF NOT EXISTS pinned_at TIMESTAMPTZ;
ALTER TABLE answers   ADD COLUMN IF NOT EXISTS member_id INTEGER;
ALTER TABLE answers   ADD COLUMN IF NOT EXISTS pinned_at TIMESTAMPTZ;
`;

const globalForDb = globalThis as unknown as {
  sql?: postgres.Sql;
  schemaReady?: Promise<void>;
};

function client(): postgres.Sql {
  if (!globalForDb.sql) {
    const url = process.env.DATABASE_URL;
    if (!url) {
      throw new Error(
        "DATABASE_URL is not set. Connect a Neon database in Vercel, then run `vercel env pull .env.local`.",
      );
    }
    globalForDb.sql = postgres(url, {
      max: Number(process.env.DB_POOL_MAX ?? 5),
      // Neon's pooled endpoint runs PgBouncer, which doesn't support prepared statements.
      prepare: false,
      // Fail fast and show the error page instead of leaving the visitor on a
      // spinner when DATABASE_URL points somewhere unreachable.
      connect_timeout: 10,
      onnotice: () => {},
    });
  }
  return globalForDb.sql;
}

const SCHEMA_TIMEOUT_MS = 15_000;

/**
 * Applies the schema, retrying once: two instances starting together can both
 * run CREATE TABLE IF NOT EXISTS, and one of them loses the race with a
 * duplicate-object error. An advisory lock would be tidier, but Neon's pooled
 * endpoint runs PgBouncer, where a session lock can outlive the client and
 * wedge every later request.
 */
async function applySchema(sql: postgres.Sql): Promise<void> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      // Never let one stuck statement hang every page on the site.
      await Promise.race([
        sql.unsafe(SCHEMA),
        new Promise((_, reject) =>
          setTimeout(
            () => reject(new Error("Timed out setting up the database schema")),
            SCHEMA_TIMEOUT_MS,
          ),
        ),
      ]);
      return;
    } catch (err) {
      const code = (err as { code?: string }).code;
      const lostTheRace = code === "23505" || code === "42P07" || code === "42710";
      if (!lostTheRace || attempt === 1) throw err;
    }
  }
}

/** Returns the SQL client, creating tables on first use in this process. */
export async function db(): Promise<postgres.Sql> {
  const sql = client();
  globalForDb.schemaReady ??= applySchema(sql).catch((err) => {
    // Let the next request try again instead of caching the failure forever.
    globalForDb.schemaReady = undefined;
    throw err;
  });
  await globalForDb.schemaReady;
  return sql;
}
