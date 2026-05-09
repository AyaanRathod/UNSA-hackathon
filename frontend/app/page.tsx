import Link from "next/link";
import { Disclaimers } from "@/components/Disclaimers";

export default function HomePage() {
  return (
    <main className="container">
      <section className="hero">
        <h1>Pathwise AI turns your past coursework into transparent next-course, career, and study guidance.</h1>
        <p className="meta">
          Build your profile, upload learning material, and review confidence-tagged recommendations with explicit
          rationale and source grounding.
        </p>
        <div className="hero-actions">
          <Link href="/dashboard" className="button button-primary">
            Open Dashboard
          </Link>
          <Link href="/dashboard/french-demo" className="button button-secondary">
            View French Demo
          </Link>
        </div>
        <Disclaimers />
      </section>
    </main>
  );
}
