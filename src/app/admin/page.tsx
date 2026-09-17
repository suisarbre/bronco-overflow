import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AdminLoginForm } from "./AdminLoginForm";
import { isAdmin } from "@/lib/identity";

export const metadata: Metadata = { title: "Admin", robots: { index: false } };

export default async function AdminPage() {
  if (await isAdmin()) redirect("/");

  return (
    <div className="mx-auto max-w-sm space-y-4 rounded-2xl border border-line bg-card p-6">
      <h1 className="text-xl font-bold">Tutor login</h1>
      {process.env.ADMIN_PASSWORD ? (
        <>
          <p className="text-sm text-muted">Logged-in tutors can delete any post.</p>
          <AdminLoginForm />
        </>
      ) : (
        <p className="text-sm text-muted">
          Set the <code>ADMIN_PASSWORD</code> environment variable to enable moderation.
        </p>
      )}
    </div>
  );
}
