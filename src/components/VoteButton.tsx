"use client";

import { startTransition, useOptimistic } from "react";
import { toggleVote } from "@/app/actions";

export function VoteButton({
  type,
  id,
  score,
  voted,
}: {
  type: "q" | "a";
  id: number;
  score: number;
  voted: boolean;
}) {
  const [state, setOptimistic] = useOptimistic({ score, voted });

  function onClick() {
    startTransition(async () => {
      setOptimistic({ score: state.score + (state.voted ? -1 : 1), voted: !state.voted });
      await toggleVote(type, id);
    });
  }

  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={state.voted}
      aria-label={state.voted ? "Remove upvote" : "Upvote"}
      className={`inline-flex min-w-14 items-center justify-center gap-1 rounded-full border px-2.5 py-1 text-sm font-semibold tabular-nums transition-colors ${
        state.voted
          ? "border-brand bg-brand text-on-brand"
          : "border-line text-muted hover:border-brand hover:text-brand"
      }`}
    >
      <svg aria-hidden viewBox="0 0 12 12" className="h-3 w-3" fill="currentColor">
        <path d="M6 1.5 11 8H1z" />
      </svg>
      {state.score}
    </button>
  );
}
