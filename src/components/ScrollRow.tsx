"use client";

import { useEffect, useRef, type ReactNode } from "react";

/**
 * A horizontally scrolling row that a mouse wheel can scroll too. Touch and
 * trackpads already scroll sideways; a plain wheel only goes up and down, so
 * vertical wheel movement is turned sideways — until the row reaches its end,
 * at which point the page scrolls as usual.
 */
export function ScrollRow({ children, className = "" }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const row = ref.current;
    if (!row) return;
    function onWheel(e: WheelEvent) {
      if (!row || e.deltaY === 0 || Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
      const atStart = row.scrollLeft <= 0;
      const atEnd = row.scrollLeft + row.clientWidth >= row.scrollWidth - 1;
      if ((e.deltaY < 0 && atStart) || (e.deltaY > 0 && atEnd)) return;
      e.preventDefault();
      row.scrollLeft += e.deltaY;
    }
    // Non-passive so preventDefault can stop the page from scrolling too.
    row.addEventListener("wheel", onWheel, { passive: false });
    return () => row.removeEventListener("wheel", onWheel);
  }, []);

  return (
    <div
      ref={ref}
      className={`overflow-x-auto [scrollbar-color:var(--line)_transparent] [scrollbar-width:thin] ${className}`}
    >
      {children}
    </div>
  );
}
