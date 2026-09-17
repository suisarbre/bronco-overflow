"use client";

import { useTransition } from "react";
import { deleteAnswer, deleteQuestion, toggleAccepted } from "@/app/actions";

const linkButton = "text-sm text-muted underline-offset-2 hover:underline disabled:opacity-50";

export function DeleteButton({ type, id }: { type: "q" | "a"; id: number }) {
  const [pending, startTransition] = useTransition();
  const what = type === "q" ? "question and all its answers" : "answer";

  return (
    <button
      type="button"
      disabled={pending}
      className={`${linkButton} hover:text-danger`}
      onClick={() => {
        if (!confirm(`Delete this ${what}? This can't be undone.`)) return;
        startTransition(() => (type === "q" ? deleteQuestion(id) : deleteAnswer(id)));
      }}
    >
      {pending ? "Deleting…" : "Delete"}
    </button>
  );
}

export function AcceptButton({
  questionId,
  answerId,
  accepted,
}: {
  questionId: number;
  answerId: number;
  accepted: boolean;
}) {
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      className={`${linkButton} hover:text-brand`}
      onClick={() => startTransition(() => toggleAccepted(questionId, answerId))}
    >
      {accepted ? "Unmark solution" : "✓ Mark as solution"}
    </button>
  );
}
