"use client";

import { ChangeEvent, DragEvent, useEffect, useState } from "react";
import { apiClient } from "@/lib/api/client";
import { StatusBadge } from "@/components/StatusBadge";
import { Spinner } from "@/components/Spinner";
import type { UploadedDocument } from "@/lib/api/types";
import { appStorage, buildLocalSnippets } from "@/lib/storage";

function onlyPdf(files: FileList | File[]): File[] {
  return Array.from(files).filter((file) => file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf"));
}

export default function UploadWorkspacePage() {
  const [documents, setDocuments] = useState<UploadedDocument[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    setDocuments(appStorage.loadDocuments());
  }, []);

  async function handleFiles(inputFiles: File[]) {
    if (!inputFiles.length) {
      setMessage("No PDF files found in selection. Only .pdf files are accepted.");
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
      setMessage(`${uploaded.length} file${uploaded.length > 1 ? "s" : ""} processed in local mode. Grounded artifacts and Q&A are still available.`);
    } else if (uploaded.some((doc) => Boolean(doc.warning))) {
      setMessage("Upload completed with warnings — see details below.");
    } else {
      setMessage(`${uploaded.length} file${uploaded.length > 1 ? "s" : ""} uploaded successfully.`);
    }
  }

  function onFilePickerChange(event: ChangeEvent<HTMLInputElement>) {
    if (!event.target.files) return;
    void handleFiles(onlyPdf(event.target.files));
  }

  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setIsDragOver(false);
    void handleFiles(onlyPdf(event.dataTransfer.files));
  }

  function onDragOver(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setIsDragOver(true);
  }

  function onDragLeave() {
    setIsDragOver(false);
  }

  function removeDocument(id: string) {
    const next = documents.filter((d) => d.document_id !== id);
    setDocuments(next);
    appStorage.saveDocuments(next);
  }

  return (
    <section className="stack">
      <h1>Upload Course Materials</h1>
      <p className="meta">Drag and drop PDFs here, or click to browse. Processing state is tracked per document.</p>

      <div
        className={`dropzone${isDragOver ? " dragover" : ""}`}
        onDrop={onDrop}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        role="region"
        aria-label="PDF drop zone"
      >
        <p>{isDragOver ? "Drop to upload…" : "Drop PDFs here, or use the file picker below."}</p>
        <input
          aria-label="Upload PDF files"
          type="file"
          accept=".pdf,application/pdf"
          multiple
          onChange={onFilePickerChange}
        />
      </div>

      {isUploading && (
        <p className="notice" role="status">
          <span className="button-inner">
            <Spinner size="sm" /> Uploading and processing — this may take a moment…
          </span>
        </p>
      )}
      {message && <p className="notice" role="status">{message}</p>}

      {documents.length === 0 ? (
        <p className="empty-state">No uploaded documents yet. Drop a PDF above to get started.</p>
      ) : (
        <div className="stack">
          <p className="meta">{documents.length} document{documents.length > 1 ? "s" : ""} in workspace</p>
          {documents.map((document) => (
            <article className="card" key={document.document_id}>
              <div className="doc-card-head">
                <h3>{document.filename}</h3>
                <button
                  type="button"
                  className="button button-ghost"
                  title="Remove from workspace"
                  aria-label={`Remove ${document.filename}`}
                  onClick={() => removeDocument(document.document_id)}
                >
                  ✕ Remove
                </button>
              </div>
              <div className="hero-actions">
                <StatusBadge value={document.status} />
                <span className="meta">
                  {document.source_language ? `Language: ${document.source_language}` : "Language detection pending"}
                </span>
              </div>
              {document.warning && <p className="meta">Note: {document.warning}</p>}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
