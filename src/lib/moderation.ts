import "server-only";
import {
  DataSet,
  RegExpMatcher,
  TextCensor,
  asteriskCensorStrategy,
  englishDataset,
  englishRecommendedTransformers,
  keepStartCensorStrategy,
  parseRawPattern,
} from "obscenity";
import { db } from "./db";
import type { FilterMode } from "./settings";

export const MAX_LINKS = 3;
const DUPLICATE_WINDOW = "1 hour";

export type WordLists = { blocked: string[]; allowed: string[] };

/** Admin word lists: extra words to block, and built-in words to stop blocking. */
export async function getWordLists(): Promise<WordLists> {
  const sql = await db();
  const rows = await sql<{ word: string; list: string }[]>`SELECT word, list FROM filter_words ORDER BY word`;
  return {
    blocked: rows.filter((r) => r.list === "blocked").map((r) => r.word),
    allowed: rows.filter((r) => r.list === "allowed").map((r) => r.word),
  };
}

/** Words are matched as plain text, so keep them free of pattern syntax. */
export function isUsableWord(word: string): boolean {
  return /^[\p{L}\p{N} '-]{2,40}$/u.test(word);
}

export async function addWord(word: string, list: "blocked" | "allowed"): Promise<void> {
  const sql = await db();
  await sql`INSERT INTO filter_words (word, list) VALUES (${word}, ${list}) ON CONFLICT DO NOTHING`;
}

export async function removeWord(word: string, list: "blocked" | "allowed"): Promise<void> {
  const sql = await db();
  await sql`DELETE FROM filter_words WHERE word = ${word} AND list = ${list}`;
}

const censor = new TextCensor().setStrategy(keepStartCensorStrategy(asteriskCensorStrategy()));

// Rebuilding the matcher is cheap but not free; cache it until the word lists change.
let cached: { key: string; matcher: RegExpMatcher } | null = null;

function buildMatcher(lists: WordLists): RegExpMatcher {
  const key = JSON.stringify(lists);
  if (cached?.key === key) return cached.matcher;

  const allowed = new Set(lists.allowed.map((w) => w.toLowerCase()));
  const dataset = new DataSet<{ originalWord: string }>()
    .addAll(englishDataset)
    .removePhrasesIf((phrase) => allowed.has(phrase.metadata?.originalWord ?? ""));
  for (const word of lists.blocked) {
    if (!isUsableWord(word) || allowed.has(word.toLowerCase())) continue;
    dataset.addPhrase((p) => p.setMetadata({ originalWord: word }).addPattern(parseRawPattern(word.toLowerCase())));
  }
  const matcher = new RegExpMatcher({ ...dataset.build(), ...englishRecommendedTransformers });
  cached = { key, matcher };
  return matcher;
}

export type FilterResult = { clean: boolean; censored: string[] };

/** Runs the profanity filter over several texts (title, body, nickname). */
export async function runFilter(texts: string[]): Promise<FilterResult> {
  const matcher = buildMatcher(await getWordLists());
  let clean = true;
  const censored = texts.map((text) => {
    const matches = matcher.getAllMatches(text, true);
    if (matches.length === 0) return text;
    clean = false;
    return censor.applyTo(text, matches);
  });
  return { clean, censored };
}

export function countLinks(text: string): number {
  return text.match(/https?:\/\//gi)?.length ?? 0;
}

/** What to do with a post, given the filter mode and the post's contents. */
export type Verdict =
  | { action: "publish"; texts: string[] }
  | { action: "review"; texts: string[]; reason: string }
  | { action: "block"; reason: string };

export async function moderate(
  texts: string[],
  mode: FilterMode,
  approvalRequired: boolean,
): Promise<Verdict> {
  const filtered = mode === "off" ? { clean: true, censored: texts } : await runFilter(texts);

  if (!filtered.clean && mode === "block") {
    return { action: "block", reason: "Please reword that — the language filter rejected it." };
  }
  const texts_ = mode === "censor" ? filtered.censored : texts;
  if (!filtered.clean && mode === "review") {
    return { action: "review", texts: texts_, reason: "language" };
  }
  if (countLinks(texts.join(" ")) > MAX_LINKS) {
    return { action: "review", texts: texts_, reason: "links" };
  }
  if (approvalRequired) return { action: "review", texts: texts_, reason: "approval" };
  return { action: "publish", texts: texts_ };
}

/**
 * True when the same text was just posted again from this browser — or, for
 * longer text, from the same network. Campus Wi-Fi puts everyone behind one IP,
 * so short posts ("thanks!", "same here") are only checked per browser: two
 * people writing the same short thing is a coincidence, not spam.
 */
const MIN_LENGTH_FOR_IP_MATCH = 60;

export async function isDuplicate(
  table: "questions" | "answers",
  column: "title" | "body",
  value: string,
  ownerId: string,
  ipHash: string,
): Promise<boolean> {
  if (!value) return false;
  const sql = await db();
  const poster =
    value.length >= MIN_LENGTH_FOR_IP_MATCH
      ? sql`(owner_id = ${ownerId} OR ip_hash = ${ipHash})`
      : sql`owner_id = ${ownerId}`;
  const rows = await sql`
    SELECT 1 FROM ${sql(table)}
    WHERE ${sql(column)} = ${value}
      AND ${poster}
      AND created_at > now() - ${DUPLICATE_WINDOW}::interval
    LIMIT 1
  `;
  return rows.length > 0;
}
