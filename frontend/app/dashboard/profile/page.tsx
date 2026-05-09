"use client";

import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { apiClient } from "@/lib/api/client";
import type { CompletedCourseInput, EnjoymentValue, StudentProfileInput } from "@/lib/api/types";
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

export default function AcademicProfilePage() {
  const router = useRouter();
  const [studentId, setStudentId] = useState("");
  const [goals, setGoals] = useState("");
  const [programInterest, setProgramInterest] = useState("");
  const [workloadPath, setWorkloadPath] = useState("");
  const [rows, setRows] = useState<CourseRow[]>([newRow()]);
  const [loading, setLoading] = useState(false);
  const [intakeBusy, setIntakeBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [intakeMessage, setIntakeMessage] = useState<string | null>(null);

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
    <section className="stack">
      <h1>Academic Profile</h1>
      <p className="meta">
        Upload a transcript PDF (same PDF text pipeline as syllabus uploads) or a marks screenshot. Images use IBM watsonx vision
        (set WATSONX_VISION_MODEL_ID if your main model is text-only). Then tweak confidence and enjoyment before analysis.
      </p>

      <form className="stack" onSubmit={handleSubmit}>
        <div className="card intake-card">
          <div className="panel-title-row">
            <h3>Quick Intake</h3>
            <span className="badge warning">new</span>
          </div>
          <p className="meta">
            Upload an unofficial transcript PDF or marks screenshot. Pathwise extracts course + grade rows automatically.
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

        <div className="card dashboard-grid">
          <label>
            Student ID
            <input value={studentId} onChange={(event) => setStudentId(event.target.value)} required />
          </label>
          <label>
            Program Interest
            <input
              value={programInterest}
              placeholder="Computer Science BSc"
              onChange={(event) => setProgramInterest(event.target.value)}
            />
          </label>
          <label>
            Goals
            <input value={goals} placeholder="AI internship, software engineering" onChange={(event) => setGoals(event.target.value)} />
          </label>
          <label>
            Workload / preferred path (optional)
            <input
              value={workloadPath}
              placeholder="balanced workload, co-op oriented"
              onChange={(event) => setWorkloadPath(event.target.value)}
            />
          </label>
        </div>

        <div className="card">
          <h3>Completed Courses</h3>
          <table className="table">
            <thead>
              <tr>
                <th>Course</th>
                <th>Grade</th>
                <th>Confidence</th>
                <th>Enjoyment</th>
                <th>Transfer / Path</th>
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
                    <label>
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
