"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { apiClient } from "@/lib/api/client";
import type { CatalogProgramSummary, CompletedCourseInput, EnjoymentValue, StudentProfileInput } from "@/lib/api/types";
import { appStorage } from "@/lib/storage";

interface CourseRow extends CompletedCourseInput {
  id: string;
}

function newRow(): CourseRow {
  return { id: crypto.randomUUID(), code: "", grade: "", confidence: 3, enjoyment: "neutral", notes: "", transfer: false, counts_as: "", repeat_attempt: false };
}

const FALLBACK_PROGRAMS: CatalogProgramSummary[] = [
  { program_id: "pathwise-explore", name: "All disciplines (explore)", institution: "Brock University", calendar_year: "2024-2025" },
  { program_id: "brock-cs-bsc", name: "BSc Computer Science", institution: "Brock University", calendar_year: "2024-2025" },
  { program_id: "brock-business-bba", name: "Bachelor of Business Administration", institution: "Brock University", calendar_year: "2024-2025" },
];

export default function AcademicProfilePage() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [studentId, setStudentId] = useState("");
  const [goals, setGoals] = useState("");
  const [programInterest, setProgramInterest] = useState("");
  const [programId, setProgramId] = useState("brock-cs-bsc");
  const [catalogPrograms, setCatalogPrograms] = useState<CatalogProgramSummary[]>(FALLBACK_PROGRAMS);
  const [rows, setRows] = useState<CourseRow[]>([newRow()]);
  const [loading, setLoading] = useState(false);
  const [intakeBusy, setIntakeBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const saved = appStorage.loadProfile();
    if (saved?.program_id) setProgramId(saved.program_id);
    if (saved?.student_id) setStudentId(saved.student_id);
    if (saved?.goals?.[0]) setGoals(saved.goals[0]);
    if (saved?.program_interest) setProgramInterest(saved.program_interest);
    if (saved?.completed_courses?.length) {
      setRows(saved.completed_courses.map(c => ({ ...c, id: crypto.randomUUID(), confidence: c.confidence || 3, enjoyment: c.enjoyment || "neutral", grade: c.grade || "" })));
    }
  }, []);

  useEffect(() => {
    void apiClient.listCatalogPrograms().then(res => res?.length && setCatalogPrograms(res)).catch(() => setCatalogPrograms(FALLBACK_PROGRAMS));
  }, []);

  const canProceedStep1 = studentId.trim().length > 0;
  const canSubmit = canProceedStep1 && rows.some((row) => row.code.trim());

  function updateRow(id: string, next: Partial<CourseRow>) {
    setRows(prev => prev.map(row => row.id === id ? { ...row, ...next } : row));
  }

  function removeRow(id: string) {
    setRows(prev => prev.length > 1 ? prev.filter(r => r.id !== id) : prev);
  }

  async function handleTranscriptImport(file: File) {
    setIntakeBusy(true);
    setError(null);
    try {
      const parsed = await apiClient.parseTranscriptFile(file);
      if (parsed.extracted_courses.length === 0) {
        setError(parsed.warning || "No courses extracted. Please add manually.");
      } else {
        const newRows = parsed.extracted_courses.map(c => ({
          ...c, id: crypto.randomUUID(), confidence: c.confidence || 3, enjoyment: c.enjoyment || "neutral", grade: c.grade || ""
        }));
        setRows(prev => {
          const merged = [...prev.filter(r => r.code.trim())];
          newRows.forEach(nr => {
            if (!merged.find(m => m.code.toUpperCase() === nr.code.toUpperCase())) merged.push(nr);
          });
          return merged.length ? merged : [newRow()];
        });
        setStep(3); // Jump to review
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed");
    } finally {
      setIntakeBusy(false);
    }
  }

  async function handleSubmit() {
    setLoading(true);
    setError(null);
    const cleanedRows = rows.filter(r => r.code.trim()).map(r => ({
      code: r.code.trim().toUpperCase(), grade: r.grade || 0, confidence: Number(r.confidence), enjoyment: r.enjoyment, notes: r.notes?.trim() || undefined, transfer: r.transfer, counts_as: r.counts_as?.trim() || undefined, repeat_attempt: r.repeat_attempt
    }));
    const payload: StudentProfileInput = {
      student_id: studentId.trim(), completed_courses: cleanedRows, goals: goals.trim() ? [goals.trim()] : [], program_interest: programInterest.trim() || undefined, program_id: programId, allowed_restriction_groups: ["any"]
    };
    try {
      const analysis = await apiClient.analyzeProfile(payload);
      appStorage.saveProfile(payload);
      appStorage.saveAnalysis(analysis);
      router.push("/dashboard/audit");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Analysis failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="stack fade-in">
      <header style={{ marginBottom: "1rem" }}>
        <h1>Build Academic Profile</h1>
        <p className="meta">Let's map out what you've done so far to personalize your pathway.</p>
      </header>

      {/* Stepper */}
      <div style={{ display: "flex", gap: "1rem", marginBottom: "2rem" }}>
        {[1, 2, 3].map(s => (
          <div key={s} style={{ flex: 1, height: "4px", background: step >= s ? "var(--accent-primary)" : "rgba(255,255,255,0.1)", borderRadius: "2px", transition: "all 0.3s" }} />
        ))}
      </div>

      {error && <div className="error">{error}</div>}

      {step === 1 && (
        <div className="card stack fade-in">
          <h3>Step 1: The Basics</h3>
          <label>Student ID<input value={studentId} onChange={e => setStudentId(e.target.value)} placeholder="Your Brock ID" /></label>
          <label>Program Track<select value={programId} onChange={e => setProgramId(e.target.value)}>{catalogPrograms.map(p => <option key={p.program_id} value={p.program_id}>{p.name}</option>)}</select></label>
          <label>Career Goals (Optional)<textarea value={goals} onChange={e => setGoals(e.target.value)} placeholder="e.g. Software Engineering, Data Science" rows={2}/></label>
          <div style={{ marginTop: "1rem", textAlign: "right" }}>
            <button className="button button-primary" onClick={() => setStep(2)} disabled={!canProceedStep1}>Next: Add Courses</button>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="stack fade-in">
          <div className="card stack" style={{ background: "rgba(168,85,247,0.05)" }}>
            <h3>Step 2: Add Courses</h3>
            <p className="meta">Fastest way: upload your unofficial transcript. We'll extract the data.</p>
            <div className="dropzone" style={{ padding: "2rem" }}>
              <input type="file" accept=".pdf,.png,.jpg,.jpeg" onChange={e => e.target.files?.[0] && handleTranscriptImport(e.target.files[0])} style={{ display: "none" }} id="transcript-upload" />
              <label htmlFor="transcript-upload" style={{ cursor: "pointer", display: "block" }}>
                {intakeBusy ? "Extracting..." : "Click or drag transcript PDF/Image here"}
              </label>
            </div>
          </div>
          
          <div style={{ textAlign: "center" }}>
            <span className="meta">— or enter manually —</span>
          </div>

          <div style={{ textAlign: "right" }}>
            <button className="button button-secondary" onClick={() => setStep(1)} style={{ marginRight: "1rem" }}>Back</button>
            <button className="button button-primary" onClick={() => setStep(3)}>Continue to Manual Entry</button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="stack fade-in">
          <div className="card stack">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h3>Step 3: Review Course Data</h3>
              <button className="button button-secondary" onClick={() => setRows(p => [...p, newRow()])}>+ Add Row</button>
            </div>
            <p className="meta">Fine-tune your grades, confidence levels, and enjoyment to improve recommendations.</p>
            
            <div className="stack" style={{ gap: "1rem" }}>
              {rows.map((row, i) => (
                <div key={row.id} style={{ background: "rgba(0,0,0,0.2)", border: "1px solid rgba(255,255,255,0.1)", padding: "1rem", borderRadius: "8px", display: "grid", gridTemplateColumns: "1fr 1fr 2fr 1fr auto", gap: "1rem", alignItems: "end" }}>
                  <label>Code<input placeholder="COSC 1P02" value={row.code} onChange={e => updateRow(row.id, {code: e.target.value})} /></label>
                  <label>Grade<input placeholder="85 or B+" value={row.grade as string} onChange={e => updateRow(row.id, {grade: e.target.value})} /></label>
                  <label>Confidence (1-10)
                    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                      <input type="range" min="1" max="10" value={row.confidence} onChange={e => updateRow(row.id, {confidence: Number(e.target.value)})} style={{ flex: 1 }}/>
                      <span style={{ width: "20px", textAlign: "center" }}>{row.confidence}</span>
                    </div>
                  </label>
                  <label>Enjoyment
                    <select value={row.enjoyment} onChange={e => updateRow(row.id, {enjoyment: e.target.value as EnjoymentValue})}>
                      <option value="liked">👍 Liked</option><option value="neutral">😐 Neutral</option><option value="disliked">👎 Disliked</option>
                    </select>
                  </label>
                  <button className="button button-secondary" onClick={() => removeRow(row.id)} style={{ padding: "0.75rem", background: "rgba(239, 68, 68, 0.1)", color: "#fca5a5", borderColor: "rgba(239, 68, 68, 0.3)" }}>✕</button>
                </div>
              ))}
            </div>
          </div>

          <div style={{ display: "flex", justifyContent: "space-between", marginTop: "1rem" }}>
            <button className="button button-secondary" onClick={() => setStep(2)}>Back</button>
            <button className="button button-primary" onClick={handleSubmit} disabled={!canSubmit || loading} style={{ padding: "1rem 2rem" }}>
              {loading ? "Generating Audit..." : "Generate Degree Audit"}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
