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
    if (!analysis) return { strengths: [], gaps: [] };
    const clusters = Object.entries(analysis.cluster_strengths);
    const sorted = [...clusters].sort((a, b) => b[1] - a[1]);
    return {
      strengths: sorted.filter(([, score]) => score >= 0.6).slice(0, 3),
      gaps: sorted.filter(([, score]) => score < 0.45).slice(0, 3),
    };
  }, [analysis]);

  if (!analysis) {
    return (
      <section className="empty-state fade-in">
        <div style={{ fontSize: "3rem", marginBottom: "1rem" }}>🎯</div>
        <h2>No Career Matches Yet</h2>
        <p style={{ maxWidth: "400px", margin: "1rem auto 2rem" }}>
          Analyze your academic profile first to see which career paths align with your coursework.
        </p>
        <Link href="/dashboard/profile" className="button button-primary">
          Build Profile
        </Link>
      </section>
    );
  }

  return (
    <section className="stack fade-in">
      <header style={{ marginBottom: "1rem" }}>
        <h1>Career Trajectories</h1>
        <p className="meta">AI-driven matching based on your coursework clusters and grades.</p>
      </header>

      <div className="card" style={{ marginBottom: "2rem" }}>
        <h3 style={{ marginBottom: "1.5rem" }}>Coursework Alignment Profile</h3>
        <p className="meta" style={{ marginBottom: "1.5rem" }}>
          We map your completed courses into skill "clusters" to understand your academic strengths and find the best career paths for you.
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: "2rem" }}>
          <div>
            <h4 style={{ marginBottom: "1rem", color: "var(--success)" }}>Strongest Clusters</h4>
            {strengthsAndGaps.strengths.length > 0 ? (
              <div className="stack" style={{ gap: "1rem" }}>
                {strengthsAndGaps.strengths.map(([name, score]) => (
                  <div key={name}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.25rem", fontSize: "0.9rem" }}>
                      <span>{name}</span>
                      <span className="meta">{(score * 100).toFixed(0)}%</span>
                    </div>
                    <div className="cluster-bar-container">
                      <div className="cluster-bar-fill" style={{ width: `${score * 100}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            ) : <p className="meta">No strong clusters established yet.</p>}
          </div>

          <div>
            <h4 style={{ marginBottom: "1rem", color: "var(--warning)" }}>Development Areas</h4>
            {strengthsAndGaps.gaps.length > 0 ? (
              <div className="stack" style={{ gap: "1rem" }}>
                {strengthsAndGaps.gaps.map(([name, score]) => (
                  <div key={name}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.25rem", fontSize: "0.9rem" }}>
                      <span>{name}</span>
                      <span className="meta">{(score * 100).toFixed(0)}%</span>
                    </div>
                    <div className="cluster-bar-container" style={{ background: "rgba(245, 158, 11, 0.1)" }}>
                      <div className="cluster-bar-fill" style={{ width: `${score * 100}%`, background: "var(--warning)" }} />
                    </div>
                  </div>
                ))}
              </div>
            ) : <p className="meta">No significant gaps detected.</p>}
          </div>
        </div>
      </div>

      <h2 style={{ marginBottom: "1rem" }}>Top Career Matches</h2>

      {analysis.career_matches.length === 0 ? (
        <div className="empty-state">
          <p>Not enough data to find confident career matches. Add more courses to your profile.</p>
        </div>
      ) : (
        <div className="stack">
          {analysis.career_matches.map((item) => (
            <article className="card" key={item.career_id} style={{ display: "flex", gap: "2rem", alignItems: "center" }}>
              <div style={{ flexShrink: 0 }}>
                <div className="progress-ring" style={{ "--progress": `${item.score * 100}%`, width: "80px", height: "80px" } as any}>
                  <span className="progress-ring-val" style={{ fontSize: "1.1rem" }}>{(item.score * 100).toFixed(0)}%</span>
                </div>
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "0.5rem" }}>
                  <h3 style={{ color: "var(--accent-primary)", fontSize: "1.3rem" }}>{item.title}</h3>
                  <StatusBadge value={item.confidence_badge} />
                </div>
                <p className="meta" style={{ marginBottom: "1rem" }}>
                  {item.narrative || (item.why.includes("Weighted cluster fit") ? `Strong alignment with your background in ${item.why.split("strongest signals in ")[1] || "your core subjects"}.` : item.why)}
                </p>
                <div style={{ background: "rgba(0,0,0,0.2)", padding: "1rem", borderRadius: "8px", border: "1px solid rgba(255,255,255,0.05)" }}>
                  <p style={{ fontSize: "0.9rem", color: "#e2e8f0" }}>
                    <strong style={{ color: "var(--accent-primary)" }}>AI Suggestion: </strong>
                    To strengthen this pathway, consider taking {item.recommended_courses.length ? item.recommended_courses.join(", ") : "more advanced electives in your core clusters"}.
                  </p>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
