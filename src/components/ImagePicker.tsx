"use client";

import { useEffect, useMemo, useRef, useState } from "react";

const MAX_SIDE = 1600;
const MAX_BYTES = 3 * 1024 * 1024;

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number) {
  return new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality));
}

/** Downscales photos in the browser so uploads are small and free storage lasts. */
async function shrink(file: File): Promise<File> {
  // Resizing would drop GIF animation, so GIFs go up as-is.
  if (file.type === "image/gif") return file;

  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();

  // Some browsers can't encode WebP and silently return PNG; fall back to JPEG then.
  let blob = await canvasToBlob(canvas, "image/webp", 0.82);
  if (!blob || blob.type !== "image/webp") blob = await canvasToBlob(canvas, "image/jpeg", 0.85);
  if (!blob) return file;
  if (blob.size >= file.size && file.size <= MAX_BYTES) return file;

  const ext = blob.type === "image/webp" ? "webp" : "jpg";
  return new File([blob], `photo.${ext}`, { type: blob.type });
}

export function ImagePicker({
  file,
  onChange,
  disabled,
}: {
  file: File | null;
  onChange: (file: File | null) => void;
  disabled?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Not revoked: it's one small blob per picked photo, and revoking in an effect
  // cleanup breaks the preview under StrictMode's double-mount.
  const preview = useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);

  // Clear the native input when the parent resets the form.
  useEffect(() => {
    if (!file && inputRef.current) inputRef.current.value = "";
  }, [file]);

  async function pick(picked: File | undefined) {
    setError(null);
    if (!picked) return;
    if (!picked.type.startsWith("image/")) {
      setError("That file isn't an image.");
      return;
    }
    setBusy(true);
    try {
      const small = await shrink(picked);
      if (small.size > MAX_BYTES) {
        setError("That image is too large (max 3 MB).");
        onChange(null);
      } else {
        onChange(small);
      }
    } catch {
      setError("Couldn't read that image. Try a JPG or PNG.");
      onChange(null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="sr-only"
        tabIndex={-1}
        disabled={disabled || busy}
        onChange={(e) => pick(e.target.files?.[0])}
      />
      {preview ? (
        <div className="relative">
          {/* eslint-disable-next-line @next/next/no-img-element -- local blob preview */}
          <img src={preview} alt="Selected attachment" className="h-16 w-16 rounded-lg border border-line object-cover" />
          <button
            type="button"
            onClick={() => onChange(null)}
            disabled={disabled}
            aria-label="Remove image"
            className="absolute -top-2 -right-2 grid h-6 w-6 place-items-center rounded-full bg-fg text-xs text-bg shadow"
          >
            ✕
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={disabled || busy}
          className="inline-flex items-center gap-1.5 rounded-lg border border-line px-3 py-2 text-sm text-muted hover:bg-subtle disabled:opacity-50"
        >
          <svg aria-hidden viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.6">
            <rect x="2.5" y="4" width="15" height="12" rx="2" />
            <circle cx="7" cy="8.5" r="1.5" />
            <path d="m3 14 4.5-4 3.5 3 2.5-2 3.5 3" />
          </svg>
          {busy ? "Preparing…" : "Add photo"}
        </button>
      )}
      {error && <p className="text-sm text-danger">{error}</p>}
    </div>
  );
}
