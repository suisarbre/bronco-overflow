// Shared by the ticket form and the server. `id` is what's stored.
export const TICKET_KINDS = [
  { id: "bug", label: "Bug", emoji: "🐞" },
  { id: "idea", label: "Suggestion", emoji: "💡" },
  { id: "other", label: "Something else", emoji: "💬" },
] as const;

export type TicketKind = (typeof TICKET_KINDS)[number]["id"];

export const TICKET_MIN = 5;
export const TICKET_MAX = 2000;

export function isTicketKind(id: string): id is TicketKind {
  return TICKET_KINDS.some((k) => k.id === id);
}

export function ticketKindLabel(id: string): string {
  const kind = TICKET_KINDS.find((k) => k.id === id);
  return kind ? `${kind.emoji} ${kind.label}` : id;
}
