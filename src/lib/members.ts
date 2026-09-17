import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { hashCode, newCode } from "./codes";
import { db } from "./db";
import { type BadgeColor, type Member } from "./member-types";
import { getSecret } from "./secrets";

const MEMBER_COOKIE = "qa_member";
const MONTHS = 60 * 60 * 24 * 180;

export type { BadgeColor, Member };

// The cookie carries the member id and the code version it was issued for, so
// handing out a new code signs out whoever had the old one.
async function sign(id: number, version: number): Promise<string> {
  const mac = createHmac("sha256", await getSecret("session_secret"))
    .update(`member:${id}:${version}`)
    .digest("hex");
  return `${id}.${version}.${mac}`;
}

async function verify(cookie: string): Promise<{ id: number; version: number } | null> {
  const [rawId, rawVersion, mac] = cookie.split(".");
  const id = Number(rawId);
  const version = Number(rawVersion);
  if (!Number.isSafeInteger(id) || !Number.isSafeInteger(version) || !mac) return null;
  const expected = (await sign(id, version)).split(".")[2];
  const a = Buffer.from(mac);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b) ? { id, version } : null;
}

/** The signed-in member for this browser, if the code is still current. */
export async function getMember(): Promise<Member | null> {
  const cookie = (await cookies()).get(MEMBER_COOKIE)?.value;
  if (!cookie) return null;
  const signed = await verify(cookie);
  if (!signed) return null;

  const sql = await db();
  const [member] = await sql<Member[]>`
    SELECT id, title, color, note, code_version, relaxed_limits, skip_review, active, created_at
    FROM members
    WHERE id = ${signed.id} AND active AND code_version = ${signed.version}
  `;
  return member ?? null;
}

/** Signs in with a badge code. Returns the member, or null if the code is unknown. */
export async function logInMember(code: string): Promise<Member | null> {
  const sql = await db();
  const [member] = await sql<Member[]>`
    SELECT id, title, color, note, code_version, relaxed_limits, skip_review, active, created_at
    FROM members WHERE code_hash = ${hashCode(code)} AND active
  `;
  if (!member) return null;
  (await cookies()).set(MEMBER_COOKIE, await sign(member.id, member.code_version), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: MONTHS,
    path: "/",
  });
  return member;
}

export async function logOutMember(): Promise<void> {
  (await cookies()).delete(MEMBER_COOKIE);
}

export async function listMembers(): Promise<Member[]> {
  const sql = await db();
  return sql<Member[]>`
    SELECT id, title, color, note, code_version, relaxed_limits, skip_review, active, created_at
    FROM members ORDER BY active DESC, created_at DESC
  `;
}

/** Creates a member and returns the one-time code to hand over. */
export async function createMember(title: string, color: BadgeColor, note: string): Promise<string> {
  const code = newCode(3);
  const sql = await db();
  await sql`
    INSERT INTO members (title, color, note, code_hash)
    VALUES (${title}, ${color}, ${note}, ${hashCode(code)})
  `;
  return code;
}

/** Issues a new code for an existing member; their posts and badge stay as they are. */
export async function regenerateCode(id: number): Promise<string | null> {
  const code = newCode(3);
  const sql = await db();
  const [row] = await sql<{ id: number }[]>`
    UPDATE members
    SET code_hash = ${hashCode(code)}, code_version = code_version + 1
    WHERE id = ${id}
    RETURNING id
  `;
  return row ? code : null;
}

export async function updateMember(
  id: number,
  fields: { title: string; color: BadgeColor; note: string; relaxed_limits: boolean; skip_review: boolean },
): Promise<void> {
  const sql = await db();
  await sql`
    UPDATE members
    SET title = ${fields.title}, color = ${fields.color}, note = ${fields.note},
        relaxed_limits = ${fields.relaxed_limits}, skip_review = ${fields.skip_review}
    WHERE id = ${id}
  `;
}

/** Deactivating keeps the member's posts and their badge, but the code stops working. */
export async function setMemberActive(id: number, active: boolean): Promise<void> {
  const sql = await db();
  await sql`UPDATE members SET active = ${active}, code_version = code_version + 1 WHERE id = ${id}`;
}
