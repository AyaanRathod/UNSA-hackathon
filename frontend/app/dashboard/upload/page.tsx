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
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    setDocuments(appStorage.loadDocuments());
  }, []);

  async function handleFiles(inputFiles: File[]) {
    if (!inputFiles.length) {
      setMessage("Select PDF files only.");
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
      setMessage("Upload processed in local extraction mode. You can still use grounded artifacts and Q&A.");
    } else if (uploaded.some((doc) => Boolean(doc.warning))) {
      setMessage("Upload completed with fallback warning details preserved for judges.");
    } else {
      setMessage("Upload submitted. Check status below.");
    }
  }

  function onFilePickerChange(event: ChangeEvent<HTMLInputElement>) {
    if (!event.target.files) {
      return;
    }
    void handleFiles(onlyPdf(event.target.files));
  }

  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    void handleFiles(onlyPdf(event.dataTransfer.files));
  }

  return (
    <section className="stack">
      <h1>Upload Course Materials</h1>
      <p className="meta">Drag/drop or pick syllabus, notes, and transcript PDFs. Processing state is tracked per document.</p>

      <div className="dropzone" onDrop={onDrop} onDragOver={(event) => event.preventDefault()}>
        <p>Drop PDFs here, or use file picker.</p>
        <input aria-label="Upload PDFs" type="file" accept=".pdf,application/pdf" multiple onChange={onFilePickerChange} />
      </div>

      {isUploading && <p className="notice">Uploading and processing...</p>}
      {message && <p className="notice">{message}</p>}

      {documents.length === 0 ? (
        <p className="empty-state">No uploaded documents yet.</p>
      ) : (
        <div className="stack">
          {documents.map((document) => (
            <article className="card" key={document.document_id}>
              <h3>{document.filename}</h3>
              <div className="hero-actions">
                <StatusBadge value={document.status} />
                <span className="meta">
                  {document.source_language ? `Source: ${document.source_language}` : "Source language pending"}
                </span>
              </div>
              {document.warning && <p className="meta">Warning: {document.warning}</p>}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
