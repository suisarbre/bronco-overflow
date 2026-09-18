import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Checkins } from "./Checkins";
import { Members } from "./Members";
import { Tickets } from "./Tickets";
import { DefaultForm, EmergencyButtons, KeyedAction, OverrideForm } from "./SettingControls";
import { WordFilter } from "./WordFilter";
import { approvePost, deleteByPoster, hidePost, rotatePassword } from "./actions";
import { deleteAnswer, deleteQuestion } from "@/app/actions";
import { adminPasswordAge } from "@/lib/admin-password";
import { CHANNELS, CHANNEL_KEYS } from "@/lib/channels";
import { checkinStats, recentCheckins } from "@/lib/checkins";
import { timeAgo } from "@/lib/format";
import { getStaffRole } from "@/lib/identity";
import { listMembers } from "@/lib/members";
import { getWordLists } from "@/lib/moderation";
import { webhookFor } from "@/lib/notify";
import { moderationQueue, recentPosts, type ModerationRow } from "@/lib/queries";
import { FILTER_MODE_LABELS, SETTINGS, SETTING_KEYS, type SettingState } from "@/lib/settings";
import { getSettingStates } from "@/lib/settings-store";
import { listTickets } from "@/lib/tickets";

export const metadata: Metadata = { title: "Admin", robots: { index: false } };

function describe(state: SettingState): string {
  const value = state.value;
  if (state.key === "filterMode") return FILTER_MODE_LABELS[value as keyof typeof FILTER_MODE_LABELS];
  if (typeof value === "boolean") return value ? "On" : "Off";
  return String(value);
}

function Card({ title, id, children }: { title: string; id?: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-4 space-y-4 rounded-2xl border border-line bg-card p-4 sm:p-5">
      <h2 className="text-lg font-bold">{title}</h2>
      {children}
    </section>
  );
}

function PostRow({ row, admin }: { row: ModerationRow; admin: boolean }) {
  const label = row.type === "q" ? row.title : row.body;
  const badge =
    row.status === "pending"
      ? { text: `Waiting (${row.status_reason ?? "review"})`, cls: "bg-accent/20 text-accent-strong" }
      : row.status === "hidden"
        ? { text: `Hidden (${row.status_reason ?? "reports"})`, cls: "bg-danger/15 text-danger" }
        : null;

  return (
    <li className="space-y-2 rounded-xl border border-line p-3">
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
        <span className="rounded bg-subtle px-1.5 py-0.5 font-medium">{row.type === "q" ? "Question" : "Answer"}</span>
        {badge && <span className={`rounded px-1.5 py-0.5 font-medium ${badge.cls}`}>{badge.text}</span>}
        {row.reports > 0 && (
          <span className="rounded bg-danger/15 px-1.5 py-0.5 font-medium text-danger">
            {row.reports} report{row.reports === 1 ? "" : "s"}
            {row.reasons?.length ? `: ${row.reasons.join(", ")}` : ""}
          </span>
        )}
        <span>{row.author || "Anonymous"}</span>
        <span>· {timeAgo(row.created_at)}</span>
      </div>

      <p className="line-clamp-3 text-sm break-words">{label || "(photo only)"}</p>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <Link href={`/q/${row.question_id}`} className="text-sm text-link underline-offset-2 hover:underline">
          Open
        </Link>
        {row.status !== "visible" && <KeyedAction label="Approve" action={approvePost.bind(null, row.type, row.id)} />}
        {row.status === "visible" && (
          <KeyedAction label="Hide" confirmText="Hide this post from everyone?" action={hidePost.bind(null, row.type, row.id)} />
        )}
        <KeyedAction
          label="Delete"
          danger
          confirmText="Delete this post for good?"
          action={row.type === "q" ? deleteQuestion.bind(null, row.id) : deleteAnswer.bind(null, row.id)}
        />
        <KeyedAction
          label={`Delete all from this browser (${row.by_owner})`}
          danger
          confirmText={`Delete ${row.by_owner} post(s) this browser made in the last 24 hours?`}
          action={deleteByPoster.bind(null, "owner", row.owner_id)}
        />
        {admin && (
          <KeyedAction
              label={`Delete all from this network (${row.by_ip})`}
            confirmText={`Delete ${row.by_ip} post(s) from this network in the last 24 hours? On campus Wi-Fi this can include other people.`}
            action={deleteByPoster.bind(null, "ip", row.ip_hash)}
            danger
          />
        )}
      </div>
    </li>
  );
}

