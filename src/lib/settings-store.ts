import "server-only";
import { after } from "next/server";
import { cache } from "react";
import { rotateAdminPasswordIfDue } from "./admin-password";
import { db } from "./db";
import {
  SETTINGS,
  SETTING_KEYS,
  parseSetting,
  type SettingKey,
  type SettingState,
  type Settings,
} from "./settings";

type Row = { key: string; default_value: string | null; override_value: string | null; override_until: Date | null };

function decode(key: SettingKey, raw: string | null) {
  if (raw === null) return undefined;
  try {
    return parseSetting(key, JSON.parse(raw));
  } catch {
    return undefined;
  }
}

// cache(): the layout and the page both ask for settings on the same request.
export const getSettingStates = cache(async function getSettingStates(): Promise<{
  [K in SettingKey]: SettingState<K>;
}> {
  const sql = await db();
  const rows = await sql<Row[]>`SELECT key, default_value, override_value, override_until FROM settings`;
  const byKey = new Map(rows.map((r) => [r.key, r]));
  const now = Date.now();

  const result = {} as { [K in SettingKey]: SettingState<K> };
  for (const key of SETTING_KEYS) {
    const row = byKey.get(key);
    const defaultValue = decode(key, row?.default_value ?? null) ?? SETTINGS[key].fallback;
    const overrideValue = decode(key, row?.override_value ?? null);
    const active =
      overrideValue !== undefined && (!row?.override_until || row.override_until.getTime() > now);
    (result as Record<SettingKey, SettingState>)[key] = {
      key,
      defaultValue,
      value: active ? overrideValue : defaultValue,
      override: active ? { value: overrideValue, until: row?.override_until ?? null } : null,
    };
  }
  return result;
});

export const getSettings = cache(async function getSettings(): Promise<Settings> {
  const states = await getSettingStates();
  const settings = Object.fromEntries(SETTING_KEYS.map((k) => [k, states[k].value])) as Settings;
  // Pages render first; the password check (and any rotation) happens afterwards.
  after(rotateAdminPasswordIfDue(settings.adminPasswordDays));
  return settings;
});

export async function setDefault<K extends SettingKey>(key: K, value: Settings[K]): Promise<void> {
  const sql = await db();
  await sql`
    INSERT INTO settings (key, default_value) VALUES (${key}, ${JSON.stringify(value)})
    ON CONFLICT (key) DO UPDATE SET default_value = EXCLUDED.default_value
  `;
}

/** `hours: null` keeps the override until it's cleared by hand. */
export async function setOverride<K extends SettingKey>(key: K, value: Settings[K], hours: number | null): Promise<void> {
  const sql = await db();
  const until = hours === null ? null : new Date(Date.now() + hours * 3600_000);
  await sql`
    INSERT INTO settings (key, override_value, override_until)
    VALUES (${key}, ${JSON.stringify(value)}, ${until})
    ON CONFLICT (key) DO UPDATE
    SET override_value = EXCLUDED.override_value, override_until = EXCLUDED.override_until
  `;
}

export async function clearOverride(key: SettingKey): Promise<void> {
  const sql = await db();
  await sql`UPDATE settings SET override_value = NULL, override_until = NULL WHERE key = ${key}`;
}

export async function clearAllOverrides(): Promise<void> {
  const sql = await db();
  await sql`UPDATE settings SET override_value = NULL, override_until = NULL`;
}
