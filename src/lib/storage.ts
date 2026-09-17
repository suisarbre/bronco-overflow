import "server-only";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { del, put } from "@vercel/blob";

// The browser resizes photos to ~1600px WebP first, which is normally well under 1 MB.
export const MAX_IMAGE_BYTES = 2 * 1024 * 1024;

const EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};

/** Detects the real image type from the file's first bytes; the browser-supplied type can't be trusted. */
function sniff(head: Uint8Array): string | null {
  const ascii = (from: number, to: number) => String.fromCharCode(...head.subarray(from, to));
  if (head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) return "image/jpeg";
  if (head[0] === 0x89 && ascii(1, 4) === "PNG") return "image/png";
  if (ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return "image/webp";
  if (ascii(0, 6) === "GIF87a" || ascii(0, 6) === "GIF89a") return "image/gif";
  return null;
}

/** Returns an error message if the upload isn't acceptable, otherwise null. */
export async function checkImage(file: File): Promise<string | null> {
  if (file.size > MAX_IMAGE_BYTES) return "Image is too large (max 2 MB).";
  const type = sniff(new Uint8Array(await file.slice(0, 12).arrayBuffer()));
  if (!type || type !== file.type) return "Images must be JPG, PNG, WebP, or GIF.";
  return null;
}

/**
 * Stores an image and returns its public URL. Uses Vercel Blob when
 * BLOB_READ_WRITE_TOKEN is set; during local development without a token,
 * falls back to public/uploads so the app can be tried offline.
 */
export async function saveImage(file: File): Promise<string> {
  const name = `${randomUUID()}.${EXTENSIONS[file.type]}`;

  if (process.env.BLOB_READ_WRITE_TOKEN) {
    const blob = await put(`uploads/${name}`, file, {
      access: "public",
      contentType: file.type,
    });
    return blob.url;
  }

  if (process.env.NODE_ENV === "production") {
    throw new Error("BLOB_READ_WRITE_TOKEN is not set. Connect Vercel Blob storage.");
  }
  const dir = path.join(process.cwd(), "public", "uploads");
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, name), Buffer.from(await file.arrayBuffer()));
  return `/uploads/${name}`;
}

/** Best-effort removal of stored images; failures are ignored. */
export async function deleteImages(urls: (string | null)[]): Promise<void> {
  const remote = urls.filter((u): u is string => !!u && u.startsWith("https://"));
  if (remote.length && process.env.BLOB_READ_WRITE_TOKEN) {
    await del(remote).catch(() => {});
  }
}
