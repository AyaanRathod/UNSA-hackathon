"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { appStorage } from "@/lib/storage";

export default function DashboardHomePage() {
  const [hasProfile, setHasProfile] = useState(false);
  const [hasAnalysis, setHasAnalysis] = useState(false);
  const [hasDocs, setHasDocs] = useState(false);

  useEffect(() => {
    const profile = appStorage.loadProfile();
    const analysis = appStorage.loadAnalysis();
    const docs = appStorage.loadDocuments();

    if (profile?.student_id) setHasProfile(true);
    if (analysis?.active_program_id) setHasAnalysis(true);
    if (docs?.length > 0) setHasDocs(true);
  }, []);

  return (
    <div className="stack" style={{ maxWidth: "800px" }}>
      <h1 style={{ marginBottom: "0.5rem" }}>Command Center</h1>
      <p className="meta" style={{ marginBottom: "2rem" }}>
        Welcome back. Follow the steps below to set up your profile and explore your pathway.
      </p>

      <div className="stack" style={{ gap: "1rem" }}>
        {/* Step 1 */}
        <div className="card" style={{ display: "flex", gap: "1.5rem", alignItems: "flex-start", borderColor: hasProfile ? "var(--success)" : "var(--accent-primary)" }}>
          <div style={{ 
            width: "32px", height: "32px", borderRadius: "50%", 
            background: hasProfile ? "var(--success)" : "var(--accent-primary)", 
            color: "white", display: "flex", alignItems: "center", justifyContent: "center",
            fontWeight: "bold", flexShrink: 0
          }}>
            {hasProfile ? "✓" : "1"}
          </div>
          <div style={{ flex: 1 }}>
            <h3 style={{ marginBottom: "0.5rem" }}>Build Academic Profile</h3>
            <p className="meta" style={{ marginBottom: "1rem" }}>Upload your transcript or enter your courses manually to give Pathwise context.</p>
            <Link href="/dashboard/profile" className="button button-primary">
              {hasProfile ? "Edit Profile" : "Start Profile"}
            </Link>
          </div>
        </div>

        {/* Step 2 */}
        <div className="card" style={{ display: "flex", gap: "1.5rem", alignItems: "flex-start", opacity: hasProfile ? 1 : 0.6 }}>
          <div style={{ 
            width: "32px", height: "32px", borderRadius: "50%", 
            background: hasAnalysis ? "var(--success)" : "rgba(255,255,255,0.1)", 
            color: "white", display: "flex", alignItems: "center", justifyContent: "center",
            fontWeight: "bold", flexShrink: 0
          }}>
            {hasAnalysis ? "✓" : "2"}
          </div>
          <div style={{ flex: 1 }}>
            <h3 style={{ marginBottom: "0.5rem" }}>Review Audit & Recommendations</h3>
            <p className="meta" style={{ marginBottom: "1rem" }}>See what requirements you're missing and discover AI-recommended next courses.</p>
            <Link href={hasAnalysis ? "/dashboard/audit" : "#"} className={`button button-secondary ${!hasAnalysis ? "disabled" : ""}`} style={{ opacity: hasAnalysis ? 1 : 0.5, pointerEvents: hasAnalysis ? "auto" : "none" }}>
              View Degree Audit
            </Link>
          </div>
        </div>

        {/* Step 3 */}
        <div className="card" style={{ display: "flex", gap: "1.5rem", alignItems: "flex-start", opacity: hasAnalysis ? 1 : 0.6 }}>
          <div style={{ 
            width: "32px", height: "32px", borderRadius: "50%", 
            background: "rgba(255,255,255,0.1)", 
            color: "white", display: "flex", alignItems: "center", justifyContent: "center",
            fontWeight: "bold", flexShrink: 0
          }}>
            3
          </div>
          <div style={{ flex: 1 }}>
            <h3 style={{ marginBottom: "0.5rem" }}>Explore Career Matches</h3>
            <p className="meta" style={{ marginBottom: "1rem" }}>See how your coursework aligns with real-world career trajectories.</p>
            <Link href={hasAnalysis ? "/dashboard/careers" : "#"} className="button button-secondary" style={{ opacity: hasAnalysis ? 1 : 0.5, pointerEvents: hasAnalysis ? "auto" : "none" }}>
              Explore Careers
            </Link>
          </div>
        </div>

        {/* Step 4 */}
        <div className="card" style={{ display: "flex", gap: "1.5rem", alignItems: "flex-start" }}>
          <div style={{ 
            width: "32px", height: "32px", borderRadius: "50%", 
            background: hasDocs ? "var(--success)" : "rgba(255,255,255,0.1)", 
            color: "white", display: "flex", alignItems: "center", justifyContent: "center",
            fontWeight: "bold", flexShrink: 0
          }}>
            {hasDocs ? "✓" : "4"}
          </div>
          <div style={{ flex: 1 }}>
            <h3 style={{ marginBottom: "0.5rem" }}>Study Workspace</h3>
            <p className="meta" style={{ marginBottom: "1rem" }}>Upload syllabi and notes to use Active Recall, Feynman mode, and Flashcards.</p>
            <div className="row">
              <Link href="/dashboard/upload" className="button button-secondary">Upload Materials</Link>
              <Link href="/dashboard/study" className="button button-primary">Open Study Space</Link>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
