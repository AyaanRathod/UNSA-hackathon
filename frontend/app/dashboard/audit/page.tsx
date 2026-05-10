"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { StatusBadge } from "@/components/StatusBadge";
import type { AnalyzeProfileResponse } from "@/lib/api/types";
import { appStorage } from "@/lib/storage";

export default function AuditPage() {
  const [analysis, setAnalysis] = useState<AnalyzeProfileResponse | null>(null);

  useEffect(() => {
    setAnalysis(appStorage.loadAnalysis());
  }, []);

  if (!analysis) {
    return (
      <section className="empty-state fade-in">
        <div style={{ fontSize: "3rem", marginBottom: "1rem" }}>📋</div>
        <h2>No Audit Available</h2>
        <p style={{ maxWidth: "400px", margin: "1rem auto 2rem" }}>
          Submit your academic profile to generate your degree audit and next-course recommendations.
        </p>
        <Link href="/dashboard/profile" className="button button-primary">
          Enter Academic Profile
        </Link>
      </section>
    );
  }

  const explain = (item: (typeof analysis.recommendations)[0]) => {
    if (item.polished_why) return item.polished_why;
    if (item.why.includes("Cluster fit=")) return "Aligns with your strongest coursework clusters and prerequisites.";
    return item.why;
  };

  const getFriendlyLabel = (label: string) => {
    if (label === "safe") return "Recommended";
    if (label === "stretch") return "Challenge";
    if (label === "risky") return "Prereqs Missing";
    return label;
  };

  return (
    <section className="stack fade-in">
      <header style={{ marginBottom: "1rem" }}>
        <h1 style={{ marginBottom: "0.5rem" }}>Degree Audit & Recommendations</h1>
        <p className="meta">
          Program track: <strong style={{ color: "white" }}>{analysis.active_program_name ?? "—"}</strong>
          {analysis.active_program_id && ` (${analysis.active_program_id})`}
        </p>
      </header>

      {/* Audit Summary Panel */}
      <div className="card" style={{ background: "rgba(168, 85, 247, 0.05)", borderColor: "var(--accent-secondary)", marginBottom: "2rem" }}>
        <h3 style={{ marginBottom: "1rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <span>📊</span> Progress Snapshot
        </h3>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "1.5rem" }}>
          <div>
            <p className="meta" style={{ marginBottom: "0.25rem" }}>Top Academic Cluster</p>
            <div className="row" style={{ alignItems: "baseline" }}>
              <span style={{ fontSize: "1.2rem", fontWeight: "bold", color: "white" }}>
                {Object.keys(analysis.cluster_strengths)[0] || "None"}
              </span>
              <StatusBadge value={analysis.cluster_confidence_badges?.[Object.keys(analysis.cluster_strengths)[0]] || "low"} />
            </div>
          </div>
          <div>
            <p className="meta" style={{ marginBottom: "0.25rem" }}>Degree Credits Completed</p>
            <div className="row" style={{ alignItems: "center" }}>
              <span style={{ fontSize: "1.2rem", fontWeight: "bold", color: "white" }}>
                {analysis.total_credits_completed || 0} / {analysis.total_credits_required || 20}
              </span>
            </div>
            <div className="cluster-bar-container" style={{ marginTop: "0.25rem" }}>
              <div className="cluster-bar-fill" style={{ width: `${Math.min(100, ((analysis.total_credits_completed || 0) / (analysis.total_credits_required || 20)) * 100)}%` }} />
            </div>
          </div>
          <div>
            <p className="meta" style={{ marginBottom: "0.25rem" }}>Unmapped Courses</p>
            <span style={{ color: analysis.unknown_courses.length > 0 ? "var(--warning)" : "var(--success)" }}>
              {analysis.unknown_courses.length} courses
            </span>
          </div>
        </div>
      </div>

      {analysis.unknown_courses.length > 0 && (
        <div className="notice warning">
          <p><strong>Note:</strong> Some courses couldn't be mapped: {analysis.unknown_courses.join(", ")}. This may affect your audit accuracy.</p>
        </div>
      )}

      <h2 style={{ marginTop: "1rem", marginBottom: "1rem" }}>Recommended Next Courses</h2>

      {analysis.recommendations.length === 0 ? (
        <div className="empty-state" style={{ padding: "3rem 1rem" }}>
          <p>No eligible next courses were found. You might be missing prerequisites.</p>
        </div>
      ) : (
        <div style={{ display: "grid", gap: "1rem", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))" }}>
          {analysis.recommendations.map((item) => (
            <article className="card" key={item.course_code} style={{ display: "flex", flexDirection: "column" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "1rem" }}>
                <div>
                  <h3 style={{ color: "var(--accent-primary)" }}>{item.course_code}</h3>
                  <p style={{ fontWeight: "600", fontSize: "0.95rem" }}>{item.title}</p>
                </div>
                <div style={{ textAlign: "right" }}>
                  <StatusBadge value={getFriendlyLabel(item.label)} />
                  <div style={{ marginTop: "0.25rem" }}>
                    <span className="meta" style={{ fontSize: "0.75rem" }}>Match: {(item.score * 100).toFixed(0)}%</span>
                  </div>
                </div>
              </div>

              {(item.clusters && item.clusters.length > 0) || (item.tags && item.tags.length > 0) ? (
                <div className="chip-row" style={{ marginBottom: "1rem" }}>
                  {(item.clusters ?? []).map((c) => (
                    <span className="chip" key={`c-${c}`} style={{ background: "rgba(168,85,247,0.15)", color: "#d8b4fe", border: "1px solid rgba(168,85,247,0.3)" }}>
                      {c}
                    </span>
                  ))}
                  {(item.tags ?? []).map((t) => (
                    <span className="chip" key={`t-${t}`}>
                      {t}
                    </span>
                  ))}
                </div>
              ) : null}

              <div style={{ flex: 1 }}>
                <p className="meta" style={{ fontSize: "0.9rem", lineHeight: 1.5 }}>
                  {explain(item)}
                </p>
                {item.track_note && (
                  <p className="meta" style={{ fontSize: "0.85rem", marginTop: "0.5rem", color: "#fbbf24" }}>
                    💡 <strong>Track Signal:</strong> {item.track_note}
                  </p>
                )}
              </div>

              {item.evidence_snippets && item.evidence_snippets.length > 0 && (
                <details style={{ marginTop: "1rem", fontSize: "0.85rem" }}>
                  <summary style={{ cursor: "pointer", color: "var(--text-secondary)", userSelect: "none" }}>Show Evidence</summary>
                  <ul style={{ marginTop: "0.5rem", paddingLeft: "1rem", color: "var(--text-secondary)", listStyleType: "disc" }}>
                    {item.evidence_snippets.map((ex, i) => (
                      <li key={`${item.course_code}-ev-${i}`} style={{ marginBottom: "0.25rem" }}>{ex}</li>
                    ))}
                  </ul>
                </details>
              )}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
