import type { Metadata } from "next";
import { CheckinForm } from "./CheckinForm";

export const metadata: Metadata = { title: "Tutoring check-in", robots: { index: false } };

export default function CheckinPage() {
  return (
    <div className="mx-auto max-w-lg space-y-5 rounded-2xl border border-line bg-card p-5 sm:p-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold">Welcome to CS tutoring 👋</h1>
        <p className="text-sm text-muted">Four quick taps to check in.</p>
      </div>
      <CheckinForm />
    </div>
  );
}
