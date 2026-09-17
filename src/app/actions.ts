"use server";

import { refresh, revalidatePath } from "next/cache";
import { after } from "next/server";
import { redirect } from "next/navigation";
import type postgres from "postgres";
import { hashCode, newCode, normalizeCode } from "@/lib/codes";
import { db } from "@/lib/db";
import {
  getIpHash,
  getOrCreateVisitorId,
  isStaff,
  logInAdmin,
  logOutAdmin,
} from "@/lib/identity";
import { getMember, logInMember, type Member } from "@/lib/members";
import { isDuplicate, moderate } from "@/lib/moderation";
import { notifyDiscord } from "@/lib/notify";
import { REPORT_REASONS } from "@/lib/report-reasons";
import { getSettings } from "@/lib/settings-store";
import { checkImage, deleteImages, saveImage } from "@/lib/storage";
import { isTag } from "@/lib/tags";

export type FormState = {
  error?: string;
  ok?: boolean;
  /** Set after posting: the new question's id, and the one-time recovery code. */
  id?: number;
  code?: string;
  /** The post is waiting for a tutor to approve it. */
  pending?: boolean;
};

const READ_ONLY = "The board is paused right now. Check back in a bit!";
const ALREADY_POSTED = "You already posted that.";

// Spam limits: per browser, and looser ones per IP (campus Wi-Fi shares IPs).
const MAX_POSTS_PER_VISITOR = 6; // per 10 minutes
const MAX_POSTS_PER_IP = 40; // per 10 minutes
const MAX_IMAGES_PER_IP = 100; // per hour
const MAX_IMAGE_MB_PER_DAY = 150; // whole site; keeps the free 1 GB Blob store from filling up
const MAX_VOTES_PER_IP_PER_POST = 50; // per hour
const MAX_EDITS_PER_VISITOR = 20; // per 10 minutes
const MAX_LOGIN_FAILURES_PER_IP = 5; // per 15 minutes
const MAX_LOGIN_FAILURES_TOTAL = 30; // per 15 minutes, across all IPs
const MAX_CODE_FAILURES_PER_IP = 20; // per 15 minutes
const MAX_REPORTS_PER_IP = 30; // per 10 minutes

const LIMITS = { title: 150, body: 5000, author: 30 };

// Postgres integer ids; anything outside this range can't exist.
function isId(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) > 0 && (value as number) <= 2_147_483_647;
}

// Control characters (except tab/newline) break Postgres text or hide content.
const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

function text(form: FormData, key: string): string {
  const value = form.get(key);
  if (typeof value !== "string") return "";
  // Browsers submit textarea line breaks as \r\n.
  return value.replace(/\r\n?/g, "\n").replace(CONTROL_CHARS, "").trim();
}

/** Length ignoring whitespace and invisible formatting characters (zero-width spaces etc.). */
function visibleLength(value: string): number {
  return value.replace(/[\s\p{Cf}]/gu, "").length;
}

function imageFrom(form: FormData): File | null {
  const value = form.get("image");
  return value instanceof File && value.size > 0 ? value : null;
}


function textFields(form: FormData) {
  return {
    title: text(form, "title"),
    body: text(form, "body"),
    tag: text(form, "tag"),
  };
}

function questionError({ title, body, tag }: ReturnType<typeof textFields>): string | null {
  if (visibleLength(title) < 5) return "Give your question a title (at least 5 characters).";
  if (title.length > LIMITS.title) return `Title must be under ${LIMITS.title} characters.`;
  if (body.length > LIMITS.body) return `Details must be under ${LIMITS.body} characters.`;
  if (!isTag(tag)) return "Pick a tag.";
  return null;
}

function answerError(body: string, hasImage: boolean): string | null {
  if (visibleLength(body) < 1 && !hasImage) return "Write something first.";
  if (body.length > LIMITS.body) return `Answers must be under ${LIMITS.body} characters.`;
  return null;
}

// ---------------------------------------------------------------------------
// Rate limits

