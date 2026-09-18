// The kinds of Discord alerts, each of which can go to its own channel. Any
// variable left unset falls back to DISCORD_WEBHOOK_URL, so one webhook is
// enough to start with. Shared with the admin page (no secrets in here).
export const CHANNELS = {
  posts: { env: "DISCORD_WEBHOOK_POSTS", label: "New questions and answers" },
  moderation: { env: "DISCORD_WEBHOOK_MODERATION", label: "Reports, auto-hides, posts waiting for review" },
  password: { env: "DISCORD_WEBHOOK_PASSWORD", label: "New tutor password (keep this channel tutors-only)" },
  checkins: { env: "DISCORD_WEBHOOK_CHECKINS", label: "Daily check-in summary" },
  tickets: { env: "DISCORD_WEBHOOK_TICKETS", label: "Bug reports and tickets" },
} as const;

export type Channel = keyof typeof CHANNELS;
export const CHANNEL_KEYS = Object.keys(CHANNELS) as Channel[];
