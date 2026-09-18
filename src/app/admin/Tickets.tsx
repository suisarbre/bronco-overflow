import { KeyedAction } from "./SettingControls";
import { removeTicket, setTicketStatus } from "./actions";
import { campusTime, timeAgo } from "@/lib/format";
import { ticketKindLabel } from "@/lib/ticket-kinds";
import type { Ticket } from "@/lib/tickets";

function TicketRow({ ticket }: { ticket: Ticket }) {
  const open = ticket.status === "open";
  return (
    <li className={`space-y-2 rounded-xl border border-line p-3 ${open ? "" : "opacity-70"}`}>
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
        <span className="font-mono font-semibold text-fg">#{ticket.id}</span>
        <span className="rounded bg-subtle px-1.5 py-0.5 font-medium">{ticketKindLabel(ticket.kind)}</span>
        <time dateTime={ticket.created_at.toISOString()} title={campusTime(ticket.created_at)}>
          {timeAgo(ticket.created_at)}
        </time>
        {ticket.page && <span className="font-mono">{ticket.page}</span>}
        {ticket.device && <span>{ticket.device}</span>}
        {!open && ticket.closed_at && <span>· closed {timeAgo(ticket.closed_at)}</span>}
      </div>
      <p className="text-sm break-words whitespace-pre-wrap">{ticket.body}</p>
      <div className="flex flex-wrap gap-4">
        <KeyedAction label={open ? "Close" : "Reopen"} action={setTicketStatus.bind(null, ticket.id, !open)} />
        <KeyedAction
          label="Delete"
          danger
          confirmText={`Delete ticket #${ticket.id}?`}
          action={removeTicket.bind(null, ticket.id)}
        />
      </div>
    </li>
  );
}

export function Tickets({ open, closed }: { open: Ticket[]; closed: Ticket[] }) {
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted">
        From the “Report a bug” button. Anonymous, so there&apos;s no one to reply to — people can mention their
        ticket number at the desk. Closed tickets are deleted after 180 days.
      </p>
      {open.length === 0 ? (
        <p className="text-sm text-muted">No open tickets. 🎉</p>
      ) : (
        <ul className="space-y-3">
          {open.map((t) => (
            <TicketRow key={t.id} ticket={t} />
          ))}
        </ul>
      )}
      {closed.length > 0 && (
        <details>
          <summary className="cursor-pointer text-sm font-semibold">Recently closed ({closed.length})</summary>
          <ul className="mt-3 space-y-3">
            {closed.map((t) => (
              <TicketRow key={t.id} ticket={t} />
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
