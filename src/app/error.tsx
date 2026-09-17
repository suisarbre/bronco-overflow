"use client";

export default function Error({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="rounded-2xl border border-dashed border-line p-10 text-center">
      <h1 className="text-xl font-bold">Something went wrong</h1>
      <p className="mt-1 text-muted">The site hiccuped. Try again in a moment.</p>
      <button onClick={reset} className="mt-4 rounded-lg bg-brand px-4 py-2 font-semibold text-on-brand">
        Try again
      </button>
    </div>
  );
}
