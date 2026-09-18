import "server-only";
import { db } from "./db";

export type Ticket = {
  id: number;
  created_at: Date;
  kind: string;
  body: string;
  page: string;
  device: string;
  status: "open" | "closed";
  closed_at: Date | null;
};

// Closed tickets are cleaned up after this long, so the table can't grow forever.
const KEEP_CLOSED_DAYS = 180;

export async function createTicket(t: Pick<Ticket, "kind" | "body" | "page" | "device">): Promise<number> {
  const sql = await db();
  const [row] = await sql<{ id: number }[]>`
    INSERT INTO tickets (kind, body, page, device) VALUES (${t.kind}, ${t.body}, ${t.page}, ${t.device})
    RETURNING id
  `;
  await sql`
    DELETE FROM tickets
    WHERE status = 'closed' AND closed_at < now() - (${KEEP_CLOSED_DAYS} * interval '1 day')
  `;
  return row.id;
}

/** Open tickets (newest first), then the most recently closed ones. */
export async function listTickets(closedLimit = 10): Promise<{ open: Ticket[]; closed: Ticket[] }> {
  const sql = await db();
  const [open, closed] = await Promise.all([
    sql<Ticket[]>`SELECT * FROM tickets WHERE status = 'open' ORDER BY created_at DESC LIMIT 100`,
    sql<Ticket[]>`SELECT * FROM tickets WHERE status = 'closed' ORDER BY closed_at DESC LIMIT ${closedLimit}`,
  ]);
  return { open, closed };
}

export async function setTicketOpen(id: number, open: boolean): Promise<void> {
  const sql = await db();
  await sql`
    UPDATE tickets
    SET status = ${open ? "open" : "closed"}, closed_at = ${open ? null : sql`now()`}
    WHERE id = ${id}
  `;
}

export async function deleteTicket(id: number): Promise<void> {
  const sql = await db();
  await sql`DELETE FROM tickets WHERE id = ${id}`;
}

/**
 * "Chrome 128 · Android" from a user-agent string. Enough to reproduce a bug,
 * without keeping the full string (which is closer to a fingerprint).
 */
export function describeDevice(ua: string): string {
  return `${browserOf(ua)} · ${osOf(ua)}`;
}

// Order matters: Edge and Opera also say "Chrome", and Chrome also says "Safari".
const BROWSERS: [RegExp, string][] = [
  [/Edg\/(\d+)/, "Edge"],
  [/OPR\/(\d+)/, "Opera"],
  [/SamsungBrowser\/(\d+)/, "Samsung Internet"],
  [/(?:Firefox|FxiOS)\/(\d+)/, "Firefox"],
  [/(?:Chrome|CriOS)\/(\d+)/, "Chrome"],
  [/Version\/(\d+).*Safari\//, "Safari"],
];

function browserOf(ua: string): string {
  for (const [pattern, name] of BROWSERS) {
    const version = ua.match(pattern)?.[1];
    if (version) return `${name} ${version}`;
  }
  return "unknown browser";
}

const SYSTEMS: [RegExp, string][] = [
  [/iPhone|iPad|iPod/, "iOS"],
  [/Android/, "Android"],
  [/Windows/, "Windows"],
  [/CrOS/, "ChromeOS"],
  [/Macintosh|Mac OS X/, "macOS"],
  [/Linux/, "Linux"],
];

function osOf(ua: string): string {
  return SYSTEMS.find(([pattern]) => pattern.test(ua))?.[1] ?? "unknown OS";
}
