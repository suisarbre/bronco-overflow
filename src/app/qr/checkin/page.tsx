import type { Metadata } from "next";
import { Poster } from "../Poster";

export const metadata: Metadata = { title: "Check-in QR code", robots: { index: false } };

/** The sign for the tutoring desk. */
export default function CheckinQrPage() {
  return (
    <Poster
      path="/checkin"
      headline="Here for tutoring?"
      tagline="Scan to check in — takes 10 seconds."
      footnote="Anonymous, no name or login. Helps us know when tutoring is busy."
    />
  );
}
