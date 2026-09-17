"use client";

import { useActionState, useTransition } from "react";
import {
  applyOverride,
  revertAllOverrides,
  revertOverride,
  saveDefault,
  stopEverything,
  type AdminState,
} from "./actions";
import { FILTER_MODES, FILTER_MODE_LABELS, OVERRIDE_DURATIONS, type SettingState } from "@/lib/settings";

const select = "rounded-lg border border-line bg-bg px-2 py-1.5 text-sm outline-none focus:border-brand";
const button = "rounded-lg bg-brand px-3 py-1.5 text-sm font-semibold text-on-brand hover:bg-brand-strong disabled:opacity-60";
const ghost = "rounded-lg border border-line px-3 py-1.5 text-sm font-medium hover:bg-subtle disabled:opacity-60";

/** Renders the right input for a setting's type, as a JSON string in a `value` field. */
function ValueInput({ state }: { state: SettingState }) {
  if (state.key === "filterMode") {
    return (
      <select name="value" defaultValue={JSON.stringify(state.value)} className={select} aria-label="Value">
        {FILTER_MODES.map((mode) => (
          <option key={mode} value={JSON.stringify(mode)}>
            {FILTER_MODE_LABELS[mode]}
          </option>
        ))}
      </select>
    );
  }
  if (typeof state.value === "number") {
    return (
      <input
        name="value"
        type="number"
        min={1}
        max={50}
        defaultValue={String(state.value)}
        aria-label="Value"
        className={`${select} w-20`}
      />
    );
  }
  return (
    <select name="value" defaultValue={JSON.stringify(state.value)} className={select} aria-label="Value">
      <option value="true">On</option>
      <option value="false">Off</option>
    </select>
  );
}

export function DefaultForm({ state }: { state: SettingState }) {
  const [result, action, pending] = useActionState<AdminState, FormData>(saveDefault, {});
  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="key" value={state.key} />
      <ValueInput state={{ ...state, value: state.defaultValue } as SettingState} />
      <button className={ghost} disabled={pending}>
        Save default
      </button>
      {result.error && <span className="text-sm text-danger">{result.error}</span>}
      {result.ok && <span className="text-sm text-brand">{result.ok}</span>}
    </form>
  );
}

export function OverrideForm({ state }: { state: SettingState }) {
  const [result, action, pending] = useActionState<AdminState, FormData>(applyOverride, {});
  const [reverting, startRevert] = useTransition();
  return (
    <div className="flex flex-wrap items-center gap-2">
      <form action={action} className="flex flex-wrap items-center gap-2">
        <input type="hidden" name="key" value={state.key} />
        <ValueInput state={state} />
        <select name="hours" defaultValue="2" className={select} aria-label="For how long">
          {OVERRIDE_DURATIONS.map((d) => (
            <option key={d.label} value={d.hours === null ? "forever" : String(d.hours)}>
              {d.label}
            </option>
          ))}
        </select>
        <button className={button} disabled={pending}>
          Apply
        </button>
      </form>
      {state.override && (
        <button
          type="button"
          className={ghost}
          disabled={reverting}
          onClick={() => startRevert(() => revertOverride(state.key))}
        >
          Back to default
        </button>
      )}
      {result.error && <span className="text-sm text-danger">{result.error}</span>}
    </div>
  );
}

export function EmergencyButtons({ overridesActive }: { overridesActive: number }) {
  const [pending, start] = useTransition();
  return (
    <div className="flex flex-wrap items-center gap-3">
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          if (confirm("Switch the whole board to read-only until you turn it back on?")) {
            start(() => stopEverything());
          }
        }}
        className="rounded-lg bg-danger px-5 py-3 text-base font-bold text-white shadow hover:opacity-90 disabled:opacity-60"
      >
        STOP EVERYTHING
      </button>
      <button
        type="button"
        disabled={pending || overridesActive === 0}
        onClick={() => start(() => revertAllOverrides())}
        className={ghost}
      >
        Clear all temporary changes{overridesActive ? ` (${overridesActive})` : ""}
      </button>
    </div>
  );
}

export function KeyedAction({
  label,
  confirmText,
  danger,
  action,
}: {
  label: string;
  confirmText?: string;
  danger?: boolean;
  action: () => Promise<void>;
}) {
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        if (confirmText && !confirm(confirmText)) return;
        start(() => action());
      }}
      className={`text-sm underline-offset-2 hover:underline disabled:opacity-50 ${
        danger ? "text-danger" : "text-link"
      }`}
    >
      {pending ? "Working…" : label}
    </button>
  );
}
