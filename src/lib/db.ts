import "server-only";
import postgres from "postgres";

const SCHEMA = `
CREATE TABLE IF NOT EXISTS questions (
  id                 SERIAL PRIMARY KEY,
  title              TEXT NOT NULL,
  body               TEXT NOT NULL DEFAULT '',
  tag                TEXT NOT NULL,
  author             TEXT NOT NULL DEFAULT '',
  image_url          TEXT,
  owner_id           TEXT NOT NULL,
  recovery_hash      TEXT,
  ip_hash            TEXT NOT NULL,
  score              INTEGER NOT NULL DEFAULT 0,
  answer_count       INTEGER NOT NULL DEFAULT 0,
  accepted_answer_id INTEGER,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  edited_at          TIMESTAMPTZ
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
  recovery_hash TEXT,
  ip_hash       TEXT NOT NULL,
  score         INTEGER NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  edited_at     TIMESTAMPTZ
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
      onnotice: () => {},
    });
  }
  return globalForDb.sql;
}

/** Returns the SQL client, creating tables on first use in this process. */
export async function db(): Promise<postgres.Sql> {
  const sql = client();
  globalForDb.schemaReady ??= sql
    .unsafe(SCHEMA)
    .then(() => undefined)
    .catch((err) => {
      globalForDb.schemaReady = undefined;
      throw err;
    });
  await globalForDb.schemaReady;
  return sql;
}
