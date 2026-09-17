"use client";

import { useActionState } from "react";
import { recoverPost, type FormState } from "@/app/actions";

export function RecoverForm() {
  const [state, formAction, pending] = useActionState<FormState, FormData>(recoverPost, {});
  return (
    <form action={formAction} className="space-y-3">
      <input
        name="code"
        required
        autoComplete="off"
        autoCapitalize="characters"
        spellCheck={false}
        placeholder="ABCD-EFGH-JKMN"
        aria-label="Recovery code"
        className="w-full rounded-lg border border-line bg-bg px-3 py-2.5 text-center font-mono text-lg tracking-widest uppercase outline-none focus:border-brand"
      />
      {state.error && (
        <p role="alert" className="text-sm text-danger">
          {state.error}
        </p>
      )}
      <button
        disabled={pending}
        className="w-full rounded-lg bg-brand px-4 py-2.5 font-semibold text-on-brand hover:bg-brand-strong disabled:opacity-60"
      >
        {pending ? "Checking…" : "Unlock my post"}
      </button>
    </form>
  );
}
