import "server-only";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { del, put } from "@vercel/blob";

export const MAX_IMAGE_BYTES = 3 * 1024 * 1024;

const EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};

/** Returns an error message if the upload isn't acceptable, otherwise null. */
export function checkImage(file: File): string | null {
  if (!EXTENSIONS[file.type]) return "Images must be JPG, PNG, WebP, or GIF.";
  if (file.size > MAX_IMAGE_BYTES) return "Image is too large (max 3 MB).";
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
