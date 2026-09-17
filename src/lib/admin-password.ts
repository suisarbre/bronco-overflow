import "server-only";
import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { newCode } from "./codes";
import { notifyDiscord } from "./notify";
import { db } from "./db";
import { readSecret, writeSecret } from "./secrets";

const derive = promisify(scrypt) as (password: string, salt: string, len: number) => Promise<Buffer>;

async function hash(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  return `${salt}:${(await derive(password, salt, 32)).toString("hex")}`;
}

async function matches(password: string, stored: string): Promise<boolean> {
  const [salt, expected] = stored.split(":");
  if (!salt || !expected) return false;
  const actual = await derive(password, salt, 32);
  const expectedBuf = Buffer.from(expected, "hex");
  return actual.length === expectedBuf.length && timingSafeEqual(actual, expectedBuf);
}

export type StaffRole = "admin" | "tutor";

/**
 * Which role a password grants, if any. The tutor password lives in the database
 * so the server can rotate it and post the new one to Discord; `ADMIN_PASSWORD`
 * stays valid as a break-glass key, and grants the wider admin role.
 */
export async function checkAdminPassword(password: string): Promise<StaffRole | null> {
  if (!password) return null;
  const env = process.env.ADMIN_PASSWORD;
  if (env && password.length === env.length && timingSafeEqual(Buffer.from(password), Buffer.from(env))) {
    return "admin";
  }
  const stored = await readSecret("admin_password");
  return stored && (await matches(password, stored.value)) ? "tutor" : null;
}

export async function adminLoginPossible(): Promise<boolean> {
  return !!process.env.ADMIN_PASSWORD || !!(await readSecret("admin_password"));
}

/** Generates a new password, stores its hash, and posts it to Discord. */
export async function rotateAdminPassword(): Promise<boolean> {
  if (!process.env.DISCORD_WEBHOOK_URL) return false;
  const password = newCode(4);
  await writeSecret("admin_password", await hash(password));
  await announce(password, "rotated by hand");
  return true;
}

export async function adminPasswordAge(): Promise<Date | null> {
  return (await readSecret("admin_password"))?.updated_at ?? null;
}

/**
 * Rotates when the password is older than `days`. Several server instances can
 * run this at once, so the write only lands for one of them — and only that one
 * posts to Discord.
 */
export async function rotateAdminPasswordIfDue(days: number): Promise<void> {
  if (days <= 0 || !process.env.DISCORD_WEBHOOK_URL) return;

  // Cheap read first: nearly every call stops here.
  const current = await readSecret("admin_password");
  if (current && Date.now() - current.updated_at.getTime() < days * 24 * 3600 * 1000) return;

  const password = newCode(4);
  const hashed = await hash(password);
  const sql = await db();
  const claimed = await sql`
    INSERT INTO secrets (key, value) VALUES ('admin_password', ${hashed})
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()
    WHERE secrets.updated_at < now() - (${days} * interval '1 day')
    RETURNING 1
  `;
  if (claimed.length) await announce(password, `rotates every ${days} day${days === 1 ? "" : "s"}`);
}

function announce(password: string, note: string): Promise<void> {
  return notifyDiscord(
    "New tutor password",
    `Log in at /admin with:  ${password}\nThe previous password stopped working just now (${note}).`,
  );
}
