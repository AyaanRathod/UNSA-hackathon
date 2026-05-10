"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { apiClient, ApiError } from "@/lib/api/client";
import type { StudyArtifactsResponse, StudyCitation, StudyQaResponse, UploadedDocument } from "@/lib/api/types";
import { appStorage } from "@/lib/storage";
import ReactMarkdown from "react-markdown";

const studyModes = [
  { id: "summary", label: "Summary", type: "summary", desc: "Read a condensed overview." },
  { id: "feynman", label: "Feynman Mode", type: "concept_breakdown", desc: "Complex concepts explained simply." },
  { id: "flashcards", label: "Flashcards", type: "glossary", desc: "Test definitions with flip cards." },
  { id: "active_recall", label: "Active Recall", type: "self_test", desc: "Question & answer workout." },
  { id: "blurting", label: "Blurting", type: "summary", desc: "Write what you know, then check." },
] as const;

function sanitizeStudyDisplayText(raw: string): string {
  return raw.replace(/\[[^\]]*chk_[a-f0-9]+[^\]]*\]\s*\([^)]*\)\s*/gi, "").replace(/\[[^\]]*internal[^\]]*chk_[a-f0-9]+[^\]]*\]\s*/gi, "").replace(/\uFFFD/g, "").replace(/[\uF020-\uF0FF]/g, "• ");
}

function parseGlossaryToFlashcards(content: string) {
  const cards: { term: string; def: string }[] = [];
  const lines = content.split('\n');
  let currentTerm = "";
  let currentDef = "";

  for (const line of lines) {
    const match = line.match(/^\*\*(.*?)\*\*:?\s*(.*)/) || line.match(/^-\s*\*\*(.*?)\*\*:?\s*(.*)/);
    if (match) {
      if (currentTerm) cards.push({ term: currentTerm, def: currentDef.trim() });
      currentTerm = match[1].trim();
      currentDef = match[2].trim();
    } else if (currentTerm && line.trim()) {
      currentDef += " " + line.trim();
    }
  }
  if (currentTerm) cards.push({ term: currentTerm, def: currentDef.trim() });
  return cards;
}

