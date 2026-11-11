import React from "react";
import { ScanStatus, ScanStatusTone, STATUS_PRESENTATION } from "../lib/scanStatus";
import queuedMarker from "../assets/figma/status-queued.svg";
import runningMarker from "../assets/figma/status-running.svg";
import completedMarker from "../assets/figma/status-completed.svg";
import failedMarker from "../assets/figma/status-failed.svg";
import neutralMarker from "../assets/figma/status-neutral.svg";

/** Cada tom tem cor própria para que os estados sejam visualmente distinguíveis. */
const toneStyles: Record<ScanStatusTone, string> = {
  neutral: "scan-status--neutral",
  pending: "scan-status--pending",
  progress: "scan-status--progress",
  success: "scan-status--success",
  danger: "scan-status--danger",
};

const statusMarkers: Record<ScanStatus, string> = {
  PENDING_VERIFICATION: queuedMarker,
  QUEUED: queuedMarker,
  RUNNING: runningMarker,
  COMPLETED: completedMarker,
  FAILED: failedMarker,
  CANCELLED: neutralMarker,
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
      className={"scan-status " + toneStyles[tone]}
    >
      <img src={statusMarkers[status]} alt="" aria-hidden="true" className={pulsing ? "is-pulsing" : ""} />
      {label}
    </span>
  );
}
