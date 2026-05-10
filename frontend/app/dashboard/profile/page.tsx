"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { apiClient } from "@/lib/api/client";
import type {
  CatalogProgramSummary,
  CompletedCourseInput,
  EnjoymentValue,
  StudentProfileInput,
} from "@/lib/api/types";
import { appStorage } from "@/lib/storage";

interface CourseRow extends CompletedCourseInput {
  id: string;
}

function newRow(): CourseRow {
  return {
    id: crypto.randomUUID(),
    code: "",
    grade: "",
    confidence: 3,
    enjoyment: "neutral",
    notes: "",
    transfer: false,
    counts_as: "",
    repeat_attempt: false,
  };
}

const enjoymentOptions: EnjoymentValue[] = ["liked", "neutral", "disliked"];
const supportedTranscriptTypes = ".pdf,.png,.jpg,.jpeg,.webp";

const FALLBACK_PROGRAMS: CatalogProgramSummary[] = [
  { program_id: "pathwise-explore", name: "All disciplines (eligible next courses)", institution: "Brock University", calendar_year: "2024-2025" },
  { program_id: "brock-cs-bsc", name: "BSc Computer Science", institution: "Brock University", calendar_year: "2024-2025" },
  {
    program_id: "brock-business-bba",
    name: "Bachelor of Business Administration (course universe)",
    institution: "Brock University",
    calendar_year: "2024-2025",
  },
];

