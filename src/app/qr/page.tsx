import type { Metadata } from "next";
import { headers } from "next/headers";
import QRCode from "qrcode";
import { PrintButton } from "./PrintButton";

export const metadata: Metadata = { title: "QR code", robots: { index: false } };

/** A printable poster with a QR code pointing at this site. */
export default async function QrPage() {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  // `||`, not `??`: a variable that's set but blank must fall back too.
  const url = process.env.NEXT_PUBLIC_SITE_URL?.trim().replace(/\/$/, "") || `${proto}://${host}`;

  const svg = await QRCode.toString(url, {
    type: "svg",
    margin: 1,
    errorCorrectionLevel: "M",
    color: { dark: "#1e4d2b", light: "#ffffff" },
  });

  return (
    <div className="mx-auto max-w-md space-y-5 rounded-2xl bg-white p-8 text-center text-[#16201a] print:border-0 print:shadow-none">
      <p className="text-sm font-semibold tracking-widest text-[#1e4d2b] uppercase">CS Tutoring · Cal Poly Pomona</p>
      <h1 className="text-3xl leading-tight font-bold">Bronco Overflow</h1>
      <p className="text-lg font-medium">Stuck on something? Ask here.</p>
      <div className="mx-auto w-64" dangerouslySetInnerHTML={{ __html: svg }} />
      <p className="text-sm text-[#5d6a61]">
        Scan to ask or answer CS questions — anonymous, no login.
        <br />
        <span className="font-mono">{url.replace(/^https?:\/\//, "")}</span>
      </p>
      <PrintButton />
    </div>
  );
}
