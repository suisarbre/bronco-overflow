"use server";

import { headers } from "next/headers";
import { after } from "next/server";
import { db } from "@/lib/db";
import { getIpHash, getOrCreateVisitorId } from "@/lib/identity";
import { notifyDiscord } from "@/lib/notify";
import { TICKET_MAX, TICKET_MIN, isTicketKind, ticketKindLabel } from "@/lib/ticket-kinds";
import { createTicket, describeDevice } from "@/lib/tickets";

export type TicketState = { id?: number; error?: string };

const MAX_PER_BROWSER = 3; // per 10 minutes
const MAX_PER_IP = 30; // per hour, loose for campus Wi-Fi

function text(form: FormData, key: string): string {
  const value = form.get(key);
  return typeof value === "string" ? value.replace(/\r\n?/g, "\n").trim() : "";
}

export async function submitTicket(_prev: TicketState, form: FormData): Promise<TicketState> {
  if (text(form, "website")) return { id: 0 }; // honeypot

  const kind = text(form, "kind");
  // Keep line breaks (steps to reproduce), drop other control characters.
  const body = text(form, "body").replace(/[^\P{Cc}\n\t]|\p{Cf}/gu, "");
  if (!isTicketKind(kind)) return { error: "Pick what kind of report this is." };
  if (body.length < TICKET_MIN) return { error: "Tell us a little more." };
  if (body.length > TICKET_MAX) return { error: `Please keep it under ${TICKET_MAX} characters.` };
  // Only the path of a page on this site, never a full URL someone typed in.
  const rawPage = text(form, "page");
  const page = /^\/[^\s]*$/.test(rawPage) ? rawPage.slice(0, 200) : "";

  const visitorId = await getOrCreateVisitorId();
  const ipHash = await getIpHash();
  const sql = await db();
  const [recent] = await sql<{ mine: number; network: number }[]>`
    SELECT
      count(*) FILTER (WHERE visitor_id = ${visitorId} AND created_at > now() - interval '10 minutes')::int AS mine,
      count(*) FILTER (WHERE ip_hash = ${ipHash})::int AS network
    FROM activity
    WHERE kind = 'ticket' AND created_at > now() - interval '1 hour'
  `;
  if (recent.mine >= MAX_PER_BROWSER || recent.network >= MAX_PER_IP) {
    return { error: "Thanks — we've got a few from you already. Try again in a few minutes." };
  }

  const device = describeDevice((await headers()).get("user-agent") ?? "");
  const id = await createTicket({ kind, body, page, device });
  await sql`INSERT INTO activity (kind, ip_hash, visitor_id) VALUES ('ticket', ${ipHash}, ${visitorId})`;

  after(
    notifyDiscord(
      "tickets",
      `Ticket #${id} · ${ticketKindLabel(kind)}`,
      `${body}\n\n${page ? `Page: ${page} · ` : ""}${device}`,
      "/admin#tickets",
    ),
  );
  return { id };
}
