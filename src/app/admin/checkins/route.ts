import { campusDayOffset, checkinsBetween, checkinsCsv } from "@/lib/checkins";
import { isStaff } from "@/lib/identity";

const DATE = /^\d{4}-\d{2}-\d{2}$/;

function day(value: string | null, fallback: string): string {
  return value && DATE.test(value) && !Number.isNaN(Date.parse(value)) ? value : fallback;
}

/** GET /admin/checkins?from=YYYY-MM-DD&to=YYYY-MM-DD → CSV download, tutors and admins only. */
export async function GET(request: Request) {
  if (!(await isStaff())) return new Response("Sign in at /login first.", { status: 403 });

  const params = new URL(request.url).searchParams;
  let from = day(params.get("from"), campusDayOffset(-29));
  let to = day(params.get("to"), campusDayOffset(0));
  if (from > to) [from, to] = [to, from];

  const csv = checkinsCsv(await checkinsBetween(from, to));
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="checkins_${from}_to_${to}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
