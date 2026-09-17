"use client";

import { startTransition, useActionState, useEffect, useRef, useState, type FormEvent } from "react";
import { createAnswer, type FormState } from "@/app/actions";
import { ImagePicker } from "./ImagePicker";
import { NicknameInput } from "./NicknameInput";
import { PostedNotice } from "./PostedNotice";

export function AnswerForm({
  questionId,
  readOnly,
  approvalRequired,
  uploadsPaused,
}: {
  questionId: number;
  readOnly: boolean;
  approvalRequired: boolean;
  uploadsPaused: boolean;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [image, setImage] = useState<File | null>(null);
  const [state, formAction, pending] = useActionState<FormState, FormData>(createAnswer, {});
  const [code, setCode] = useState<{ value: string; pending: boolean } | null>(null);

  useEffect(() => {
    if (!state.ok || !state.code) return;
    formRef.current?.reset();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- react to a completed post
    setImage(null);
    setCode({ value: state.code, pending: !!state.pending });
  }, [state]);

  // onSubmit (not `action`) so React doesn't wipe what was typed when posting fails.
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    if (image) form.set("image", image);
    startTransition(() => formAction(form));
  }

  return (
    <>
      <form ref={formRef} onSubmit={submit} className="space-y-3 rounded-2xl border border-line bg-card p-4 sm:p-5">
        <label htmlFor="answer-body" className="block font-semibold">
          Your answer
        </label>
        {readOnly && (
          <p className="rounded-lg bg-subtle px-3 py-2 text-sm text-muted">
            Answering is paused right now — check back in a bit.
          </p>
        )}
        {approvalRequired && !readOnly && (
          <p className="text-sm text-muted">New answers are reviewed by a tutor before they show up.</p>
        )}
        <input type="hidden" name="questionId" value={questionId} />
        <textarea
          id="answer-body"
          name="body"
          rows={5}
          maxLength={5000}
          disabled={readOnly}
          placeholder={"Share what you know. Paste code between ``` fences."}
          className="w-full resize-y rounded-lg border border-line bg-bg px-3 py-2.5 text-base outline-none focus:border-brand focus:ring-2 focus:ring-brand/25"
        />
        <input name="website" tabIndex={-1} autoComplete="off" aria-hidden className="hidden" />
        <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-center">
          <NicknameInput />
          {uploadsPaused ? (
            <span className="text-sm text-muted">Photo uploads are paused.</span>
          ) : (
            <ImagePicker file={image} onChange={setImage} disabled={pending} />
          )}
        </div>
        <div className="flex items-center justify-between gap-3">
          <p role="alert" className="text-sm text-danger">
            {state.error}
          </p>
          <button
            type="submit"
            disabled={pending || readOnly}
            className="shrink-0 rounded-lg bg-brand px-5 py-2.5 font-semibold text-on-brand hover:bg-brand-strong disabled:opacity-60"
          >
            {pending ? "Posting…" : "Post answer"}
          </button>
        </div>
      </form>
      {code && (
        <PostedNotice
          kind="answer"
          code={code.value}
          pending={code.pending}
          actionLabel="Done"
          onClose={() => setCode(null)}
        />
      )}
    </>
  );
}
