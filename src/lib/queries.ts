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
  badge_title: string | null;
  badge_color: string | null;
  pinned: boolean;
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
  badge_title: string | null;
  badge_color: string | null;
  pinned: boolean;
  /** Written by the person who asked the question. */
  by_asker: boolean;
  is_mine: boolean;
  voted: boolean;
};

/** Posts everyone can see, plus your own held posts (and everything, for admins). */
function visible(sql: postgres.Sql, type: "q" | "a", visitor: string, staff: boolean, memberId?: number | null) {
  const row = sql(type);
  if (staff) return sql`TRUE`;
  return sql`(${row}.status = 'visible' OR ${mine(sql, type, visitor, memberId)})`;
}

/** Whether the visitor wrote the post (alias `q`/`a`) or unlocked it with a recovery code. */
function mine(sql: postgres.Sql, type: "q" | "a", visitor: string, memberId?: number | null) {
  const row = sql(type);
  return sql`(${row}.owner_id = ${visitor} OR EXISTS (
    SELECT 1 FROM claims c
    WHERE c.target_type = ${type} AND c.target_id = ${row}.id AND c.visitor_id = ${visitor}
  ) ${memberId ? sql`OR ${row}.member_id = ${memberId}` : sql``})`;
}

export async function listQuestions(opts: {
  sort: Sort;
  tag?: string;
  search?: string;
  page: number;
  visitorId: string | null;
  memberId?: number | null;
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
           q.status, q.status_reason, m.title AS badge_title, m.color AS badge_color,
           (q.pinned_at IS NOT NULL) AS pinned,
           ${mine(sql, "q", visitor, opts.memberId)} AS is_mine,
           EXISTS (SELECT 1 FROM votes v WHERE v.target_type = 'q'
                   AND v.target_id = q.id AND v.voter_id = ${visitor}) AS voted
    FROM questions q
    LEFT JOIN members m ON m.id = q.member_id
    WHERE ${visible(sql, "q", visitor, !!opts.admin, opts.memberId)}
      ${opts.tag ? sql`AND q.tag = ${opts.tag}` : sql``}
      ${opts.sort === "unanswered" ? sql`AND q.answer_count = 0` : sql``}
      ${pattern ? sql`AND (q.title ILIKE ${pattern} OR q.body ILIKE ${pattern})` : sql``}
    ORDER BY (q.pinned_at IS NOT NULL) DESC, ${order}, q.id DESC
    LIMIT ${PAGE_SIZE + 1} OFFSET ${(opts.page - 1) * PAGE_SIZE}
  `;
  return { questions: rows.slice(0, PAGE_SIZE), hasMore: rows.length > PAGE_SIZE };
}

export async function getQuestion(
  id: number,
  visitorId: string | null,
  staff = false,
  memberId: number | null = null,
): Promise<{ question: QuestionRow; answers: AnswerRow[] } | null> {
  const sql = await db();
  const visitor = visitorId ?? "";
  const [question] = await sql<(QuestionRow & { owner_id: string; member_id: number | null })[]>`
    SELECT q.id, q.title, q.body, q.tag, q.author, q.image_url, q.score, q.owner_id, q.member_id,
           q.answer_count, q.accepted_answer_id, q.created_at, q.edited_at,
           q.status, q.status_reason, m.title AS badge_title, m.color AS badge_color,
           (q.pinned_at IS NOT NULL) AS pinned,
           ${mine(sql, "q", visitor, memberId)} AS is_mine,
           EXISTS (SELECT 1 FROM votes v WHERE v.target_type = 'q'
                   AND v.target_id = q.id AND v.voter_id = ${visitor}) AS voted
    FROM questions q
    LEFT JOIN members m ON m.id = q.member_id
    WHERE q.id = ${id} AND ${visible(sql, "q", visitor, staff, memberId)}
  `;
  if (!question) return null;

  // Accepted answer first, then highest score, then oldest.
  const answers = await sql<AnswerRow[]>`
    SELECT a.id, a.body, a.author, a.image_url, a.score, a.created_at, a.edited_at,
           a.status, a.status_reason, m.title AS badge_title, m.color AS badge_color,
           (a.pinned_at IS NOT NULL) AS pinned,
           (a.owner_id = ${question.owner_id}
            OR (a.member_id IS NOT NULL AND a.member_id = ${question.member_id})) AS by_asker,
           ${mine(sql, "a", visitor, memberId)} AS is_mine,
           EXISTS (SELECT 1 FROM votes v WHERE v.target_type = 'a'
                   AND v.target_id = a.id AND v.voter_id = ${visitor}) AS voted
    FROM answers a
    LEFT JOIN members m ON m.id = a.member_id
    WHERE a.question_id = ${id} AND ${visible(sql, "a", visitor, staff, memberId)}
    ORDER BY (a.pinned_at IS NOT NULL) DESC,
             (a.id = ${question.accepted_answer_id ?? 0}) DESC,
             a.score DESC, a.created_at ASC
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
  reviewed_at: Date | null;
  /** How much this browser / network posted in the last day, for the bulk-delete buttons. */
  by_owner: number;
  by_ip: number;
};

const MODERATION_COLUMNS = (sql: postgres.Sql) => sql`
  SELECT 'q' AS type, q.id, q.id AS question_id, q.title, q.body, q.author, q.image_url,
         q.status, q.status_reason, q.created_at, q.reviewed_at, q.owner_id, q.ip_hash,
         (SELECT count(*)::int FROM reports r WHERE r.target_type = 'q' AND r.target_id = q.id) AS reports,
         (SELECT array_agg(DISTINCT r.reason) FROM reports r WHERE r.target_type = 'q' AND r.target_id = q.id) AS reasons
  FROM questions q
  UNION ALL
  SELECT 'a' AS type, a.id, a.question_id, '' AS title, a.body, a.author, a.image_url,
         a.status, a.status_reason, a.created_at, a.reviewed_at, a.owner_id, a.ip_hash,
         (SELECT count(*)::int FROM reports r WHERE r.target_type = 'a' AND r.target_id = a.id) AS reports,
         (SELECT array_agg(DISTINCT r.reason) FROM reports r WHERE r.target_type = 'a' AND r.target_id = a.id) AS reasons
  FROM answers a
`;

/** Counts per poster for the bulk-delete buttons, joined in so the page stays one query. */
const WITH_POSTER_COUNTS = (sql: postgres.Sql) => sql`
  WITH posts AS (${MODERATION_COLUMNS(sql)}),
  recent AS (
    SELECT owner_id, ip_hash FROM questions WHERE created_at > now() - interval '1 day'
    UNION ALL
    SELECT owner_id, ip_hash FROM answers WHERE created_at > now() - interval '1 day'
  ),
  by_owner AS (SELECT owner_id, count(*)::int AS n FROM recent GROUP BY owner_id),
  by_ip AS (SELECT ip_hash, count(*)::int AS n FROM recent GROUP BY ip_hash)
  SELECT posts.*, coalesce(by_owner.n, 0) AS by_owner, coalesce(by_ip.n, 0) AS by_ip
  FROM posts
  LEFT JOIN by_owner ON by_owner.owner_id = posts.owner_id
  LEFT JOIN by_ip ON by_ip.ip_hash = posts.ip_hash
`;

/**
 * What still needs a tutor: posts held for approval, and anything hidden or
 * reported that nobody has reviewed yet. Once a tutor approves or hides a post
 * it drops out (it's still under "Recent posts").
 */
const NEEDS_A_LOOK = (sql: postgres.Sql) =>
  sql`(status = 'pending' OR (reviewed_at IS NULL AND (status = 'hidden' OR reports > 0)))`;

export async function moderationQueue(): Promise<ModerationRow[]> {
  const sql = await db();
  return sql<ModerationRow[]>`
    SELECT * FROM (${WITH_POSTER_COUNTS(sql)}) queue
    WHERE ${NEEDS_A_LOOK(sql)}
    ORDER BY (status <> 'visible') DESC, reports DESC, created_at DESC
    LIMIT 100
  `;
}

/** The number on the header's Moderation button. */
export async function moderationCount(): Promise<number> {
  const sql = await db();
  const [{ n }] = await sql<{ n: number }[]>`
    SELECT count(*)::int AS n FROM (${MODERATION_COLUMNS(sql)}) posts WHERE ${NEEDS_A_LOOK(sql)}
  `;
  return n;
}

export async function recentPosts(limit = 30): Promise<ModerationRow[]> {
  const sql = await db();
  return sql<ModerationRow[]>`
    SELECT * FROM (${WITH_POSTER_COUNTS(sql)}) recent_posts ORDER BY created_at DESC LIMIT ${limit}
  `;
}
