"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { apiClient, ApiError } from "@/lib/api/client";
import type { StudyArtifactsResponse, StudyCitation, StudyQaResponse, UploadedDocument } from "@/lib/api/types";
import { appStorage } from "@/lib/storage";

const artifactLabels: Record<StudyArtifactsResponse["artifact_type"], string> = {
  summary: "Summary",
  concept_breakdown: "Concepts",
  glossary: "Glossary",
  self_test: "Self-test",
  study_guide: "Study guide",
};

function sanitizeStudyDisplayText(raw: string): string {
  return raw
    .replace(/\[[^\]]*chk_[a-f0-9]+[^\]]*\]\s*\([^)]*\)\s*/gi, "")
    .replace(/\[[^\]]*internal[^\]]*chk_[a-f0-9]+[^\]]*\]\s*/gi, "")
    .replace(/\uFFFD/g, "")
    .replace(/[\uF020-\uF0FF]/g, "• ");
}

function splitLongParagraph(text: string, softMax = 400): string[] {
  const t = text.trim();
  if (!t) {
    return [];
  }
  if (t.length <= softMax) {
    return [t];
  }
  const parts: string[] = [];
  const sentences = t.split(/(?<=[.!?])\s+/);
  let buf = "";
  for (const sentence of sentences) {
    const next = buf ? `${buf} ${sentence}` : sentence;
    if (next.length > softMax && buf) {
      parts.push(buf.trim());
      buf = sentence;
    } else {
      buf = next;
    }
  }
  if (buf.trim()) {
    parts.push(buf.trim());
  }
  return parts.length ? parts : [t];
}

function isBulletLine(line: string): boolean {
  return /^\s*(?:[-•*]|\d+\.)\s+\S/.test(line);
}

function stripBullet(line: string): string {
  return line.replace(/^\s*(?:[-•*]|\d+\.)\s+/, "").trim();
}

function segmentStudyContent(text: string): Array<{ kind: "p"; text: string } | { kind: "ul"; items: string[] }> {
  const cleaned = sanitizeStudyDisplayText(text);
  const out: Array<{ kind: "p"; text: string } | { kind: "ul"; items: string[] }> = [];
  const sections = cleaned.split(/\n{2,}/).map((s) => s.trim()).filter(Boolean);

  for (const section of sections) {
    const lines = section.split(/\n/).map((l) => l.trim()).filter(Boolean);
    if (lines.length >= 2 && lines.every(isBulletLine)) {
      out.push({ kind: "ul", items: lines.map(stripBullet) });
      continue;
    }
    for (const line of lines) {
      if (isBulletLine(line)) {
        out.push({ kind: "ul", items: [stripBullet(line)] });
      } else {
        for (const chunk of splitLongParagraph(line)) {
          out.push({ kind: "p", text: chunk });
        }
      }
    }
  }
  return out;
}

function StudyReadableBody({ content }: { content: string }) {
  const blocks = segmentStudyContent(content);
  if (blocks.length === 0) {
    return <p className="meta">No text returned.</p>;
  }
  return (
    <div className="study-readable-prose">
      {blocks.map((block, i) =>
        block.kind === "p" ? (
          <p key={`p-${i}`}>{block.text}</p>
        ) : (
          <ul key={`ul-${i}`} className="study-bullet-list">
            {block.items.map((item, j) => (
              <li key={j}>{item}</li>
            ))}
          </ul>
        ),
      )}
    </div>
  );
}

function sortByPage<T extends { page?: number }>(items: T[]): T[] {
  return [...items].sort((a, b) => (a.page ?? 0) - (b.page ?? 0));
}

function fastApiDetail(details: unknown): string | undefined {
  if (!details || typeof details !== "object") {
    return undefined;
  }
  const d = details as { detail?: unknown };
  if (typeof d.detail === "string") {
    return d.detail;
  }
  return undefined;
}

function explainArtifactFailure(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 404) {
      return (
        "No study chunks on the server for this session (upload again if the backend data folder was cleared). " +
        "Re-upload your PDF on Upload, then Generate again."
      );
    }
    const detail = fastApiDetail(error.details);
    return `Artifacts request failed (HTTP ${error.status})${detail ? `: ${detail}` : ""}. Showing local fallback.`;
  }
  if (error instanceof TypeError || (error instanceof Error && /fetch|network|failed/i.test(error.message))) {
    return "Cannot reach the API. Confirm the backend is running on port 8000 and NEXT_PUBLIC_API_BASE_URL matches it, then restart Next.js.";
  }
  return "Artifacts endpoint unavailable; showing local fallback artifacts.";
}

