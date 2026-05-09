import type { ConfidenceBadge, RecommendationLabel } from "@/lib/api/types";

type BadgeValue = ConfidenceBadge | RecommendationLabel | "processing" | "ready" | "queued" | "local_only" | "error";

const classByValue: Record<BadgeValue, string> = {
  high: "badge success",
  medium: "badge warning",
  low: "badge muted",
  safe: "badge success",
  stretch: "badge warning",
  risky: "badge danger",
  processing: "badge warning",
  ready: "badge success",
  queued: "badge muted",
  local_only: "badge muted",
  error: "badge danger",
};

export function StatusBadge({ value }: { value: BadgeValue }) {
  return <span className={classByValue[value]}>{value.replace("_", " ")}</span>;
}
