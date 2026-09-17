"use client";

import { useEffect, useRef, useState } from "react";

/** Shown once after posting: explains browser-bound ownership and hands over the recovery code. */
export function PostedNotice({
  kind,
  code,
  actionLabel,
  pending,
  onClose,
}: {
  kind: "question" | "answer";
  code: string;
  actionLabel: string;
  pending?: boolean;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [copy, setCopy] = useState<"idle" | "copied" | "manual">("idle");

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(code);
      setCopy("copied");
    } catch {
      // Clipboard API can be blocked (older browsers, some in-app browsers): select it instead.
      inputRef.current?.select();
      setCopy("manual");
    }
  }

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      aria-labelledby="posted-title"
      className="m-auto w-[calc(100%-2rem)] max-w-md rounded-2xl border border-line bg-card p-0 text-fg shadow-xl backdrop:bg-black/50"
    >
      <div className="space-y-4 p-5 sm:p-6">
        <h2 id="posted-title" className="text-xl font-bold">
          {pending ? `Your ${kind} is waiting for review` : `Your ${kind} is posted!`}
        </h2>
        {pending && (
          <p className="rounded-lg bg-accent/15 px-3 py-2 text-sm text-accent-strong">
            A tutor will approve it shortly. Until then, only you can see it.
          </p>
        )}
        <p className="text-sm leading-relaxed text-muted">
          You can edit or delete it from <strong className="text-fg">this browser</strong>. If you open the
          site in a different browser or device, use a private window, or clear your cookies, you&apos;ll need
          this recovery code to edit or delete it:
        </p>

        <div className="flex gap-2">
          <input
            ref={inputRef}
            readOnly
            value={code}
            aria-label="Recovery code"
            onFocus={(e) => e.currentTarget.select()}
            className="min-w-0 flex-1 rounded-lg border border-line bg-subtle px-3 py-2.5 text-center font-mono text-lg font-semibold tracking-widest"
          />
          <button
            type="button"
            onClick={copyCode}
            className="shrink-0 rounded-lg border border-brand px-4 py-2.5 text-sm font-semibold text-brand hover:bg-brand/10"
          >
            {copy === "copied" ? "Copied ✓" : "Copy"}
          </button>
        </div>
        <p role="status" className="text-sm text-muted">
          {copy === "manual"
            ? "Couldn't copy automatically — the code is selected, so copy it manually."
            : "Save it somewhere safe. We won't show it again, and anyone with this code can edit or delete your post."}
        </p>

        <form method="dialog" className="flex justify-end">
          <button className="rounded-lg bg-brand px-5 py-2.5 font-semibold text-on-brand hover:bg-brand-strong">
            {actionLabel}
          </button>
        </form>
      </div>
    </dialog>
  );
}
