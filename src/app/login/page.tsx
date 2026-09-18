import type { Metadata } from "next";
import { LoginForm } from "./LoginForm";
import { adminLoginPossible } from "@/lib/admin-password";

export const metadata: Metadata = { title: "Sign in", robots: { index: false } };

export default async function LoginPage() {
  const staffLoginPossible = await adminLoginPossible();

  return (
    <div className="mx-auto max-w-sm space-y-4 rounded-2xl border border-line bg-card p-6">
      <h1 className="text-xl font-bold">Sign in</h1>
      <p className="text-sm leading-relaxed text-muted">
        Tutors: use the password from the tutors&apos; Discord channel. If a tutor gave you a badge code, enter it
        here to post with your badge.
      </p>
      <p className="text-sm text-muted">
        Students don&apos;t need to sign in — asking and answering are anonymous.
      </p>
      <LoginForm />
      {!staffLoginPossible && (
        <p className="text-xs text-muted">
          No tutor password exists yet. Set <code>ADMIN_PASSWORD</code> or a Discord webhook to
          enable staff sign-in.
        </p>
      )}
    </div>
  );
}
