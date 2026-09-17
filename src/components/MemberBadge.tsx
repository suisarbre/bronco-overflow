const COLORS: Record<string, string> = {
  green: "bg-brand/15 text-brand",
  gold: "bg-accent/25 text-accent-strong",
  blue: "bg-[#2563eb]/15 text-[#2563eb] dark:text-[#7aa7ff]",
  purple: "bg-[#7c3aed]/15 text-[#7c3aed] dark:text-[#c4a5ff]",
  red: "bg-danger/15 text-danger",
};

/** The label a tutor gave a vouched-for poster, e.g. "Teacher". */
export function MemberBadge({ title, color }: { title: string | null; color: string | null }) {
  if (!title) return null;
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${COLORS[color ?? "green"] ?? COLORS.green}`}>
      {title}
    </span>
  );
}
