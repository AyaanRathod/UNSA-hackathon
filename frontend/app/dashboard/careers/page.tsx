"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { StatusBadge } from "@/components/StatusBadge";
import type { AnalyzeProfileResponse } from "@/lib/api/types";
import { appStorage } from "@/lib/storage";

export default function CareersPage() {
  const [analysis, setAnalysis] = useState<AnalyzeProfileResponse | null>(null);

  useEffect(() => {
    setAnalysis(appStorage.loadAnalysis());
  }, []);

  const strengthsAndGaps = useMemo(() => {
    if (!analysis) {
      return { strengths: [], gaps: [] };
    }

    const clusters = Object.entries(analysis.cluster_strengths);
    const sorted = [...clusters].sort((a, b) => b[1] - a[1]);
    return {
      strengths: sorted.filter(([, score]) => score >= 0.6).slice(0, 3),
      gaps: sorted.filter(([, score]) => score < 0.45).slice(0, 3),
    };
  }, [analysis]);

  if (!analysis) {
    return (
      <section className="empty-state">
        <h1>No career matches yet</h1>
        <p>Analyze your academic profile before opening career match results.</p>
        <Link href="/dashboard/profile" className="button button-primary">
          Build profile
        </Link>
      </section>
    );
  }

  return (
    <section className="stack">
      <h1>Career Match Results</h1>
      <div className="card">
        <h3>Strengths and gaps snapshot</h3>
        <p>
          <strong>Strengths:</strong>{" "}
          {strengthsAndGaps.strengths.length
            ? strengthsAndGaps.strengths.map(([name, score]) => `${name} (${(score * 100).toFixed(0)}%)`).join(", ")
            : "No strong clusters yet"}
        </p>
        <p>
          <strong>Gaps:</strong>{" "}
          {strengthsAndGaps.gaps.length
            ? strengthsAndGaps.gaps.map(([name, score]) => `${name} (${(score * 100).toFixed(0)}%)`).join(", ")
            : "No major gaps detected"}
        </p>
      </div>

      {analysis.career_matches.length === 0 ? (
        <p className="empty-state">No career matches returned from backend analysis.</p>
      ) : (
        <div className="stack">
          {analysis.career_matches.map((item) => (
            <article className="card" key={item.career_id}>
              <h3>{item.title}</h3>
              <p className="meta">{item.why}</p>
              <div className="hero-actions">
                <StatusBadge value={item.confidence_badge} />
                <span className="meta">Match score: {(item.score * 100).toFixed(1)}%</span>
              </div>
              <p>
                <strong>Suggested next steps:</strong>{" "}
                {item.recommended_courses.length ? item.recommended_courses.join(", ") : "Try strengthening low-confidence clusters first."}
              </p>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
