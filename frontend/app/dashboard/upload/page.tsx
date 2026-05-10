"use client";

import { ChangeEvent, DragEvent, useEffect, useState } from "react";
import { apiClient } from "@/lib/api/client";
import { StatusBadge } from "@/components/StatusBadge";
import type { UploadedDocument } from "@/lib/api/types";
import { appStorage, buildLocalSnippets } from "@/lib/storage";

function onlyPdf(files: FileList | File[]): File[] {
  return Array.from(files).filter((file) => file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf"));
}

export default function UploadWorkspacePage() {
  const [documents, setDocuments] = useState<UploadedDocument[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [message, setMessage] = useState<{ text: string; type: "success" | "error" | "info" } | null>(null);
  const [dragActive, setDragActive] = useState(false);

  useEffect(() => {
    setDocuments(appStorage.loadDocuments());
  }, []);

  async function handleFiles(inputFiles: File[]) {
    if (!inputFiles.length) {
      setMessage({ text: "Select PDF files only.", type: "error" });
      return;
    }

    setIsUploading(true);
    setMessage(null);

    const uploaded = await apiClient.uploadDocuments(inputFiles);
    const merged = [...uploaded, ...documents].map((doc) => ({
      ...doc,
      snippets: doc.snippets && doc.snippets.length > 0 ? doc.snippets : buildLocalSnippets(doc),
    }));

    setDocuments(merged);
    appStorage.saveDocuments(merged);
    setIsUploading(false);

    if (uploaded.some((doc) => doc.status === "local_only")) {
      setMessage({ text: "Upload processed in local mode. Grounded artifacts will use local data.", type: "info" });
    } else if (uploaded.some((doc) => Boolean(doc.warning))) {
      setMessage({ text: "Upload completed with warnings.", type: "info" });
    } else {
      setMessage({ text: "Upload successful. Materials are ready for study.", type: "success" });
    }
  }

  function onFilePickerChange(event: ChangeEvent<HTMLInputElement>) {
    if (!event.target.files) return;
    void handleFiles(onlyPdf(event.target.files));
  }

  function onDragOver(e: DragEvent) {
    e.preventDefault();
    setDragActive(true);
  }

  function onDragLeave() {
    setDragActive(false);
  }

  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragActive(false);
    void handleFiles(onlyPdf(event.dataTransfer.files));
  }

  return (
    <section className="stack fade-in">
      <header style={{ marginBottom: "1rem" }}>
        <h1>Course Materials</h1>
        <p className="meta">Upload syllabi, notes, or slides (PDF only) to power the Study Workspace.</p>
      </header>

      <div 
        className="dropzone" 
        onDrop={onDrop} 
        onDragOver={onDragOver} 
        onDragLeave={onDragLeave}
        style={{ 
          borderColor: dragActive ? "var(--accent-primary)" : "rgba(255,255,255,0.2)",
          background: dragActive ? "rgba(168,85,247,0.05)" : "rgba(255,255,255,0.02)",
          transform: dragActive ? "scale(1.02)" : "scale(1)"
        }}
      >
        <div style={{ fontSize: "3rem", marginBottom: "1rem", color: dragActive ? "var(--accent-primary)" : "var(--text-secondary)", transition: "color 0.2s" }}>
          📄
        </div>
        <h3 style={{ marginBottom: "0.5rem" }}>{dragActive ? "Drop PDFs here" : "Drag & drop PDFs here"}</h3>
        <p className="meta" style={{ marginBottom: "1.5rem" }}>or click to browse your files</p>
        
        <input id="pdf-upload" type="file" accept=".pdf,application/pdf" multiple onChange={onFilePickerChange} style={{ display: "none" }} />
        <label htmlFor="pdf-upload" className="button button-secondary" style={{ cursor: "pointer", pointerEvents: isUploading ? "none" : "auto" }}>
          {isUploading ? "Uploading..." : "Browse Files"}
        </label>
      </div>

      {message && (
        <div className={`notice ${message.type === 'error' ? 'error' : ''}`} style={{ 
          background: message.type === 'success' ? 'rgba(16, 185, 129, 0.1)' : undefined,
          borderColor: message.type === 'success' ? 'rgba(16, 185, 129, 0.3)' : undefined,
          color: message.type === 'success' ? '#34d399' : undefined
        }}>
          {message.text}
        </div>
      )}

      <h2 style={{ marginTop: "2rem", marginBottom: "1rem" }}>Your Materials</h2>

      {documents.length === 0 ? (
        <div className="empty-state">
          <p>No documents uploaded yet. Add some to start studying.</p>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: "1.5rem" }}>
          {documents.map((document) => (
            <article className="card" key={document.document_id}>
              <h3 style={{ fontSize: "1.1rem", marginBottom: "1rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {document.filename}
              </h3>
              <div className="row" style={{ justifyContent: "space-between" }}>
                <StatusBadge value={document.status} />
                <span className="meta" style={{ fontSize: "0.8rem" }}>
                  {document.source_language ? `Lang: ${document.source_language}` : "Detecting..."}
                </span>
              </div>
              {document.warning && (
                <p className="meta" style={{ marginTop: "1rem", fontSize: "0.8rem", color: "var(--warning)" }}>
                  ⚠ {document.warning}
                </p>
              )}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
