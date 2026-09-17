/** Reasons offered on the Report button, and accepted by the report action. */
export const REPORT_REASONS = ["spam", "offensive", "wrong place", "other"] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];
