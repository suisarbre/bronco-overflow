import Link from "next/link";

export default function NotFound() {
  return (
    <div className="rounded-2xl border border-dashed border-line p-10 text-center">
      <h1 className="text-xl font-bold">Not found</h1>
      <p className="mt-1 text-muted">This question may have been deleted.</p>
      <Link href="/" className="mt-4 inline-block text-link underline">
        Back to all questions
      </Link>
    </div>
  );
}
