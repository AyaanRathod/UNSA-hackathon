import type {
  AnalyzeProfileResponse,
  StudentProfileInput,
  StudyCitation,
  UploadedDocument,
} from "@/lib/api/types";

const PROFILE_KEY = "pathwise:lastProfile";
const ANALYSIS_KEY = "pathwise:lastAnalysis";
const DOCUMENTS_KEY = "pathwise:documents";

function safeParse<T>(value: string | null): T | null {
  if (!value) {
    return null;
  }
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

export const appStorage = {
  saveProfile(profile: StudentProfileInput): void {
    localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
  },
  loadProfile(): StudentProfileInput | null {
    return safeParse<StudentProfileInput>(localStorage.getItem(PROFILE_KEY));
  },
  saveAnalysis(analysis: AnalyzeProfileResponse): void {
    localStorage.setItem(ANALYSIS_KEY, JSON.stringify(analysis));
  },
  loadAnalysis(): AnalyzeProfileResponse | null {
    return safeParse<AnalyzeProfileResponse>(localStorage.getItem(ANALYSIS_KEY));
  },
  saveDocuments(documents: UploadedDocument[]): void {
    localStorage.setItem(DOCUMENTS_KEY, JSON.stringify(documents));
  },
  loadDocuments(): UploadedDocument[] {
    return safeParse<UploadedDocument[]>(localStorage.getItem(DOCUMENTS_KEY)) ?? [];
  },
};

export function buildLocalSnippets(document: UploadedDocument): StudyCitation[] {
  return [
    {
      id: `${document.document_id}-snippet-1`,
      document_id: document.document_id,
      section_title: "Learning objectives",
      excerpt: `Core concepts extracted from ${document.filename} with local fallback processing.`,
      page: 1,
      language: document.source_language || "unknown",
    },
    {
      id: `${document.document_id}-snippet-2`,
      document_id: document.document_id,
      section_title: "Key definitions",
      excerpt: "Terminology and formula highlights are organized to support exam prep.",
      page: 2,
      language: "en",
    },
  ];
}
