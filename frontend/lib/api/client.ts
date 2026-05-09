import type {
  AnalyzeProfileResponse,
  FrenchDemoResponse,
  TranscriptParseResponse,
  StudentProfileInput,
  StudyCitation,
  StudyArtifactsResponse,
  StudyQaResponse,
  UploadedDocument,
} from "@/lib/api/types";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";

class ApiError extends Error {
  status: number;
  details?: unknown;

  constructor(message: string, status: number, details?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.details = details;
  }
}

interface RequestOptions {
  method?: "GET" | "POST";
  pathCandidates: string[];
  body?: unknown;
  formData?: FormData;
}

async function requestWithFallback<T>(options: RequestOptions): Promise<T> {
  const { method = "GET", pathCandidates, body, formData } = options;
  let lastError: Error | null = null;

  for (const path of pathCandidates) {
    try {
      const response = await fetch(`${API_BASE_URL}${path}`, {
        method,
        headers: formData ? undefined : { "Content-Type": "application/json" },
        body: formData ?? (body ? JSON.stringify(body) : undefined),
      });

      if (response.status === 404 || response.status === 405) {
        continue;
      }

      if (!response.ok) {
        let details: unknown;
        try {
          details = await response.json();
        } catch {
          details = await response.text();
        }
        throw new ApiError(`Request failed for ${path}`, response.status, details);
      }

      if (response.status === 204) {
        return {} as T;
      }

      return (await response.json()) as T;
    } catch (error) {
      lastError = error as Error;
    }
  }

  if (lastError) {
    throw lastError;
  }
  throw new ApiError("No matching backend endpoint is available.", 0);
}

export const endpointAliases = {
  analyzeProfile: ["/api/profile/analyze", "/api/analyze/profile"],
  parseTranscriptFile: ["/api/profile/parse-transcript"],
  parseTranscriptText: ["/api/profile/parse-transcript-text"],
  uploadDocuments: ["/api/study/ingest", "/api/study/upload", "/api/uploads"],
  generateArtifacts: ["/api/study/artifacts", "/api/study/generate"],
  askGroundedQuestion: ["/api/study/qa", "/api/study/question"],
  frenchDemo: ["/api/i18n/french-demo", "/api/study/french-demo"],
} as const;

interface BackendIngestResponse {
  session_id: string;
  source_filename: string;
  detected_lang: string;
  chunks_ingested: number;
  translation_applied: boolean;
  warnings: string[];
  chunk_ids: string[];
}

interface BackendCitation {
  chunk_id: string;
  source_filename: string;
  page?: number;
  section_title?: string;
  lang: string;
  quote: string;
}

interface BackendArtifactResponse {
  session_id: string;
  artifact_type: StudyArtifactsResponse["artifact_type"];
  content: string;
  citations?: BackendCitation[];
  warning?: string;
}

interface BackendQaResponse {
  session_id: string;
  answer: string;
  citations?: BackendCitation[];
  warning?: string;
}

function toSessionId(file: File, index: number): string {
  const base = file.name.replace(/[^a-zA-Z0-9]+/g, "-").replace(/(^-|-$)/g, "").toLowerCase();
  return `${base || "study-doc"}-${Date.now()}-${index}`;
}

function mapCitation(citation: BackendCitation, position: number): StudyCitation {
  return {
    id: `${citation.chunk_id}-${position}`,
    document_id: citation.source_filename,
    section_title: citation.section_title || "Study extract",
    excerpt: citation.quote,
    page: citation.page,
    language: citation.lang,
    original_excerpt: citation.quote,
  };
}

function toLocalOnlyDocuments(files: File[]): UploadedDocument[] {
  return files.map((file, index) => ({
    document_id: `${file.name}-${index}-${Date.now()}`,
    session_id: undefined,
    filename: file.name,
    status: "local_only",
    source_language: "unknown",
    derived_language: "en",
  }));
}

export const apiClient = {
  get baseUrl(): string {
    return API_BASE_URL;
  },

  async analyzeProfile(payload: StudentProfileInput): Promise<AnalyzeProfileResponse> {
    return requestWithFallback<AnalyzeProfileResponse>({
      method: "POST",
      pathCandidates: [...endpointAliases.analyzeProfile],
      body: payload,
    });
  },

  async parseTranscriptFile(file: File): Promise<TranscriptParseResponse> {
    const formData = new FormData();
    formData.append("file", file);
    return requestWithFallback<TranscriptParseResponse>({
      method: "POST",
      pathCandidates: [...endpointAliases.parseTranscriptFile],
      formData,
    });
  },

  async parseTranscriptText(rawText: string, sourceName?: string): Promise<TranscriptParseResponse> {
    return requestWithFallback<TranscriptParseResponse>({
      method: "POST",
      pathCandidates: [...endpointAliases.parseTranscriptText],
      body: { raw_text: rawText, source_name: sourceName },
    });
  },

  async uploadDocuments(files: File[]): Promise<UploadedDocument[]> {
    try {
      const uploads = await Promise.all(
        files.map(async (file, index) => {
          const sessionId = toSessionId(file, index);
          const formData = new FormData();
          formData.append("session_id", sessionId);
          formData.append("file", file);
          const response = await requestWithFallback<BackendIngestResponse>({
            method: "POST",
            pathCandidates: [...endpointAliases.uploadDocuments],
            formData,
          });
          return {
            document_id: response.chunk_ids[0] || `${response.session_id}-${index}`,
            session_id: response.session_id,
            filename: response.source_filename,
            status: "ready" as const,
            source_language: response.detected_lang,
            derived_language: response.translation_applied ? "en" : response.detected_lang,
            warning: response.warnings.join(" | ") || undefined,
          };
        }),
      );
      return uploads;
    } catch {
      return toLocalOnlyDocuments(files);
    }
  },

  async generateStudyArtifacts(
    sessionId: string,
    artifactType: StudyArtifactsResponse["artifact_type"] = "summary",
  ): Promise<StudyArtifactsResponse> {
    const response = await requestWithFallback<BackendArtifactResponse>({
      method: "POST",
      pathCandidates: [...endpointAliases.generateArtifacts],
      body: { session_id: sessionId, artifact_type: artifactType },
    });
    return {
      session_id: response.session_id,
      artifact_type: response.artifact_type,
      content: response.content,
      citations: (response.citations || []).map(mapCitation),
      warning: response.warning,
    };
  },

  async askGroundedQuestion(payload: { question: string; session_id: string }): Promise<StudyQaResponse> {
    const response = await requestWithFallback<BackendQaResponse>({
      method: "POST",
      pathCandidates: [...endpointAliases.askGroundedQuestion],
      body: payload,
    });
    return {
      session_id: response.session_id,
      answer: response.answer,
      citations: (response.citations || []).map(mapCitation),
      warning: response.warning,
    };
  },

  async fetchFrenchDemo(): Promise<FrenchDemoResponse> {
    return requestWithFallback<FrenchDemoResponse>({
      pathCandidates: [...endpointAliases.frenchDemo],
    });
  },
};

export { ApiError };