type Who = { visitorId: string; ipHash: string; member: Member | null };
type ActivityKind = "post" | "upload" | "edit" | "login_fail" | "code_fail" | "report";

async function whoAmI(): Promise<Who> {
  return {
    visitorId: await getOrCreateVisitorId(),
    ipHash: await getIpHash(),
    member: await getMember(),
  };
}

// Badge holders a tutor vouched for get more room before the spam limits bite.
const RELAXED = 5;

function postingBlocked(who: Who, activity: Activity): boolean {
  if (who.member?.relaxed_limits) {
    return activity.posts_by_visitor >= MAX_POSTS_PER_VISITOR * RELAXED;
  }
  return activity.posts_by_visitor >= MAX_POSTS_PER_VISITOR || activity.posts_by_ip >= MAX_POSTS_PER_IP;
}

async function logActivity(kind: ActivityKind, who: Pick<Who, "ipHash"> & { visitorId?: string }, bytes = 0) {
  const sql = await db();
  await sql`
    INSERT INTO activity (kind, ip_hash, visitor_id, bytes)
    VALUES (${kind}, ${who.ipHash}, ${who.visitorId ?? ""}, ${bytes})
  `;
  await sql`DELETE FROM activity WHERE created_at < now() - interval '2 days'`;
}

type Activity = {
  posts_by_visitor: number;
  posts_by_ip: number;
  edits_by_visitor: number;
  uploads_by_ip: number;
  upload_bytes_today: number;
  login_fails_by_ip: number;
  login_fails_total: number;
  code_fails_by_ip: number;
  reports_by_ip: number;
};

async function recentActivity(who: Pick<Who, "ipHash"> & { visitorId?: string }): Promise<Activity> {
  const sql = await db();
  const visitor = who.visitorId ?? "";
  const [row] = await sql<Activity[]>`
    SELECT
      count(*) FILTER (WHERE kind = 'post' AND visitor_id = ${visitor} AND created_at > now() - interval '10 minutes')::int AS posts_by_visitor,
      count(*) FILTER (WHERE kind = 'post' AND ip_hash = ${who.ipHash} AND created_at > now() - interval '10 minutes')::int AS posts_by_ip,
      count(*) FILTER (WHERE kind = 'edit' AND visitor_id = ${visitor} AND created_at > now() - interval '10 minutes')::int AS edits_by_visitor,
      count(*) FILTER (WHERE kind = 'upload' AND ip_hash = ${who.ipHash} AND created_at > now() - interval '1 hour')::int AS uploads_by_ip,
      coalesce(sum(bytes) FILTER (WHERE kind = 'upload'), 0)::float8 AS upload_bytes_today,
      count(*) FILTER (WHERE kind = 'login_fail' AND ip_hash = ${who.ipHash} AND created_at > now() - interval '15 minutes')::int AS login_fails_by_ip,
      count(*) FILTER (WHERE kind = 'login_fail' AND created_at > now() - interval '15 minutes')::int AS login_fails_total,
      count(*) FILTER (WHERE kind = 'code_fail' AND ip_hash = ${who.ipHash} AND created_at > now() - interval '15 minutes')::int AS code_fails_by_ip,
      count(*) FILTER (WHERE kind = 'report' AND ip_hash = ${who.ipHash} AND created_at > now() - interval '10 minutes')::int AS reports_by_ip
    FROM activity
    WHERE created_at > now() - interval '1 day'
  `;
  return row;
}

const SLOW_DOWN = "You're posting a lot — take a breather and try again in a few minutes.";

