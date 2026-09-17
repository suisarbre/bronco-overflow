import "server-only";
import type postgres from "postgres";
import { db } from "./db";

export const SORTS = ["hot", "new", "unanswered"] as const;
/** visible to everyone | waiting for a tutor | auto-hidden after reports */
export type PostStatus = "visible" | "pending" | "hidden";
export type Sort = (typeof SORTS)[number];
export const PAGE_SIZE = 20;

export type QuestionRow = {
  id: number;
  title: string;
  body: string;
  tag: string;
  author: string;
  image_url: string | null;
  score: number;
  answer_count: number;
  accepted_answer_id: number | null;
  created_at: Date;
  edited_at: Date | null;
  status: PostStatus;
  status_reason: string | null;
  is_mine: boolean;
  voted: boolean;
};

export type AnswerRow = {
  id: number;
  body: string;
  author: string;
  image_url: string | null;
  score: number;
  created_at: Date;
  edited_at: Date | null;
  status: PostStatus;
  status_reason: string | null;
  is_mine: boolean;
  voted: boolean;
};

/** Posts everyone can see, plus your own held posts (and everything, for admins). */
function visible(sql: postgres.Sql, type: "q" | "a", visitor: string, admin: boolean) {
  const row = sql(type);
  if (admin) return sql`TRUE`;
  return sql`(${row}.status = 'visible' OR ${mine(sql, type, visitor)})`;
}

/** Whether the visitor wrote the post (alias `q`/`a`) or unlocked it with a recovery code. */
function mine(sql: postgres.Sql, type: "q" | "a", visitor: string) {
  const row = sql(type);
  return sql`(${row}.owner_id = ${visitor} OR EXISTS (
    SELECT 1 FROM claims c
    WHERE c.target_type = ${type} AND c.target_id = ${row}.id AND c.visitor_id = ${visitor}
  ))`;
}

export async function listQuestions(opts: {
  sort: Sort;
  tag?: string;
  search?: string;
  page: number;
  visitorId: string | null;
  admin?: boolean;
}): Promise<{ questions: QuestionRow[]; hasMore: boolean }> {
  const sql = await db();
  const visitor = opts.visitorId ?? "";
  const pattern = opts.search ? `%${opts.search.replace(/[\\%_]/g, "\\$&")}%` : null;

  // "Hot": votes and answers push a question up, age pulls it down.
  const order =
    opts.sort === "hot"
      ? sql`(q.score + q.answer_count * 2 + 1)
            / power(extract(epoch from now() - q.created_at) / 3600 + 2, 1.5) DESC`
      : sql`q.created_at DESC`;

  const rows = await sql<QuestionRow[]>`
    SELECT q.id, q.title, q.body, q.tag, q.author, q.image_url, q.score,
           q.answer_count, q.accepted_answer_id, q.created_at, q.edited_at,
           q.status, q.status_reason,
           ${mine(sql, "q", visitor)} AS is_mine,
           EXISTS (SELECT 1 FROM votes v WHERE v.target_type = 'q'
                   AND v.target_id = q.id AND v.voter_id = ${visitor}) AS voted
    FROM questions q
    WHERE ${visible(sql, "q", visitor, !!opts.admin)}
      ${opts.tag ? sql`AND q.tag = ${opts.tag}` : sql``}
      ${opts.sort === "unanswered" ? sql`AND q.answer_count = 0` : sql``}
      ${pattern ? sql`AND (q.title ILIKE ${pattern} OR q.body ILIKE ${pattern})` : sql``}
    ORDER BY ${order}, q.id DESC
    LIMIT ${PAGE_SIZE + 1} OFFSET ${(opts.page - 1) * PAGE_SIZE}
  `;
  return { questions: rows.slice(0, PAGE_SIZE), hasMore: rows.length > PAGE_SIZE };
}

