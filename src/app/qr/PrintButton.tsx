"use client";

export function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="rounded-lg bg-[#1e4d2b] px-4 py-2 text-sm font-semibold text-white print:hidden"
    >
      Print
    </button>
  );
}
