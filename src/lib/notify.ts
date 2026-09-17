import "server-only";
import { headers } from "next/headers";

/** Posts a message to the tutors' Discord channel, if a webhook is configured. */
export async function notifyDiscord(title: string, body: string, path?: string): Promise<void> {
  const webhook = process.env.DISCORD_WEBHOOK_URL;
  if (!webhook) return;

  const link = path ? `${await siteUrl()}${path}` : undefined;
  try {
    await fetch(webhook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        // Posts are written by anonymous visitors: never let their text ping anyone.
        allowed_mentions: { parse: [] },
        embeds: [
          {
            title: clamp(title, 240),
            description: clamp(body, 1500) || undefined,
            url: link,
            color: 0x1e4d2b,
          },
        ],
      }),
    });
  } catch (err) {
    console.error("discord notification failed", err);
  }
}

function clamp(text: string, max: number): string {
  const single = text.replace(/\s+/g, " ").trim();
  return single.length > max ? `${single.slice(0, max - 1)}…` : single;
}

async function siteUrl(): Promise<string> {
  if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL.replace(/\/$/, "");
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}