/** Validates and stores an optional photo, counting it against the upload limits. */
async function storeImage(
  image: File | null,
  who: Who,
  activity: Activity,
): Promise<{ url: string | null } | { error: string }> {
  if (!image) return { url: null };
  const problem = await checkImage(image);
  if (problem) return { error: problem };
  if (!who.member?.relaxed_limits && activity.uploads_by_ip >= MAX_IMAGES_PER_IP) {
    return { error: "That's a lot of photos from your network — post without one or try again later." };
  }
  if (activity.upload_bytes_today + image.size > MAX_IMAGE_MB_PER_DAY * 1024 * 1024) {
    return { error: "Photo uploads are paused for today. You can still post without one." };
  }
  try {
    const url = await saveImage(image);
    await logActivity("upload", who, image.size);
    return { url };
  } catch (err) {
    console.error("image upload failed", err);
    return { error: "Couldn't upload the image. Try again or post without it." };
  }
}

// ---------------------------------------------------------------------------
// Ownership and recovery codes

const CODE_LENGTH = 12; // 3 groups of 4, 60 bits

type PostType = "q" | "a";

/**
 * SQL condition: this visitor wrote the post, unlocked it with its recovery code,
 * or is signed in as the badge holder who posted it.
 */
function ownedBy(sql: postgres.Sql, type: PostType, id: number, visitorId: string, memberId?: number | null) {
  return sql`(
    owner_id = ${visitorId}
    OR EXISTS (SELECT 1 FROM claims c
               WHERE c.target_type = ${type} AND c.target_id = ${id} AND c.visitor_id = ${visitorId})
    ${memberId ? sql`OR member_id = ${memberId}` : sql``}
  )`;
}

/** Keeps answer_count in sync with the answers people can actually see. */
async function recountAnswers(tx: postgres.TransactionSql | postgres.Sql, questionId: number) {
  await tx`
    UPDATE questions SET answer_count = (
      SELECT count(*) FROM answers WHERE question_id = ${questionId} AND status = 'visible'
    ) WHERE id = ${questionId}
  `;
}

// ---------------------------------------------------------------------------
// Posting

export async function createQuestion(_prev: FormState, form: FormData): Promise<FormState> {
  // Bots fill every field; people never see this one.
  if (text(form, "website")) return {};

  const fields = textFields(form);
  const invalid = questionError(fields);
  if (invalid) return { error: invalid };

  const settings = await getSettings();
  if (settings.readOnly) return { error: READ_ONLY };

  const who = await whoAmI();
  const activity = await recentActivity(who);
  if (postingBlocked(who, activity)) return { error: SLOW_DOWN };
  if (await isDuplicate("questions", "title", fields.title, who.visitorId, who.ipHash)) {
    return { error: ALREADY_POSTED };
  }

  const author = text(form, "author").slice(0, LIMITS.author);
  const verdict = await moderate(
    [fields.title, fields.body, author],
    settings.filterMode,
    settings.approvalRequired,
  );
  if (verdict.action === "block") return { error: verdict.reason };
  const [title, body, nickname] = verdict.texts;

  const image = imageFrom(form);
  if (image && settings.uploadsPaused) {
    return { error: "Photo uploads are paused right now. You can still post text." };
  }
  const stored = await storeImage(image, who, activity);
  if ("error" in stored) return { error: stored.error };

  const pending = verdict.action === "review" && !who.member?.skip_review;
  const code = newCode();
  const sql = await db();
  const [row] = await sql<{ id: number }[]>`
    INSERT INTO questions (title, body, tag, author, image_url, owner_id, member_id, recovery_hash,
                           ip_hash, status, status_reason)
    VALUES (${title}, ${body}, ${fields.tag}, ${nickname}, ${stored.url}, ${who.visitorId},
            ${who.member?.id ?? null}, ${hashCode(code)}, ${who.ipHash},
            ${pending ? "pending" : "visible"}, ${pending ? verdict.reason : null})
    RETURNING id
  `;
  await logActivity("post", who);
  if (pending || settings.notifyAllPosts) {
    after(
      notifyDiscord(
        pending && verdict.action === "review" ? `Question waiting for review (${verdict.reason})` : "New question",
        title,
        `/q/${row.id}`,
      ),
    );
  }
  revalidatePath("/");
  return { ok: true, id: row.id, code, pending };
}