export default function StudyWorkspacePage() {
  const [documents, setDocuments] = useState<UploadedDocument[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [activeMode, setActiveMode] = useState<typeof studyModes[number]["id"]>("summary");
  
  const [artifacts, setArtifacts] = useState<Record<string, StudyArtifactsResponse>>({});
  const [qaQuestion, setQaQuestion] = useState("");
  const [qaResponse, setQaResponse] = useState<StudyQaResponse | null>(null);
  
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Blurting state
  const [blurtText, setBlurtText] = useState("");
  const [blurtFeedback, setBlurtFeedback] = useState("");
  const [blurtScore, setBlurtScore] = useState<number | null>(null);
  const [evaluatingBlurt, setEvaluatingBlurt] = useState(false);

  // Flashcard state
  const [cardIndex, setCardIndex] = useState(0);
  const [cardFlipped, setCardFlipped] = useState(false);

  useEffect(() => {
    const docs = appStorage.loadDocuments();
    setDocuments(docs);
    if (docs.length) setSelectedId(docs[0].document_id);
  }, []);

  const selected = useMemo(() => documents.find(d => d.document_id === selectedId) || null, [documents, selectedId]);
  const currentModeConfig = studyModes.find(m => m.id === activeMode)!;
  const currentArtifact = artifacts[`${selectedId}-${currentModeConfig.type}`];

  async function handleGenerate() {
    if (!selected || !selected.session_id) return;
    setBusy(true); setError(null);
    try {
      const result = await apiClient.generateStudyArtifacts(selected.session_id, currentModeConfig.type as any);
      setArtifacts(prev => ({ ...prev, [`${selectedId}-${currentModeConfig.type}`]: result }));
      setCardIndex(0); setCardFlipped(false); 
      setBlurtFeedback(""); setBlurtScore(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate artifact.");
    } finally {
      setBusy(false);
    }
  }

  async function handleQuestion(e: FormEvent) {
    e.preventDefault();
    if (!selected?.session_id || !qaQuestion.trim()) return;
    setBusy(true); setError(null);
    try {
      const res = await apiClient.askGroundedQuestion({ question: qaQuestion.trim(), session_id: selected.session_id });
      setQaResponse(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to answer question.");
    } finally {
      setBusy(false);
    }
  }

  async function handleEvaluateBlurt() {
    if (!selected?.session_id || !blurtText.trim()) return;
    setEvaluatingBlurt(true); setError(null);
    try {
      const res = await apiClient.evaluateBlurt({ blurt_text: blurtText.trim(), session_id: selected.session_id });
      setBlurtFeedback(res.feedback);
      setBlurtScore(res.score);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to evaluate blurt.");
    } finally {
      setEvaluatingBlurt(false);
    }
  }

  const flashcards = useMemo(() => {
    if (activeMode !== "flashcards" || !currentArtifact) return [];
    return parseGlossaryToFlashcards(currentArtifact.content);
  }, [activeMode, currentArtifact]);

  return (
    <section className="stack fade-in">
      <header style={{ marginBottom: "1rem" }}>
        <h1>Study Workspace</h1>
        <p className="meta">Turn your materials into active recall sessions, powered by IBM watsonx.</p>
      </header>

      {documents.length === 0 ? (
        <div className="empty-state">
          <p>Upload PDFs to enable the Study Workspace.</p>
        </div>
      ) : (
        <div className="app-layout" style={{ minHeight: "auto", flexDirection: "row", gap: "2rem", flexWrap: "wrap" }}>
          
          {/* Source Selection Panel */}
          <aside style={{ flex: "1 1 250px", minWidth: "250px", display: "flex", flexDirection: "column", gap: "1rem" }}>
            <div className="card stack" style={{ padding: "1rem" }}>
              <h4 style={{ marginBottom: "0.5rem" }}>Sources</h4>
              <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", maxHeight: "300px", overflowY: "auto" }}>
                {documents.map(doc => (
                  <button 
                    key={doc.document_id} 
                    onClick={() => { setSelectedId(doc.document_id); setBlurtFeedback(""); setBlurtScore(null); setCardIndex(0); setCardFlipped(false); }}
                    style={{
                      padding: "0.75rem", textAlign: "left", background: selectedId === doc.document_id ? "var(--accent-secondary)" : "rgba(255,255,255,0.05)",
                      border: "none", borderRadius: "8px", color: "white", cursor: "pointer", transition: "all 0.2s"
                    }}
                  >
                    <div style={{ fontWeight: 600, fontSize: "0.9rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{doc.filename}</div>
                    <div className="meta" style={{ fontSize: "0.75rem", color: selectedId === doc.document_id ? "#e9d5ff" : "var(--text-secondary)" }}>{doc.status}</div>
                  </button>
                ))}
              </div>
            </div>

            <div className="card stack" style={{ padding: "1rem" }}>
              <h4 style={{ marginBottom: "0.5rem" }}>Ask Document</h4>
              <form onSubmit={handleQuestion} className="stack" style={{ gap: "0.5rem" }}>
                <textarea 
                  rows={3} 
                  placeholder="e.g. What are the key formulas?" 
                  value={qaQuestion} 
                  onChange={e => setQaQuestion(e.target.value)} 
                  style={{ fontSize: "0.9rem", padding: "0.5rem" }}
                />
                <button className="button button-primary" type="submit" disabled={busy || !qaQuestion.trim()}>Ask</button>
              </form>
              {qaResponse && (
                <div style={{ marginTop: "1rem", padding: "1rem", background: "rgba(168,85,247,0.1)", borderRadius: "8px", border: "1px solid rgba(168,85,247,0.3)", fontSize: "0.9rem" }}>
                  <p>{sanitizeStudyDisplayText(qaResponse.answer)}</p>
                </div>
              )}
            </div>
          </aside>

          {/* Main Studio Panel */}
          <main className="card" style={{ flex: "3 1 600px", minWidth: "300px", minHeight: "600px", display: "flex", flexDirection: "column" }}>
            
            {/* Mode Selector */}
            <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", marginBottom: "1.5rem", borderBottom: "1px solid var(--card-border)", paddingBottom: "1.5rem" }}>
              {studyModes.map(mode => (
                <button
                  key={mode.id}
                  onClick={() => { setActiveMode(mode.id as any); setBlurtFeedback(""); setBlurtScore(null); setCardIndex(0); setCardFlipped(false); }}
                  className={`button ${activeMode === mode.id ? "button-primary" : "button-secondary"}`}
                  style={{ borderRadius: "20px", padding: "0.5rem 1rem", fontSize: "0.85rem" }}
                >
                  {mode.label}
                </button>
              ))}
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem" }}>
              <div>
                <h2 style={{ fontSize: "1.5rem", marginBottom: "0.25rem" }}>{currentModeConfig.label}</h2>
                <p className="meta">{currentModeConfig.desc}</p>
              </div>
              {!currentArtifact && (
                <button className="button button-primary" onClick={handleGenerate} disabled={busy || !selected?.session_id}>
                  {busy ? "Generating..." : `Generate ${currentModeConfig.label}`}
                </button>
              )}
            </div>

            {error && <div className="error">{error}</div>}

            <div style={{ flex: 1, overflowY: "auto", paddingRight: "1rem" }}>
              {!currentArtifact && !busy && (
                <div className="empty-state">
                  <p>Click Generate to create AI content for this mode based on your document.</p>
                </div>
              )}

              {busy && (
                <div className="empty-state" style={{ animation: "pulse 2s infinite" }}>
                  <p>Analyzing document and generating content...</p>
                </div>
              )}

              {currentArtifact && !busy && (
                <>
                  {/* TEXT MODES (Summary, Active Recall, Feynman) */}
                  {(activeMode === "summary" || activeMode === "feynman" || activeMode === "active_recall") && (
                    <div style={{ color: "#e2e8f0", lineHeight: 1.7, fontSize: "1.05rem" }}>
                      <ReactMarkdown>{sanitizeStudyDisplayText(currentArtifact.content)}</ReactMarkdown>
                    </div>
                  )}

                  {/* FLASHCARDS MODE */}
                  {activeMode === "flashcards" && (
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", height: "100%", justifyContent: "center" }}>
                      {flashcards.length === 0 ? (
                        <p className="meta">Could not parse flashcards from generated glossary.</p>
                      ) : (
                        <>
                          <p className="meta" style={{ marginBottom: "1rem" }}>Card {cardIndex + 1} of {flashcards.length}</p>
                          <div 
                            onClick={() => setCardFlipped(!cardFlipped)}
                            style={{ 
                              width: "100%", maxWidth: "500px", height: "300px", perspective: "1000px", cursor: "pointer"
                            }}
                          >
                            <div style={{ 
                              position: "relative", width: "100%", height: "100%", transition: "transform 0.6s", transformStyle: "preserve-3d",
                              transform: cardFlipped ? "rotateY(180deg)" : "rotateY(0deg)"
                            }}>
                              {/* Front */}
                              <div style={{ position: "absolute", width: "100%", height: "100%", backfaceVisibility: "hidden", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.2)", borderRadius: "16px", display: "flex", alignItems: "center", justifyContent: "center", padding: "2rem", textAlign: "center" }}>
                                <h3>{flashcards[cardIndex]?.term}</h3>
                              </div>
                              {/* Back */}
                              <div style={{ position: "absolute", width: "100%", height: "100%", backfaceVisibility: "hidden", background: "rgba(168,85,247,0.15)", border: "1px solid rgba(168,85,247,0.5)", borderRadius: "16px", display: "flex", alignItems: "center", justifyContent: "center", padding: "2rem", textAlign: "center", transform: "rotateY(180deg)" }}>
                                <p style={{ fontSize: "1.1rem" }}>{flashcards[cardIndex]?.def}</p>
                              </div>
                            </div>
                          </div>
                          <div className="row" style={{ marginTop: "2rem", gap: "1rem" }}>
                            <button className="button button-secondary" onClick={() => { setCardIndex(prev => Math.max(0, prev - 1)); setCardFlipped(false); }} disabled={cardIndex === 0}>Previous</button>
                            <button className="button button-primary" onClick={() => { setCardIndex(prev => Math.min(flashcards.length - 1, prev + 1)); setCardFlipped(false); }} disabled={cardIndex === flashcards.length - 1}>Next</button>
                          </div>
                        </>
                      )}
                    </div>
                  )}

                  {/* BLURTING MODE */}
                  {activeMode === "blurting" && (
                    <div className="stack" style={{ height: "100%" }}>
                      {!blurtFeedback ? (
                        <>
                          <div style={{ background: "rgba(245,158,11,0.1)", border: "1px solid rgba(245,158,11,0.3)", padding: "1rem", borderRadius: "8px", color: "#fbbf24" }}>
                            <strong>Rule:</strong> Write down everything you can remember about this document. Don't look at your notes!
                          </div>
                          <textarea 
                            style={{ flex: 1, minHeight: "300px", fontSize: "1.1rem", padding: "1.5rem" }} 
                            placeholder="Start typing..." 
                            value={blurtText} 
                            onChange={e => setBlurtText(e.target.value)}
                          />
                          <button className="button button-primary" onClick={handleEvaluateBlurt} style={{ alignSelf: "flex-end" }} disabled={evaluatingBlurt || !blurtText.trim()}>
                            {evaluatingBlurt ? "Evaluating..." : "Submit for AI Evaluation"}
                          </button>
                        </>
                      ) : (
                        <div style={{ display: "flex", gap: "1rem", height: "100%" }}>
                          <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
                            <h4>Your Blurt</h4>
                            <div style={{ flex: 1, background: "rgba(0,0,0,0.3)", padding: "1rem", borderRadius: "8px", whiteSpace: "pre-wrap", marginTop: "0.5rem", overflowY: "auto" }}>
                              {blurtText || "(You didn't write anything!)"}
                            </div>
                            <button className="button button-secondary" onClick={() => { setBlurtFeedback(""); setBlurtScore(null); setBlurtText(""); }} style={{ marginTop: "1rem" }}>
                              Try Again
                            </button>
                          </div>
                          <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                              <h4>AI Tutor Feedback</h4>
                              {blurtScore !== null && (
                                <span style={{ background: "rgba(16,185,129,0.15)", color: "#34d399", padding: "0.25rem 0.75rem", borderRadius: "99px", fontWeight: "bold" }}>
                                  Score: {blurtScore}/100
                                </span>
                              )}
                            </div>
                            <div style={{ flex: 1, background: "rgba(168,85,247,0.1)", padding: "1rem", borderRadius: "8px", marginTop: "0.5rem", overflowY: "auto" }}>
                              <ReactMarkdown>{blurtFeedback}</ReactMarkdown>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          </main>
        </div>
      )}
    </section>
  );
}
