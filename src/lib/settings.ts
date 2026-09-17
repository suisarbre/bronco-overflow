// Definitions shared by the server and the admin UI (no database access here).
// Every setting has a default (edited on /admin) and an optional temporary
// override that expires on its own, or stays until an admin clears it.

export const FILTER_MODES = ["off", "censor", "review", "block"] as const;
export type FilterMode = (typeof FILTER_MODES)[number];

export type Settings = {
  readOnly: boolean;
  approvalRequired: boolean;
  uploadsPaused: boolean;
  filterMode: FilterMode;
  reportThreshold: number;
  notifyAllPosts: boolean;
  adminPasswordDays: number;
};
export type SettingKey = keyof Settings;

type Definition<K extends SettingKey> = {
  label: string;
  help: string;
  fallback: Settings[K];
  parse: (value: unknown) => Settings[K] | undefined;
};

const bool = (value: unknown) => (typeof value === "boolean" ? value : undefined);

export const SETTINGS: { [K in SettingKey]: Definition<K> } = {
  readOnly: {
    label: "Read-only mode",
    help: "Nobody can post, answer, edit, or vote. Deleting still works.",
    fallback: false,
    parse: bool,
  },
  approvalRequired: {
    label: "Hold new posts for approval",
    help: "New questions and answers stay hidden until a tutor approves them.",
    fallback: false,
    parse: bool,
  },
  uploadsPaused: {
    label: "Pause photo uploads",
    help: "People can still post text.",
    fallback: false,
    parse: bool,
  },
  filterMode: {
    label: "Profanity filter",
    help: "What happens when a post contains a blocked word.",
    fallback: "censor",
    parse: (v) => (FILTER_MODES as readonly unknown[]).includes(v) ? (v as FilterMode) : undefined,
  },
  reportThreshold: {
    label: "Reports before auto-hide",
    help: "A post is hidden for review after this many different people report it.",
    fallback: 3,
    parse: (v) => (Number.isInteger(v) && (v as number) >= 1 && (v as number) <= 50 ? (v as number) : undefined),
  },
  notifyAllPosts: {
    label: "Discord alert for every new post",
    help: "Reports, auto-hides, and posts waiting for review are always sent.",
    fallback: true,
    parse: bool,
  },
  adminPasswordDays: {
    label: "New tutor password every … days",
    help: "The server picks a new password and posts it to Discord. 0 turns rotation off. Needs a Discord webhook.",
    fallback: 7,
    parse: (v) => (Number.isInteger(v) && (v as number) >= 0 && (v as number) <= 90 ? (v as number) : undefined),
  },
};

export const SETTING_KEYS = Object.keys(SETTINGS) as SettingKey[];

export const FILTER_MODE_LABELS: Record<FilterMode, string> = {
  off: "Off",
  censor: "Censor the words (f***) and publish",
  review: "Hold the post for review",
  block: "Reject the post",
};

export function isSettingKey(key: string): key is SettingKey {
  return Object.hasOwn(SETTINGS, key);
}

export function parseSetting<K extends SettingKey>(key: K, value: unknown): Settings[K] | undefined {
  return SETTINGS[key].parse(value);
}

/** Durations offered for temporary overrides; null means "until I turn it off". */
export const OVERRIDE_DURATIONS: { label: string; hours: number | null }[] = [
  { label: "1 hour", hours: 1 },
  { label: "2 hours", hours: 2 },
  { label: "6 hours", hours: 6 },
  { label: "12 hours", hours: 12 },
  { label: "24 hours", hours: 24 },
  { label: "Until I turn it off", hours: null },
];

export type SettingState<K extends SettingKey = SettingKey> = {
  key: K;
  value: Settings[K];
  defaultValue: Settings[K];
  /** Present while a temporary override is active. `until: null` means until cleared. */
  override: { value: Settings[K]; until: Date | null } | null;
};
