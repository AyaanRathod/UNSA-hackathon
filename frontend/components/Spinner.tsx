export function Spinner({ size = "sm" }: { size?: "sm" | "md" }) {
  return <span className={`spinner spinner--${size}`} aria-hidden="true" />;
}
