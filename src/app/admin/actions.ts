"use server";

import { refresh, revalidatePath } from "next/cache";
import { rotateAdminPassword } from "@/lib/admin-password";
import { deleteCheckin } from "@/lib/checkins";
import { db } from "@/lib/db";
import { isAdmin, isStaff } from "@/lib/identity";
import { addWord, isUsableWord, removeWord, runFilter } from "@/lib/moderation";
import { isBadgeColor, isUsableTitle, type BadgeColor } from "@/lib/member-types";
import { createMember, regenerateCode, setMemberActive, updateMember } from "@/lib/members";
import { notifyDiscord } from "@/lib/notify";
import { OVERRIDE_DURATIONS, isSettingKey, parseSetting, type SettingKey } from "@/lib/settings";
import { clearAllOverrides, clearOverride, setDefault, setOverride } from "@/lib/settings-store";
import { deleteImages } from "@/lib/storage";

export type AdminState = { error?: string; ok?: string };

/** Tutors and admins: everyday moderation. */
async function requireStaff(): Promise<boolean> {
  return isStaff();
}

/** Admins only: setting defaults, member management, password rotation, network-wide deletes. */
async function requireAdmin(): Promise<boolean> {
  return isAdmin();
}

function field(form: FormData, key: string): string {
  const value = form.get(key);
  return typeof value === "string" ? value.trim() : "";
}

/** Reads a setting key plus its value, both validated against the setting definitions. */
function settingFrom(form: FormData): { key: SettingKey; value: never } | null {
  const key = field(form, "key");
  if (!isSettingKey(key)) return null;
  let raw: unknown;
  try {
    raw = JSON.parse(field(form, "value"));
  } catch {
    return null;
  }
  const value = parseSetting(key, raw);
  return value === undefined ? null : { key, value: value as never };
}

function durationFrom(form: FormData): number | null | undefined {
  const raw = field(form, "hours");
  if (raw === "forever") return null;
  const hours = Number(raw);
  return OVERRIDE_DURATIONS.some((d) => d.hours === hours) ? hours : undefined;
}

function done(message: string): AdminState {
  revalidatePath("/");
  revalidatePath("/admin");
  refresh();
  return { ok: message };
}

export async function saveDefault(_prev: AdminState, form: FormData): Promise<AdminState> {
  if (!(await requireAdmin())) return { error: "Not signed in." };
  const setting = settingFrom(form);
  if (!setting) return { error: "That setting doesn't look right." };
  await setDefault(setting.key, setting.value);
  return done("Default saved.");
}

export async function applyOverride(_prev: AdminState, form: FormData): Promise<AdminState> {
  if (!(await requireStaff())) return { error: "Not signed in." };
  const setting = settingFrom(form);
  const hours = durationFrom(form);
  if (!setting || hours === undefined) return { error: "That setting doesn't look right." };
  await setOverride(setting.key, setting.value, hours);
  return done("Temporary change applied.");
}

export async function revertOverride(key: string): Promise<void> {
  if (!(await requireStaff()) || !isSettingKey(key)) return;
  await clearOverride(key);
  revalidatePath("/");
  revalidatePath("/admin");
  refresh();
}

export async function revertAllOverrides(): Promise<void> {
  if (!(await requireStaff())) return;
  await clearAllOverrides();
  revalidatePath("/");
  revalidatePath("/admin");
  refresh();
}

/** The big red button: read-only until an admin turns it back on. */
export async function stopEverything(): Promise<void> {
  if (!(await requireStaff())) return;
  await setOverride("readOnly", true, null);
  await notifyDiscord("Board paused", "A tutor switched on read-only mode.");
  revalidatePath("/");
  revalidatePath("/admin");
  refresh();
}

/** Picks a new tutor password right now and posts it to Discord. */
export async function rotatePassword(): Promise<void> {
  if (!(await requireAdmin())) return;
  await rotateAdminPassword();
  revalidatePath("/admin");
  refresh();
}

// ---------------------------------------------------------------------------
// Word filter

