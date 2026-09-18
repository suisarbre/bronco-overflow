"use server";

import { COURSES, OTHER, OTHER_MAX, REASONS, YEARS, isChoice, type Choice } from "@/lib/checkin-options";
import { recordCheckin } from "@/lib/checkins";
import { db } from "@/lib/db";
import { getIpHash, getOrCreateVisitorId } from "@/lib/identity";

export type CheckinState = { ok?: boolean; again?: boolean; error?: string };

// Re-scanning within this window counts as the same visit (no checkout needed).
const SAME_VISIT_HOURS = 3;
// Loose, because everyone at the desk shares the campus Wi-Fi address.
const MAX_PER_IP_PER_HOUR = 300;

function text(form: FormData, key: string): string {
  const value = form.get(key);
  return typeof value === "string" ? value.replace(/[\p{Cc}\p{Cf}]/gu, " ").replace(/\s+/g, " ").trim() : "";
}

/** A choice from the list, plus the typed text when it's "Other". */
function answer(form: FormData, key: string, list: Choice[]): { id: string; other: string | null } | null {
  const id = text(form, key);
  if (!isChoice(list, id)) return null;
  if (id !== OTHER) return { id, other: null };
  const other = text(form, `${key}_other`).slice(0, OTHER_MAX);
  return { id, other: other || null };
}

export async function checkIn(_prev: CheckinState, form: FormData): Promise<CheckinState> {
  if (text(form, "website")) return { ok: true }; // honeypot: bots fill every field

  const year = answer(form, "year", YEARS);
  const course = answer(form, "course", COURSES);
  const reason = answer(form, "reason", REASONS);
  const first = text(form, "first_visit");
  if (!year || !course || !reason || (first !== "yes" && first !== "no")) {
    return { error: "Please answer each question." };
  }

  const visitorId = await getOrCreateVisitorId();
  const ipHash = await getIpHash();
  const sql = await db();
  const [recent] = await sql<{ mine: number; network: number }[]>`
    SELECT
      count(*) FILTER (WHERE visitor_id = ${visitorId}
                       AND created_at > now() - (${SAME_VISIT_HOURS} * interval '1 hour'))::int AS mine,
      count(*) FILTER (WHERE ip_hash = ${ipHash} AND created_at > now() - interval '1 hour')::int AS network
    FROM activity
    WHERE kind = 'checkin' AND created_at > now() - (${SAME_VISIT_HOURS} * interval '1 hour')
  `;
  if (recent.mine > 0) return { ok: true, again: true };
  if (recent.network >= MAX_PER_IP_PER_HOUR) return { error: "Too many check-ins from this network. Try again later." };

  await recordCheckin({
    year: year.id,
    year_other: year.other,
    course: course.id,
    course_other: course.other,
    reason: reason.id,
    reason_other: reason.other,
    first_visit: first === "yes",
  });
  // The browser id is only kept here, for two days, to stop double counting.
  // The check-in row itself has no link back to the browser.
  await sql`INSERT INTO activity (kind, ip_hash, visitor_id) VALUES ('checkin', ${ipHash}, ${visitorId})`;
  return { ok: true };
}
