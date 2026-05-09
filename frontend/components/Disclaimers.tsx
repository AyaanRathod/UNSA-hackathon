export function Disclaimers({ compact = false }: { compact?: boolean }) {
  return (
    <aside className={compact ? "disclaimer-card compact" : "disclaimer-card"} aria-label="Important disclaimer">
      <p>
        Pathwise AI is decision support only and is not official Brock advising or a degree audit. Verify every
        recommendation with current advising guidance.
      </p>
      <p className="secondary">
        Dataset note: based on a frozen 2024-2025 Brock undergraduate calendar/COSC excerpt MVP snapshot.
      </p>
    </aside>
  );
}
