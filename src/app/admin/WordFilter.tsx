"use client";

import { useActionState, useTransition } from "react";
import { addFilterWord, deleteFilterWord, testFilter, type AdminState } from "./actions";

const input = "rounded-lg border border-line bg-bg px-3 py-1.5 text-sm outline-none focus:border-brand";
const button = "rounded-lg border border-line px-3 py-1.5 text-sm font-medium hover:bg-subtle disabled:opacity-60";

function WordChip({ word, list }: { word: string; list: "blocked" | "allowed" }) {
  const [pending, start] = useTransition();
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-line bg-subtle px-2.5 py-1 text-sm">
      {word}
      <button
        type="button"
        aria-label={`Remove ${word}`}
        disabled={pending}
        onClick={() => start(() => deleteFilterWord(word, list))}
        className="text-muted hover:text-danger disabled:opacity-50"
      >
        ✕
      </button>
    </span>
  );
}

function AddWordForm({ list, placeholder }: { list: "blocked" | "allowed"; placeholder: string }) {
  const [state, action, pending] = useActionState<AdminState, FormData>(addFilterWord, {});
  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="list" value={list} />
      <input name="word" required maxLength={40} placeholder={placeholder} aria-label={placeholder} className={input} />
      <button className={button} disabled={pending}>
        Add
      </button>
      {state.error && <span className="text-sm text-danger">{state.error}</span>}
      {state.ok && <span className="text-sm text-brand">{state.ok}</span>}
    </form>
  );
}

export function WordFilter({ blocked, allowed }: { blocked: string[]; allowed: string[] }) {
  const [test, testAction, testing] = useActionState<AdminState, FormData>(testFilter, {});

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <h3 className="font-semibold">Extra blocked words</h3>
        <p className="text-sm text-muted">
          Added on top of the built-in English list. Matching ignores spacing tricks like{" "}
          <code className="rounded bg-code px-1">f.u.c.k</code> and <code className="rounded bg-code px-1">sh1t</code>.
        </p>
        <div className="flex flex-wrap gap-2">
          {blocked.length === 0 ? (
            <span className="text-sm text-muted">None yet.</span>
          ) : (
            blocked.map((w) => <WordChip key={w} word={w} list="blocked" />)
          )}
        </div>
        <AddWordForm list="blocked" placeholder="word to block" />
      </div>

      <div className="space-y-2">
        <h3 className="font-semibold">Words to stop blocking</h3>
        <p className="text-sm text-muted">
          Turns off a built-in word (type it exactly, e.g. <code className="rounded bg-code px-1">crap</code>).
        </p>
        <div className="flex flex-wrap gap-2">
          {allowed.length === 0 ? (
            <span className="text-sm text-muted">None yet.</span>
          ) : (
            allowed.map((w) => <WordChip key={w} word={w} list="allowed" />)
          )}
        </div>
        <AddWordForm list="allowed" placeholder="word to allow" />
      </div>

      <div className="space-y-2">
        <h3 className="font-semibold">Try it</h3>
        <form action={testAction} className="flex flex-wrap items-center gap-2">
          <input name="text" maxLength={200} placeholder="Type a sentence to test" aria-label="Test text" className={`${input} min-w-64 flex-1`} />
          <button className={button} disabled={testing}>
            Test
          </button>
        </form>
        {test.ok && <p className="font-mono text-sm">{test.ok}</p>}
      </div>
    </div>
  );
}
