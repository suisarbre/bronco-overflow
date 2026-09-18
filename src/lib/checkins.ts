import "server-only";
import { COURSES, REASONS, YEARS, choiceLabel, type Choice } from "./checkin-options";
import { db } from "./db";
import { notifyDiscord } from "./notify";

export const CAMPUS_TZ = "America/Los_Angeles";

export type Checkin = {
  id: number;
  created_at: Date;
  year: string;
  year_other: string | null;
  course: string;
  course_other: string | null;
  reason: string;
  reason_other: string | null;
  first_visit: boolean;
};

export async function recordCheckin(c: Omit<Checkin, "id" | "created_at">): Promise<void> {
  const sql = await db();
  await sql`
    INSERT INTO checkins (year, year_other, course, course_other, reason, reason_other, first_visit)
    VALUES (${c.year}, ${c.year_other}, ${c.course}, ${c.course_other}, ${c.reason}, ${c.reason_other}, ${c.first_visit})
  `;
}

/** Check-ins between two campus dates (YYYY-MM-DD), both inclusive, oldest first. */
export async function checkinsBetween(from: string, to: string): Promise<Checkin[]> {
  const sql = await db();
  return sql<Checkin[]>`
    SELECT * FROM checkins
    WHERE (created_at AT TIME ZONE ${CAMPUS_TZ})::date BETWEEN ${from}::date AND ${to}::date
    ORDER BY created_at
  `;
}

export async function recentCheckins(limit = 15): Promise<Checkin[]> {
  const sql = await db();
  return sql<Checkin[]>`SELECT * FROM checkins ORDER BY created_at DESC LIMIT ${limit}`;
}

export async function deleteCheckin(id: number): Promise<void> {
  const sql = await db();
  await sql`DELETE FROM checkins WHERE id = ${id}`;
}

// ---------------------------------------------------------------------------
// Numbers for the admin page

const DAY = new Intl.DateTimeFormat("en-CA", { timeZone: CAMPUS_TZ }); // en-CA formats as YYYY-MM-DD
const HOUR = new Intl.DateTimeFormat("en-US", { timeZone: CAMPUS_TZ, hour: "numeric", hourCycle: "h23" });
const WEEKDAY = new Intl.DateTimeFormat("en-US", { timeZone: CAMPUS_TZ, weekday: "short" });

export function campusDay(date: Date): string {
  return DAY.format(date);
}

/** YYYY-MM-DD for the campus day `offset` days from today (negative = past). */
export function campusDayOffset(offset: number): string {
  return campusDay(new Date(Date.now() + offset * 24 * 3600 * 1000));
}

export type Tally = { label: string; count: number }[];

export type CheckinStats = {
  today: number;
  week: number;
  month: number;
  firstVisits: number;
  byCourse: Tally;
  byReason: Tally;
  byYear: Tally;
  byHour: Tally;
  byWeekday: Tally;
};

function tally(values: string[], order?: string[]): Tally {
  const counts = new Map<string, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  const rows = [...counts].map(([label, count]) => ({ label, count }));
  return order
    ? rows.sort((a, b) => order.indexOf(a.label) - order.indexOf(b.label))
    : rows.sort((a, b) => b.count - a.count);
}

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function hourLabel(h: number): string {
  const suffix = h < 12 ? "am" : "pm";
  return `${h % 12 || 12}${suffix}`;
}

/** Totals for today, the last 7 and 30 days, and breakdowns over the last 30 days. */
export async function checkinStats(): Promise<CheckinStats> {
  const month = await checkinsBetween(campusDayOffset(-29), campusDayOffset(0));
  const today = campusDayOffset(0);
  const weekStart = campusDayOffset(-6);
  const days = month.map((c) => campusDay(c.created_at));
  const hours = month.map((c) => Number(HOUR.format(c.created_at)));
  const hourOrder = [...new Set(hours)].sort((a, b) => a - b).map(hourLabel);

  return {
    today: days.filter((d) => d === today).length,
    week: days.filter((d) => d >= weekStart).length,
    month: month.length,
    firstVisits: month.filter((c) => c.first_visit).length,
    // Typed-in "Other" answers are grouped as one row here; the CSV has the text.
    byCourse: tally(month.map((c) => choiceLabel(COURSES, c.course, null))),
    byReason: tally(month.map((c) => choiceLabel(REASONS, c.reason, null))),
    byYear: tally(
      month.map((c) => choiceLabel(YEARS, c.year, null)),
      YEARS.map((y) => y.label),
    ),
    byHour: tally(hours.map(hourLabel), hourOrder),
    byWeekday: tally(month.map((c) => WEEKDAY.format(c.created_at)), WEEKDAYS),
  };
}

