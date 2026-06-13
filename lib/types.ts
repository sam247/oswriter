export type JobStatus = "queued" | "processing" | "generated" | "needs_review" | "failed";
export type PipelineStageName = "research" | "outline" | "generation" | "save" | "editor" | "validation" | "export";
export type PipelineStatus = "idle" | "running" | "done" | "failed" | "skipped";
export type StyleProfile = "standard" | "technical" | "developer" | "homeowner" | "commercial" | "authority" | "local-seo";

export interface ContentControls {
  includeTldr: boolean;
  includeFaq: boolean;
  runEditor: boolean;
  styleProfile: StyleProfile;
  targetTone: string;
  lengthTargetWords: number;
}

export interface ProjectDocument {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

export interface SettingsDocument {
  projectId: string;
  controls: ContentControls;
  staleProcessingMinutes: number;
}

export interface PipelineStep {
  stage: PipelineStageName;
  status: PipelineStatus;
  startedAt?: string;
  completedAt?: string;
  durationMs?: number;
  message?: string;
  error?: string;
  meta?: Record<string, unknown>;
}

export interface ArticleTiming {
  queued_at?: string;
  started_at?: string;
  research_started_at?: string;
  research_completed_at?: string;
  generation_started_at?: string;
  generation_completed_at?: string;
  validation_started_at?: string;
  validation_completed_at?: string;
  save_started_at?: string;
  save_completed_at?: string;
  generated_at?: string;
  visible_at?: string;
  completed_at?: string;
}

export interface QueueJob {
  id: string;
  projectId: string;
  articleId: string;
  title: string;
  status: JobStatus;
  createdAt: string;
  updatedAt: string;
  attempts: number;
  needsReviewReasons: string[];
  fatalError?: string;
  pipeline: PipelineStep[];
  timings?: ArticleTiming;
}

export interface ResearchSource {
  id: string;
  title: string;
  url: string;
  domain: string;
  text?: string;
  summary?: string;
  highlights: string[];
  authorityScore: number;
  relevanceScore: number;
  accepted: boolean;
  rejectionReason?: string;
}

export interface ResearchPack {
  articleId: string;
  title: string;
  queries: string[];
  sources: ResearchSource[];
  rejectedSources: ResearchSource[];
  usefulFacts: string[];
  rejectedFacts: string[];
  questionsFound: string[];
  headingsFound: string[];
  authorityScore: number;
  relevanceScore: number;
  confidence: number;
  warnings: string[];
  requestIds: string[];
  durationMs: number;
  createdAt: string;
}

export interface ValidationResult {
  pass: boolean;
  warnings: string[];
  needsReviewReasons: string[];
  qualityScore: number;
  sectionScores: Record<string, number>;
  faqScore: number;
  seoScore: number;
}

export interface ArticleDocument {
  id: string;
  projectId: string;
  jobId: string;
  title: string;
  status: JobStatus;
  markdown: string;
  createdAt: string;
  updatedAt: string;
  wordCount: number;
  qualityScore: number;
  researchSummary: string;
  validation: ValidationResult;
  pipeline: PipelineStep[];
  sources: ResearchSource[];
  needsReviewReasons: string[];
  timings?: ArticleTiming;
}

export interface DebugEvent {
  at: string;
  stage: PipelineStageName | "queue";
  level: "info" | "warn" | "error";
  message: string;
  data?: unknown;
}

export interface DebugDocument {
  articleId: string;
  jobId: string;
  events: DebugEvent[];
  updatedAt: string;
}

export interface WorkerLeaseDocument {
  id: string;
  owner: string;
  token: string;
  acquiredAt: string;
  expiresAt: string;
}

export interface AppState {
  project: ProjectDocument;
  settings: SettingsDocument;
  jobs: QueueJob[];
  articles: ArticleDocument[];
}

export interface SearchResult {
  title: string;
  url: string;
  text?: string;
  summary?: string;
  highlights?: string[];
  requestId?: string;
}

export interface SearchAdapter {
  search(query: string, options: { numResults: number; includeDomains?: string[]; excludeDomains?: string[] }): Promise<{ results: SearchResult[]; requestId?: string }>;
}

export interface ModelAdapter {
  generateArticle(input: ArticleGenerationInput): Promise<string>;
  editArticle(input: EditorInput): Promise<string>;
  validateArticle(input: ValidationInput): Promise<ValidationResult>;
}

export interface ArticleGenerationInput {
  title: string;
  research: ResearchPack;
  controls: ContentControls;
}

export interface EditorInput {
  title: string;
  markdown: string;
  research: ResearchPack;
}

export interface ValidationInput {
  title: string;
  markdown: string;
  research: ResearchPack;
}