export async function addFilterWord(_prev: AdminState, form: FormData): Promise<AdminState> {
  if (!(await requireStaff())) return { error: "Not signed in." };
  const list = field(form, "list");
  const word = field(form, "word").toLowerCase();
  if (list !== "blocked" && list !== "allowed") return { error: "Unknown list." };
  if (!isUsableWord(word)) {
    return { error: "Use 2–40 letters, numbers, spaces, apostrophes, or hyphens." };
  }
  await addWord(word, list);
  return done(list === "blocked" ? `"${word}" is now blocked.` : `"${word}" is allowed again.`);
}

export async function deleteFilterWord(word: string, list: "blocked" | "allowed"): Promise<void> {
  if (!(await requireStaff())) return;
  if (list !== "blocked" && list !== "allowed") return;
  await removeWord(word, list);
  revalidatePath("/admin");
  refresh();
}

export async function testFilter(_prev: AdminState, form: FormData): Promise<AdminState> {
  if (!(await requireStaff())) return { error: "Not signed in." };
  const text = field(form, "text").slice(0, 500);
  if (!text) return {};
  const { clean, censored } = await runFilter([text]);
  return { ok: clean ? `No match: ${censored[0]}` : `Match: ${censored[0]}` };
}

// ---------------------------------------------------------------------------
// Badge holders (teachers and other vouched-for people)

/** The generated code is shown once, in `ok`, so an admin can copy it. */
export async function addMember(_prev: AdminState, form: FormData): Promise<AdminState> {
  if (!(await requireAdmin())) return { error: "Admins only." };
  const title = field(form, "title");
  const color = field(form, "color");
  if (!isUsableTitle(title)) return { error: "Badge text is 2–24 letters, numbers, or spaces." };
  if (!isBadgeColor(color)) return { error: "Pick a badge color." };
  const code = await createMember(title, color, field(form, "note").slice(0, 120));
  revalidatePath("/admin");
  return { ok: code };
}

export async function saveMember(_prev: AdminState, form: FormData): Promise<AdminState> {
  if (!(await requireAdmin())) return { error: "Admins only." };
  const id = Number(field(form, "id"));
  const title = field(form, "title");
  const color = field(form, "color");
  if (!isId(id)) return { error: "Unknown member." };
  if (!isUsableTitle(title)) return { error: "Badge text is 2–24 letters, numbers, or spaces." };
  if (!isBadgeColor(color)) return { error: "Pick a badge color." };
  await updateMember(id, {
    title,
    color: color as BadgeColor,
    note: field(form, "note").slice(0, 120),
    relaxed_limits: field(form, "relaxed_limits") === "on",
    skip_review: field(form, "skip_review") === "on",
  });
  return done("Saved.");
}

/** Hands out a fresh code. Their posts and badge stay; the old code stops working. */
export async function newMemberCode(_prev: AdminState, form: FormData): Promise<AdminState> {
  if (!(await requireAdmin())) return { error: "Admins only." };
  const id = Number(field(form, "id"));
  if (!isId(id)) return { error: "Unknown member." };
  const code = await regenerateCode(id);
  if (!code) return { error: "Unknown member." };
  revalidatePath("/admin");
  return { ok: code };
}

export async function toggleMember(id: number, active: boolean): Promise<void> {
  if (!(await requireAdmin()) || !isId(id) || typeof active !== "boolean") return;
  await setMemberActive(id, active);
  revalidatePath("/");
  revalidatePath("/admin");
  refresh();
}

// ---------------------------------------------------------------------------
// Moderation queue

type PostType = "q" | "a";

function isId(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) > 0 && (value as number) <= 2_147_483_647;
}

function isPost(type: string, id: number): type is PostType {
  return (type === "q" || type === "a") && Number.isSafeInteger(id) && id > 0 && id <= 2_147_483_647;
}

async function recount(questionId: number) {
  const sql = await db();
  await sql`
    UPDATE questions SET answer_count = (
      SELECT count(*) FROM answers WHERE question_id = ${questionId} AND status = 'visible'
    ) WHERE id = ${questionId}
  `;
}

