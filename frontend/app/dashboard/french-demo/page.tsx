"use client";

import { useEffect, useState } from "react";
import { apiClient } from "@/lib/api/client";
import type { FrenchDemoResponse } from "@/lib/api/types";

const fallbackDemo: FrenchDemoResponse = {
  original_text:
    "Ce cours presente les structures de donnees fondamentales, avec un accent sur les tableaux, les listes chainees et les algorithmes de tri.",
  original_language: "fr",
  translated_text:
    "This course introduces fundamental data structures, with emphasis on arrays, linked lists, and sorting algorithms.",
  explanation:
    "French source text is retained for provenance while English translation is indexed for study artifact generation.",
  citations: [
    {
      id: "fr-demo-1",
      document_id: "fr-demo-doc",
      section_title: "Objectifs du cours",
      excerpt:
        "structures de donnees fondamentales ... algorithmes de tri",
      original_excerpt:
        "Ce cours presente les structures de donnees fondamentales...",
      page: 1,
      language: "fr",
    },
  ],
};

export default function FrenchDemoPage() {
  const [demo, setDemo] = useState<FrenchDemoResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const response = await apiClient.fetchFrenchDemo();
        setDemo(response);
      } catch {
        setDemo(fallbackDemo);
        setError("French demo endpoint unavailable; showing local multilingual linkage sample.");
      }
    }
    void load();
  }, []);

  if (!demo) {
    return <p className="notice">Loading multilingual demo...</p>;
  }

  return (
    <section className="stack">
      <h1>French-to-English Demo</h1>
      <p className="meta">
        This page demonstrates source linkage from French-origin content to English study output for retrieval and Q&A.
      </p>

      {error && <p className="notice">{error}</p>}

      <div className="dashboard-grid">
        <article className="card">
          <h3>Original source (French)</h3>
          <p>{demo.original_text}</p>
        </article>
        <article className="card">
          <h3>Derived study output (English)</h3>
          <p>{demo.translated_text}</p>
        </article>
      </div>

      <article className="card">
        <h3>Source linkage</h3>
        <p className="meta">{demo.explanation}</p>
        {demo.citations.map((citation) => (
          <div key={citation.id} className="citation">
            <p>
              <strong>{citation.section_title}</strong> ({citation.language})
            </p>
            <p className="meta">{citation.excerpt}</p>
            {citation.original_excerpt && <p className="meta">Original: {citation.original_excerpt}</p>}
          </div>
        ))}
      </article>
    </section>
  );
}