function explainQaFailure(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 404) {
      return (
        "No study chunks on the server for this session. Re-upload your PDF on Upload, then try Q&A again."
      );
    }
    const detail = fastApiDetail(error.details);
    return `Q&A request failed (HTTP ${error.status})${detail ? `: ${detail}` : ""}. Showing local fallback.`;
  }
  if (error instanceof TypeError || (error instanceof Error && /fetch|network|failed/i.test(error.message))) {
    return "Cannot reach the API for grounded Q&A. Check backend on :8000 and env URL.";
  }
  return "Grounded QA endpoint unavailable; showing local citation-based fallback.";
}

function localArtifacts(filename: string): StudyArtifactsResponse {
  return {
    session_id: "local-demo",
    artifact_type: "summary",
    content: `Local study summary for ${filename}: key ideas are grouped by topic with emphasis on exam-style concepts.`,
    citations: [],
    warning: "Backend study artifacts endpoint unavailable; showing local fallback.",
  };
}

function localAnswer(question: string, citations: StudyCitation[]): StudyQaResponse {
  return {
    answer: `Local grounded answer: based on uploaded snippets, "${question}" maps to core objectives and definitions in your selected document.`,
    citations: citations.slice(0, 2),
  };
}

export default function StudyWorkspacePage() {
  const [documents, setDocuments] = useState<UploadedDocument[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [activeArtifact, setActiveArtifact] = useState<StudyArtifactsResponse["artifact_type"]>("summary");
  const [artifacts, setArtifacts] = useState<StudyArtifactsResponse | null>(null);
  const [qaQuestion, setQaQuestion] = useState("");
  const [qaResponse, setQaResponse] = useState<StudyQaResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const docs = appStorage.loadDocuments();
    setDocuments(docs);
    if (docs[0]) {
      setSelectedId(docs[0].document_id);
    }
  }, []);

  const selected = useMemo(() => documents.find((document) => document.document_id === selectedId) ?? null, [documents, selectedId]);
  const selectedSnippets = selected?.snippets ?? artifacts?.citations ?? [];

  async function handleGenerateArtifacts() {
    if (!selected) {
      return;
    }
    if (!selected.session_id) {
      setArtifacts(localArtifacts(selected.filename));
      setError("Selected document is local-only; generated deterministic local artifacts.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await apiClient.generateStudyArtifacts(selected.session_id, activeArtifact);
      setArtifacts(result);
    } catch (error) {
      setArtifacts(localArtifacts(selected.filename));
      setError(explainArtifactFailure(error));
    } finally {
      setBusy(false);
    }
  }

  async function handleQuestion(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected || !qaQuestion.trim()) {
      return;
    }
    if (!selected.session_id) {
      setQaResponse(localAnswer(qaQuestion.trim(), selected.snippets ?? []));
      setError("Selected document is local-only; grounded answers are using local citations.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const response = await apiClient.askGroundedQuestion({
        question: qaQuestion.trim(),
        session_id: selected.session_id,
        top_k: 14,
      });
      setQaResponse(response);
    } catch (error) {
      setQaResponse(localAnswer(qaQuestion.trim(), selected.snippets ?? []));
      setError(explainQaFailure(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="stack notebook-page study-workspace">
      <h1>Study Workspace</h1>
      <p className="meta">
        Notebook-style grounded workspace: choose a source, build study artifacts, then ask questions that cite your uploaded material.
      </p>

      {documents.length === 0 ? (
        <p className="empty-state">No documents found. Upload PDFs first to open the study workspace.</p>
      ) : (
        <div className="notebook-shell study-workspace-grid">
          <aside className="notebook-column card study-column">
            <div className="panel-title-row study-column-head">
              <h3>Sources</h3>
              <span className="badge muted">{documents.length} docs</span>
            </div>
            <div className="study-column-scroll">
              <ul className="list-reset source-list">
                {documents.map((document) => (
                  <li key={document.document_id}>
                    <button
                      className={`source-item ${selectedId === document.document_id ? "active" : ""}`}
                      onClick={() => setSelectedId(document.document_id)}
                    >
                      <span className="source-item-title">{document.filename}</span>
                      <span className="source-item-meta">
                        {document.status.replace("_", " ")}
                        {document.source_language ? ` • ${document.source_language}` : ""}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
              {selected?.warning && <p className="meta source-warning">{selected.warning}</p>}
            </div>
          </aside>

          <article className="notebook-column card study-column study-column--studio">
            <div className="panel-title-row study-column-head">
              <h3>Studio</h3>
              <span className="meta filename-ellipsis">
                {selected ? `${selected.filename}${selected.session_id ? "" : " (local mode)"}` : "Select a source"}
              </span>
            </div>
            <div className="artifact-toolbar study-toolbar">
              {(Object.keys(artifactLabels) as StudyArtifactsResponse["artifact_type"][]).map((artifactType) => (
                <button
                  key={artifactType}
                  type="button"
                  className={`chip-button ${activeArtifact === artifactType ? "active" : ""}`}
                  onClick={() => setActiveArtifact(artifactType)}
                >
                  {artifactLabels[artifactType]}
                </button>
              ))}
              <button className="button button-primary" onClick={handleGenerateArtifacts} disabled={!selected || busy}>
                {busy ? "Working..." : "Generate"}
              </button>
            </div>
            <div className="study-column-scroll study-studio-scroll">
              {artifacts ? (
                <div className="artifact-output">
                  <div className="artifact-header">
                    <h4>{artifactLabels[artifacts.artifact_type]}</h4>
                    <span className="badge success">grounded</span>
                  </div>
                  <StudyReadableBody content={artifacts.content} />
                  {artifacts.warning && <p className="meta study-artifact-note">Note: {artifacts.warning}</p>}
                  <div className="citation-list study-citations-block">
                    <h4 className="citation-list-title">Sources (by page)</h4>
                    {sortByPage(artifacts.citations).map((citation) => (
                      <div className="citation" key={citation.id}>
                        <p>
                          <strong>{citation.section_title || "Excerpt"}</strong>
                          {citation.page ? ` · page ${citation.page}` : ""}
                        </p>
                        <p className="meta citation-snippet">{sanitizeStudyDisplayText(citation.excerpt)}</p>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="empty-state study-empty-pad">
                  Select an artifact mode and generate notes. The output stays tied to uploaded source chunks.
                </div>
              )}
            </div>
          </article>

          <aside className="notebook-column card study-column">
            <div className="panel-title-row study-column-head">
              <h3>Grounded Q&A</h3>
            </div>
            <form onSubmit={handleQuestion} className="stack study-qa-form">
              <label>
                Ask from selected sources
                <textarea
                  rows={4}
                  value={qaQuestion}
                  placeholder="What topics are most likely to be tested and why?"
                  onChange={(event) => setQaQuestion(event.target.value)}
                />
              </label>
              <button className="button button-primary" disabled={!selected || busy || !qaQuestion.trim()} type="submit">
                Answer with citations
              </button>
            </form>
            <div className="study-column-scroll study-qa-scroll">
              {qaResponse ? (
                <div className="qa-output">
                  <StudyReadableBody content={qaResponse.answer} />
                  {qaResponse.warning && <p className="meta study-artifact-note">Note: {qaResponse.warning}</p>}
                  <h4 className="citation-list-title">Linked citations</h4>
                  {sortByPage(qaResponse.citations || []).map((citation) => (
                    <div className="citation" key={citation.id}>
                      <p>
                        <strong>{citation.section_title || "Excerpt"}</strong>
                        {citation.page ? ` · page ${citation.page}` : ""}
                      </p>
                      <p className="meta citation-snippet">{sanitizeStudyDisplayText(citation.excerpt)}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="empty-state study-empty-pad">Ask a question to generate a grounded answer.</div>
              )}
              <div className="citation-list study-source-context">
                <h4 className="citation-list-title">Source context</h4>
                {selectedSnippets.length > 0 ? (
                  sortByPage(selectedSnippets)
                    .slice(0, 6)
                    .map((snippet) => (
                      <div className="citation" key={snippet.id}>
                        <p>
                          <strong>{snippet.section_title}</strong>
                          {snippet.page ? ` · page ${snippet.page}` : ""}
                        </p>
                        <p className="meta citation-snippet">{sanitizeStudyDisplayText(snippet.excerpt)}</p>
                      </div>
                    ))
                ) : (
                  <p className="meta">No extracted snippets yet for this source.</p>
                )}
              </div>
            </div>
          </aside>
        </div>
      )}

      {error && <p className="notice">{error}</p>}
    </section>
  );
}
