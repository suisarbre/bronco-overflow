"use client";

import { useEffect, useState } from "react";

const KEY = "qa-nickname";

/** Optional display name, remembered on this device so people don't retype it. */
export function NicknameInput() {
  const [value, setValue] = useState("");

  useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage is only readable after mount
      setValue(localStorage.getItem(KEY) ?? "");
    } catch {}
  }, []);

  return (
    <input
      name="author"
      maxLength={30}
      value={value}
      onChange={(e) => {
        setValue(e.target.value);
        try {
          localStorage.setItem(KEY, e.target.value);
        } catch {}
      }}
      placeholder="Nickname (optional)"
      aria-label="Nickname (optional)"
      className="w-full rounded-lg border border-line bg-bg px-3 py-2.5 text-base outline-none focus:border-brand"
    />
  );
}
