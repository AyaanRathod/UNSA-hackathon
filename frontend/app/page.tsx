import Link from "next/link";

export default function HomePage() {
  return (
    <div className="container home-landing">
      <section className="hero landing-hero">
        <div className="landing-hero-main">
          <h1>Pathwise AI turns your past coursework into transparent next-course, career, and study guidance.</h1>
          <p className="meta landing-lede">
            Build your profile, upload learning material, and review confidence-tagged recommendations with explicit
            rationale and source grounding.
          </p>
          <div className="hero-actions landing-actions">
            <Link href="/dashboard" className="button button-primary">
              Open Dashboard
            </Link>
            <Link href="/dashboard/french-demo" className="button button-secondary">
              View French Demo
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