// ---------------------------------------------------------------------------
// CSV export

/** One cell. Quotes as needed, and defuses text a spreadsheet would run as a formula. */
function cell(value: string): string {
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

const CSV_TIME = new Intl.DateTimeFormat("en-GB", { timeZone: CAMPUS_TZ, hour: "2-digit", minute: "2-digit" });

export function checkinsCsv(rows: Checkin[]): string {
  const header = ["date", "time", "weekday", "year", "class", "reason", "first_visit"];
  const lines = rows.map((c) =>
    [
      campusDay(c.created_at),
      CSV_TIME.format(c.created_at),
      WEEKDAY.format(c.created_at),
      choiceLabel(YEARS, c.year, c.year_other),
      choiceLabel(COURSES, c.course, c.course_other),
      choiceLabel(REASONS, c.reason, c.reason_other),
      c.first_visit ? "yes" : "no",
    ]
      .map(cell)
      .join(","),
  );
  // The byte-order mark makes Excel read the file as UTF-8.
  return "﻿" + [header.join(","), ...lines].join("\r\n") + "\r\n";
}

// ---------------------------------------------------------------------------
// Daily Discord summary

const MAX_CATCH_UP_DAYS = 7;

function topLine(list: Choice[], rows: Checkin[], pick: (c: Checkin) => string, limit = 5): string {
  return tally(rows.map((c) => choiceLabel(list, pick(c), null)))
    .slice(0, limit)
    .map((t) => `${t.label.split(" · ")[0]} ${t.count}`)
    .join(", ");
}

/**
 * Posts yesterday's check-in totals to Discord, once per campus day. Runs after
 * a page view (like the tutor password rotation), so there's no cron. If nobody
 * visited the site for a while, it catches up on up to a week of days.
 * Numbers only: no free-text answers go to Discord.
 */
export async function sendCheckinSummariesIfDue(): Promise<void> {
  if (!process.env.DISCORD_WEBHOOK_URL) return;
  const yesterday = campusDayOffset(-1);
  const sql = await db();

  // Cheap check first: nearly every call stops here.
  const [last] = await sql<{ day: string | null }[]>`SELECT max(day)::text AS day FROM checkin_summaries`;
  if (last?.day && last.day >= yesterday) return;

  const start = last?.day ?? yesterday;
  const days = await sql<{ day: string }[]>`
    SELECT d::date::text AS day
    FROM generate_series((${start}::date + ${last?.day ? 1 : 0}::int)::timestamp,
                         ${yesterday}::date::timestamp, interval '1 day') d
    ORDER BY d DESC
    LIMIT ${MAX_CATCH_UP_DAYS}
  `;

  for (const { day } of days.reverse()) {
    // Claim the day first so two requests at once don't both post it.
    const claimed = await sql`INSERT INTO checkin_summaries (day) VALUES (${day}) ON CONFLICT DO NOTHING RETURNING 1`;
    if (!claimed.length) continue;
    const rows = await checkinsBetween(day, day);
    if (rows.length === 0) continue;

    const weekday = new Date(`${day}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "long", timeZone: "UTC" });
    const first = rows.filter((c) => c.first_visit).length;
    await notifyDiscord(
      `Check-ins for ${weekday} ${day}: ${rows.length}`,
      [
        `First visit: ${first}`,
        `Classes: ${topLine(COURSES, rows, (c) => c.course)}`,
        `Reasons: ${topLine(REASONS, rows, (c) => c.reason)}`,
      ].join(" · "),
      "/admin#checkins",
    );
  }
}
