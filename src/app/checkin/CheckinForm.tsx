"use client";

import Link from "next/link";
import { startTransition, useActionState, useState, useSyncExternalStore, type FormEvent } from "react";
import { checkIn, type CheckinState } from "./actions";
import { COURSES, OTHER, OTHER_MAX, REASONS, YEARS, type Choice } from "@/lib/checkin-options";

// Year and class rarely change between visits, so they're remembered on this
// device (and only here) to make the next check-in one tap.
const STORAGE_KEY = "checkin";
type Saved = { year?: string; year_other?: string; course?: string; course_other?: string };

// Read once per page load. Re-reading after submit (which saves new answers)
// would change the form's key below and remount it, losing the result.
let loaded: string | null | undefined;

function readSaved(): string | null {
  if (loaded === undefined) {
    try {
      loaded = localStorage.getItem(STORAGE_KEY);
    } catch {
      loaded = null;
    }
  }
  return loaded;
}

function parseSaved(raw: string | null): Saved | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw);
    return value && typeof value === "object" ? (value as Saved) : null;
  } catch {
    return null;
  }
}

const subscribe = () => () => {};

export function CheckinForm() {
  // Server render has no saved answers; the client swaps them in after hydrating.
  const raw = useSyncExternalStore(subscribe, readSaved, () => null);
  return <Form key={raw ?? "none"} saved={parseSaved(raw)} />;
}

const input =
  "w-full rounded-lg border border-line bg-bg px-3 py-2.5 text-base outline-none focus:border-brand focus:ring-2 focus:ring-brand/25";

function Chips({
  name,
  label,
  choices,
  value,
  onChange,
}: {
  name: string;
  label: string;
  choices: Choice[];
  value: string;
  onChange: (id: string) => void;
}) {
  return (
    <fieldset className="space-y-2">
      <legend className="mb-2 font-semibold">{label}</legend>
      <div className="flex flex-wrap gap-2">
        {choices.map((c) => (
          <label
            key={c.id}
            className={`cursor-pointer rounded-full border px-3.5 py-2 text-sm font-medium transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand/40 ${
              value === c.id ? "border-brand bg-brand text-on-brand" : "border-line bg-bg hover:border-brand/60"
            }`}
          >
            <input
              type="radio"
              name={name}
              value={c.id}
              checked={value === c.id}
              onChange={() => onChange(c.id)}
              className="sr-only"
              required
            />
            {c.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function OtherBox({ name, value, onChange, placeholder }: { name: string; value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <input
      name={name}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      maxLength={OTHER_MAX}
      placeholder={placeholder}
      aria-label={placeholder}
      autoFocus
      className={input}
    />
  );
}

function Form({ saved }: { saved: Saved | null }) {
  const [state, formAction, pending] = useActionState<CheckinState, FormData>(checkIn, {});
  const [year, setYear] = useState(saved?.year ?? "");
  const [yearOther, setYearOther] = useState(saved?.year_other ?? "");
  const [course, setCourse] = useState(saved?.course ?? "");
  const [courseOther, setCourseOther] = useState(saved?.course_other ?? "");
  const [reason, setReason] = useState("");
  const [reasonOther, setReasonOther] = useState("");
  // Someone with saved answers has been here before.
  const [first, setFirst] = useState(saved ? "no" : "");

  if (state.ok) {
    return (
      <div className="space-y-4 text-center">
        <p className="text-5xl" aria-hidden>
          ✅
        </p>
        <h2 className="text-xl font-bold">{state.again ? "You're already checked in" : "You're checked in!"}</h2>
        <p className="text-muted">
          {state.again
            ? "No need to scan again during this visit."
            : "Thanks! A tutor will be with you soon. No need to check out when you leave."}
        </p>
        <Link
          href="/"
          className="inline-block rounded-lg bg-brand px-5 py-2.5 font-semibold text-on-brand hover:bg-brand-strong"
        >
          Ask a question while you wait
        </Link>
      </div>
    );
  }

  // onSubmit (not `action`) so React doesn't clear the form if the server says no.
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ year, year_other: yearOther, course, course_other: courseOther } satisfies Saved),
      );
    } catch {
      // Private browsing: they'll just fill it in again next time.
    }
    startTransition(() => formAction(form));
  }

  return (
    <form onSubmit={submit} className="space-y-6">
      <div className="space-y-2">
        <Chips name="year" label="What year are you?" choices={YEARS} value={year} onChange={setYear} />
        {year === OTHER && (
          <OtherBox name="year_other" value={yearOther} onChange={setYearOther} placeholder="e.g. transfer, visiting student" />
        )}
      </div>

      <div className="space-y-2">
        <label htmlFor="course" className="mb-2 block font-semibold">
          Which class is this for?
        </label>
        <select
          id="course"
          name="course"
          required
          value={course}
          onChange={(e) => setCourse(e.target.value)}
          className={input}
        >
          <option value="" disabled>
            Choose a class…
          </option>
          {COURSES.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </select>
        {course === OTHER && (
          <OtherBox name="course_other" value={courseOther} onChange={setCourseOther} placeholder="Which class? e.g. MAT 1150" />
        )}
      </div>

      <div className="space-y-2">
        <Chips name="reason" label="What do you need help with?" choices={REASONS} value={reason} onChange={setReason} />
        {reason === OTHER && (
          <OtherBox name="reason_other" value={reasonOther} onChange={setReasonOther} placeholder="Tell us briefly" />
        )}
      </div>

      <Chips
        name="first_visit"
        label="Is this your first time at CS tutoring?"
        choices={[
          { id: "yes", label: "Yes, first time" },
          { id: "no", label: "No, I've been before" },
        ]}
        value={first}
        onChange={setFirst}
      />

      {/* Honeypot: hidden from people, tempting to bots. */}
      <input name="website" tabIndex={-1} autoComplete="off" aria-hidden className="hidden" />

      {state.error && <p className="text-sm font-medium text-danger">{state.error}</p>}
      <button
        disabled={pending}
        className="w-full rounded-lg bg-brand px-5 py-3 text-lg font-semibold text-on-brand hover:bg-brand-strong disabled:opacity-60"
      >
        {pending ? "Checking in…" : "Check in"}
      </button>
      <p className="text-center text-xs text-muted">
        Anonymous — no name or ID. This only counts visits so the CS department knows when tutoring is busy.
      </p>
    </form>
  );
}
