import type { Metadata } from "next";
import { RecoverForm } from "./RecoverForm";

export const metadata: Metadata = { title: "Recover your post", robots: { index: false } };

export default function RecoverPage() {
  return (
    <div className="mx-auto max-w-md space-y-4 rounded-2xl border border-line bg-card p-6">
      <h1 className="text-xl font-bold">Recover your post</h1>
      <p className="text-sm leading-relaxed text-muted">
        Posts can be edited or deleted from the browser they were written in. On another browser or device,
        enter the recovery code you got when you posted, and you&apos;ll be able to manage that post from here too.
      </p>
      <RecoverForm />
    </div>
  );
}
