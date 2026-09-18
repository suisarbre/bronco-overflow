import Link from "next/link";
import { plural, timeAgo } from "@/lib/format";
import type { QuestionRow } from "@/lib/queries";
import { MemberBadge } from "./MemberBadge";
import { StaffBadge } from "./StaffBadge";
import { TagBadge } from "./TagBadge";
import { VoteButton } from "./VoteButton";

export function QuestionCard({ q }: { q: QuestionRow }) {
  const preview = q.body.replace(/```[\s\S]*?(```|$)/g, " [code] ").replace(/\s+/g, " ").trim();

  return (
    <article className="relative rounded-2xl border border-line bg-card p-4 transition-colors hover:border-brand/50">
      <div className="mb-1.5 flex flex-wrap items-center gap-2 text-xs text-muted">
        <TagBadge tag={q.tag} />
        {q.pinned && <span className="font-medium">📌 Pinned</span>}
        <StaffBadge role={q.staff_role} />
        <MemberBadge title={q.badge_title} color={q.badge_color} />
        <span>{q.author || "Anonymous"}</span>
        <span aria-hidden>·</span>
        <time dateTime={q.created_at.toISOString()}>{timeAgo(q.created_at)}</time>
      </div>

      <div className="flex gap-3">
        <div className="min-w-0 flex-1">
          <h2 className="text-base leading-snug font-semibold">
            {/* The link's ::after covers the card so the whole card is clickable. */}
            <Link href={`/q/${q.id}`} className="after:absolute after:inset-0 hover:text-brand">
              {q.title}
            </Link>
          </h2>
          {preview && <p className="mt-1 line-clamp-2 text-sm text-muted">{preview}</p>}
        </div>
        {q.image_url && (
          // eslint-disable-next-line @next/next/no-img-element -- user uploads are already resized
          <img
            src={q.image_url}
            alt=""
            loading="lazy"
            className="h-16 w-16 shrink-0 rounded-lg border border-line object-cover"
          />
        )}
      </div>

      <div className="mt-3 flex items-center gap-3 text-sm">
        {/* Sits above the card-wide link so voting doesn't navigate. */}
        <div className="relative z-10">
          <VoteButton type="q" id={q.id} score={q.score} voted={q.voted} />
        </div>
        <span
          className={
            q.accepted_answer_id
              ? "font-medium text-brand"
              : q.answer_count === 0
                ? "font-medium text-accent-strong"
                : "text-muted"
          }
        >
          {q.accepted_answer_id ? "✓ Solved · " : ""}
          {q.answer_count === 0 ? "No answers yet" : plural(q.answer_count, "answer")}
        </span>
      </div>
    </article>
  );
}
