/** Marks a post written by a signed-in admin or tutor. Styled like the header labels, unlike member badges. */
export function StaffBadge({ role }: { role: string | null }) {
  if (role === "admin") {
    return <span className="rounded bg-accent px-1.5 py-0.5 text-xs font-bold text-on-accent">ADMIN</span>;
  }
  if (role === "tutor") {
    return <span className="rounded bg-brand px-1.5 py-0.5 text-xs font-bold text-on-brand">TUTOR</span>;
  }
  return null;
}
