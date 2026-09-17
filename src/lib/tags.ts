// Edit this list to match the courses you tutor. `id` is stored in the
// database, so avoid renaming an id once questions use it.
export type Tag = { id: string; label: string; group: "course" | "general" };

export const TAGS: Tag[] = [
  { id: "cs1300", label: "CS 1300 · Discrete Structures", group: "course" },
  { id: "cs1400", label: "CS 1400 · Intro to Programming", group: "course" },
  { id: "cs2400", label: "CS 2400 · Data Structures", group: "course" },
  { id: "cs2560", label: "CS 2560 · C++", group: "course" },
  { id: "cs2600", label: "CS 2600 · Systems Programming", group: "course" },
  { id: "cs2640", label: "CS 2640 · Assembly", group: "course" },
  { id: "cs3010", label: "CS 3010 · Numerical Methods", group: "course" },
  { id: "cs3110", label: "CS 3110 · Automata", group: "course" },
  { id: "cs3310", label: "CS 3310 · Algorithms", group: "course" },
  { id: "cs3560", label: "CS 3560 · OOP", group: "course" },
  { id: "cs3650", label: "CS 3650 · Computer Architecture", group: "course" },
  { id: "cs4310", label: "CS 4310 · Operating Systems", group: "course" },
  { id: "cs4350", label: "CS 4350 · Databases", group: "course" },
  { id: "cs4800", label: "CS 4800 · Software Engineering", group: "course" },
  { id: "other-class", label: "Other class", group: "course" },

  { id: "coding", label: "Coding", group: "general" },
  { id: "career", label: "Career / Internships", group: "general" },
  { id: "campus", label: "Campus", group: "general" },
  { id: "chat", label: "Just chatting", group: "general" },
];

const byId = new Map(TAGS.map((t) => [t.id, t]));

export function isTag(id: string): boolean {
  return byId.has(id);
}

export function tagLabel(id: string): string {
  return byId.get(id)?.label ?? id;
}

export function tagGroup(id: string): Tag["group"] {
  return byId.get(id)?.group ?? "general";
}
