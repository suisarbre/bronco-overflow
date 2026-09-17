import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import { AnswerForm } from "@/components/AnswerForm";
import { EditButton, EditForm, Editable } from "@/components/EditPost";
import { MemberBadge } from "@/components/MemberBadge";
import { ReportButton } from "@/components/ReportButton";
import { StatusBadge } from "@/components/StatusBadge";
import { AcceptButton, DeleteButton, PinButton } from "@/components/PostControls";
import { RichText } from "@/components/RichText";
import { TagBadge } from "@/components/TagBadge";
import { VoteButton } from "@/components/VoteButton";
import { plural, timeAgo } from "@/lib/format";
import { getVisitorId, isStaff } from "@/lib/identity";
import { getMember } from "@/lib/members";
import { getQuestion } from "@/lib/queries";
import { getSettings } from "@/lib/settings-store";

// Shared by generateMetadata and the page so the DB is queried once per request.
const load = cache(async (rawId: string) => {
  const id = Number(rawId);
  if (!Number.isSafeInteger(id) || id <= 0 || id > 2_147_483_647) return null;
  return getQuestion(id, await getVisitorId(), await isStaff(), (await getMember())?.id ?? null);
});

export async function generateMetadata({ params }: PageProps<"/q/[id]">): Promise<Metadata> {
  const data = await load((await params).id);
  return { title: data?.question.title ?? "Question not found" };
}

function Attachment({ url }: { url: string }) {
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" className="block w-fit">
      {/* eslint-disable-next-line @next/next/no-img-element -- user uploads are already resized */}
      <img
        src={url}
        alt="Attached image"
        loading="lazy"
        className="max-h-[28rem] max-w-full rounded-lg border border-line object-contain"
      />
    </a>
  );
}

function Byline({
  author,
  date,
  edited,
  badge,
  asker,
}: {
  author: string;
  date: Date;
  edited: Date | null;
  badge: { title: string | null; color: string | null };
  asker?: boolean;
}) {
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5 text-sm text-muted">
      <MemberBadge title={badge.title} color={badge.color} />
      {asker && (
        <span
          className="rounded-full bg-subtle px-2 py-0.5 text-xs font-semibold text-muted"
          title="Written by whoever asked the question"
        >
          Asker
        </span>
      )}
      {author || "Anonymous"} ·{" "}
      <time dateTime={date.toISOString()} title={date.toLocaleString("en-US")}>
        {timeAgo(date)}
      </time>
      {edited && (
        <span title={`Edited ${edited.toLocaleString("en-US")}`}>
          {" "}
          · edited
        </span>
      )}
    </span>
  );
}

export default async function QuestionPage({ params }: PageProps<"/q/[id]">) {
  const data = await load((await params).id);
  if (!data) notFound();
  const { question: q, answers } = data;
  const [staff, settings] = await Promise.all([isStaff(), getSettings()]);

  return (
    <div className="space-y-5">
      <Link href="/" className="text-sm text-link hover:underline">
        ← All questions
      </Link>

      <article className="space-y-4 rounded-2xl border border-line bg-card p-4 sm:p-6">
        <Editable
          form={
            <EditForm type="q" id={q.id} title={q.title} body={q.body} tag={q.tag} imageUrl={q.image_url} />
          }
        >
          <StatusBadge status={q.status} reason={q.status_reason} />
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <TagBadge tag={q.tag} />
            {q.pinned && (
              <span className="rounded-full bg-subtle px-2 py-0.5 font-medium text-muted">📌 Pinned</span>
            )}
            {q.accepted_answer_id && (
              <span className="rounded-full bg-brand px-2 py-0.5 font-medium text-on-brand">✓ Solved</span>
            )}
          </div>
          <h1 className="text-2xl leading-tight font-bold break-words">{q.title}</h1>
          {q.body && <RichText text={q.body} />}
          {q.image_url && <Attachment url={q.image_url} />}
          <div className="flex flex-wrap items-center gap-3 border-t border-line pt-3">
            <VoteButton type="q" id={q.id} score={q.score} voted={q.voted} />
            <Byline author={q.author} date={q.created_at} edited={q.edited_at} badge={{ title: q.badge_title, color: q.badge_color }} />
            <span className="ml-auto flex flex-wrap items-center gap-3">
              {staff && <PinButton type="q" id={q.id} pinned={q.pinned} />}
              {!q.is_mine && <ReportButton type="q" id={q.id} />}
              {q.is_mine && <EditButton />}
              {(q.is_mine || staff) && <DeleteButton type="q" id={q.id} />}
            </span>
          </div>
        </Editable>
      </article>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">
          {answers.length === 0 ? "No answers yet — can you help?" : plural(answers.length, "Answer")}
        </h2>

        {answers.map((a) => {
          const accepted = a.id === q.accepted_answer_id;
          return (
            <article
              key={a.id}
              id={`answer-${a.id}`}
              className={`scroll-mt-4 space-y-3 rounded-2xl border bg-card p-4 sm:p-5 ${
                accepted ? "border-brand ring-1 ring-brand" : "border-line"
              }`}
            >
              <Editable form={<EditForm type="a" id={a.id} body={a.body} imageUrl={a.image_url} />}>
                <StatusBadge status={a.status} reason={a.status_reason} />
                {a.pinned && <p className="text-sm font-medium text-muted">📌 Pinned by a tutor</p>}
                {accepted && (
                  <p className="text-sm font-semibold text-brand">✓ Marked as the solution by the asker</p>
                )}
                {a.body && <RichText text={a.body} />}
                {a.image_url && <Attachment url={a.image_url} />}
                <div className="flex flex-wrap items-center gap-3">
                  <VoteButton type="a" id={a.id} score={a.score} voted={a.voted} />
                  <Byline
                    author={a.author}
                    date={a.created_at}
                    edited={a.edited_at}
                    badge={{ title: a.badge_title, color: a.badge_color }}
                    asker={a.by_asker}
                  />
                  <span className="ml-auto flex flex-wrap items-center gap-3">
                    {staff && <PinButton type="a" id={a.id} pinned={a.pinned} />}
                    {!a.is_mine && <ReportButton type="a" id={a.id} />}
                    {q.is_mine && <AcceptButton questionId={q.id} answerId={a.id} accepted={accepted} />}
                    {a.is_mine && <EditButton />}
                    {(a.is_mine || staff) && <DeleteButton type="a" id={a.id} />}
                  </span>
                </div>
              </Editable>
            </article>
          );
        })}
      </section>

      <AnswerForm
        questionId={q.id}
        readOnly={settings.readOnly}
        approvalRequired={settings.approvalRequired}
        uploadsPaused={settings.uploadsPaused}
      />

      <p className="text-center text-sm text-muted">
        Posted here from another browser?{" "}
        <Link href="/recover" className="text-link underline-offset-2 hover:underline">
          Use your recovery code
        </Link>{" "}
        to edit or delete it.
      </p>
    </div>
  );
}
