"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { StatusBadge } from "@/components/StatusBadge";
import type { AnalyzeProfileResponse } from "@/lib/api/types";
import { appStorage } from "@/lib/storage";

function ScoreBar({ score }: { score: number }) {
  const pct = (score * 100).toFixed(1);
  return (
    <div className="score-bar-track">
      <div
        className="score-bar"
        role="progressbar"
        aria-valuenow={Math.round(score * 100)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`Match score: ${pct}%`}
      >
        <div className="score-bar-fill" style={{ width: `${pct}%` }} />
      </div>
      <span className="meta">{pct}%</span>
    </div>
  );
}

export default function RecommendationsPage() {
  const [analysis, setAnalysis] = useState<AnalyzeProfileResponse | null>(null);

  useEffect(() => {
    setAnalysis(appStorage.loadAnalysis());
  }, []);

  if (!analysis) {
    return (
      <section className="empty-state stack" style={{ textAlign: "center", gap: "0.75rem" }}>
        <h1>No recommendations yet</h1>
        <p>Submit an academic profile first to generate next-course recommendations.</p>
        <Link href="/dashboard/profile" className="button button-primary" style={{ justifySelf: "center" }}>
          Enter Academic Profile
        </Link>
      </section>
    );
  }

  const explain = (item: (typeof analysis.recommendations)[0]) => item.polished_why || item.why;

  return (
    <section className="stack">
      <h1>Pathway Recommendations</h1>
      <p className="meta recommendation-scope">
        Program track: <strong>{analysis.active_program_name ?? "—"}</strong>
        {analysis.active_program_id ? (
          <span className="meta muted"> ({analysis.active_program_id})</span>
        ) : (
          <span className="meta muted"> · Resubmit your profile to use catalog program tracks.</span>
        )}
        {analysis.ranking_source === "watsonx_rag" ? (
          <span className="meta muted"> · Ranked with IBM watsonx + calendar evidence</span>
        ) : (
          <span className="meta muted"> · Ranked by catalog rules (deterministic)</span>
        )}
      </p>

      {analysis.unknown_courses.length > 0 && (
        <p className="notice" role="alert">
          Unknown or unmapped courses: <strong>{analysis.unknown_courses.join(", ")}</strong>. These may reduce recommendation confidence.
        </p>
      )}

      {analysis.recommendations.length === 0 ? (
        <div className="empty-state stack" style={{ gap: "0.75rem" }}>
          <p>No eligible next courses were found from the current profile.</p>
          <Link href="/dashboard/profile" className="button button-secondary" style={{ justifySelf: "start" }}>
            Update Profile
          </Link>
        </div>
      ) : (
        <div className="stack">
          {analysis.recommendations.map((item) => (
            <article className="card recommendation-card" key={item.course_code}>
              <div className="recommendation-card-head">
                <h3>
                  {item.course_code}: {item.title}
                </h3>
                <span className="recommendation-credits">{item.credits != null ? `${item.credits} cr.` : ""}</span>
              </div>

              {(item.clusters && item.clusters.length > 0) || (item.tags && item.tags.length > 0) ? (
                <div className="chip-row">
                  {(item.clusters ?? []).map((c) => (
                    <span className="chip chip-cluster" key={`c-${c}`}>{c}</span>
                  ))}
                  {(item.tags ?? []).map((t) => (
                    <span className="chip chip-tag" key={`t-${t}`}>{t}</span>
                  ))}
                </div>
              ) : null}

              {item.track_note ? (
                <p className="meta track-note">
                  <span className="track-note-label">Track signal:</span> {item.track_note}
                </p>
              ) : null}

              <p className="meta recommendation-rationale">{explain(item)}</p>

              {item.evidence_snippets && item.evidence_snippets.length > 0 ? (
                <details className="evidence-details">
                  <summary className="meta">Calendar evidence used</summary>
                  <ul className="evidence-list">
                    {item.evidence_snippets.map((ex, i) => (
                      <li key={`${item.course_code}-ev-${i}`}>{ex}</li>
                    ))}
                  </ul>
                </details>
              ) : null}

              <div className="hero-actions" style={{ alignItems: "center" }}>
                <StatusBadge value={item.label} />
                <StatusBadge value={item.confidence_badge} />
                <ScoreBar score={item.score} />
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
