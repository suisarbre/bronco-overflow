// Choices on the walk-in check-in form, shared by the form, the server, and the
// CSV export. The `id`s are what's stored, so don't rename one that's in use;
// add new choices or change labels instead.
import { TAGS } from "./tags";

export type Choice = { id: string; label: string };

/** Picking this reveals a short text box. */
export const OTHER = "other";
export const OTHER_MAX = 60;

export const YEARS: Choice[] = [
  { id: "freshman", label: "Freshman" },
  { id: "sophomore", label: "Sophomore" },
  { id: "junior", label: "Junior" },
  { id: "senior", label: "Senior" },
  { id: "grad", label: "Grad student" },
  { id: OTHER, label: "Other" },
];

// The class list is the same as the board's class tags.
export const COURSES: Choice[] = [
  ...TAGS.filter((t) => t.group === "course" && t.id !== "other-class").map((t) => ({ id: t.id, label: t.label })),
  { id: OTHER, label: "Other" },
];

export const REASONS: Choice[] = [
  { id: "homework", label: "Homework / lab" },
  { id: "exam", label: "Exam prep" },
  { id: "project", label: "Project" },
  { id: "concept", label: "Understanding a concept" },
  { id: OTHER, label: "Other" },
];

export function isChoice(list: Choice[], id: string): boolean {
  return list.some((c) => c.id === id);
}

/** "CS 2400 · Data Structures", or "Other: MAT 1150" for a typed-in answer. */
export function choiceLabel(list: Choice[], id: string, other: string | null): string {
  if (id === OTHER) return other ? `Other: ${other}` : "Other";
  return list.find((c) => c.id === id)?.label ?? id;
}
