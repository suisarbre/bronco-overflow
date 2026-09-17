import Link from "next/link";
import { tagGroup, tagLabel } from "@/lib/tags";

export function TagBadge({ tag }: { tag: string }) {
  const course = tagGroup(tag) === "course";
  return (
    <Link
      href={`/?tag=${encodeURIComponent(tag)}`}
      className={`relative z-10 rounded-full px-2 py-0.5 font-medium ${
        course ? "bg-brand/10 text-brand" : "bg-accent/20 text-accent-strong"
      } hover:opacity-80`}
    >
      {tagLabel(tag)}
    </Link>
  );
}