export async function createAnswer(_prev: FormState, form: FormData): Promise<FormState> {
  if (text(form, "website")) return {};

  const questionId = Number(text(form, "questionId"));
  const body = text(form, "body");
  if (!isId(questionId)) return { error: "Unknown question." };
  const invalid = answerError(body, !!imageFrom(form));
  if (invalid) return { error: invalid };

  const settings = await getSettings();
  if (settings.readOnly) return { error: READ_ONLY };

  const who = await whoAmI();
  const activity = await recentActivity(who);
  if (postingBlocked(who, activity)) return { error: SLOW_DOWN };
  if (await isDuplicate("answers", "body", body, who.visitorId, who.ipHash)) {
    return { error: ALREADY_POSTED };
  }

  const author = text(form, "author").slice(0, LIMITS.author);
  const verdict = await moderate([body, author], settings.filterMode, settings.approvalRequired);
  if (verdict.action === "block") return { error: verdict.reason };
  const [cleanBody, nickname] = verdict.texts;

  const image = imageFrom(form);
  if (image && settings.uploadsPaused) {
    return { error: "Photo uploads are paused right now. You can still post text." };
  }
  const stored = await storeImage(image, who, activity);
  if ("error" in stored) return { error: stored.error };

  const pending = verdict.action === "review" && !who.member?.skip_review;
  const code = newCode();
  const sql = await db();
  const inserted = await sql.begin(async (tx) => {
    const [row] = await tx<{ id: number }[]>`
      INSERT INTO answers (question_id, body, author, image_url, owner_id, member_id, recovery_hash,
                           ip_hash, status, status_reason)
      SELECT ${questionId}::int, ${cleanBody}::text, ${nickname}::text, ${stored.url}::text,
             ${who.visitorId}::text, ${who.member?.id ?? null}::int, ${hashCode(code)}::text,
             ${who.ipHash}::text,
             ${pending ? "pending" : "visible"}::text, ${pending ? verdict.reason : null}::text
      WHERE EXISTS (SELECT 1 FROM questions WHERE id = ${questionId})
      RETURNING id
    `;
    if (row) await recountAnswers(tx, questionId);
    return !!row;
  });
  if (!inserted) {
    await deleteImages([stored.url]);
    return { error: "That question was deleted." };
  }

  await logActivity("post", who);
  if (pending || settings.notifyAllPosts) {
    after(
      notifyDiscord(
        pending && verdict.action === "review" ? `Answer waiting for review (${verdict.reason})` : "New answer",
        cleanBody,
        `/q/${questionId}`,
      ),
    );
  }
  revalidatePath("/");
  refresh();
  return { ok: true, code, pending };
}

// ---------------------------------------------------------------------------
// Editing

type ImageChange = { kind: "keep" } | { kind: "remove" } | { kind: "replace"; file: File };

function imageChangeFrom(form: FormData): ImageChange {
  const file = imageFrom(form);
  if (text(form, "imageAction") === "replace" && file) return { kind: "replace", file };
  if (text(form, "imageAction") === "remove") return { kind: "remove" };
  return { kind: "keep" };
}

/**
 * Shared edit flow: checks limits and ownership, stores a new photo if any,
 * runs `update` with the resulting image URL, then removes the old photo.
 */
