import type { Metadata } from "next";
import Link from "next/link";
import { Poster } from "./Poster";

export const metadata: Metadata = { title: "QR code", robots: { index: false } };

export default function QrPage() {
  return (
    <div className="space-y-4">
      <Poster
        path=""
        headline="Bronco Overflow"
        tagline="Stuck on something? Ask here."
        footnote="Scan to ask or answer CS questions — anonymous, no login."
      />
      <p className="text-center text-sm text-muted print:hidden">
        Need the desk sign too?{" "}
        <Link href="/qr/checkin" className="text-link underline">
          Check-in QR code
        </Link>
      </p>
    </div>
  );
}
