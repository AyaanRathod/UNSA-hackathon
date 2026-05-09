export type EnjoymentValue = "liked" | "neutral" | "disliked";
export type RecommendationLabel = "safe" | "stretch" | "risky";
export type ConfidenceBadge = "high" | "medium" | "low";

export interface CompletedCourseInput {
  code: string;
  grade: number | string;
  confidence: number;
  enjoyment: EnjoymentValue;
  notes?: string;
  transfer?: boolean;
  counts_as?: string;
  repeat_attempt?: boolean;
}

export interface StudentProfileInput {
  student_id: string;
  completed_courses: CompletedCourseInput[];
  goals: string[];
  program_interest?: string;
  allowed_restriction_groups?: string[];
}

export interface TranscriptParseResponse {
  source_name: string;
  extracted_courses: CompletedCourseInput[];
  unparsed_lines: string[];
  warning?: string;
}

export interface RecommendationItem {
  course_code: string;
  title: string;
  score: number;
  label: RecommendationLabel;
  confidence_badge: ConfidenceBadge;
  why: string;
}

export interface CareerMatchItem {
  career_id: string;
  title: string;
  score: number;
  confidence_badge: ConfidenceBadge;
  why: string;
  recommended_courses: string[];
}

export interface AnalyzeProfileResponse {
  student_id: string;
  unknown_courses: string[];
  cluster_strengths: Record<string, number>;
  cluster_confidence_badges: Record<string, ConfidenceBadge>;
  recommendations: RecommendationItem[];
  career_matches: CareerMatchItem[];
  disclaimer: string;
}

export interface UploadedDocument {
  document_id: string;
  session_id?: string;
  filename: string;
  status: "queued" | "processing" | "ready" | "error" | "local_only";
  source_language?: string;
  derived_language?: string;
  warning?: string;
  snippets?: StudyCitation[];
}

export interface StudyCitation {
  id: string;
  document_id: string;
  section_title: string;
  excerpt: string;
  page?: number;
  language?: string;
  original_excerpt?: string;
}

export interface StudyArtifactsResponse {
  session_id: string;
  artifact_type: "summary" | "concept_breakdown" | "glossary" | "self_test" | "study_guide";
  content: string;
  citations: StudyCitation[];
  warning?: string;
}

export interface StudyQaResponse {
  session_id?: string;
  answer: string;
  citations: StudyCitation[];
  warning?: string;
}

export interface FrenchDemoResponse {
  original_text: string;
  original_language: "fr";
  translated_text: string;
  explanation: string;
  citations: StudyCitation[];
}
