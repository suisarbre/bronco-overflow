import { TAGS } from "@/lib/tags";

const courses = TAGS.filter((t) => t.group === "course");
const general = TAGS.filter((t) => t.group === "general");

export function TagSelect({ defaultValue = "" }: { defaultValue?: string }) {
  return (
    <select
      name="tag"
      required
      defaultValue={defaultValue}
      aria-label="Tag"
      className="w-full rounded-lg border border-line bg-bg px-3 py-2.5 text-base outline-none focus:border-brand"
    >
      <option value="" disabled>
        Choose a tag…
      </option>
      <optgroup label="Classes">
        {courses.map((t) => (
          <option key={t.id} value={t.id}>
            {t.label}
          </option>
        ))}
      </optgroup>
      <optgroup label="General">
        {general.map((t) => (
          <option key={t.id} value={t.id}>
            {t.label}
          </option>
        ))}
      </optgroup>
    </select>
  );
}
