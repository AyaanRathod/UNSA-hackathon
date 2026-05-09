"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { apiClient } from "@/lib/api/client";
import type { StudyArtifactsResponse, StudyCitation, StudyQaResponse, UploadedDocument } from "@/lib/api/types";
import { appStorage } from "@/lib/storage";

const artifactLabels: Record<StudyArtifactsResponse["artifact_type"], string> = {
  summary: "Summary",
  concept_breakdown: "Concepts",
  glossary: "Glossary",
  self_test: "Self-test",
  study_guide: "Study guide",
};

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
    } catch {
      setArtifacts(localArtifacts(selected.filename));
      setError("Artifacts endpoint unavailable; showing local fallback artifacts.");
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
      const response = await apiClient.askGroundedQuestion({ question: qaQuestion.trim(), session_id: selected.session_id });
      setQaResponse(response);
    } catch {
      setQaResponse(localAnswer(qaQuestion.trim(), selected.snippets ?? []));
      setError("Grounded QA endpoint unavailable; showing local citation-based fallback.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="stack notebook-page">
      <h1>Study Workspace</h1>
      <p className="meta">
        Notebook-style grounded workspace: choose a source, build study artifacts, then ask questions that cite your uploaded material.
      </p>

      {documents.length === 0 ? (
        <p className="empty-state">No documents found. Upload PDFs first to open the study workspace.</p>
      ) : (
        <div className="notebook-shell">
          <aside className="notebook-column card">
            <div className="panel-title-row">
              <h3>Sources</h3>
              <span className="badge muted">{documents.length} docs</span>
            </div>
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
          </aside>

          <article className="notebook-column card">
            <div className="panel-title-row">
              <h3>Studio</h3>
              <span className="meta">
                {selected ? `${selected.filename}${selected.session_id ? "" : " (local mode)"}` : "Select a source"}
              </span>
            </div>
            <div className="artifact-toolbar">
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
            {artifacts ? (
              <div className="artifact-output">
                <div className="artifact-header">
                  <h4>{artifactLabels[artifacts.artifact_type]}</h4>
                  {artifacts.warning ? <span className="badge warning">fallback</span> : <span className="badge success">grounded</span>}
                </div>
                <p>{artifacts.content}</p>
                {artifacts.warning && <p className="meta">Warning: {artifacts.warning}</p>}
                <div className="citation-list">
                  {artifacts.citations.map((citation) => (
                    <div className="citation" key={citation.id}>
                      <p>
                        <strong>{citation.section_title}</strong>
                        {citation.page ? ` (page ${citation.page})` : ""}
                      </p>
                      <p className="meta">{citation.excerpt}</p>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="empty-state">
                Select an artifact mode and generate notes. The output stays tied to uploaded source chunks.
              </div>
            )}
          </article>

          <aside className="notebook-column card">
            <h3>Grounded Q&A</h3>
            <form onSubmit={handleQuestion} className="stack">
              <label>
                Ask from selected sources
                <textarea
                  rows={5}
                  value={qaQuestion}
                  placeholder="What topics are most likely to be tested and why?"
                  onChange={(event) => setQaQuestion(event.target.value)}
                />
              </label>
              <button className="button button-primary" disabled={!selected || busy || !qaQuestion.trim()} type="submit">
                Answer with citations
              </button>
            </form>
            {qaResponse ? (
              <div className="qa-output">
                <p>{qaResponse.answer}</p>
                {qaResponse.warning && <p className="meta">Warning: {qaResponse.warning}</p>}
                <h4>Linked citations</h4>
                {(qaResponse.citations || []).map((citation) => (
                  <div className="citation" key={citation.id}>
                    <p>
                      <strong>{citation.section_title}</strong>
                      {citation.page ? ` (page ${citation.page})` : ""}
                    </p>
                    <p className="meta">{citation.excerpt}</p>
                  </div>
                ))}
              </div>
            ) : (
              <div className="empty-state">Ask a question to generate a grounded answer.</div>
            )}
            <div className="citation-list">
              <h4>Source context</h4>
              {selectedSnippets.length > 0 ? (
                selectedSnippets.slice(0, 4).map((snippet) => (
                  <div className="citation" key={snippet.id}>
                    <p>
                      <strong>{snippet.section_title}</strong>
                      {snippet.page ? ` (page ${snippet.page})` : ""}
                    </p>
                    <p className="meta">{snippet.excerpt}</p>
                  </div>
                ))
              ) : (
                <p className="meta">No extracted snippets yet for this source.</p>
              )}
            </div>
          </aside>
        </div>
      )}

      {error && <p className="notice">{error}</p>}
    </section>
  );
}