/** Publishes a held or hidden post, and marks it reviewed so reports don't re-hide it. */
export async function approvePost(type: string, id: number): Promise<void> {
  if (!(await requireStaff()) || !isPost(type, id)) return;
  const sql = await db();
  const table = sql(type === "q" ? "questions" : "answers");
  const [row] = await sql<{ question_id: number }[]>`
    UPDATE ${table}
    SET status = 'visible', status_reason = NULL, reviewed_at = now()
    WHERE id = ${id}
    RETURNING ${type === "q" ? sql`id` : sql`question_id`} AS question_id
  `;
  if (row && type === "a") await recount(row.question_id);
  revalidatePath("/");
  revalidatePath("/admin");
  refresh();
}

export async function hidePost(type: string, id: number): Promise<void> {
  if (!(await requireStaff()) || !isPost(type, id)) return;
  const sql = await db();
  const table = sql(type === "q" ? "questions" : "answers");
  const [row] = await sql<{ question_id: number }[]>`
    UPDATE ${table}
    SET status = 'hidden', status_reason = 'tutor', reviewed_at = now()
    WHERE id = ${id}
    RETURNING ${type === "q" ? sql`id` : sql`question_id`} AS question_id
  `;
  if (row && type === "a") await recount(row.question_id);
  revalidatePath("/");
  revalidatePath("/admin");
  refresh();
}

/** Flood cleanup: removes everything one browser (or one network) posted in the last day. */
export async function deleteByPoster(scope: "owner" | "ip", value: string): Promise<void> {
  if ((scope !== "owner" && scope !== "ip") || typeof value !== "string" || !value) return;
  // Wiping a whole network can catch bystanders on campus Wi-Fi, so that half is admin-only.
  if (!(scope === "ip" ? await requireAdmin() : await requireStaff())) return;

  const sql = await db();
  const column = sql(scope === "owner" ? "owner_id" : "ip_hash");
  const window = sql`created_at > now() - interval '1 day'`;
  const images = await sql.begin(async (tx) => {
    // Gather everything first: deleting a question cascades to its answers.
    const questions = await tx<{ id: number; image_url: string | null }[]>`
      SELECT id, image_url FROM questions WHERE ${column} = ${value} AND ${window}
    `;
    const questionIds = questions.map((q) => q.id);
    const cascaded = await tx<{ id: number; image_url: string | null }[]>`
      SELECT id, image_url FROM answers WHERE question_id = ANY(${questionIds}::int[])
    `;
    const answers = await tx<{ id: number; question_id: number; image_url: string | null }[]>`
      SELECT id, question_id, image_url FROM answers
      WHERE ${column} = ${value} AND ${window} AND NOT (question_id = ANY(${questionIds}::int[]))
    `;
    const answerIds = [...cascaded.map((a) => a.id), ...answers.map((a) => a.id)];

    for (const table of ["votes", "claims", "reports"]) {
      await tx`
        DELETE FROM ${tx(table)}
        WHERE (target_type = 'q' AND target_id = ANY(${questionIds}::int[]))
           OR (target_type = 'a' AND target_id = ANY(${answerIds}::int[]))
      `;
    }
    await tx`DELETE FROM answers WHERE id = ANY(${answers.map((a) => a.id)}::int[])`;
    await tx`DELETE FROM questions WHERE id = ANY(${questionIds}::int[])`;
    for (const questionId of new Set(answers.map((a) => a.question_id))) {
      await tx`
        UPDATE questions SET answer_count = (
          SELECT count(*) FROM answers WHERE question_id = ${questionId} AND status = 'visible'
        ) WHERE id = ${questionId}
      `;
    }
    return [...questions, ...cascaded, ...answers].map((row) => row.image_url);
  });
  await deleteImages(images);
  revalidatePath("/");
  revalidatePath("/admin");
  refresh();
}

// ---------------------------------------------------------------------------
// Check-ins

/** Removes one check-in, e.g. a joke entry from someone who photographed the QR code. */
export async function removeCheckin(id: number): Promise<void> {
  if (!(await requireStaff()) || !Number.isSafeInteger(id)) return;
  await deleteCheckin(id);
  revalidatePath("/admin");
  refresh();
}
