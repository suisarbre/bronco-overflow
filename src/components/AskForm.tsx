"use client";

import { useRouter } from "next/navigation";
import { startTransition, useActionState, useEffect, useRef, useState, type FormEvent } from "react";
import { createQuestion, type FormState } from "@/app/actions";
import { ImagePicker } from "./ImagePicker";
import { NicknameInput } from "./NicknameInput";
import { PostedNotice } from "./PostedNotice";
import { TagSelect } from "./TagSelect";

export function AskForm() {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [image, setImage] = useState<File | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [state, formAction, pending] = useActionState<FormState, FormData>(createQuestion, {});
  const [notice, setNotice] = useState<{ id: number; code: string } | null>(null);

  useEffect(() => {
    if (!state.ok || !state.id || !state.code) return;
    formRef.current?.reset();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- react to a completed post
    setImage(null);
    setExpanded(false);
    setNotice({ id: state.id, code: state.code });
  }, [state]);

  // onSubmit (not `action`) so React doesn't wipe what was typed when validation fails.
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    if (image) form.set("image", image);
    startTransition(() => formAction(form));
  }

  return (
    <>
      <form ref={formRef} onSubmit={submit} className="rounded-2xl border border-line bg-card p-4 shadow-sm sm:p-5">
        <label htmlFor="title" className="mb-2 block text-lg font-semibold">
          Ask a question
        </label>
        <input
          id="title"
          name="title"
          required
          minLength={5}
          maxLength={150}
          placeholder="e.g. Why does my linked list lose its head node?"
          onFocus={() => setExpanded(true)}
          className="w-full rounded-lg border border-line bg-bg px-3 py-2.5 text-base outline-none focus:border-brand focus:ring-2 focus:ring-brand/25"
        />

        <div className={expanded ? "mt-3 space-y-3" : "hidden"}>
          <textarea
            name="body"
            rows={5}
            maxLength={5000}
            placeholder={"Add details (optional). Paste code between ``` fences. Links are clickable."}
            className="w-full resize-y rounded-lg border border-line bg-bg px-3 py-2.5 text-base outline-none focus:border-brand focus:ring-2 focus:ring-brand/25"
          />
          <div className="grid gap-3 sm:grid-cols-2">
            <TagSelect />
            <NicknameInput />
          </div>
          {/* Honeypot: hidden from people, tempting to bots. */}
          <input name="website" tabIndex={-1} autoComplete="off" aria-hidden className="hidden" />
          <div className="flex flex-wrap items-center justify-between gap-3">
            <ImagePicker file={image} onChange={setImage} disabled={pending} />
            <button
              type="submit"
              disabled={pending}
              className="rounded-lg bg-brand px-5 py-2.5 font-semibold text-on-brand hover:bg-brand-strong disabled:opacity-60"
            >
              {pending ? "Posting…" : "Post question"}
            </button>
          </div>
          {state.error && (
            <p role="alert" className="text-sm text-danger">
              {state.error}
            </p>
          )}
        </div>
      </form>

      {notice && (
        <PostedNotice
          kind="question"
          code={notice.code}
          actionLabel="View my question"
          onClose={() => {
            setNotice(null);
            router.push(`/q/${notice.id}`);
          }}
        />
      )}
    </>
  );
}
