"use server";

import { refresh, revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import {
  getIpHash,
  getOrCreateVisitorId,
  isAdmin,
  logInAdmin,
  logOutAdmin,
} from "@/lib/identity";
import { checkImage, deleteImages, saveImage } from "@/lib/storage";
import { isTag } from "@/lib/tags";

export type FormState = { error?: string; ok?: boolean };

// Spam limits: per browser, and a looser one per IP (campus Wi-Fi shares IPs).
const WINDOW = "10 minutes";
const MAX_POSTS_PER_VISITOR = 6;
const MAX_POSTS_PER_IP = 40;

const LIMITS = { title: 150, body: 5000, author: 30 };

function text(form: FormData, key: string): string {
  const value = form.get(key);
  // Browsers submit textarea line breaks as \r\n.
  return typeof value === "string" ? value.replace(/\r\n?/g, "\n").trim() : "";
}

function imageFrom(form: FormData): File | null {
  const value = form.get("image");
  return value instanceof File && value.size > 0 ? value : null;
}

async function checkRateLimit(visitorId: string, ipHash: string): Promise<string | null> {
  const sql = await db();
  const [counts] = await sql<{ by_visitor: number; by_ip: number }[]>`
    WITH recent AS (
      SELECT owner_id, ip_hash FROM questions WHERE created_at > now() - ${WINDOW}::interval
      UNION ALL
      SELECT owner_id, ip_hash FROM answers WHERE created_at > now() - ${WINDOW}::interval
    )
    SELECT count(*) FILTER (WHERE owner_id = ${visitorId})::int AS by_visitor,
           count(*) FILTER (WHERE ip_hash = ${ipHash})::int AS by_ip
    FROM recent
  `;
  if (counts.by_visitor >= MAX_POSTS_PER_VISITOR || counts.by_ip >= MAX_POSTS_PER_IP) {
    return "You're posting a lot — take a breather and try again in a few minutes.";
  }
  return null;
}

/** Shared validation + image upload for questions and answers. */
async function prepare(form: FormData) {
  const author = text(form, "author").slice(0, LIMITS.author);
  const image = imageFrom(form);
  if (image) {
    const problem = checkImage(image);
    if (problem) return { error: problem } as const;
  }
  const visitorId = await getOrCreateVisitorId();
  const ipHash = await getIpHash();
  const limited = await checkRateLimit(visitorId, ipHash);
  if (limited) return { error: limited } as const;

  let imageUrl: string | null = null;
  if (image) {
    try {
      imageUrl = await saveImage(image);
    } catch (err) {
      console.error("image upload failed", err);
      return { error: "Couldn't upload the image. Try again or post without it." } as const;
    }
  }
  return { author, visitorId, ipHash, imageUrl } as const;
}

export async function createQuestion(_prev: FormState, form: FormData): Promise<FormState> {
  // Bots fill every field; people never see this one.
  if (text(form, "website")) return { ok: true };

  const title = text(form, "title");
  const body = text(form, "body");
  const tag = text(form, "tag");
  if (title.length < 5) return { error: "Give your question a title (at least 5 characters)." };
  if (title.length > LIMITS.title) return { error: `Title must be under ${LIMITS.title} characters.` };
  if (body.length > LIMITS.body) return { error: `Details must be under ${LIMITS.body} characters.` };
  if (!isTag(tag)) return { error: "Pick a tag." };

  const ready = await prepare(form);
  if ("error" in ready) return { error: ready.error };

  const sql = await db();
  const [row] = await sql<{ id: number }[]>`
    INSERT INTO questions (title, body, tag, author, image_url, owner_id, ip_hash)
    VALUES (${title}, ${body}, ${tag}, ${ready.author}, ${ready.imageUrl},
            ${ready.visitorId}, ${ready.ipHash})
    RETURNING id
  `;
  revalidatePath("/");
  redirect(`/q/${row.id}`);
}

export async function createAnswer(_prev: FormState, form: FormData): Promise<FormState> {
  if (text(form, "website")) return { ok: true };

  const questionId = Number(text(form, "questionId"));
  const body = text(form, "body");
  if (!Number.isInteger(questionId)) return { error: "Unknown question." };
  if (body.length < 1 && !imageFrom(form)) return { error: "Write something first." };
  if (body.length > LIMITS.body) return { error: `Answers must be under ${LIMITS.body} characters.` };

  const ready = await prepare(form);
  if ("error" in ready) return { error: ready.error };

  const sql = await db();
  const inserted = await sql.begin(async (tx) => {
    const [row] = await tx<{ id: number }[]>`
      INSERT INTO answers (question_id, body, author, image_url, owner_id, ip_hash)
      SELECT ${questionId}::int, ${body}::text, ${ready.author}::text, ${ready.imageUrl}::text,
             ${ready.visitorId}::text, ${ready.ipHash}::text
      WHERE EXISTS (SELECT 1 FROM questions WHERE id = ${questionId})
      RETURNING id
    `;
    if (row) {
      await tx`UPDATE questions SET answer_count = answer_count + 1 WHERE id = ${questionId}`;
    }
    return !!row;
  });
  if (!inserted) {
    await deleteImages([ready.imageUrl]);
    return { error: "That question was deleted." };
  }

  revalidatePath("/");
  refresh();
  return { ok: true };
}

export async function toggleVote(type: "q" | "a", id: number): Promise<void> {
  if ((type !== "q" && type !== "a") || !Number.isInteger(id)) return;
  const visitorId = await getOrCreateVisitorId();
  const sql = await db();
  const table = sql(type === "q" ? "questions" : "answers");

  await sql.begin(async (tx) => {
    const removed = await tx`
      DELETE FROM votes
      WHERE target_type = ${type} AND target_id = ${id} AND voter_id = ${visitorId}
      RETURNING 1
    `;
    if (removed.length) {
      await tx`UPDATE ${table} SET score = score - 1 WHERE id = ${id}`;
      return;
    }
    const [target] = await tx`SELECT 1 FROM ${table} WHERE id = ${id}`;
    if (!target) return;
    await tx`INSERT INTO votes (target_type, target_id, voter_id) VALUES (${type}, ${id}, ${visitorId})`;
    await tx`UPDATE ${table} SET score = score + 1 WHERE id = ${id}`;
  });
  revalidatePath("/");
  refresh();
}

/** The question's author can mark (or unmark) one answer as the one that solved it. */
export async function toggleAccepted(questionId: number, answerId: number): Promise<void> {
  if (!Number.isInteger(questionId) || !Number.isInteger(answerId)) return;
  const visitorId = await getOrCreateVisitorId();
  const sql = await db();
  await sql`
    UPDATE questions
    SET accepted_answer_id = CASE WHEN accepted_answer_id = ${answerId}::int THEN NULL ELSE ${answerId}::int END
    WHERE id = ${questionId} AND owner_id = ${visitorId}
      AND EXISTS (SELECT 1 FROM answers WHERE id = ${answerId} AND question_id = ${questionId})
  `;
  revalidatePath("/");
  refresh();
}

/** Authors can delete their own posts; the admin can delete anything. */
export async function deleteQuestion(id: number): Promise<void> {
  if (!Number.isInteger(id)) return;
  const admin = await isAdmin();
  const visitorId = await getOrCreateVisitorId();
  const sql = await db();
  const images = await sql.begin(async (tx) => {
    const [row] = await tx<{ image_url: string | null }[]>`
      SELECT image_url FROM questions
      WHERE id = ${id} AND (${admin}::boolean OR owner_id = ${visitorId})
      FOR UPDATE
    `;
    if (!row) return null;
    const answers = await tx<{ id: number; image_url: string | null }[]>`
      SELECT id, image_url FROM answers WHERE question_id = ${id}
    `;
    const answerIds = answers.map((a) => a.id);
    await tx`
      DELETE FROM votes
      WHERE (target_type = 'q' AND target_id = ${id})
         OR (target_type = 'a' AND target_id = ANY(${answerIds}::int[]))
    `;
    // Answers go with it via ON DELETE CASCADE.
    await tx`DELETE FROM questions WHERE id = ${id}`;
    return [row.image_url, ...answers.map((a) => a.image_url)];
  });
  if (!images) return;
  await deleteImages(images);
  revalidatePath("/");
  redirect("/");
}

export async function deleteAnswer(id: number): Promise<void> {
  if (!Number.isInteger(id)) return;
  const admin = await isAdmin();
  const visitorId = await getOrCreateVisitorId();
  const sql = await db();
  const imageUrl = await sql.begin(async (tx) => {
    const [row] = await tx<{ question_id: number; image_url: string | null }[]>`
      DELETE FROM answers
      WHERE id = ${id} AND (${admin}::boolean OR owner_id = ${visitorId})
      RETURNING question_id, image_url
    `;
    if (!row) return null;
    await tx`
      UPDATE questions
      SET answer_count = answer_count - 1,
          accepted_answer_id = NULLIF(accepted_answer_id, ${id}::int)
      WHERE id = ${row.question_id}
    `;
    await tx`DELETE FROM votes WHERE target_type = 'a' AND target_id = ${id}`;
    return row.image_url;
  });
  await deleteImages([imageUrl]);
  revalidatePath("/");
  refresh();
}

export async function adminLogin(_prev: FormState, form: FormData): Promise<FormState> {
  const ok = await logInAdmin(text(form, "password"));
  if (!ok) return { error: "Wrong password." };
  redirect("/");
}

export async function adminLogout(): Promise<void> {
  await logOutAdmin();
  redirect("/");
}
