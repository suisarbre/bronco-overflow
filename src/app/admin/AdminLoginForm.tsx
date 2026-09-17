"use client";

import { useActionState } from "react";
import { adminLogin, type FormState } from "@/app/actions";

export function AdminLoginForm() {
  const [state, formAction, pending] = useActionState<FormState, FormData>(adminLogin, {});
  return (
    <form action={formAction} className="space-y-3">
      <input
        type="password"
        name="password"
        required
        autoComplete="current-password"
        placeholder="Password"
        aria-label="Password"
        className="w-full rounded-lg border border-line bg-bg px-3 py-2.5 outline-none focus:border-brand"
      />
      {state.error && <p className="text-sm text-danger">{state.error}</p>}
      <button
        disabled={pending}
        className="w-full rounded-lg bg-brand px-4 py-2.5 font-semibold text-on-brand hover:bg-brand-strong disabled:opacity-60"
      >
        {pending ? "Checking…" : "Log in"}
      </button>
    </form>
  );
}
