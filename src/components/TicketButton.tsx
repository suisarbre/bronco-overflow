"use client";

import { usePathname } from "next/navigation";
import { startTransition, useActionState, useRef, useState, type FormEvent } from "react";
import { submitTicket, type TicketState } from "@/app/ticket-actions";
import { TICKET_KINDS, TICKET_MAX, TICKET_MIN } from "@/lib/ticket-kinds";

/**
 * "Report a bug": a small floating button on wide screens, where it sits in the
 * empty margin, and a footer link below that (on phones and tablets a floating
 * button would cover the answer box). Both open the same kind of dialog.
 */
export function TicketButton({ variant }: { variant: "floating" | "link" }) {
  const dialog = useRef<HTMLDialogElement>(null);
  // Remount the form each time it opens, so a finished ticket starts fresh.
  const [opened, setOpened] = useState(0);

  const trigger =
    variant === "floating" ? (
      <button
        type="button"
        onClick={() => {
          setOpened((n) => n + 1);
          dialog.current?.showModal();
        }}
        className="fixed right-4 bottom-4 z-30 hidden items-center gap-1.5 rounded-full border border-line bg-card px-3 py-1.5 text-xs font-medium text-muted shadow-md hover:text-fg lg:inline-flex print:hidden"
      >
        <span aria-hidden>🐞</span> Report a bug
      </button>
    ) : (
      <button
        type="button"
        onClick={() => {
          setOpened((n) => n + 1);
          dialog.current?.showModal();
        }}
        className="underline-offset-2 hover:underline lg:hidden"
      >
        Report a bug
      </button>
    );

  return (
    <>
      {trigger}
      <dialog
        ref={dialog}
        aria-label="Report a bug or send a suggestion"
        // Clicking the dimmed backdrop closes it.
        onClick={(e) => e.target === e.currentTarget && dialog.current?.close()}
        className="m-auto w-[min(32rem,calc(100vw-2rem))] rounded-2xl border border-line bg-card p-0 text-fg shadow-xl backdrop:bg-black/40"
      >
        <TicketForm key={opened} onClose={() => dialog.current?.close()} />
      </dialog>
    </>
  );
}

function TicketForm({ onClose }: { onClose: () => void }) {
  const pathname = usePathname();
  const [state, formAction, pending] = useActionState<TicketState, FormData>(submitTicket, {});
  const [kind, setKind] = useState<string>("bug");

  if (state.id !== undefined) {
    return (
      <div className="space-y-3 p-5 text-center">
        <p className="text-4xl" aria-hidden>
          🎫
        </p>
        <h2 className="text-lg font-bold">Thanks! {state.id > 0 && <>Your ticket is #{state.id}.</>}</h2>
        <p className="text-sm text-muted">
          Tutors will take a look. If you want to follow up, mention the ticket number to a tutor at the desk.
        </p>
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg bg-brand px-4 py-2 font-semibold text-on-brand hover:bg-brand-strong"
        >
          Done
        </button>
      </div>
    );
  }

  // onSubmit (not `action`) so what was typed survives a server-side "no".
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    startTransition(() => formAction(form));
  }

  return (
    <form onSubmit={submit} className="space-y-4 p-5">
      <div className="flex items-start justify-between gap-3">
        <h2 className="text-lg font-bold">Report a bug or send a note</h2>
        <button type="button" onClick={onClose} aria-label="Close" className="text-xl leading-none text-muted hover:text-fg">
          ×
        </button>
      </div>

      <fieldset className="flex flex-wrap gap-2">
        <legend className="sr-only">What kind?</legend>
        {TICKET_KINDS.map((k) => (
          <label
            key={k.id}
            className={`cursor-pointer rounded-full border px-3 py-1.5 text-sm font-medium has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand/40 ${
              kind === k.id ? "border-brand bg-brand text-on-brand" : "border-line bg-bg hover:border-brand/60"
            }`}
          >
            <input
              type="radio"
              name="kind"
              value={k.id}
              checked={kind === k.id}
              onChange={() => setKind(k.id)}
              className="sr-only"
            />
            <span aria-hidden>{k.emoji}</span> {k.label}
          </label>
        ))}
      </fieldset>

      <textarea
        name="body"
        required
        minLength={TICKET_MIN}
        maxLength={TICKET_MAX}
        rows={5}
        autoFocus
        placeholder={
          kind === "bug"
            ? "What happened, and what did you expect? Steps to make it happen again help a lot."
            : kind === "idea"
              ? "What would make this site better?"
              : "What's on your mind?"
        }
        className="w-full resize-y rounded-lg border border-line bg-bg px-3 py-2.5 text-base outline-none focus:border-brand focus:ring-2 focus:ring-brand/25"
      />
      <input type="hidden" name="page" value={pathname} />
      {/* Honeypot: hidden from people, tempting to bots. */}
      <input name="website" tabIndex={-1} autoComplete="off" aria-hidden className="hidden" />

      <p className="text-xs text-muted">
        Anonymous. We attach this page ({pathname}) and your browser type so we can reproduce bugs. Please don&apos;t
        include personal info. For questions about coursework, post on the board instead.
      </p>
      {state.error && <p className="text-sm font-medium text-danger">{state.error}</p>}
      <button
        disabled={pending}
        className="w-full rounded-lg bg-brand px-4 py-2.5 font-semibold text-on-brand hover:bg-brand-strong disabled:opacity-60"
      >
        {pending ? "Sending…" : "Send"}
      </button>
    </form>
  );
}
