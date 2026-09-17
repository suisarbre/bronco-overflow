"use client";

import { startTransition, useState } from "react";
import { reportPost } from "@/app/actions";
import { REPORT_REASONS } from "@/lib/report-reasons";

export function ReportButton({ type, id }: { type: "q" | "a"; id: number }) {
  const [open, setOpen] = useState(false);
  const [sent, setSent] = useState(false);

  if (sent) return <span className="text-sm text-muted">Reported — thanks</span>;

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-sm text-muted underline-offset-2 hover:text-danger hover:underline"
      >
        Report
      </button>
    );
  }

  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      {REPORT_REASONS.map((reason) => (
        <button
          key={reason}
          type="button"
          onClick={() => {
            setSent(true);
            startTransition(() => reportPost(type, id, reason));
          }}
          className="rounded-full border border-line px-2.5 py-1 text-xs font-medium hover:border-danger hover:text-danger"
        >
          {reason}
        </button>
      ))}
      <button type="button" onClick={() => setOpen(false)} className="text-xs text-muted underline-offset-2 hover:underline">
        cancel
      </button>
    </span>
  );
}
