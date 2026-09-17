import type { PostStatus } from "@/lib/queries";

const REASONS: Record<string, string> = {
  language: "the language filter flagged it",
  links: "it has a lot of links",
  approval: "new posts are being reviewed",
  reports: "people reported it",
  tutor: "a tutor hid it",
};

/** Shown to the author (and tutors) on posts that aren't publicly visible. */
export function StatusBadge({ status, reason }: { status: PostStatus; reason: string | null }) {
  if (status === "visible") return null;
  const why = reason ? REASONS[reason] ?? reason : null;
  const waiting = status === "pending";
  return (
    <p
      className={`rounded-lg px-3 py-2 text-sm ${
        waiting ? "bg-accent/15 text-accent-strong" : "bg-danger/10 text-danger"
      }`}
    >
      {waiting ? "Waiting for a tutor to approve this" : "Hidden while a tutor takes a look"}
      {why ? ` — ${why}` : ""}. Only you and the tutors can see it right now.
    </p>
  );
}
