import "server-only";
import { randomBytes } from "node:crypto";
import { db } from "./db";

export type SecretKey = "session_secret" | "ip_salt" | "admin_password";

// Secrets are stable, so one lookup per server instance is enough.
const cache = new Map<SecretKey, string>();

/** Reads a secret, creating a random one on first use. */
export async function getSecret(key: SecretKey): Promise<string> {
  const cached = cache.get(key);
  if (cached) return cached;

  const sql = await db();
  // If another instance inserts the row at the same moment, our INSERT does
  // nothing and its row isn't visible to this statement yet — so try again.
  for (let attempt = 0; attempt < 3; attempt++) {
    const [row] = await sql<{ value: string }[]>`
      WITH inserted AS (
        INSERT INTO secrets (key, value) VALUES (${key}, ${randomBytes(32).toString("hex")})
        ON CONFLICT (key) DO NOTHING
        RETURNING value
      )
      SELECT value FROM inserted
      UNION ALL
      SELECT value FROM secrets WHERE key = ${key}
      LIMIT 1
    `;
    if (row) {
      cache.set(key, row.value);
      return row.value;
    }
  }
  throw new Error(`could not read or create the ${key} secret`);
}

export async function readSecret(key: SecretKey): Promise<{ value: string; updated_at: Date } | null> {
  const sql = await db();
  const [row] = await sql<{ value: string; updated_at: Date }[]>`
    SELECT value, updated_at FROM secrets WHERE key = ${key}
  `;
  return row ?? null;
}

export async function writeSecret(key: SecretKey, value: string): Promise<void> {
  const sql = await db();
  await sql`
    INSERT INTO secrets (key, value) VALUES (${key}, ${value})
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()
  `;
  cache.set(key, value);
}
