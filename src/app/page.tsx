import Link from "next/link";
import { AskForm } from "@/components/AskForm";
import { QuestionCard } from "@/components/QuestionCard";
import { StatusBadge } from "@/components/StatusBadge";
import { getVisitorId, isStaff } from "@/lib/identity";
import { getMember } from "@/lib/members";
import { getSettings } from "@/lib/settings-store";
import { listQuestions, SORTS, type Sort } from "@/lib/queries";
import { isTag, TAGS, tagLabel } from "@/lib/tags";

const SORT_LABELS: Record<Sort, string> = {
  hot: "Hot",
  new: "Newest",
  unanswered: "Unanswered",
};

type Params = { sort?: string; tag?: string; q?: string; page?: string };

function href(current: Params, change: Partial<Params>): string {
  const next = { ...current, ...change };
  const search = new URLSearchParams();
  if (next.sort && next.sort !== "hot") search.set("sort", next.sort);
  if (next.tag) search.set("tag", next.tag);
  if (next.q) search.set("q", next.q);
  if (next.page && next.page !== "1") search.set("page", next.page);
  const s = search.toString();
  return s ? `/?${s}` : "/";
}

export default async function Home({ searchParams }: PageProps<"/">) {
  const raw = await searchParams;
  const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

  const sort: Sort = SORTS.find((s) => s === first(raw.sort)) ?? "hot";
  const tagParam = first(raw.tag);
  const tag = tagParam && isTag(tagParam) ? tagParam : undefined;
  const search = first(raw.q)?.trim().slice(0, 100) || undefined;
  const page = Math.max(1, Math.min(500, Number.parseInt(first(raw.page) ?? "1", 10) || 1));
  const current: Params = { sort, tag, q: search, page: String(page) };

  const [settings, staff, member] = await Promise.all([getSettings(), isStaff(), getMember()]);
  const { questions, hasMore } = await listQuestions({
    sort,
    tag,
    search,
    page,
    visitorId: await getVisitorId(),
    memberId: member?.id,
    admin: staff,
  });

  return (
    <div className="space-y-5">
      <AskForm
        readOnly={settings.readOnly}
        approvalRequired={settings.approvalRequired}
        uploadsPaused={settings.uploadsPaused}
      />

      <section aria-label="Questions" className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <nav className="flex rounded-full border border-line bg-card p-1 text-sm">
            {SORTS.map((s) => (
              <Link
                key={s}
                href={href(current, { sort: s, page: undefined })}
                aria-current={s === sort ? "page" : undefined}
                className={`rounded-full px-3 py-1.5 font-medium ${
                  s === sort ? "bg-brand text-on-brand" : "text-muted hover:text-fg"
                }`}
              >
                {SORT_LABELS[s]}
              </Link>
            ))}
          </nav>
          <form action="/" className="flex-1 sm:max-w-56">
            {sort !== "hot" && <input type="hidden" name="sort" value={sort} />}
            {tag && <input type="hidden" name="tag" value={tag} />}
            <input
              type="search"
              name="q"
              defaultValue={search}
              placeholder="Search questions"
              aria-label="Search questions"
              className="w-full rounded-full border border-line bg-card px-4 py-2 text-sm outline-none focus:border-brand"
            />
          </form>
        </div>

        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 text-sm [scrollbar-width:none]">
          <Link
            href={href(current, { tag: undefined, page: undefined })}
            className={`shrink-0 rounded-full border px-3 py-1 ${
              !tag ? "border-brand bg-brand/10 font-medium text-brand" : "border-line text-muted"
            }`}
          >
            All
          </Link>
          {TAGS.map((t) => (
            <Link
              key={t.id}
              href={href(current, { tag: t.id, page: undefined })}
              className={`shrink-0 rounded-full border px-3 py-1 whitespace-nowrap ${
                t.id === tag ? "border-brand bg-brand/10 font-medium text-brand" : "border-line text-muted hover:text-fg"
              }`}
            >
              {t.group === "course" ? t.label.split(" · ")[0] : t.label}
            </Link>
          ))}
        </div>

        {(tag || search) && (
          <p className="text-sm text-muted">
            Showing {tag && <strong className="text-fg">{tagLabel(tag)}</strong>}
            {tag && search && " matching "}
            {search && <strong className="text-fg">“{search}”</strong>}
            {" · "}
            <Link href={href(current, { tag: undefined, q: undefined, page: undefined })} className="underline">
              clear
            </Link>
          </p>
        )}

        {questions.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-line p-10 text-center text-muted">
            {page > 1
              ? "No more questions."
              : sort === "unanswered"
                ? "Every question has an answer. Nice work!"
                : "No questions here yet. Be the first to ask!"}
          </div>
        ) : (
          <div className="space-y-3">
            {questions.map((q) => (
              <div key={q.id} className="space-y-1">
                <StatusBadge status={q.status} reason={q.status_reason} />
                <QuestionCard q={q} />
              </div>
            ))}
          </div>
        )}

        {(page > 1 || hasMore) && (
          <nav className="flex justify-between pt-2 text-sm font-medium">
            {page > 1 ? (
              <Link href={href(current, { page: String(page - 1) })} className="text-link hover:underline">
                ← Previous
              </Link>
            ) : (
              <span />
            )}
            {hasMore && (
              <Link href={href(current, { page: String(page + 1) })} className="text-link hover:underline">
                Next page →
              </Link>
            )}
          </nav>
        )}
      </section>
    </div>
  );
}
