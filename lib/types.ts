export type JobStatus = "queued" | "processing" | "generated" | "needs_review" | "failed" | "skipped";
export type QueueControlMode = "running" | "paused" | "stop_after_current" | "stopped";
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

export interface ProjectProfile {
  profileVersion: number;
  regionKey: string;
  regionLabel: string;
  industryKey: string;
  industryLabel: string;
  customIndustryLabel?: string;
  audienceKey: string;
  audienceLabel: string;
  defaultTargetWords: number;
}

export interface ProjectProfileSnapshot {
  profileVersion: number;
  region: string;
  regionLabel: string;
  industry: string;
  industryLabel: string;
  audience: string;
  audienceLabel: string;
  targetWords: number;
  regionAwarenessActive: boolean;
  industryAwarenessActive: boolean;
  audienceAwarenessActive: boolean;
}

export interface ProjectDocument {
  id: string;
  organisationId?: string;
  name: string;
  slug?: string;
  profile?: ProjectProfile;
  createdByUserId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface OrganisationDocument {
  id: string;
  name: string;
  slug: string;
  createdAt: string;
  updatedAt: string;
}

export interface DocumentVersion {
  id: string;
  organisationId: string;
  projectId: string;
  documentId: string;
  documentType: string;
  versionNumber: number;
  content: string;
  metadata: Record<string, unknown>;
  createdByUserId: string;
  createdAt: string;
}

export interface SettingsDocument {
  organisationId?: string;
  projectId: string;
  controls: ContentControls;
  staleProcessingMinutes: number;
}

export type AiProviderPreference = "platform_managed" | "bring_your_own_key";
export type PersonalApiKeyStatus = "not_configured" | "placeholder";

export interface WorkspacePreferencesDocument {
  organisationId?: string;
  userId?: string;
  account: {
    name: string;
    email: string;
    workspaceName: string;
  };
  notifications: {
    queueCompleted: boolean;
    queueCompletedWithWarnings: boolean;
    queueFailed: boolean;
    dailySummaryEmail: boolean;
    weeklySummaryEmail: boolean;
  };
  aiProvider: {
    preference: AiProviderPreference;
    personalKeyStatus: PersonalApiKeyStatus;
  };
  operational: {
    autoStartQueueOnAdd: boolean;
    confirmBeforeDeletingArticles: boolean;
    confirmBeforeDeletingProjects: boolean;
    defaultTargetWordCount: number;
    reuseProjectResearch: boolean;
    reuseTitleResearch: boolean;
  };
  createdAt: string;
  updatedAt: string;
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
  processing_at?: string;
  started_by?: "manual" | "worker" | "unknown";
  worker_first_seen_at?: string;
  worker_lease_requested_at?: string;
  worker_lease_acquired_at?: string;
  worker_lease_blocked_at?: string;
  research_started_at?: string;
  research_completed_at?: string;
  outline_started_at?: string;
  outline_completed_at?: string;
  generation_started_at?: string;
  generation_completed_at?: string;
  validation_started_at?: string;
  validation_completed_at?: string;
  save_started_at?: string;
  save_completed_at?: string;
  generated_at?: string;
  visible_at?: string;
  visible_context?: "state_observed_after_initial_load" | "article_selected" | "unknown";
  state_reconciled_at?: string;
  completed_at?: string;
}

export interface QueueJob {
  id: string;
  organisationId?: string;
  projectId: string;
  articleId: string;
  title: string;
  status: JobStatus;
  statusReason?: string | null;
  createdAt: string;
  updatedAt: string;
  createdByUserId?: string;
  attempts: number;
  queuePosition?: number;
  needsReviewReasons: string[];
  fatalError?: string;
  pipeline: PipelineStep[];
  timings?: ArticleTiming;
}

export interface QueueControlDocument {
  organisationId?: string;
  projectId: string;
  mode: QueueControlMode;
  requestedBy?: string | null;
  requestedAt?: string | null;
  stoppedAt?: string | null;
  reason?: string | null;
  updatedAt: string;
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

export interface ResearchFactSource {
  fact: string;
  sourceId: string;
  sourceUrl: string;
  sourceTitle: string;
}

export interface ResearchPack {
  id?: string;
  organisationId?: string;
  projectId?: string;
  articleId: string;
  jobId?: string;
  runNumber?: number;
  title: string;
  queries: string[];
  sources: ResearchSource[];
  rejectedSources: ResearchSource[];
  usefulFacts: string[];
  usefulFactSources?: ResearchFactSource[];
  rejectedFacts: string[];
  questionsFound: string[];
  headingsFound: string[];
  authorityScore: number;
  relevanceScore: number;
  confidence: number;
  warnings: string[];
  requestIds: string[];
  durationMs: number;
  exaSearchCalls?: number;
  exaContentCalls?: number;
  estimatedResearchCostUsd?: number;
  profileSnapshot?: ProjectProfileSnapshot | null;
  profileRelevanceScore?: number | null;
  createdAt: string;
}

export interface ResearchRun {
  id: string;
  organisationId: string;
  projectId: string;
  researchPackId?: string | null;
  articleId?: string | null;
  jobId?: string | null;
  runNumber: number;
  title: string;
  query?: string | null;
  queries: string[];
  status: "queued" | "running" | "completed" | "failed";
  confidence?: number | null;
  authorityScore?: number | null;
  relevanceScore?: number | null;
  warnings: string[];
  requestIds: string[];
  durationMs?: number | null;
  metadata: Record<string, unknown>;
  startedAt?: string | null;
  completedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ResearchFinding {
  id: string;
  organisationId: string;
  projectId: string;
  researchRunId: string;
  sourceId?: string | null;
  findingType: "useful_fact" | "rejected_fact" | "question" | "heading" | "summary";
  content: string;
  confidence?: number | null;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface SourceCitation {
  id: string;
  organisationId: string;
  projectId: string;
  researchRunId?: string | null;
  sourceId: string;
  findingId?: string | null;
  articleId?: string | null;
  citationType: string;
  snippet?: string | null;
  url: string;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface ValidationResult {
  pass: boolean;
  warnings: string[];
  needsReviewReasons: string[];
  qualityScore: number;
  sectionScores: Record<string, number>;
  profileRelevanceScore?: number | null;
  faqScore: number;
  seoScore: number;
}

export interface ArticleDocument {
  id: string;
  organisationId?: string;
  projectId: string;
  jobId: string;
  title: string;
  status: JobStatus;
  statusReason?: string | null;
  markdown: string;
  markdownBlobPath?: string | null;
  createdAt: string;
  updatedAt: string;
  createdByUserId?: string;
  currentVersionNumber?: number;
  versionedAt?: string | null;
  wordCount: number;
  targetWords?: number;
  profileSnapshot?: ProjectProfileSnapshot | null;
  profileRelevanceScore?: number | null;
  planningDiagnostics?: import("@/lib/generation/plan").PlanningDiagnostics | null;
  qualityScore: number;
  researchSummary: string;
  validation: ValidationResult;
  pipeline: PipelineStep[];
  sources: ResearchSource[];
  needsReviewReasons: string[];
  timings?: ArticleTiming;
}

export interface ModelGenerationResult {
  markdown: string;
  model?: string;
  inputTokens?: number;
  outputTokens?: number;
  finishReason?: string | null;
  estimatedAiCostUsd?: number;
}

export interface GenerationTelemetryDocument {
  id?: string;
  organisationId?: string;
  projectId: string;
  articleId: string;
  jobId?: string;
  createdByUserId?: string | null;
  model?: string | null;
  targetWords: number;
  actualWords: number;
  plannedSections: number;
  actualSections: number;
  plannedH2Count?: number;
  plannedH3Count?: number;
  expectedDepth?: import("@/lib/generation/plan").ExpectedDepth | string | null;
  actualH2Count?: number;
  actualH3Count?: number;
  actualDepth?: import("@/lib/generation/plan").ExpectedDepth | string | null;
  h2AchievementPercent?: number;
  h3AchievementPercent?: number;
  targetAchievementPercent?: number;
  plannerOutcome?: import("@/lib/generation/plan").PlannerOutcome | string | null;
  finishReason?: string | null;
  reviewStatus: JobStatus;
  profileVersion?: number | null;
  region?: string | null;
  industry?: string | null;
  audience?: string | null;
  profileRelevanceScore?: number | null;
  regionAwarenessActive?: boolean;
  industryAwarenessActive?: boolean;
  audienceAwarenessActive?: boolean;
  researchDurationMs?: number | null;
  sourcesDiscovered: number;
  sourcesAccepted: number;
  sourcesRejected: number;
  findingsExtracted: number;
  usefulFactsExtracted: number;
  citationsGenerated: number;
  inputTokens: number;
  outputTokens: number;
  researchTokens: number;
  generationTokens: number;
  estimatedAiCostUsd: number;
  exaSearchCalls: number;
  exaContentCalls: number;
  estimatedResearchCostUsd: number;
  totalCostUsd: number;
  generationDurationMs?: number | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export type TelemetryExportType = "article" | "daily_summary" | "anomaly";
export type TelemetryExportStatus = "pending" | "exported" | "failed";

export interface TelemetryExportStatusDocument {
  id: string;
  organisationId?: string;
  exportType: TelemetryExportType;
  projectId?: string | null;
  articleId?: string | null;
  exportKey: string;
  targetSheet: string;
  status: TelemetryExportStatus;
  attempts: number;
  lastError?: string | null;
  exportedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DebugEvent {
  at: string;
  stage: PipelineStageName | "queue";
  level: "info" | "warn" | "error";
  message: string;
  data?: unknown;
}

export interface DebugDocument {
  organisationId?: string;
  projectId?: string;
  articleId: string;
  jobId: string;
  events: DebugEvent[];
  updatedAt: string;
}

export interface WorkerLeaseDocument {
  organisationId?: string;
  projectId?: string;
  queueName?: string;
  id: string;
  owner: string;
  token: string;
  acquiredAt: string;
  expiresAt: string;
}

export interface AppState {
  project: ProjectDocument;
  projects?: ProjectDocument[];
  settings: SettingsDocument;
  preferences: WorkspacePreferencesDocument;
  queueControl: QueueControlDocument;
  jobs: QueueJob[];
  articles: ArticleDocument[];
}

export type GlobalSearchResultType = "project" | "article" | "research_run" | "research_finding" | "research_source";

export interface GlobalSearchResult {
  id: string;
  type: GlobalSearchResultType;
  title: string;
  subtitle?: string;
  projectId: string;
  articleId?: string | null;
  jobId?: string | null;
  url?: string | null;
  matchedText?: string | null;
  updatedAt?: string | null;
}

export interface GlobalSearchResponse {
  query: string;
  groups: Record<GlobalSearchResultType, GlobalSearchResult[]>;
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
  generateArticle(input: ArticleGenerationInput): Promise<string | ModelGenerationResult>;
  editArticle(input: EditorInput): Promise<string>;
  validateArticle(input: ValidationInput): Promise<ValidationResult>;
}

export interface ArticleGenerationInput {
  title: string;
  research: ResearchPack;
  controls: ContentControls;
  plan?: import("@/lib/generation/plan").ArticleGenerationPlan;
  profileSnapshot?: ProjectProfileSnapshot | null;
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
  controls?: ContentControls;
  targetWords?: number;
  profileSnapshot?: ProjectProfileSnapshot | null;
}
