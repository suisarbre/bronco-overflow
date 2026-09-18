import { KeyedAction } from "./SettingControls";
import { removeCheckin } from "./actions";
import { COURSES, REASONS, YEARS, choiceLabel } from "@/lib/checkin-options";
import { campusDayOffset, type Checkin, type CheckinStats, type Tally } from "@/lib/checkins";
import { campusTime } from "@/lib/format";

function Bars({ title, rows }: { title: string; rows: Tally }) {
  const max = Math.max(1, ...rows.map((r) => r.count));
  return (
    <div className="space-y-1.5">
      <h3 className="text-sm font-semibold">{title}</h3>
      {rows.length === 0 ? (
        <p className="text-sm text-muted">—</p>
      ) : (
        <ul className="space-y-1">
          {rows.map((r) => (
            <li key={r.label} className="grid grid-cols-[minmax(0,9rem)_1fr_2.5rem] items-center gap-2 text-sm">
              <span className="truncate" title={r.label}>
                {r.label.split(" · ")[0]}
              </span>
              <span className="h-2.5 rounded-full bg-subtle">
                <span className="block h-full rounded-full bg-brand" style={{ width: `${(r.count / max) * 100}%` }} />
              </span>
              <span className="text-right tabular-nums text-muted">{r.count}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl bg-subtle px-3 py-2">
      <div className="text-2xl font-bold tabular-nums">{value}</div>
      <div className="text-xs text-muted">{label}</div>
    </div>
  );
}

const dateInput = "rounded-lg border border-line bg-bg px-2 py-1.5 text-sm outline-none focus:border-brand";

export function Checkins({ stats, recent }: { stats: CheckinStats; recent: Checkin[] }) {
  return (
    <div className="space-y-5">
      <p className="text-sm text-muted">
        Walk-ins who scanned the desk QR code (<a href="/qr/checkin" className="text-link underline">print it here</a>).
        Anonymous: year, class, reason, and time only.
      </p>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="today" value={stats.today} />
        <Stat label="last 7 days" value={stats.week} />
        <Stat label="last 30 days" value={stats.month} />
        <Stat label="first-timers (30 days)" value={stats.firstVisits} />
      </div>

      {stats.month > 0 && (
        <div className="grid gap-5 sm:grid-cols-2">
          <Bars title="Classes (30 days)" rows={stats.byCourse} />
          <Bars title="Reasons (30 days)" rows={stats.byReason} />
          <Bars title="Time of day (30 days)" rows={stats.byHour} />
          <Bars title="Day of week (30 days)" rows={stats.byWeekday} />
          <Bars title="Year (30 days)" rows={stats.byYear} />
        </div>
      )}

      <form action="/admin/checkins" method="get" className="flex flex-wrap items-end gap-2 border-t border-line pt-4">
        <label className="space-y-1 text-sm">
          <span className="block text-muted">From</span>
          <input type="date" name="from" defaultValue={campusDayOffset(-29)} className={dateInput} />
        </label>
        <label className="space-y-1 text-sm">
          <span className="block text-muted">To</span>
          <input type="date" name="to" defaultValue={campusDayOffset(0)} className={dateInput} />
        </label>
        <button className="rounded-lg bg-brand px-3 py-1.5 text-sm font-semibold text-on-brand hover:bg-brand-strong">
          Download CSV
        </button>
      </form>

      {recent.length > 0 && (
        <details className="border-t border-line pt-4">
          <summary className="cursor-pointer text-sm font-semibold">Latest check-ins</summary>
          <ul className="mt-2 divide-y divide-line text-sm">
            {recent.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
                <span className="text-muted">{campusTime(c.created_at)}</span>
                <span>{choiceLabel(COURSES, c.course, c.course_other).split(" · ")[0]}</span>
                <span className="text-muted">{choiceLabel(REASONS, c.reason, c.reason_other)}</span>
                <span className="text-muted">{choiceLabel(YEARS, c.year, c.year_other)}</span>
                {c.first_visit && <span className="rounded bg-accent/20 px-1.5 text-xs text-accent-strong">first visit</span>}
                <span className="ml-auto">
                  <KeyedAction label="Remove" danger confirmText="Remove this check-in?" action={removeCheckin.bind(null, c.id)} />
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
