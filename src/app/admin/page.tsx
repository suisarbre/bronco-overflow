import type { Metadata } from "next";
import Link from "next/link";
import { AdminLoginForm } from "./AdminLoginForm";
import { DefaultForm, EmergencyButtons, KeyedAction, OverrideForm } from "./SettingControls";
import { WordFilter } from "./WordFilter";
import { approvePost, deleteByPoster, hidePost } from "./actions";
import { deleteAnswer, deleteQuestion } from "@/app/actions";
import { timeAgo } from "@/lib/format";
import { isAdmin } from "@/lib/identity";
import { getWordLists } from "@/lib/moderation";
import { moderationQueue, posterCounts, recentPosts, type ModerationRow } from "@/lib/queries";
import { FILTER_MODE_LABELS, SETTINGS, SETTING_KEYS, type SettingState } from "@/lib/settings";
import { getSettingStates } from "@/lib/settings-store";

export const metadata: Metadata = { title: "Admin", robots: { index: false } };

function describe(state: SettingState): string {
  const value = state.value;
  if (state.key === "filterMode") return FILTER_MODE_LABELS[value as keyof typeof FILTER_MODE_LABELS];
  if (typeof value === "boolean") return value ? "On" : "Off";
  return String(value);
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-4 rounded-2xl border border-line bg-card p-4 sm:p-5">
      <h2 className="text-lg font-bold">{title}</h2>
      {children}
    </section>
  );
}

async function PostRow({ row }: { row: ModerationRow }) {
  const counts = await posterCounts(row.owner_id, row.ip_hash);
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
          label={`Delete all from this browser (${counts.by_owner})`}
          danger
          confirmText={`Delete ${counts.by_owner} post(s) this browser made in the last 24 hours?`}
          action={deleteByPoster.bind(null, "owner", row.owner_id)}
        />
        <KeyedAction
          label={`Delete all from this network (${counts.by_ip})`}
          danger
          confirmText={`Delete ${counts.by_ip} post(s) from this network in the last 24 hours? On campus Wi-Fi this can include other people.`}
          action={deleteByPoster.bind(null, "ip", row.ip_hash)}
        />
      </div>
    </li>
  );
}

export default async function AdminPage() {
  if (!(await isAdmin())) {
    return (
      <div className="mx-auto max-w-sm space-y-4 rounded-2xl border border-line bg-card p-6">
        <h1 className="text-xl font-bold">Tutor login</h1>
        {process.env.ADMIN_PASSWORD ? (
          <>
            <p className="text-sm text-muted">Signed-in tutors can moderate posts and change site settings.</p>
            <AdminLoginForm />
          </>
        ) : (
          <p className="text-sm text-muted">
            Set the <code>ADMIN_PASSWORD</code> environment variable to enable moderation.
          </p>
        )}
      </div>
    );
  }

  const [states, words, queue, recent] = await Promise.all([
    getSettingStates(),
    getWordLists(),
    moderationQueue(),
    recentPosts(),
  ]);
  const overrides = SETTING_KEYS.filter((key) => states[key].override);

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold">Moderation</h1>

      <Card title="Emergency">
        <EmergencyButtons overridesActive={overrides.length} />
        {states.readOnly.value && (
          <p className="rounded-lg bg-danger/10 px-3 py-2 text-sm font-medium text-danger">
            The board is read-only right now. Nobody can post, answer, edit, or vote.
          </p>
        )}
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

      <Card title="Word filter">
        <WordFilter blocked={words.blocked} allowed={words.allowed} />
      </Card>

      <Card title={`Needs a look (${queue.length})`}>
        {queue.length === 0 ? (
          <p className="text-sm text-muted">Nothing waiting. 🎉</p>
        ) : (
          <ul className="space-y-3">
            {queue.map((row) => (
              <PostRow key={`${row.type}${row.id}`} row={row} />
            ))}
          </ul>
        )}
      </Card>

      <Card title="Recent posts">
        <ul className="space-y-3">
          {recent.map((row) => (
            <PostRow key={`${row.type}${row.id}`} row={row} />
          ))}
        </ul>
      </Card>
    </div>
  );
}