async function editPost(
  type: PostType,
  id: number,
  change: ImageChange,
  update: (tx: postgres.TransactionSql, imageUrl: string | null) => Promise<unknown>,
): Promise<FormState> {
  if ((await getSettings()).readOnly) return { error: READ_ONLY };
  const who = await whoAmI();
  const activity = await recentActivity(who);
  if (activity.edits_by_visitor >= MAX_EDITS_PER_VISITOR) {
    return { error: "You're editing a lot — try again in a few minutes." };
  }

  const sql = await db();
  const table = sql(type === "q" ? "questions" : "answers");
  const [current] = await sql<{ image_url: string | null }[]>`
    SELECT image_url FROM ${table} WHERE id = ${id} AND ${ownedBy(sql, type, id, who.visitorId, who.member?.id)}
  `;
  if (!current) return { error: "You can't edit this post from this browser." };

  let newUrl: string | null = null;
  if (change.kind === "replace") {
    if ((await getSettings()).uploadsPaused) {
      return { error: "Photo uploads are paused right now." };
    }
    const stored = await storeImage(change.file, who, activity);
    if ("error" in stored) return { error: stored.error };
    newUrl = stored.url;
  }

  const oldUrl = await sql.begin(async (tx) => {
    const [locked] = await tx<{ image_url: string | null }[]>`
      SELECT image_url FROM ${table} WHERE id = ${id} AND ${ownedBy(sql, type, id, who.visitorId, who.member?.id)}
      FOR UPDATE
    `;
    if (!locked) return undefined;
    await update(tx, change.kind === "keep" ? locked.image_url : newUrl);
    return locked.image_url;
  });
  if (oldUrl === undefined) {
    await deleteImages([newUrl]);
    return { error: "That post was deleted." };
  }
  if (change.kind !== "keep") await deleteImages([oldUrl]);

  await logActivity("edit", who);
  revalidatePath("/");
  refresh();
  return { ok: true };
}

export async function updateQuestion(_prev: FormState, form: FormData): Promise<FormState> {
  const id = Number(text(form, "id"));
  if (!isId(id)) return { error: "Unknown question." };
  const fields = textFields(form);
  const invalid = questionError(fields);
  if (invalid) return { error: invalid };

  const settings = await getSettings();
  const verdict = await moderate([fields.title, fields.body], settings.filterMode, false);
  if (verdict.action === "block") return { error: verdict.reason };
  const [title, body] = verdict.texts;
  const held = verdict.action === "review" ? verdict.reason : null;

  const result = await editPost("q", id, imageChangeFrom(form), (tx, imageUrl) => tx`
    UPDATE questions
    SET title = ${title}, body = ${body}, tag = ${fields.tag}, image_url = ${imageUrl}, edited_at = now(),
        status = CASE WHEN ${held !== null} THEN 'pending' ELSE status END,
        status_reason = CASE WHEN ${held !== null} THEN ${held} ELSE status_reason END
    WHERE id = ${id}
  `);
  if (result.ok && held) {
    after(notifyDiscord(`Edited question waiting for review (${held})`, title, `/q/${id}`));
  }
  return held && result.ok ? { ...result, pending: true } : result;
}

export async function updateAnswer(_prev: FormState, form: FormData): Promise<FormState> {
  const id = Number(text(form, "id"));
  if (!isId(id)) return { error: "Unknown answer." };
  const body = text(form, "body");
  const change = imageChangeFrom(form);
  const sql = await db();
  const [existing] = await sql<{ image_url: string | null }[]>`SELECT image_url FROM answers WHERE id = ${id}`;
  const willHaveImage = change.kind === "replace" || (change.kind === "keep" && !!existing?.image_url);
  const invalid = answerError(body, willHaveImage);
  if (invalid) return { error: invalid };

  const settings = await getSettings();
  const verdict = await moderate([body], settings.filterMode, false);
  if (verdict.action === "block") return { error: verdict.reason };
  const [cleanBody] = verdict.texts;
  const held = verdict.action === "review" ? verdict.reason : null;

  const result = await editPost("a", id, change, async (tx, imageUrl) => {
    const [row] = await tx<{ question_id: number }[]>`
      UPDATE answers
      SET body = ${cleanBody}, image_url = ${imageUrl}, edited_at = now(),
          status = CASE WHEN ${held !== null} THEN 'pending' ELSE status END,
          status_reason = CASE WHEN ${held !== null} THEN ${held} ELSE status_reason END
      WHERE id = ${id}
      RETURNING question_id
    `;
    if (row) await recountAnswers(tx, row.question_id);
  });
  if (result.ok && held) {
    after(notifyDiscord(`Edited answer waiting for review (${held})`, cleanBody, `/q/${id}`));
  }
  return held && result.ok ? { ...result, pending: true } : result;
}

