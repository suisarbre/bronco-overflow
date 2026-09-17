import "server-only";
import { createHash, createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { cookies, headers } from "next/headers";
import { checkAdminPassword } from "./admin-password";
import { getSecret } from "./secrets";

const VISITOR_COOKIE = "qa_visitor";
const ADMIN_COOKIE = "qa_admin";
const YEAR = 60 * 60 * 24 * 365;

const secure = process.env.NODE_ENV === "production";

/** Anonymous per-browser id used for votes and "your post" ownership. Read-only (safe in pages). */
export async function getVisitorId(): Promise<string | null> {
  const value = (await cookies()).get(VISITOR_COOKIE)?.value;
  return value && /^[0-9a-f-]{36}$/.test(value) ? value : null;
}

/** Same as getVisitorId, but creates the cookie. Only callable from Server Actions. */
export async function getOrCreateVisitorId(): Promise<string> {
  const existing = await getVisitorId();
  if (existing) return existing;
  const id = randomUUID();
  (await cookies()).set(VISITOR_COOKIE, id, {
    httpOnly: true,
    sameSite: "lax",
    secure,
    maxAge: YEAR,
    path: "/",
  });
  return id;
}

/** Hashed client IP, used only for spam limits. Raw IPs are never stored. */
export async function getIpHash(): Promise<string> {
  const h = await headers();
  const ip =
    h.get("x-real-ip") ?? h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const salt = await getSecret("ip_salt");
  return createHash("sha256").update(`${salt}:${ip}`).digest("hex").slice(0, 32);
}

// Signed with a server-generated key, not the password, so rotating the tutor
// password doesn't sign everyone out (and doesn't change every IP hash).
async function adminToken(): Promise<string> {
  return createHmac("sha256", await getSecret("session_secret")).update("admin-session").digest("hex");
}

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

export async function isAdmin(): Promise<boolean> {
  // Read cookies first so pages using this always render per request.
  const value = (await cookies()).get(ADMIN_COOKIE)?.value;
  if (!value) return false;
  return safeEqual(value, await adminToken());
}

export async function logInAdmin(password: string): Promise<boolean> {
  if (!(await checkAdminPassword(password))) return false;
  (await cookies()).set(ADMIN_COOKIE, await adminToken(), {
    httpOnly: true,
    sameSite: "lax",
    secure,
    maxAge: 60 * 60 * 24 * 30,
    path: "/",
  });
  return true;
}

export async function logOutAdmin(): Promise<void> {
  (await cookies()).delete(ADMIN_COOKIE);
}
