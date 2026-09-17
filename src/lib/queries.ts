import "server-only";
import { db } from "./db";

export const SORTS = ["hot", "new", "unanswered"] as const;
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
  is_mine: boolean;
  voted: boolean;
};

export async function listQuestions(opts: {
  sort: Sort;
  tag?: string;
  search?: string;
  page: number;
  visitorId: string | null;
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
           q.answer_count, q.accepted_answer_id, q.created_at,
           (q.owner_id = ${visitor}) AS is_mine,
           EXISTS (SELECT 1 FROM votes v WHERE v.target_type = 'q'
                   AND v.target_id = q.id AND v.voter_id = ${visitor}) AS voted
    FROM questions q
    WHERE TRUE
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
): Promise<{ question: QuestionRow; answers: AnswerRow[] } | null> {
  const sql = await db();
  const visitor = visitorId ?? "";
  const [question] = await sql<QuestionRow[]>`
    SELECT q.id, q.title, q.body, q.tag, q.author, q.image_url, q.score,
           q.answer_count, q.accepted_answer_id, q.created_at,
           (q.owner_id = ${visitor}) AS is_mine,
           EXISTS (SELECT 1 FROM votes v WHERE v.target_type = 'q'
                   AND v.target_id = q.id AND v.voter_id = ${visitor}) AS voted
    FROM questions q WHERE q.id = ${id}
  `;
  if (!question) return null;

  // Accepted answer first, then highest score, then oldest.
  const answers = await sql<AnswerRow[]>`
    SELECT a.id, a.body, a.author, a.image_url, a.score, a.created_at,
           (a.owner_id = ${visitor}) AS is_mine,
           EXISTS (SELECT 1 FROM votes v WHERE v.target_type = 'a'
                   AND v.target_id = a.id AND v.voter_id = ${visitor}) AS voted
    FROM answers a
    WHERE a.question_id = ${id}
    ORDER BY (a.id = ${question.accepted_answer_id ?? 0}) DESC, a.score DESC, a.created_at ASC
  `;
  return { question, answers };
}