// ---------------------------------------------------------------------------
// Reporting

/** Anyone can report a post; enough reports hide it until a tutor looks. */
export async function reportPost(type: PostType, id: number, reason: string): Promise<void> {
  if ((type !== "q" && type !== "a") || !isId(id)) return;
  if (!(REPORT_REASONS as readonly string[]).includes(reason)) return;

  const who = await whoAmI();
  const activity = await recentActivity(who);
  if (activity.reports_by_ip >= MAX_REPORTS_PER_IP) return;

  const sql = await db();
  const table = sql(type === "q" ? "questions" : "answers");
  const added = await sql`
    INSERT INTO reports (target_type, target_id, reporter_id, reason)
    SELECT ${type}, ${id}, ${who.visitorId}, ${reason}
    WHERE EXISTS (SELECT 1 FROM ${table} WHERE id = ${id})
    ON CONFLICT DO NOTHING
    RETURNING 1
  `;
  if (!added.length) return;
  await logActivity("report", who);

  const threshold = (await getSettings()).reportThreshold;
  const [row] = await sql<{ reports: number; status: string; reviewed: boolean; label: string; question_id: number }[]>`
    SELECT (SELECT count(*)::int FROM reports WHERE target_type = ${type} AND target_id = ${id}) AS reports,
           t.status, (t.reviewed_at IS NOT NULL) AS reviewed,
           ${type === "q" ? sql`t.title` : sql`t.body`} AS label,
           ${type === "q" ? sql`t.id` : sql`t.question_id`} AS question_id
    FROM ${table} t WHERE t.id = ${id}
  `;
  if (!row) return;

  const hide = row.reports >= threshold && row.status === "visible" && !row.reviewed;
  if (hide) {
    await sql`UPDATE ${table} SET status = 'hidden', status_reason = 'reports' WHERE id = ${id}`;
    if (type === "a") await recountAnswers(sql, row.question_id);
  }
  after(
    notifyDiscord(
      hide ? `Auto-hidden after ${row.reports} reports` : `Reported (${reason}) — ${row.reports} so far`,
      row.label,
      `/q/${row.question_id}`,
    ),
  );
  revalidatePath("/");
  refresh();
}

/** Unlocks a post in this browser using the recovery code shown when it was posted. */
export async function recoverPost(_prev: FormState, form: FormData): Promise<FormState> {
  const code = normalizeCode(text(form, "code"));
  const ipHash = await getIpHash();
  const activity = await recentActivity({ ipHash });
  if (activity.code_fails_by_ip >= MAX_CODE_FAILURES_PER_IP) {
    return { error: "Too many wrong codes. Try again in 15 minutes." };
  }
  if (code.length !== CODE_LENGTH) {
    return { error: "Recovery codes are 12 letters and numbers, like ABCD-EFGH-JKMN." };
  }

  const member = await logInMember(code);
  if (member) {
    revalidatePath("/");
    redirect("/");
  }

  const sql = await db();
  const hash = hashCode(code);
  const [post] = await sql<{ type: PostType; id: number; question_id: number }[]>`
    SELECT 'q' AS type, id, id AS question_id FROM questions WHERE recovery_hash = ${hash}
    UNION ALL
    SELECT 'a' AS type, id, question_id FROM answers WHERE recovery_hash = ${hash}
    LIMIT 1
  `;
  if (!post) {
    await logActivity("code_fail", { ipHash });
    return { error: "That code doesn't match a post or a badge. It may have been deleted." };
  }

  const visitorId = await getOrCreateVisitorId();
  await sql`
    INSERT INTO claims (target_type, target_id, visitor_id)
    VALUES (${post.type}, ${post.id}, ${visitorId})
    ON CONFLICT DO NOTHING
  `;
  redirect(post.type === "q" ? `/q/${post.question_id}` : `/q/${post.question_id}#answer-${post.id}`);
}

