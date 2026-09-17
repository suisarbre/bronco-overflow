import "server-only";
import { createHash, createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { cookies, headers } from "next/headers";
import { checkAdminPassword, type StaffRole } from "./admin-password";
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
// The role is part of what's signed, so the cookie can't be edited into an admin one.
async function staffToken(role: StaffRole): Promise<string> {
  const mac = createHmac("sha256", await getSecret("session_secret"))
    .update(`staff:${role}`)
    .digest("hex");
  return `${role}.${mac}`;
}

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

/** "admin" (the environment password) outranks "tutor" (the rotating one). */
export async function getStaffRole(): Promise<StaffRole | null> {
  // Read cookies first so pages using this always render per request.
  const value = (await cookies()).get(ADMIN_COOKIE)?.value;
  if (!value) return null;
  for (const role of ["admin", "tutor"] as const) {
    if (safeEqual(value, await staffToken(role))) return role;
  }
  return null;
}

/** True for tutors and admins: everyday moderation. */
export async function isStaff(): Promise<boolean> {
  return (await getStaffRole()) !== null;
}

/** True only for whoever has the environment password. */
export async function isAdmin(): Promise<boolean> {
  return (await getStaffRole()) === "admin";
}

export async function logInAdmin(password: string): Promise<boolean> {
  const role = await checkAdminPassword(password);
  if (!role) return false;
  (await cookies()).set(ADMIN_COOKIE, await staffToken(role), {
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
