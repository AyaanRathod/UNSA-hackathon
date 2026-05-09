import Link from "next/link";

const modules = [
  {
    href: "/dashboard/profile",
    title: "Enter Academic Profile",
    description: "Add completed courses, grades, confidence, and enjoyment signals.",
  },
  {
    href: "/dashboard/upload",
    title: "Upload Course Materials",
    description: "Upload syllabus, notes, or transcript PDFs and track processing status.",
  },
  {
    href: "/dashboard/recommendations",
    title: "View Pathway Recommendations",
    description: "See next courses with transparent rationale, confidence, and risk labels.",
  },
  {
    href: "/dashboard/careers",
    title: "View Career Match Results",
    description: "Explore cluster-driven career fit, gaps, and suggested next steps.",
  },
  {
    href: "/dashboard/study",
    title: "Open Study Workspace",
    description: "Browse document snippets, generate artifacts, and ask grounded Q&A.",
  },
  {
    href: "/dashboard/french-demo",
    title: "French Demo",
    description: "Show French-origin snippet linkage to English study output.",
  },
];

export default function DashboardHomePage() {
  return (
    <section className="stack">
      <div className="hero">
        <h1>Pathwise Command Center</h1>
        <p className="meta">
          Build your profile once, then move between planning, career fit, and grounded study support in one workspace.
        </p>
        <div className="hero-actions">
          <Link className="button button-primary" href="/dashboard/profile">
            Start with profile
          </Link>
          <Link className="button button-secondary" href="/dashboard/study">
            Open study workspace
          </Link>
        </div>
      </div>
      <div className="module-grid">
        {modules.map((module) => (
          <article key={module.href} className="card">
            <h3>{module.title}</h3>
            <p className="meta">{module.description}</p>
            <Link className="button button-secondary" href={module.href}>
              Open
            </Link>
          </article>
        ))}
      </div>
    </section>
  );
}
