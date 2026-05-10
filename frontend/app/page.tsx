import Link from "next/link";

export default function HomePage() {
  return (
    <div className="container" style={{ padding: "4rem 1.5rem" }}>
      <header style={{ marginBottom: "2rem", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <Link href="/" className="brand" style={{ marginBottom: 0 }}>
          Pathwise AI
        </Link>
        <Link href="/dashboard" className="button button-secondary">
          Go to Dashboard
        </Link>
      </header>

      <section style={{ textAlign: "center", maxWidth: "800px", margin: "0 auto 6rem auto", padding: "4rem 0" }}>
        <h1 className="fade-in" style={{ fontSize: "clamp(2.5rem, 5vw, 4rem)", marginBottom: "1.5rem" }}>
          Navigate your degree with <span style={{ color: "var(--accent-primary)" }}>clarity</span>.
        </h1>
        <p className="fade-in" style={{ fontSize: "1.2rem", color: "var(--text-secondary)", marginBottom: "2.5rem", animationDelay: "0.1s" }}>
          Pathwise AI turns your past coursework into transparent next-course, career, and study guidance built specifically for Brock University students.
        </p>
        <div className="hero-actions fade-in" style={{ justifyContent: "center", animationDelay: "0.2s" }}>
          <Link href="/dashboard" className="button button-primary" style={{ fontSize: "1.1rem", padding: "1rem 2rem" }}>
            Start Planning
          </Link>
        </div>
      </section>

      <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "2rem", marginBottom: "4rem" }}>
        <div className="card">
          <h3 style={{ marginBottom: "1rem", color: "var(--accent-primary)" }}>Degree Audit & Recs</h3>
          <p className="meta">
            Upload your transcript to instantly see what requirements are missing, and get AI-ranked course recommendations based on prerequisite logic and confidence levels.
          </p>
        </div>
        <div className="card">
          <h3 style={{ marginBottom: "1rem", color: "var(--accent-primary)" }}>Career Match</h3>
          <p className="meta">
            Discover career paths that match your coursework clusters. Identify gaps in your academic profile and see which courses will strengthen your trajectory.
          </p>
        </div>
        <div className="card">
          <h3 style={{ marginBottom: "1rem", color: "var(--accent-primary)" }}>Active Study Space</h3>
          <p className="meta">
            Turn your syllabi and notes into active recall workouts. Use Feynman mode, Blurting, or Flashcards to study effectively, all grounded in your actual course materials.
          </p>
        </div>
      </section>

      <footer style={{ textAlign: "center", borderTop: "1px solid var(--card-border)", paddingTop: "2rem", marginTop: "4rem" }}>
        <p className="meta">
          Disclaimer: Pathwise AI is a student planning platform. Always verify final decisions with official academic advising.
        </p>
      </footer>
    </div>
  );
}
