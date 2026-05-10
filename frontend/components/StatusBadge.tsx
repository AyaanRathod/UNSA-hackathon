import React from "react";

export function StatusBadge({ value }: { value?: string }) {
  if (!value) return null;

  const normalized = value.toLowerCase();
  let colorClass = "muted";

  if (["safe", "high", "ready", "success", "completed"].includes(normalized)) {
    colorClass = "success";
  } else if (["stretch", "medium", "processing", "warning", "queued"].includes(normalized)) {
    colorClass = "warning";
  } else if (["risky", "low", "error", "danger", "local_only"].includes(normalized)) {
    colorClass = "danger";
  }

  return <span className={`badge ${colorClass}`}>{value.replace(/_/g, " ")}</span>;
}
