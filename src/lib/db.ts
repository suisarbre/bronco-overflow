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
  ip_hash            TEXT NOT NULL,
  score              INTEGER NOT NULL DEFAULT 0,
  answer_count       INTEGER NOT NULL DEFAULT 0,
  accepted_answer_id INTEGER,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS questions_created_idx ON questions (created_at DESC);
CREATE INDEX IF NOT EXISTS questions_tag_idx ON questions (tag, created_at DESC);

CREATE TABLE IF NOT EXISTS answers (
  id          SERIAL PRIMARY KEY,
  question_id INTEGER NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  body        TEXT NOT NULL,
  author      TEXT NOT NULL DEFAULT '',
  image_url   TEXT,
  owner_id    TEXT NOT NULL,
  ip_hash     TEXT NOT NULL,
  score       INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS answers_question_idx ON answers (question_id, created_at);

CREATE TABLE IF NOT EXISTS votes (
  target_type TEXT NOT NULL,
  target_id   INTEGER NOT NULL,
  voter_id    TEXT NOT NULL,
  PRIMARY KEY (target_type, target_id, voter_id)
);
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