export default function AcademicProfilePage() {
  const router = useRouter();
  const [studentId, setStudentId] = useState("");
  const [goals, setGoals] = useState("");
  const [programInterest, setProgramInterest] = useState("");
  const [programId, setProgramId] = useState("brock-cs-bsc");
  const [catalogPrograms, setCatalogPrograms] = useState<CatalogProgramSummary[]>(FALLBACK_PROGRAMS);
  const [workloadPath, setWorkloadPath] = useState("");
  const [rows, setRows] = useState<CourseRow[]>([newRow()]);
  const [loading, setLoading] = useState(false);
  const [intakeBusy, setIntakeBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [intakeMessage, setIntakeMessage] = useState<string | null>(null);

  useEffect(() => {
    const saved = appStorage.loadProfile();
    if (saved?.program_id) {
      setProgramId(saved.program_id);
    }
  }, []);

  useEffect(() => {
    void apiClient
      .listCatalogPrograms()
      .then((rows) => {
        if (rows?.length) {
          setCatalogPrograms(rows);
        }
      })
      .catch(() => {
        setCatalogPrograms(FALLBACK_PROGRAMS);
      });
  }, []);

  const canSubmit = useMemo(() => {
    return studentId.trim().length > 0 && rows.some((row) => row.code.trim());
  }, [studentId, rows]);

  function updateRow(id: string, next: Partial<CourseRow>) {
    setRows((prev) => prev.map((row) => (row.id === id ? { ...row, ...next } : row)));
  }

  function removeRow(id: string) {
    setRows((prev) => (prev.length > 1 ? prev.filter((row) => row.id !== id) : prev));
  }

  function mergeRows(imported: CompletedCourseInput[]) {
    if (!imported.length) {
      return;
    }
    setRows((prev) => {
      const byCode = new Map(prev.map((row) => [row.code.trim().toUpperCase(), row]));
      for (const course of imported) {
        const code = course.code.trim().toUpperCase();
        const existing = byCode.get(code);
        if (existing) {
          byCode.set(code, {
            ...existing,
            grade: course.grade,
            confidence: Number(course.confidence) || existing.confidence,
            enjoyment: course.enjoyment || existing.enjoyment,
            notes: course.notes || existing.notes,
          });
        } else {
          byCode.set(code, {
            id: crypto.randomUUID(),
            code,
            grade: course.grade,
            confidence: Number(course.confidence) || 3,
            enjoyment: course.enjoyment || "neutral",
            notes: course.notes,
            transfer: course.transfer || false,
            counts_as: course.counts_as || "",
            repeat_attempt: course.repeat_attempt || false,
          });
        }
      }
      const merged = Array.from(byCode.values());
      return merged.length ? merged : [newRow()];
    });
  }

  async function handleTranscriptImport(file: File) {
    setIntakeBusy(true);
    setIntakeMessage(null);
    setError(null);
    try {
      const parsed = await apiClient.parseTranscriptFile(file);

      mergeRows(parsed.extracted_courses);
      const rowCount = parsed.extracted_courses.length;
      if (rowCount === 0) {
        setIntakeMessage(parsed.warning || "No courses were extracted. Try a clearer transcript or edit manually.");
      } else {
        setIntakeMessage(
          `Imported ${rowCount} course row${rowCount === 1 ? "" : "s"} from ${parsed.source_name}. Review and adjust before submit.`,
        );
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not parse transcript upload.";
      setIntakeMessage(`Transcript import failed: ${message}`);
    } finally {
      setIntakeBusy(false);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);

    const cleanedRows = rows
      .filter((row) => row.code.trim())
      .map((row) => ({
        code: row.code.trim().toUpperCase(),
        grade: row.grade || 0,
        confidence: Number(row.confidence),
        enjoyment: row.enjoyment,
        notes: row.notes?.trim() || undefined,
        transfer: row.transfer,
        counts_as: row.counts_as?.trim() || undefined,
        repeat_attempt: row.repeat_attempt,
      }));

    const payload: StudentProfileInput = {
      student_id: studentId.trim(),
      completed_courses: cleanedRows,
      goals: [goals.trim(), workloadPath.trim()].filter(Boolean),
      program_interest: programInterest.trim() || undefined,
      program_id: programId,
      allowed_restriction_groups: ["any"],
    };

    try {
      const analysis = await apiClient.analyzeProfile(payload);
      appStorage.saveProfile(payload);
      appStorage.saveAnalysis(analysis);
      router.push("/dashboard/recommendations");
    } catch (err) {
      const message =
        err instanceof Error && err.message === "Failed to fetch"
          ? "Could not reach backend. Confirm backend is running on 127.0.0.1:8000 and refresh this page."
          : err instanceof Error
            ? err.message
            : "Could not analyze profile.";
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="stack profile-page">
      <h1>Academic Profile</h1>
      <p className="meta profile-page-lede">
        Add your details first, optionally upload a transcript to fill course rows, then review before running analysis.
      </p>

      <form className="stack" onSubmit={handleSubmit}>
        <div className="card">
          <h3 className="profile-section-title">1 · Student info</h3>
          <p className="meta">These fields feed pathway recommendations. Inputs expand to full width on smaller screens.</p>
          <div className="profile-field-grid">
            <label>
              Student ID
              <input
                value={studentId}
                onChange={(event) => setStudentId(event.target.value)}
                required
                placeholder="e.g. your Brock student number"
                autoComplete="off"
              />
            </label>
            <label>
              Program track
              <select value={programId} onChange={(event) => setProgramId(event.target.value)} required>
                {catalogPrograms.map((p) => (
                  <option key={p.program_id} value={p.program_id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Focus notes (optional)
              <input
                value={programInterest}
                placeholder="e.g. AI concentration, co-op, minor ideas"
                onChange={(event) => setProgramInterest(event.target.value)}
              />
            </label>
            <label className="profile-field-span-2">
              Goals
              <textarea
                value={goals}
                placeholder="e.g. AI internship, software engineering, graduate school"
                onChange={(event) => setGoals(event.target.value)}
                rows={3}
              />
            </label>
            <label className="profile-field-span-2">
              Workload / preferred path (optional)
              <textarea
                value={workloadPath}
                placeholder="e.g. balanced workload, co-op oriented"
                onChange={(event) => setWorkloadPath(event.target.value)}
                rows={2}
              />
            </label>
          </div>
        </div>

        <div className="card intake-card">
          <div className="panel-title-row">
            <h3 className="profile-section-title">2 · Quick intake (optional)</h3>
            <span className="badge warning">beta</span>
          </div>
          <p className="meta">
            Upload an unofficial transcript PDF or marks screenshot. We extract course rows automatically—you can edit everything
            below before submitting.
          </p>
          <label className="file-input-label">
            Transcript / marks image
            <input
              type="file"
              accept={supportedTranscriptTypes}
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) {
                  void handleTranscriptImport(file);
                }
              }}
            />
          </label>
          {intakeBusy && <p className="notice">Extracting transcript data...</p>}
          {intakeMessage && <p className="notice">{intakeMessage}</p>}
        </div>

        <div className="card">
          <h3 className="profile-section-title">3 · Completed courses</h3>
          <p className="meta">Scroll horizontally on small screens if needed. Add or remove rows as needed.</p>
          <div className="profile-table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Course</th>
                  <th>Grade</th>
                  <th>Confidence</th>
                  <th>Enjoyment</th>
                  <th>Transfer / path</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td>
                      <input
                        aria-label="Course code"
                        placeholder="COSC1P02"
                        value={row.code}
                        onChange={(event) => updateRow(row.id, { code: event.target.value })}
                      />
                    </td>
                    <td>
                      <input
                        aria-label="Grade"
                        placeholder="84 or B+"
                        value={String(row.grade)}
                        onChange={(event) => updateRow(row.id, { grade: event.target.value })}
                      />
                    </td>
                    <td>
                      <input
                        aria-label="Confidence"
                        type="number"
                        min={1}
                        max={10}
                        value={row.confidence}
                        onChange={(event) => updateRow(row.id, { confidence: Number(event.target.value) })}
                      />
                    </td>
                    <td>
                      <select
                        aria-label="Enjoyment"
                        value={row.enjoyment}
                        onChange={(event) => updateRow(row.id, { enjoyment: event.target.value as EnjoymentValue })}
                      >
                        {enjoymentOptions.map((option) => (
                          <option key={option} value={option}>
                            {option}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <div className="profile-transfer-cell">
                        <label className="profile-inline-check">
                          <input
                            type="checkbox"
                            checked={row.transfer}
                            onChange={(event) => updateRow(row.id, { transfer: event.target.checked })}
                          />
                          Transfer
                        </label>
                        <input
                          aria-label="Counts as"
                          placeholder="Counts as (optional)"
                          value={row.counts_as}
                          onChange={(event) => updateRow(row.id, { counts_as: event.target.value })}
                        />
                      </div>
                    </td>
                    <td>
                      <button type="button" className="button button-secondary" onClick={() => removeRow(row.id)}>
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ marginTop: "0.8rem" }}>
            <button type="button" className="button button-secondary" onClick={() => setRows((prev) => [...prev, newRow()])}>
              Add course row
            </button>
          </div>
        </div>

        {error && <p className="error">{error}</p>}

        <div>
          <button className="button button-primary" disabled={!canSubmit || loading} type="submit">
            {loading ? "Analyzing..." : "Submit profile for analysis"}
          </button>
        </div>
      </form>
    </section>
  );
}