// ---------------------------------------------------------------------------
// Votes, accepted answers, deletion

export async function toggleVote(type: PostType, id: number): Promise<void> {
  if ((type !== "q" && type !== "a") || !isId(id)) return;
  if ((await getSettings()).readOnly) return;
  const { visitorId, ipHash } = await whoAmI();
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
    // Clearing cookies gives a fresh voter id, so also cap votes per network.
    const [{ n }] = await tx<{ n: number }[]>`
      SELECT count(*)::int AS n FROM votes
      WHERE target_type = ${type} AND target_id = ${id} AND ip_hash = ${ipHash}
        AND created_at > now() - interval '1 hour'
    `;
    if (n >= MAX_VOTES_PER_IP_PER_POST) return;
    const added = await tx`
      INSERT INTO votes (target_type, target_id, voter_id, ip_hash)
      VALUES (${type}, ${id}, ${visitorId}, ${ipHash})
      ON CONFLICT DO NOTHING
      RETURNING 1
    `;
    if (added.length) await tx`UPDATE ${table} SET score = score + 1 WHERE id = ${id}`;
  });
  revalidatePath("/");
  refresh();
}

/** The question's author can mark (or unmark) one answer as the one that solved it. */
export async function toggleAccepted(questionId: number, answerId: number): Promise<void> {
  if (!isId(questionId) || !isId(answerId)) return;
  const { visitorId, member } = await whoAmI();
  const sql = await db();
  await sql`
    UPDATE questions
    SET accepted_answer_id = CASE WHEN accepted_answer_id = ${answerId}::int THEN NULL ELSE ${answerId}::int END
    WHERE id = ${questionId} AND ${ownedBy(sql, "q", questionId, visitorId, member?.id)}
      AND EXISTS (SELECT 1 FROM answers WHERE id = ${answerId} AND question_id = ${questionId})
  `;
  revalidatePath("/");
  refresh();
}

/** Authors can delete their own posts; the admin can delete anything. */
export async function deleteQuestion(id: number): Promise<void> {
  if (!isId(id)) return;
  const staff = await isStaff();
  const { visitorId, member } = await whoAmI();
  const sql = await db();
  const images = await sql.begin(async (tx) => {
    const [row] = await tx<{ image_url: string | null }[]>`
      SELECT image_url FROM questions
      WHERE id = ${id} AND (${staff}::boolean OR ${ownedBy(sql, "q", id, visitorId, member?.id)})
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
    await tx`
      DELETE FROM claims
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
  if (!isId(id)) return;
  const staff = await isStaff();
  const { visitorId, member } = await whoAmI();
  const sql = await db();
  const imageUrl = await sql.begin(async (tx) => {
    const [row] = await tx<{ question_id: number; image_url: string | null }[]>`
      DELETE FROM answers
      WHERE id = ${id} AND (${staff}::boolean OR ${ownedBy(sql, "a", id, visitorId, member?.id)})
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
    await tx`DELETE FROM claims WHERE target_type = 'a' AND target_id = ${id}`;
    return row.image_url;
  });
  await deleteImages([imageUrl]);
  revalidatePath("/");
  refresh();
}

// ---------------------------------------------------------------------------
// Admin

export async function adminLogin(_prev: FormState, form: FormData): Promise<FormState> {
  const ipHash = await getIpHash();
  const activity = await recentActivity({ ipHash });
  if (
    activity.login_fails_by_ip >= MAX_LOGIN_FAILURES_PER_IP ||
    activity.login_fails_total >= MAX_LOGIN_FAILURES_TOTAL
  ) {
    return { error: "Too many attempts. Try again in 15 minutes." };
  }

  const ok = await logInAdmin(text(form, "password"));
  if (!ok) {
    await logActivity("login_fail", { ipHash });
    return { error: "Wrong password." };
  }
  redirect("/");
}

export async function adminLogout(): Promise<void> {
  await logOutAdmin();
  redirect("/");
}