export default async function AdminPage() {
  const role = await getStaffRole();
  if (!role) redirect("/login");

  const admin = role === "admin";
  const [states, words, queue, recent, passwordSetAt, members, visits, latestVisits, tickets] = await Promise.all([
    getSettingStates(),
    getWordLists(),
    moderationQueue(),
    recentPosts(),
    admin ? adminPasswordAge() : null,
    admin ? listMembers() : [],
    checkinStats(),
    recentCheckins(),
    listTickets(),
  ]);
  const rotationDays = states.adminPasswordDays.value;
  const webhookMissing = !webhookFor("password");
  const overrides = SETTING_KEYS.filter((key) => states[key].override);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-baseline gap-2">
        <h1 className="text-2xl font-bold">Moderation</h1>
        <span className="rounded-full bg-subtle px-2 py-0.5 text-sm font-medium text-muted">
          signed in as {role}
        </span>
      </div>
      {!admin && (
        <p className="text-sm text-muted">
          Site defaults, badge holders, and the tutor password are admin-only — they need the password from
          Vercel&apos;s environment variables.
        </p>
      )}

      <Card title="Emergency">
        <EmergencyButtons overridesActive={overrides.length} />
        {states.readOnly.value && (
          <p className="rounded-lg bg-danger/10 px-3 py-2 text-sm font-medium text-danger">
            The board is read-only right now. Nobody can post, answer, edit, or vote.
          </p>
        )}
      </Card>

      <Card title="Check-ins" id="checkins">
        <Checkins stats={visits} recent={latestVisits} />
      </Card>

      <Card title="Temporary changes">
        <p className="text-sm text-muted">
          These snap back to the defaults below when the timer runs out.
        </p>
        <ul className="space-y-4">
          {SETTING_KEYS.map((key) => {
            const state = states[key];
            return (
              <li key={key} className="space-y-2 border-t border-line pt-4 first:border-0 first:pt-0">
                <div className="flex flex-wrap items-baseline gap-2">
                  <span className="font-semibold">{SETTINGS[key].label}</span>
                  <span className="text-sm text-muted">now: {describe(state)}</span>
                  {state.override && (
                    <span className="rounded bg-accent/20 px-1.5 py-0.5 text-xs font-medium text-accent-strong">
                      temporary ·{" "}
                      {state.override.until
                        ? `back to default ${timeAgo(state.override.until)}`
                        : "until you turn it off"}
                    </span>
                  )}
                </div>
                <p className="text-sm text-muted">{SETTINGS[key].help}</p>
                <OverrideForm state={state} />
              </li>
            );
          })}
        </ul>
      </Card>

      {admin && (
      <Card title="Default settings">
        <ul className="space-y-4">
          {SETTING_KEYS.map((key) => (
            <li key={key} className="space-y-2 border-t border-line pt-4 first:border-0 first:pt-0">
              <span className="font-semibold">{SETTINGS[key].label}</span>
              <DefaultForm state={states[key]} />
            </li>
          ))}
        </ul>
      </Card>
      )}

      {admin && (
      <Card title="Tutor password">
        <p className="text-sm text-muted">
          {webhookMissing
            ? "Set DISCORD_WEBHOOK_URL (or DISCORD_WEBHOOK_PASSWORD) to let the server rotate the password and post the new one to Discord. Until then, the ADMIN_PASSWORD environment variable is the only way in."
            : rotationDays > 0
              ? `A new password goes to Discord every ${rotationDays} day${rotationDays === 1 ? "" : "s"}. Change that under "Default settings" above.`
              : "Rotation is off. Turn it on under “Default settings” above."}
        </p>
        <p className="text-sm text-muted">
          {passwordSetAt
            ? `Current password was posted to Discord ${timeAgo(passwordSetAt)}.`
            : "No password has been generated yet — the ADMIN_PASSWORD environment variable is in use."}
        </p>
        {!webhookMissing && (
          <KeyedAction
            label="Post a new password to Discord now"
            confirmText="Replace the tutor password? Everyone will need the new one from Discord to sign in again. You stay signed in."
            action={rotatePassword}
          />
        )}
      </Card>
      )}

      {admin && (
      <Card title="Discord channels">
        <p className="text-sm text-muted">
          Each kind of alert can go to its own channel: set its variable in Vercel (Settings → Environment
          Variables) and redeploy. Anything unset goes to <code>DISCORD_WEBHOOK_URL</code>.
        </p>
        <ul className="divide-y divide-line text-sm">
          {CHANNEL_KEYS.map((key) => {
            const own = !!process.env[CHANNELS[key].env]?.trim();
            const any = !!webhookFor(key);
            return (
              <li key={key} className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 py-2">
                <span>{CHANNELS[key].label}</span>
                <span className={`font-mono text-xs ${any ? "text-muted" : "text-danger"}`}>
                  {own ? CHANNELS[key].env : any ? "DISCORD_WEBHOOK_URL" : "not sent (no webhook)"}
                </span>
              </li>
            );
          })}
        </ul>
      </Card>
      )}

      {admin && (
      <Card title="Badge holders">
        <Members members={members} />
      </Card>
      )}

      <Card title="Word filter">
        <WordFilter blocked={words.blocked} allowed={words.allowed} />
      </Card>

      <Card title={`Tickets (${tickets.open.length} open)`} id="tickets">
        <Tickets open={tickets.open} closed={tickets.closed} />
      </Card>

      <Card title={`Needs a look (${queue.length})`}>
        {queue.length === 0 ? (
          <p className="text-sm text-muted">Nothing waiting. 🎉</p>
        ) : (
          <ul className="space-y-3">
            {queue.map((row) => (
              <PostRow key={`${row.type}${row.id}`} row={row} admin={admin} />
            ))}
          </ul>
        )}
      </Card>

      <Card title="Recent posts">
        <ul className="space-y-3">
          {recent.map((row) => (
            <PostRow key={`${row.type}${row.id}`} row={row} admin={admin} />
          ))}
        </ul>
      </Card>
    </div>
  );
}
