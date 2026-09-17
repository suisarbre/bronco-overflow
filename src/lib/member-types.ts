// Shared by the server and the admin UI; no database access here.
export const BADGE_COLORS = ["green", "gold", "blue", "purple", "red"] as const;
export type BadgeColor = (typeof BADGE_COLORS)[number];

export type Member = {
  id: number;
  title: string;
  color: BadgeColor;
  note: string;
  code_version: number;
  relaxed_limits: boolean;
  skip_review: boolean;
  active: boolean;
  created_at: Date;
};

export function isBadgeColor(value: string): value is BadgeColor {
  return (BADGE_COLORS as readonly string[]).includes(value);
}

/** Title shown on the badge; kept short so it fits next to a nickname. */
export function isUsableTitle(title: string): boolean {
  return /^[\p{L}\p{N} '&./-]{2,24}$/u.test(title);
}
