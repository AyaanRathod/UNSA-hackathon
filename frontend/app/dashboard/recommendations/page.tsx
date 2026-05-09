"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { StatusBadge } from "@/components/StatusBadge";
import type { AnalyzeProfileResponse } from "@/lib/api/types";
import { appStorage } from "@/lib/storage";

export default function RecommendationsPage() {
  const [analysis, setAnalysis] = useState<AnalyzeProfileResponse | null>(null);

  useEffect(() => {
    setAnalysis(appStorage.loadAnalysis());
  }, []);

  if (!analysis) {
    return (
      <section className="empty-state">
        <h1>No recommendations yet</h1>
        <p>Submit an academic profile first to generate next-course recommendations.</p>
        <Link href="/dashboard/profile" className="button button-primary">
          Enter Academic Profile
        </Link>
      </section>
    );
  }

  return (
    <section className="stack">
      <h1>Pathway Recommendations</h1>
      <p className="meta">{analysis.disclaimer}</p>

      {analysis.unknown_courses.length > 0 && (
        <p className="notice">Unknown or unmapped courses: {analysis.unknown_courses.join(", ")}. These may reduce confidence.</p>
      )}

      {analysis.recommendations.length === 0 ? (
        <p className="empty-state">No eligible next courses were found from the current profile.</p>
      ) : (
        <div className="stack">
          {analysis.recommendations.map((item) => (
            <article className="card" key={item.course_code}>
              <h3>
                {item.course_code}: {item.title}
              </h3>
              <p className="meta">{item.why}</p>
              <div className="hero-actions">
                <StatusBadge value={item.label} />
                <StatusBadge value={item.confidence_badge} />
                <span className="meta">Score: {(item.score * 100).toFixed(1)}%</span>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