export async function getQuestion(
  id: number,
  visitorId: string | null,
  admin = false,
): Promise<{ question: QuestionRow; answers: AnswerRow[] } | null> {
  const sql = await db();
  const visitor = visitorId ?? "";
  const [question] = await sql<QuestionRow[]>`
    SELECT q.id, q.title, q.body, q.tag, q.author, q.image_url, q.score,
           q.answer_count, q.accepted_answer_id, q.created_at, q.edited_at,
           q.status, q.status_reason,
           ${mine(sql, "q", visitor)} AS is_mine,
           EXISTS (SELECT 1 FROM votes v WHERE v.target_type = 'q'
                   AND v.target_id = q.id AND v.voter_id = ${visitor}) AS voted
    FROM questions q WHERE q.id = ${id} AND ${visible(sql, "q", visitor, admin)}
  `;
  if (!question) return null;

  // Accepted answer first, then highest score, then oldest.
  const answers = await sql<AnswerRow[]>`
    SELECT a.id, a.body, a.author, a.image_url, a.score, a.created_at, a.edited_at,
           a.status, a.status_reason,
           ${mine(sql, "a", visitor)} AS is_mine,
           EXISTS (SELECT 1 FROM votes v WHERE v.target_type = 'a'
                   AND v.target_id = a.id AND v.voter_id = ${visitor}) AS voted
    FROM answers a
    WHERE a.question_id = ${id} AND ${visible(sql, "a", visitor, admin)}
    ORDER BY (a.id = ${question.accepted_answer_id ?? 0}) DESC, a.score DESC, a.created_at ASC
  `;
  return { question, answers };
}

// ---------------------------------------------------------------------------
// Moderation views (admin only)

export type ModerationRow = {
  type: "q" | "a";
  id: number;
  question_id: number;
  title: string;
  body: string;
  author: string;
  image_url: string | null;
  status: PostStatus;
  status_reason: string | null;
  created_at: Date;
  reports: number;
  reasons: string[] | null;
  owner_id: string;
  ip_hash: string;
};

const MODERATION_COLUMNS = (sql: postgres.Sql) => sql`
  SELECT 'q' AS type, q.id, q.id AS question_id, q.title, q.body, q.author, q.image_url,
         q.status, q.status_reason, q.created_at, q.owner_id, q.ip_hash,
         (SELECT count(*)::int FROM reports r WHERE r.target_type = 'q' AND r.target_id = q.id) AS reports,
         (SELECT array_agg(DISTINCT r.reason) FROM reports r WHERE r.target_type = 'q' AND r.target_id = q.id) AS reasons
  FROM questions q
  UNION ALL
  SELECT 'a' AS type, a.id, a.question_id, '' AS title, a.body, a.author, a.image_url,
         a.status, a.status_reason, a.created_at, a.owner_id, a.ip_hash,
         (SELECT count(*)::int FROM reports r WHERE r.target_type = 'a' AND r.target_id = a.id) AS reports,
         (SELECT array_agg(DISTINCT r.reason) FROM reports r WHERE r.target_type = 'a' AND r.target_id = a.id) AS reasons
  FROM answers a
`;

/** Posts waiting for review, auto-hidden posts, and anything that has been reported. */
export async function moderationQueue(): Promise<ModerationRow[]> {
  const sql = await db();
  return sql<ModerationRow[]>`
    SELECT * FROM (${MODERATION_COLUMNS(sql)}) posts
    WHERE status <> 'visible' OR reports > 0
    ORDER BY (status <> 'visible') DESC, reports DESC, created_at DESC
    LIMIT 100
  `;
}

export async function recentPosts(limit = 30): Promise<ModerationRow[]> {
  const sql = await db();
  return sql<ModerationRow[]>`
    SELECT * FROM (${MODERATION_COLUMNS(sql)}) posts ORDER BY created_at DESC LIMIT ${limit}
  `;
}

/** How many posts this browser / network made in the last day (for bulk cleanup). */
export async function posterCounts(ownerId: string, ipHash: string): Promise<{ by_owner: number; by_ip: number }> {
  const sql = await db();
  const [row] = await sql<{ by_owner: number; by_ip: number }[]>`
    WITH recent AS (
      SELECT owner_id, ip_hash FROM questions WHERE created_at > now() - interval '1 day'
      UNION ALL
      SELECT owner_id, ip_hash FROM answers WHERE created_at > now() - interval '1 day'
    )
    SELECT count(*) FILTER (WHERE owner_id = ${ownerId})::int AS by_owner,
           count(*) FILTER (WHERE ip_hash = ${ipHash})::int AS by_ip
    FROM recent
  `;
  return row;
}
