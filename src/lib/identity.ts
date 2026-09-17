import "server-only";
import { createHash, createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { cookies, headers } from "next/headers";

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

function secret(): string {
  return process.env.ADMIN_PASSWORD || "local-dev-only";
}

/** Hashed client IP, used only for spam limits. Raw IPs are never stored. */
export async function getIpHash(): Promise<string> {
  const h = await headers();
  const ip =
    h.get("x-real-ip") ?? h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  return createHash("sha256").update(`${secret()}:${ip}`).digest("hex").slice(0, 32);
}

function adminToken(): string {
  return createHmac("sha256", secret()).update("admin-session").digest("hex");
}

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

export async function isAdmin(): Promise<boolean> {
  // Read cookies first so pages using this always render per request.
  const value = (await cookies()).get(ADMIN_COOKIE)?.value;
  if (!process.env.ADMIN_PASSWORD) return false;
  return !!value && safeEqual(value, adminToken());
}

export async function logInAdmin(password: string): Promise<boolean> {
  const expected = process.env.ADMIN_PASSWORD;
  if (!expected || !safeEqual(password, expected)) return false;
  (await cookies()).set(ADMIN_COOKIE, adminToken(), {
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
