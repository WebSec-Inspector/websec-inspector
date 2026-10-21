import React from "react";
import { ScanStatus, ScanStatusTone, STATUS_PRESENTATION } from "../lib/scanStatus";

/** Cada tom tem cor própria para que os estados sejam visualmente distinguíveis. */
const toneStyles: Record<ScanStatusTone, string> = {
  pending: "bg-risk-medium/20 text-risk-medium border-risk-medium/40",
  progress: "bg-accent/20 text-accent border-accent/40",
  success: "bg-risk-low/20 text-risk-low border-risk-low/40",
  danger: "bg-risk-critical/20 text-risk-critical border-risk-critical/40",
};

export default function ScanStatusBadge({
  status,
  pulsing = false,
}: {
  status: ScanStatus;
  pulsing?: boolean;
}) {
  const { label, tone } = STATUS_PRESENTATION[status];
  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium ${toneStyles[tone]}`}
    >
      <span
        aria-hidden="true"
        className={`h-1.5 w-1.5 rounded-full bg-current ${pulsing ? "animate-pulse" : ""}`}
      />
      {label}
    </span>
  );
}
