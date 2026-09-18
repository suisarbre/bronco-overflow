"use client";

import { useActionState, useState, useTransition } from "react";
import { addMember, newMemberCode, saveMember, toggleMember, type AdminState } from "./actions";
import { MemberBadge } from "@/components/MemberBadge";
import { BADGE_COLORS, type Member } from "@/lib/member-types";

const field = "rounded-lg border border-line bg-bg px-3 py-1.5 text-sm outline-none focus:border-brand";
const primary = "rounded-lg bg-brand px-3 py-1.5 text-sm font-semibold text-on-brand hover:bg-brand-strong disabled:opacity-60";
const ghost = "rounded-lg border border-line px-3 py-1.5 text-sm font-medium hover:bg-subtle disabled:opacity-60";

function ColorSelect({ defaultValue }: { defaultValue?: string }) {
  return (
    <select name="color" defaultValue={defaultValue ?? "green"} aria-label="Badge color" className={field}>
      {BADGE_COLORS.map((c) => (
        <option key={c} value={c}>
          {c}
        </option>
      ))}
    </select>
  );
}

/** Codes are shown once, right after they're generated. */
function CodeNotice({ code }: { code: string }) {
  return (
    <p className="rounded-lg bg-subtle px-3 py-2 text-sm">
      Give them this code — it won&apos;t be shown again:{" "}
      <strong className="font-mono text-base tracking-widest">{code}</strong>
    </p>
  );
}

function MemberRow({ member }: { member: Member }) {
  const [saved, save, saving] = useActionState<AdminState, FormData>(saveMember, {});
  const [newCode, regenerate, regenerating] = useActionState<AdminState, FormData>(newMemberCode, {});
  const [pending, start] = useTransition();

  return (
    <li className={`space-y-3 rounded-xl border border-line p-3 ${member.active ? "" : "opacity-60"}`}>
      <div className="flex flex-wrap items-center gap-2">
        <MemberBadge title={member.title} color={member.color} />
        {!member.active && <span className="text-xs font-medium text-danger">deactivated</span>}
        <span className="text-xs text-muted">code #{member.code_version}</span>
      </div>

      <form action={save} className="flex flex-wrap items-center gap-2">
        <input type="hidden" name="id" value={member.id} />
        <input name="title" defaultValue={member.title} maxLength={24} aria-label="Badge text" className={`${field} w-36`} />
        <ColorSelect defaultValue={member.color} />
        <input
          name="note"
          defaultValue={member.note}
          maxLength={120}
          placeholder="note for tutors (who is this?)"
          aria-label="Note"
          className={`${field} min-w-48 flex-1`}
        />
        <label className="flex items-center gap-1.5 text-sm">
          <input type="checkbox" name="relaxed_limits" defaultChecked={member.relaxed_limits} /> higher limits
        </label>
        <label className="flex items-center gap-1.5 text-sm">
          <input type="checkbox" name="skip_review" defaultChecked={member.skip_review} /> skip review
        </label>
        <button className={ghost} disabled={saving}>
          Save
        </button>
        {saved.ok && <span className="text-sm text-brand">{saved.ok}</span>}
        {saved.error && <span className="text-sm text-danger">{saved.error}</span>}
      </form>

      <div className="flex flex-wrap items-center gap-3">
        <form action={regenerate}>
          <input type="hidden" name="id" value={member.id} />
          <button className={ghost} disabled={regenerating}>
            New code
          </button>
        </form>
        <button
          type="button"
          disabled={pending}
          className="text-sm text-muted underline-offset-2 hover:text-danger hover:underline"
          onClick={() => start(() => toggleMember(member.id, !member.active))}
        >
          {member.active ? "Deactivate" : "Reactivate"}
        </button>
      </div>
      {newCode.ok && <CodeNotice code={newCode.ok} />}
      {newCode.error && <p className="text-sm text-danger">{newCode.error}</p>}
    </li>
  );
}

export function Members({ members }: { members: Member[] }) {
  const [created, create, creating] = useActionState<AdminState, FormData>(addMember, {});
  const [open, setOpen] = useState(false);

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">
        A badge holder signs in with their code at <code className="rounded bg-code px-1">/login</code>. The badge
        shows on everything they post while signed in, and their code also lets them edit those posts from another
        device. Handing out a new code keeps their badge and posts, and signs out whoever had the old one.
      </p>

      {members.length > 0 && (
        <ul className="space-y-3">
          {members.map((m) => (
            <MemberRow key={m.id} member={m} />
          ))}
        </ul>
      )}

      {open ? (
        <form action={create} className="flex flex-wrap items-end gap-2 rounded-xl border border-dashed border-line p-3">
          <input name="title" required maxLength={24} placeholder="Teacher" aria-label="Badge text" className={`${field} w-36`} />
          <ColorSelect />
          <input name="note" maxLength={120} placeholder="note for tutors (who is this?)" aria-label="Note" className={`${field} min-w-48 flex-1`} />
          <button className={primary} disabled={creating}>
            Create
          </button>
          <button type="button" className={ghost} onClick={() => setOpen(false)}>
            Cancel
          </button>
        </form>
      ) : (
        <button type="button" className={ghost} onClick={() => setOpen(true)}>
          Add a badge holder
        </button>
      )}
      {created.ok && <CodeNotice code={created.ok} />}
      {created.error && <p className="text-sm text-danger">{created.error}</p>}
    </div>
  );
}
