import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import { AnswerForm } from "@/components/AnswerForm";
import { AcceptButton, DeleteButton } from "@/components/PostControls";
import { RichText } from "@/components/RichText";
import { TagBadge } from "@/components/TagBadge";
import { VoteButton } from "@/components/VoteButton";
import { plural, timeAgo } from "@/lib/format";
import { getVisitorId, isAdmin } from "@/lib/identity";
import { getQuestion } from "@/lib/queries";

// Shared by generateMetadata and the page so the DB is queried once per request.
const load = cache(async (rawId: string) => {
  const id = Number(rawId);
  if (!Number.isInteger(id) || id <= 0) return null;
  return getQuestion(id, await getVisitorId());
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

function Byline({ author, date }: { author: string; date: Date }) {
  return (
    <span className="text-sm text-muted">
      {author || "Anonymous"} ·{" "}
      <time dateTime={date.toISOString()} title={date.toLocaleString("en-US")}>
        {timeAgo(date)}
      </time>
    </span>
  );
}

export default async function QuestionPage({ params }: PageProps<"/q/[id]">) {
  const data = await load((await params).id);
  if (!data) notFound();
  const { question: q, answers } = data;
  const admin = await isAdmin();

  return (
    <div className="space-y-5">
      <Link href="/" className="text-sm text-link hover:underline">
        ← All questions
      </Link>

      <article className="space-y-4 rounded-2xl border border-line bg-card p-4 sm:p-6">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <TagBadge tag={q.tag} />
          {q.accepted_answer_id && (
            <span className="rounded-full bg-brand px-2 py-0.5 font-medium text-on-brand">✓ Solved</span>
          )}
        </div>
        <h1 className="text-2xl leading-tight font-bold break-words">{q.title}</h1>
        {q.body && <RichText text={q.body} />}
        {q.image_url && <Attachment url={q.image_url} />}
        <div className="flex flex-wrap items-center gap-3 border-t border-line pt-3">
          <VoteButton type="q" id={q.id} score={q.score} voted={q.voted} />
          <Byline author={q.author} date={q.created_at} />
          {(q.is_mine || admin) && (
            <span className="ml-auto">
              <DeleteButton type="q" id={q.id} />
            </span>
          )}
        </div>
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
              className={`space-y-3 rounded-2xl border bg-card p-4 sm:p-5 ${
                accepted ? "border-brand ring-1 ring-brand" : "border-line"
              }`}
            >
              {accepted && <p className="text-sm font-semibold text-brand">✓ Marked as the solution by the asker</p>}
              {a.body && <RichText text={a.body} />}
              {a.image_url && <Attachment url={a.image_url} />}
              <div className="flex flex-wrap items-center gap-3">
                <VoteButton type="a" id={a.id} score={a.score} voted={a.voted} />
                <Byline author={a.author} date={a.created_at} />
                <span className="ml-auto flex gap-3">
                  {q.is_mine && <AcceptButton questionId={q.id} answerId={a.id} accepted={accepted} />}
                  {(a.is_mine || admin) && <DeleteButton type="a" id={a.id} />}
                </span>
              </div>
            </article>
          );
        })}
      </section>

      <AnswerForm questionId={q.id} />
    </div>
  );
}
