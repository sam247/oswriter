"use client";

import { AlertCircle, ArrowDown, ArrowUp, Bold, CheckCircle2, ChevronsDown, ChevronsUp, ChevronDown, ChevronRight, Copy, Download, ExternalLink, FileArchive, FileCode, FileJson, FileText, Heading2, Heading3, Italic, Link as LinkIcon, List, ListOrdered, Loader2, PanelLeft, PanelRight, Pin, Play, RotateCw, Search, Settings, SkipForward, Sparkles, Trash2, Unlink, Upload } from "lucide-react";
import { type RefObject, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { UsageIndicator } from "@/components/usage/UsageIndicator";
import { SeoDecisionPanel } from "@/components/seo/SeoDecisionPanel";
import { KnowledgeBaseSettings } from "@/components/project/KnowledgeBaseSettings";
import { SourceFavicon } from "@/components/research/SourceFavicon";
import type { ProjectAnalytics } from "@/lib/analytics/project";
import type { ProjectAnalyticsSummary } from "@/lib/analytics/summary";
import { describePostGenerationAction, getArticlePublishingStatus } from "@/lib/publishing/status";
import { audienceOptionsForIndustry, defaultAudienceForIndustry, INDUSTRY_OPTIONS, normalizeProjectProfile, REGION_OPTIONS } from "@/lib/project/profile";
import type { QueueCostProjection } from "@/lib/queue/projection";
import { toArticleSummary } from "@/lib/articles/summary";
import { calculateArticleScores, type ArticleScore, type ArticleScores } from "@/lib/scoring/article-scores";
import type { AppState, ArticleDocument, ArticleSummary, DebugDocument, GlobalSearchResponse, GlobalSearchResult, GlobalSearchResultType, JobStatus, PostGenerationPublishingAction, ProjectDocument, ProjectProfile, ProjectWordPressConnection, PublishingScheduleIntervalUnit, PublishingSchedulePattern, PublishingWorkflowStatus, QueueControlMode, QueueJob, QueueStatus, ResearchPack, ResearchSource, WorkerHealthState, WorkerStatusSnapshot, WordPressConnectionStatus, WordPressPostStatus, WorkspacePreferencesDocument } from "@/lib/types";
import { cn } from "@/lib/utils";
import { isGlobalSearchShortcut } from "@/lib/ui/keyboard";
import { getSourceDisplayDomain, getSourceDisplayTitle, truncateSourceTitle } from "@/lib/ui/source-display";
import { CONTENT_PROFILES, PROJECT_CONTENT_PROFILE_OPTIONS, normalizeContentProfile, type ContentProfile } from "@/lib/content-profiles";

type Details = { research: ResearchPack | null; debug: DebugDocument | null };
type Filter = JobStatus | "all";
type InspectorTab = "project" | "pipeline" | "research" | "validation" | "seo" | "debug";
type FormatCommand = "bold" | "italic" | "link" | "unlink" | "h2" | "h3" | "bullet" | "numbered";
type ArticleViewMode = "rich" | "md" | "split";
type InventorySortKey = "quality" | "research" | "evidence" | "updated";
type SortDirection = "asc" | "desc";
type WorkspacePreferencePatch = {
  account?: Partial<WorkspacePreferencesDocument["account"]>;
  notifications?: Partial<WorkspacePreferencesDocument["notifications"]>;
  aiProvider?: Partial<WorkspacePreferencesDocument["aiProvider"]>;
  operational?: Partial<WorkspacePreferencesDocument["operational"]>;
};
type ProjectProfilePatch = Partial<ProjectProfile>;
type WordPressConnectionDraft = {
  siteUrl: string;
  username: string;
  applicationPassword: string;
  defaultPostStatus: WordPressPostStatus;
  defaultCategory: string;
};
type BulkPublishingAction = "publish_draft" | "publish_now" | "schedule";
type SelectionAction = BulkPublishingAction | "pin" | "unpin" | "delete" | "export_package";
type BulkPublishingProgress = {
  action: SelectionAction;
  completed: number;
  total: number;
  failed: number;
};
type UploadFeedbackState = {
  status: "idle" | "submitting" | "success" | "error";
  titleCount: number;
  durationMs: number | null;
  message: string | null;
};
type GenerateFeedbackState = {
  status: "idle" | "starting" | "success" | "error";
  title: string | null;
  durationMs: number | null;
  message: string | null;
};
type ScheduleFormState = {
  date: string;
  time: string;
  pattern: PublishingSchedulePattern;
  customIntervalValue: number;
  customIntervalUnit: PublishingScheduleIntervalUnit;
};
const POST_GENERATION_ACTION_OPTIONS: Array<{
  value: PostGenerationPublishingAction;
  label: string;
  description: string;
}> = [
  { value: "generate_only", label: "Generate Only", description: "Keep new articles as Not Published after generation." },
  { value: "publish_draft", label: "Generate + Publish Draft", description: "Send completed articles to WordPress as drafts." },
  { value: "publish_live", label: "Generate + Publish Now", description: "Publish completed articles to WordPress immediately." }
];
const BULK_PUBLISHING_ACTION_OPTIONS: Array<{ value: BulkPublishingAction; label: string }> = [
  { value: "publish_draft", label: "Publish Draft" },
  { value: "publish_now", label: "Publish Now" },
  { value: "schedule", label: "Schedule" }
];
const SELECTION_ACTION_OPTIONS: Array<{ value: SelectionAction; label: string }> = [
  { value: "export_package", label: "Export" },
  { value: "publish_draft", label: "Publish Draft" },
  { value: "publish_now", label: "Publish Now" },
  { value: "schedule", label: "Schedule" },
  { value: "pin", label: "Pin" },
  { value: "unpin", label: "Unpin" },
  { value: "delete", label: "Delete" }
];
const SCHEDULE_PATTERN_OPTIONS: Array<{ value: PublishingSchedulePattern; label: string }> = [
  { value: "all_at_once", label: "Publish all at once" },
  { value: "one_per_day", label: "One article per day" },
  { value: "two_per_week", label: "Two articles per week" },
  { value: "custom_interval", label: "Custom interval" }
];
const SCHEDULE_INTERVAL_UNIT_OPTIONS: Array<{ value: PublishingScheduleIntervalUnit; label: string }> = [
  { value: "hours", label: "Hours" },
  { value: "days", label: "Days" },
  { value: "weeks", label: "Weeks" }
];

function createDefaultScheduleForm(): ScheduleFormState {
  const start = new Date(Date.now() + 60 * 60 * 1000);
  return {
    date: start.toISOString().slice(0, 10),
    time: start.toTimeString().slice(0, 5),
    pattern: "all_at_once",
    customIntervalValue: 1,
    customIntervalUnit: "days"
  };
}
type TransitionTraceEntry = {
  at: string;
  event: string;
  jobId: string;
  articleId: string;
  title: string;
  serverStatus: JobStatus;
  displayedStatus: string;
  activeStage: string | null;
  queued_at: string | null;
  processing_at: string | null;
  research_started_at: string | null;
  research_completed_at: string | null;
  outline_started_at: string | null;
  outline_completed_at: string | null;
  generation_started_at: string | null;
  generation_completed_at: string | null;
};

const TRANSITION_TRACE_KEY = "oswriter.transitionTrace";
const ARTICLE_VIEW_MODE_KEY = "oswriter.articleViewMode";

export function WriterApp({ initialAuthed }: { initialAuthed: boolean }) {
  const [authed, setAuthed] = useState(initialAuthed);
  if (!authed) return <Login onAuthed={() => setAuthed(true)} />;
  return <Workbench />;
}

function Login({ onAuthed }: { onAuthed: () => void }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password })
    });
    setLoading(false);
    if (res.ok) onAuthed();
    else setError("Incorrect workspace password.");
  }

  return (
    <main className="grid min-h-screen place-items-center bg-background px-4">
      <form onSubmit={submit} className="w-full max-w-sm rounded-lg border border-line bg-surface-1 p-5 shadow-sm">
        <div className="mb-4">
          <h1 className="text-lg font-semibold tracking-tight text-ink">QueueWrite</h1>
          <p className="mt-1 text-sm text-ink-muted">Enter the workspace password to open the production queue.</p>
        </div>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="h-9 w-full rounded-md border border-line bg-white px-3 text-sm outline-none focus:border-ink"
          autoFocus
        />
        {error && <p className="mt-2 text-xs text-danger">{error}</p>}
        <button className="mt-4 flex h-9 w-full items-center justify-center rounded-md bg-ink px-3 text-sm font-medium text-white" disabled={loading}>
          {loading ? <Loader2 className="size-4 animate-spin" /> : "Open workspace"}
        </button>
      </form>
    </main>
  );
}

function Workbench() {
  const [state, setState] = useState<AppState | null>(null);
  const [titles, setTitles] = useState("");
  const [postGenerationAction, setPostGenerationAction] = useState<PostGenerationPublishingAction>("generate_only");
  const [generateMenuOpen, setGenerateMenuOpen] = useState(false);
  const [selectedInventoryArticleIds, setSelectedInventoryArticleIds] = useState<Set<string>>(new Set());
  const [bulkProgress, setBulkProgress] = useState<BulkPublishingProgress | null>(null);
  const [scheduleModalOpen, setScheduleModalOpen] = useState(false);
  const [scheduleForm, setScheduleForm] = useState<ScheduleFormState>(() => createDefaultScheduleForm());
  const [selectedArticleId, setSelectedArticleId] = useState<string | null>(null);
  const [selectedArticle, setSelectedArticle] = useState<ArticleDocument | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [running, setRunning] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("Idle");
  const [details, setDetails] = useState<Details>({ research: null, debug: null });
  const [tab, setTab] = useState<InspectorTab>("project");
  const [projectAnalytics, setProjectAnalytics] = useState<ProjectAnalyticsSummary | null>(null);
  const [queueProjection, setQueueProjection] = useState<QueueCostProjection | null>(null);
  const [queueStatus, setQueueStatus] = useState<QueueStatus | null>(null);
  const [workerStatus, setWorkerStatus] = useState<WorkerStatusSnapshot | null>(null);
  const [uploadFeedback, setUploadFeedback] = useState<UploadFeedbackState>({ status: "idle", titleCount: 0, durationMs: null, message: null });
  const [generateFeedback, setGenerateFeedback] = useState<GenerateFeedbackState>({ status: "idle", title: null, durationMs: null, message: null });
  const [pinnedArticleIds, setPinnedArticleIds] = useState<Set<string>>(new Set());
  const [articleSourceCounts, setArticleSourceCounts] = useState<Record<string, number>>({});
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [titleDrafts, setTitleDrafts] = useState<Record<string, string>>({});
  const [saveState, setSaveState] = useState<"saved" | "saving" | "error">("saved");
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const [globalMenuOpen, setGlobalMenuOpen] = useState(false);
  const [projectMenuOpen, setProjectMenuOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [projectSettingsProjectId, setProjectSettingsProjectId] = useState<string | null>(null);
  const [showLeftPane, setShowLeftPane] = useState(true);
  const [showRightPane, setShowRightPane] = useState(true);
  const [articleViewMode, setArticleViewMode] = useState<ArticleViewMode>("rich");
  const [globalSearchOpen, setGlobalSearchOpen] = useState(false);
  const [globalSearchQuery, setGlobalSearchQuery] = useState("");
  const [globalSearchResults, setGlobalSearchResults] = useState<GlobalSearchResponse | null>(null);
  const [globalSearchLoading, setGlobalSearchLoading] = useState(false);
  const [regenerateCandidate, setRegenerateCandidate] = useState<ArticleSummary | null>(null);
  const [similarCandidate, setSimilarCandidate] = useState<ArticleSummary | null>(null);
  const [similarTitles, setSimilarTitles] = useState<string[]>([]);
  const [selectedSimilarTitles, setSelectedSimilarTitles] = useState<Set<string>>(new Set());
  const [similarLoading, setSimilarLoading] = useState(false);
  const [similarError, setSimilarError] = useState<string | null>(null);
  const [selectedStage, setSelectedStage] = useState<string>("research");
  const [highlightWarnings, setHighlightWarnings] = useState(false);
  const [tick, setTick] = useState(Date.now());
  const stopRequested = useRef(false);
  const activeRequest = useRef<AbortController | null>(null);
  const editorRef = useRef<HTMLTextAreaElement | null>(null);
  const richEditorRef = useRef<HTMLDivElement | null>(null);
  const globalMenuRef = useRef<HTMLDivElement | null>(null);
  const projectMenuRef = useRef<HTMLDivElement | null>(null);
  const generateMenuRef = useRef<HTMLDivElement | null>(null);
  const saveTimerRef = useRef<number | null>(null);
  const saveRevisionRef = useRef(0);
  const warningsRef = useRef<HTMLDivElement | null>(null);
  const visibleRecordedRef = useRef<Set<string>>(new Set());
  const visibilityBaselineRef = useRef<Set<string> | null>(null);
  const traceJobIdRef = useRef<string | null>(null);
  const optimisticClaimsRef = useRef<Map<string, QueueJob>>(new Map());
  const optimisticQueuedJobIdsRef = useRef<Set<string>>(new Set());
  const optimisticQueueControlRef = useRef<AppState["queueControl"] | null>(null);
  const analyticsProjectIdRef = useRef<string | null>(null);

  const jobs = state?.jobs ?? [];
  const articles = state?.articles ?? [];
  const inventoryArticles = useMemo(() => articles.filter(isInventoryArticle), [articles]);
  const parsedTitleCount = useMemo(() => parseSubmittedTitles(titles).length, [titles]);
  const projects = state?.projects ?? (state?.project ? [state.project] : []);
  const preferences = state?.preferences;
  const projectSettingsProject = projectSettingsProjectId
    ? projects.find((project) => project.id === projectSettingsProjectId) ?? null
    : null;
  const selectedJob = useMemo(
    () => jobs.find((job) => job.articleId === selectedArticleId || job.id === selectedArticle?.jobId) ?? null,
    [jobs, selectedArticle?.jobId, selectedArticleId]
  );
  const selectedMarkdown = selectedArticle ? drafts[selectedArticle.id] ?? selectedArticle.markdown : "";
  const selectedTitle = selectedArticle ? titleDrafts[selectedArticle.id] ?? selectedArticle.title : "";
  const breadcrumbArticleTitle = selectedArticle ? selectedTitle : selectedJob?.title ?? null;
  const handleSelectedMarkdownChange = useCallback((markdown: string) => {
    if (!selectedArticle) return;
    updateArticleDraft(selectedArticle.id, { markdown });
  }, [selectedArticle, updateArticleDraft]);
  const displayJobs = useMemo(() => jobs.map((job) => {
    const article = articles.find((item) => item.id === job.articleId);
    return article ? { ...job, status: article.status } : job;
  }), [articles, jobs]);
  const queueJobs = displayJobs.filter(isQueueJobVisible);
  const queuedJobs = queueJobs.filter((job) => job.status === "queued" || job.status === "skipped");
  const runningJobs = queueJobs.filter((job) => job.status === "processing");
  const failedQueueJobs = queueJobs.filter((job) => job.status === "failed" || job.status === "research_failed");
  const libraryArticles = inventoryArticles.filter((article) => filter !== "needs_review" || article.status === "needs_review");
  const localStats = useMemo(() => ({
    queued: displayJobs.filter((job) => job.status === "queued").length,
    processing: displayJobs.filter((job) => job.status === "processing").length,
    generated: inventoryArticles.filter((article) => article.status === "generated" || isApprovedArticleStatus(article.status)).length,
    needs_review: inventoryArticles.filter((article) => article.status === "needs_review").length,
    failed: displayJobs.filter((job) => job.status === "failed" || job.status === "research_failed").length,
    skipped: displayJobs.filter((job) => job.status === "skipped").length
  }), [displayJobs, inventoryArticles]);
  const stats = queueStatus ? {
    queued: queueStatus.queued,
    processing: queueStatus.processing,
    generated: queueStatus.generated,
    needs_review: queueStatus.review,
    failed: queueStatus.failed,
    skipped: localStats.skipped
  } : localStats;
  const queueMetrics = useMemo(() => calculateQueueMetrics(displayJobs, inventoryArticles, tick), [inventoryArticles, displayJobs, tick]);
  const runHistory = useMemo(() => buildRunHistory(displayJobs, inventoryArticles), [inventoryArticles, displayJobs]);
  const projectSummary = useMemo(() => state ? calculateProjectSummary({ ...state, articles: inventoryArticles }, projectAnalytics) : null, [state, inventoryArticles, projectAnalytics]);
  const accountStats = useMemo(() => calculateAccountOutcomeStats(inventoryArticles, projectAnalytics?.source_count ?? 0), [inventoryArticles, projectAnalytics]);
  const shouldPollQueue = running || busy || generateFeedback.status === "starting" || stats.queued > 0 || stats.processing > 0;
  const queuePollIntervalMs = stats.processing > 0 || running || busy || generateFeedback.status === "starting" ? 1_500 : 4_000;
  const queueMutationBlockedReason = queueMutationBlockReason(state, displayJobs);
  const settingsBlockedReason = settingsMutationBlockReason(displayJobs);
  const hasRunnableQueueWork = stats.queued > 0 || stats.processing > 0;
  const hasRecoverableQueueWork = displayJobs.some((job) => isRecoverableProcessingJob(job, state?.settings.staleProcessingMinutes ?? 15, tick));
  const resumableQueuedJob = useMemo(() => displayJobs.find(isResumableQueuedJob), [displayJobs]);
  const generateBlocked = busy || running || generateFeedback.status === "starting" || (state?.queueControl.mode === "stop_after_current" && !resumableQueuedJob);
  const generateButton = describeGenerateButton(
    stats,
    queueMetrics,
    generateBlocked,
    state?.queueControl.mode ?? "stopped",
    Boolean(resumableQueuedJob),
    generateFeedback.status === "starting"
  );
  const queueProjectionKey = state ? [
    state.project.id,
    ...displayJobs.filter((job) => job.status === "queued").map((job) => job.id).sort(),
    state.project.profile?.profileVersion,
    state.project.profile?.regionKey,
    state.project.profile?.industryKey,
    state.project.profile?.audienceKey,
    state.project.profile?.defaultTargetWords,
    state.settings.controls.lengthTargetWords
  ].join(":") : "";

  function applyServerState(next: AppState, source: string) {
    const merged = mergeOptimisticProcessingClaims(next, optimisticClaimsRef.current);
    recordStateTrace(merged, traceJobIdRef.current, source);
    setState(merged);
    setQueueStatus(null);
    const selectedExists = selectedArticleId && (
      merged.jobs.some((job) => job.articleId === selectedArticleId) ||
      merged.articles.some((article) => article.id === selectedArticleId)
    );
    if (!selectedExists) {
      const active = merged.jobs.find((job) => job.status === "processing");
      setSelectedArticleId(active?.articleId ?? null);
    }
  }

  async function refresh() {
    const res = await fetchWithTimeout("/api/state", { cache: "no-store" }, 8_000);
    if (res?.ok) {
      const next = await res.json() as AppState;
      applyServerState(next, "api-state");
    }
  }

  async function refreshQueueStatus() {
    // Queue polling must never load full project state.
    const res = await fetchWithTimeout("/api/queue/status", { cache: "no-store" }, 8_000);
    if (!res?.ok) return;
    const next = await res.json() as QueueStatus;
    setQueueStatus(next);
    setState((current) => {
      if (!current) return current;
      if (queueStatusNeedsFullRefresh(current, next)) window.setTimeout(() => void refresh(), 0);
      return reconcileQueueStatusState(current, next);
    });
  }

  async function refreshWorkerStatus() {
    const res = await fetchWithTimeout("/api/worker/status", { cache: "no-store" }, 8_000);
    if (!res?.ok) return;
    const next = await res.json() as WorkerStatusSnapshot;
    setWorkerStatus(next);
  }

  useEffect(() => {
    void refresh();
  }, []);

  useEffect(() => {
    if (!state?.project.id) return;
    void fetch("/api/articles/pins", { cache: "no-store" })
      .then((res) => res.ok ? res.json() : { pinnedIds: [], sourceCounts: {} })
      .then((data: { pinnedIds?: string[]; sourceCounts?: Record<string, number> }) => {
        setPinnedArticleIds(new Set(data.pinnedIds ?? []));
        setArticleSourceCounts(data.sourceCounts ?? {});
      });
  }, [state?.project.id]);

  useEffect(() => {
    if (!state || stats.queued === 0) {
      setQueueProjection(null);
      return;
    }
    setQueueProjection(null);
    const controller = new AbortController();
    void fetch("/api/queue/projection", { cache: "no-store", signal: controller.signal })
      .then((res) => res.ok ? res.json() : null)
      .then((projection: QueueCostProjection | null) => {
        if (projection?.articleCount) setQueueProjection(projection);
      })
      .catch(() => {
        // Projection is advisory and must never interfere with queue generation.
      });
    return () => controller.abort();
  }, [queueProjectionKey]);

  useEffect(() => {
    return () => {
      if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
    };
  }, []);

  useEffect(() => {
    const stored = window.localStorage.getItem(ARTICLE_VIEW_MODE_KEY);
    if (stored === "rich" || stored === "md" || stored === "split") setArticleViewMode(stored);
  }, []);

  useEffect(() => {
    window.localStorage.setItem(ARTICLE_VIEW_MODE_KEY, articleViewMode);
  }, [articleViewMode]);

  useEffect(() => {
    if (!selectedArticleId && tab !== "project") setTab("project");
  }, [selectedArticleId, tab]);

  useEffect(() => {
    setSelectedInventoryArticleIds((current) => {
      if (!current.size) return current;
      const allowed = new Set(inventoryArticles.map((article) => article.id));
      const next = new Set([...current].filter((id) => allowed.has(id)));
      return next.size === current.size ? current : next;
    });
  }, [inventoryArticles]);

  useEffect(() => {
    if (selectedArticleId && settingsOpen) setSettingsOpen(false);
    if (selectedArticleId && projectSettingsProjectId) setProjectSettingsProjectId(null);
  }, [selectedArticleId, settingsOpen, projectSettingsProjectId]);

  useEffect(() => {
    const projectId = state?.project.id;
    if (!projectId || analyticsProjectIdRef.current === projectId) return;
    analyticsProjectIdRef.current = projectId;
    setProjectAnalytics(null);
    void fetch("/api/analytics/project", { cache: "no-store" })
      .then((res) => res.ok ? res.json() : null)
      .then((data: ProjectAnalyticsSummary | null) => setProjectAnalytics(data));
  }, [state?.project.id]);

  useEffect(() => {
    const timer = window.setInterval(() => setTick(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!shouldPollQueue) return;
    const timer = window.setInterval(() => {
      void refreshQueueStatus();
    }, queuePollIntervalMs);
    return () => window.clearInterval(timer);
  }, [queuePollIntervalMs, shouldPollQueue]);

  useEffect(() => {
    if (!state?.project.id || (!shouldPollQueue && !workerStatus?.remaining)) return;
    void refreshWorkerStatus();
    const timer = window.setInterval(() => {
      void refreshWorkerStatus();
    }, queuePollIntervalMs);
    return () => window.clearInterval(timer);
  }, [queuePollIntervalMs, shouldPollQueue, state?.project.id, workerStatus?.remaining]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (isGlobalSearchShortcut(event)) {
        event.preventDefault();
        setGlobalSearchOpen(true);
      }
      if (event.key === "Escape") {
        setGlobalSearchOpen(false);
        setGlobalMenuOpen(false);
        setProjectMenuOpen(false);
        setGenerateMenuOpen(false);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    if (!globalMenuOpen) return;
    function onPointerDown(event: PointerEvent) {
      const target = event.target;
      if (target instanceof Node && globalMenuRef.current?.contains(target)) return;
      setGlobalMenuOpen(false);
    }
    window.addEventListener("pointerdown", onPointerDown);
    return () => window.removeEventListener("pointerdown", onPointerDown);
  }, [globalMenuOpen]);

  useEffect(() => {
    if (!projectMenuOpen) return;
    function onPointerDown(event: PointerEvent) {
      const target = event.target;
      if (target instanceof Node && projectMenuRef.current?.contains(target)) return;
      setProjectMenuOpen(false);
    }
    window.addEventListener("pointerdown", onPointerDown);
    return () => window.removeEventListener("pointerdown", onPointerDown);
  }, [projectMenuOpen]);

  useEffect(() => {
    if (!generateMenuOpen) return;
    function onPointerDown(event: PointerEvent) {
      const target = event.target;
      if (target instanceof Node && generateMenuRef.current?.contains(target)) return;
      setGenerateMenuOpen(false);
    }
    window.addEventListener("pointerdown", onPointerDown);
    return () => window.removeEventListener("pointerdown", onPointerDown);
  }, [generateMenuOpen]);

  useEffect(() => {
    if (!globalSearchOpen) return;
    const query = globalSearchQuery.trim();
    if (query.length < 2) {
      setGlobalSearchResults(null);
      setGlobalSearchLoading(false);
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setGlobalSearchLoading(true);
      void fetch(`/api/search?q=${encodeURIComponent(query)}`, { signal: controller.signal, cache: "no-store" })
        .then((res) => res.ok ? res.json() : null)
        .then((data: GlobalSearchResponse | null) => setGlobalSearchResults(data))
        .catch((error) => {
          if (!controller.signal.aborted) console.warn("Global search failed", error);
        })
        .finally(() => {
          if (!controller.signal.aborted) setGlobalSearchLoading(false);
        });
    }, 120);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [globalSearchOpen, globalSearchQuery]);

  useEffect(() => {
    if (!selectedArticleId) {
      setSelectedArticle(null);
      setDetails({ research: null, debug: null });
      return;
    }
    const controller = new AbortController();
    setSelectedArticle(null);
    void fetch(`/api/articles/${selectedArticleId}`, { cache: "no-store", signal: controller.signal })
      .then((res) => res.ok ? res.json() : null)
      .then((data: { article?: ArticleDocument } | null) => {
        if (data?.article) setSelectedArticle(data.article);
      })
      .catch(() => undefined);
    void fetch(`/api/articles/${selectedArticleId}/details`, { cache: "no-store", signal: controller.signal })
      .then((res) => res.ok ? res.json() : { research: null, debug: null })
      .then((data: Details) => setDetails(data));
    return () => controller.abort();
  }, [selectedArticleId, articles.some((article) => article.id === selectedArticleId)]);

  function applyUpdatedArticle(updated: ArticleDocument) {
    setSelectedArticle((current) => current?.id === updated.id ? updated : current);
    setState((current) => current ? {
      ...current,
      articles: current.articles.map((article) => article.id === updated.id ? toArticleSummary(updated) : article)
    } : current);
  }

  function toggleInventoryArticleSelection(articleId: string) {
    setSelectedInventoryArticleIds((current) => {
      const next = new Set(current);
      if (next.has(articleId)) next.delete(articleId);
      else next.add(articleId);
      return next;
    });
  }

  function toggleAllInventoryArticleSelections(articleIds: string[]) {
    setSelectedInventoryArticleIds((current) => {
      const allSelected = articleIds.length > 0 && articleIds.every((articleId) => current.has(articleId));
      return allSelected ? new Set() : new Set(articleIds);
    });
  }

  async function addTitles() {
    const submittedTitles = parseSubmittedTitles(titles);
    if (!submittedTitles.length) return;
    const startedAt = performance.now();
    const pendingInput = titles;
    const optimisticJobs = createOptimisticQueuedJobs(state?.project.id, submittedTitles, jobs, postGenerationAction);
    setUploadFeedback({
      status: "submitting",
      titleCount: submittedTitles.length,
      durationMs: null,
      message: `Adding ${submittedTitles.length} title${submittedTitles.length === 1 ? "" : "s"} to the queue...`
    });
    setTitles("");
    if (optimisticJobs.length) {
      optimisticQueuedJobIdsRef.current = new Set(optimisticJobs.map((job) => job.id));
      insertOptimisticQueuedJobs(optimisticJobs);
    }
    setBusy(true);
    setMessage(`Adding ${submittedTitles.length} title${submittedTitles.length === 1 ? "" : "s"} to queue...`);
    const res = await fetch("/api/jobs/bulk", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        titles: submittedTitles,
        postGenerationAction
      })
    });
    const data = await res.json().catch(() => ({})) as { jobs?: QueueJob[]; queueControl?: AppState["queueControl"]; error?: string };
    const durationMs = performance.now() - startedAt;
    setBusy(false);
    if (res.ok) {
      const queuedCount = data.jobs?.length ?? submittedTitles.length;
      const successMessage = queuedCount > 0
        ? `${queuedCount} title${queuedCount === 1 ? "" : "s"} added to queue.`
        : "Those titles already exist in this project or queue.";
      reconcileQueuedJobs(data.jobs ?? [], data.queueControl);
      setUploadFeedback({
        status: "success",
        titleCount: queuedCount,
        durationMs,
        message: successMessage
      });
      setMessage(successMessage);
    } else {
      const errorMessage = data.error ?? "Could not add titles.";
      rollbackOptimisticQueuedJobs();
      setTitles(pendingInput);
      setUploadFeedback({
        status: "error",
        titleCount: submittedTitles.length,
        durationMs,
        message: errorMessage
      });
      setMessage(errorMessage);
    }
  }

  async function processNext() {
    const startedAt = performance.now();
    const queuedTitle = resumableQueuedJob?.title ?? displayJobs.find((job) => job.status === "queued")?.title ?? null;
    setGenerateFeedback({
      status: "starting",
      title: queuedTitle,
      durationMs: null,
      message: queuedTitle ? `Starting ${queuedTitle}...` : "Starting queue..."
    });
    setBusy(true);
    setMessage(queuedTitle ? `Starting ${queuedTitle}...` : "Processing next queued title...");
    const canResumeCurrentUnderStop = state?.queueControl.mode === "stop_after_current" && Boolean(resumableQueuedJob);
    if (state?.queueControl.mode !== "running" && !canResumeCurrentUnderStop) {
      const controlRes = await fetch("/api/queue/control", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "resume" })
      });
      const controlData = await controlRes.json().catch(() => ({})) as { queueControl?: AppState["queueControl"]; error?: string };
      if (!controlRes.ok) {
        setBusy(false);
        const errorMessage = controlData.error ?? "Queue start failed.";
        setGenerateFeedback({
          status: "error",
          title: queuedTitle,
          durationMs: performance.now() - startedAt,
          message: errorMessage
        });
        setMessage(errorMessage);
        return false;
      }
      if (controlData.queueControl) setState((current) => current ? { ...current, queueControl: controlData.queueControl! } : current);
    }
    const optimisticJob = markNextJobGenerating();
    if (optimisticJob) {
      optimisticClaimsRef.current.set(optimisticJob.id, optimisticJob);
      if (!traceJobIdRef.current) {
        traceJobIdRef.current = optimisticJob.id;
        resetTransitionTrace();
      }
      recordTransitionTrace("ui-optimistic", optimisticJob);
      setSelectedArticleId(optimisticJob.articleId);
    }
    const controller = new AbortController();
    activeRequest.current = controller;
    const res = await fetch("/api/queue/process-next", { method: "POST", signal: controller.signal }).catch((error) => {
      if (controller.signal.aborted) return null;
      throw error;
    });
    activeRequest.current = null;
    if (!res) {
      optimisticClaimsRef.current.clear();
      setBusy(false);
      const stoppedMessage = "Run stopped locally. Current server job may finish or recover on next refresh.";
      setGenerateFeedback({
        status: "error",
        title: queuedTitle,
        durationMs: performance.now() - startedAt,
        message: stoppedMessage
      });
      setMessage(stoppedMessage);
      void refresh();
      return false;
    }
    const data = await res.json().catch(() => ({})) as { processed?: boolean; job?: QueueJob; error?: string };
    const durationMs = performance.now() - startedAt;
    setBusy(false);
    if (!res.ok) {
      optimisticClaimsRef.current.clear();
      const errorMessage = data.error ? String(data.error) : "Processing failed.";
      setGenerateFeedback({
        status: "error",
        title: data.job?.title ?? queuedTitle,
        durationMs,
        message: errorMessage
      });
      setMessage(errorMessage);
      void refresh();
      return res.status === 504;
    }
    if (data.job) {
      optimisticClaimsRef.current.delete(data.job.id);
      if (traceJobIdRef.current === data.job.id) recordTransitionTrace("process-next-response", data.job);
      upsertJob(data.job);
      if (data.job.status !== "failed" && data.job.status !== "research_failed") setSelectedArticleId(data.job.articleId);
    } else {
      optimisticClaimsRef.current.clear();
    }
    const successMessage = data.processed
      ? data.job?.status === "processing"
        ? `Queue running: ${data.job.title}`
        : `Queue updated: ${data.job?.title ?? "current article"}`
      : "No queued jobs.";
    setGenerateFeedback({
      status: "success",
      title: data.job?.title ?? queuedTitle,
      durationMs,
      message: successMessage
    });
    setMessage(successMessage);
    void refreshQueueStatus();
    void refresh();
    return Boolean(data.processed);
  }

  async function runSequential() {
    await setQueueControl("resume", "Queue running.");
    stopRequested.current = false;
    setRunning(true);
    let processed = true;
    while (processed && !stopRequested.current) {
      processed = await processNext();
      if (!processed) break;
    }
    setRunning(false);
  }

  async function stopRun() {
    setMessage("Queue will stop after the current article.");
    await setQueueControl("stop_after_current", "Stop after current article requested.");
  }

  async function emergencyStopRun() {
    setMessage("Emergency stop requested...");
    stopRequested.current = true;
    activeRequest.current?.abort();
    optimisticClaimsRef.current.clear();
    setRunning(false);
    setBusy(true);
    const res = await fetch("/api/queue/cancel-current", { method: "POST" });
    const data = await res.json().catch(() => ({})) as { state?: AppState; job?: QueueJob | null; error?: string };
    setBusy(false);
    if (res.ok) {
      setMessage(data.job ? "Emergency stop applied. Article can be retried." : "Queue stopped.");
      if (data.state) applyServerState(data.state, "queue-emergency-stop");
      else await refresh();
    } else {
      setMessage(data.error ?? "Emergency stop failed.");
      await refresh();
    }
  }

  async function setQueueControl(action: "stop_after_current" | "resume", success: string) {
    setBusy(true);
    const res = await fetch("/api/queue/control", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action })
    });
    const data = await res.json().catch(() => ({})) as { queueControl?: AppState["queueControl"]; error?: string };
    setBusy(false);
    if (res.ok) {
      setMessage(success);
      if (data.queueControl) setState((current) => current ? { ...current, queueControl: data.queueControl! } : current);
    } else {
      setMessage(data.error ?? "Queue control failed.");
    }
    await refresh();
  }

  async function post(path: string, success: string) {
    setBusy(true);
    const res = await fetch(path, { method: "POST" });
    setBusy(false);
    setMessage(res.ok ? success : "Action failed.");
    await refresh();
  }

  async function retryFailedJobs() {
    await post("/api/queue/retry-failed", "Failed jobs requeued.");
    setFilter("all");
  }

  async function recoverQueue() {
    await post("/api/queue/recover", "Stale processing jobs recovered.");
  }

  async function clearQueue() {
    if (queueMutationBlockedReason) {
      setMessage(queueMutationBlockedReason);
      return;
    }
    if (!confirm("Clear active queue work for this project? Saved articles and research records are kept.")) return;
    stopRequested.current = true;
    activeRequest.current?.abort();
    setRunning(false);
    setBusy(true);
    const res = await fetch("/api/queue/clear", { method: "POST" });
    const data = await res.json().catch(() => ({})) as { article?: ArticleDocument; state?: AppState; error?: string };
    setBusy(false);
    if (res.ok) {
      setMessage("Queue work cleared.");
      if (data.state) applyServerState(data.state, "queue-clear");
      else await refresh();
    } else {
      setMessage(data.error ?? "Clear queue failed.");
    }
  }

  async function updateProjectProfile(profilePatch: ProjectProfilePatch, projectId = state?.project.id, defaultContentProfile?: ContentProfile) {
    if (!state) return false;
    const targetProjectId = projectId ?? state.project.id;
    const targetProject = projects.find((project) => project.id === targetProjectId) ?? state.project;
    const isActiveProject = targetProjectId === state.project.id;
    if (isActiveProject && settingsBlockedReason) {
      setMessage(settingsBlockedReason);
      return false;
    }
    const nextProfile = normalizeProjectProfile({ ...targetProject.profile, ...profilePatch }, state.settings.controls.lengthTargetWords);
    setState((current) => current ? {
      ...current,
      project: current.project.id === targetProjectId ? { ...current.project, profile: nextProfile, ...(defaultContentProfile ? { defaultContentProfile } : {}), updatedAt: new Date().toISOString() } : current.project,
      projects: (current.projects ?? []).map((project) => project.id === targetProjectId ? { ...project, profile: nextProfile, ...(defaultContentProfile ? { defaultContentProfile } : {}), updatedAt: new Date().toISOString() } : project)
    } : current);
    const res = await fetch("/api/project", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId: targetProjectId, profile: profilePatch, ...(defaultContentProfile ? { defaultContentProfile } : {}) })
    });
    const data = await res.json().catch(() => ({})) as { state?: AppState; project?: ProjectDocument; error?: string };
    if (res.ok && data.state) {
      setMessage("Project settings saved.");
      applyServerState({
        ...data.state,
        projects: (data.state.projects ?? []).map((project) => data.project && project.id === data.project.id ? data.project : project),
        project: data.project && data.state.project.id === data.project.id ? data.project : data.state.project
      }, "project-profile");
    } else {
      setMessage(data.error ?? "Project settings save failed.");
      await refresh();
      return false;
    }
    return true;
  }

  async function testProjectWordPressConnection(connection: WordPressConnectionDraft, projectId = state?.project.id) {
    if (!state) return false;
    const targetProjectId = projectId ?? state.project.id;
    setBusy(true);
    const res = await fetch("/api/project/wordpress/test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId: targetProjectId, ...connection })
    });
    const data = await res.json().catch(() => ({})) as { error?: string };
    setBusy(false);
    setMessage(res.ok ? "WordPress connection succeeded." : data.error ?? "WordPress connection failed.");
    return res.ok;
  }

  async function saveProjectWordPressConnection(connection: WordPressConnectionDraft, projectId = state?.project.id) {
    if (!state) return false;
    const targetProjectId = projectId ?? state.project.id;
    setBusy(true);
    const res = await fetch("/api/project/wordpress", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId: targetProjectId, ...connection })
    });
    const data = await res.json().catch(() => ({})) as { state?: AppState; project?: ProjectDocument; error?: string; message?: string };
    setBusy(false);
    if (res.ok && data.state) {
      setMessage(data.message ?? "WordPress connection saved.");
      applyServerState({
        ...data.state,
        projects: (data.state.projects ?? []).map((project) => data.project && project.id === data.project.id ? data.project : project),
        project: data.project && data.state.project.id === data.project.id ? data.project : data.state.project
      }, "project-wordpress");
      return true;
    }
    setMessage(data.error ?? "WordPress connection save failed.");
    await refresh();
    return false;
  }

  async function publishSelectedArticle(status: WordPressPostStatus) {
    if (!selectedArticle) return false;
    setBusy(true);
    const res = await fetch(`/api/articles/${selectedArticle.id}/publish`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status })
    });
    const data = await res.json().catch(() => ({})) as { article?: ArticleDocument; error?: string; message?: string };
    setBusy(false);
    if (!res.ok || !data.article) {
      setMessage(data.error ?? "WordPress publish failed.");
      return false;
    }
    applyUpdatedArticle(data.article);
    setMessage(data.message ?? (status === "draft" ? "Draft published successfully" : "Article published successfully"));
    return true;
  }

  async function approveSelectedArticle(articleId = selectedArticle?.id) {
    if (!articleId) return false;
    setBusy(true);
    const res = await fetch(`/api/articles/${articleId}/approve`, { method: "POST" });
    const data = await res.json().catch(() => ({})) as { article?: ArticleDocument; error?: string; message?: string };
    setBusy(false);
    if (!res.ok || !data.article) {
      setMessage(data.error ?? "Article approval failed.");
      return false;
    }
    applyUpdatedArticle(data.article);
    setMessage(data.message ?? "Article approved.");
    return true;
  }

  async function runSelectionAction(action: SelectionAction) {
    const articleIds = [...selectedInventoryArticleIds];
    if (action === "export_package") {
      window.location.assign("/api/export/project/package");
      return true;
    }
    if (!articleIds.length) {
      setMessage("Select at least one article.");
      return false;
    }
    if (action === "schedule") {
      setScheduleForm(createDefaultScheduleForm());
      setScheduleModalOpen(true);
      return true;
    }
    if (action === "delete") {
      const count = articleIds.length;
      if (!window.confirm(`Delete ${count} selected article${count === 1 ? "" : "s"} from this project? Queue and research records are kept.`)) return false;
      setBusy(true);
      setBulkProgress({ action, completed: 0, total: articleIds.length, failed: 0 });
      let completed = 0;
      let failed = 0;
      for (const articleId of articleIds) {
        const res = await fetch(`/api/articles/${articleId}`, { method: "DELETE" });
        if (!res.ok) failed += 1;
        else if (selectedArticleId === articleId) {
          setSelectedArticleId(null);
          setSelectedArticle(null);
          setDetails({ research: null, debug: null });
        }
        completed += 1;
        setBulkProgress({ action, completed, total: articleIds.length, failed });
      }
      setBusy(false);
      setSelectedInventoryArticleIds(new Set());
      await refresh();
      setMessage(failed
        ? `${completed - failed} article${completed - failed === 1 ? "" : "s"} deleted, ${failed} failed.`
        : `${completed} article${completed === 1 ? "" : "s"} deleted.`);
      return failed === 0;
    }
    if (action === "pin" || action === "unpin") {
      const nextPinned = action === "pin";
      const selectedArticles = articles.filter((article) => articleIds.includes(article.id));
      const targetArticles = selectedArticles.filter((article) => pinnedArticleIds.has(article.id) !== nextPinned);
      if (!targetArticles.length) {
        setMessage(nextPinned ? "Selected articles are already pinned." : "Selected articles are already unpinned.");
        return true;
      }
      setBusy(true);
      setBulkProgress({ action, completed: 0, total: targetArticles.length, failed: 0 });
      let completed = 0;
      let failed = 0;
      for (const article of targetArticles) {
        const res = await fetch(`/api/articles/${article.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ isPinned: nextPinned })
        });
        const data = await res.json().catch(() => ({})) as { article?: ArticleDocument };
        if (res.ok && data.article) {
          if (selectedArticle?.id === data.article.id) setSelectedArticle(data.article);
          setPinnedArticleIds((current) => {
            const next = new Set(current);
            if (data.article!.isPinned) next.add(data.article!.id);
            else next.delete(data.article!.id);
            return next;
          });
        } else {
          failed += 1;
        }
        completed += 1;
        setBulkProgress({ action, completed, total: targetArticles.length, failed });
      }
      setBusy(false);
      setSelectedInventoryArticleIds(new Set());
      setMessage(failed
        ? `${completed - failed} article${completed - failed === 1 ? "" : "s"} updated, ${failed} failed.`
        : `${completed} article${completed === 1 ? "" : "s"} ${nextPinned ? "pinned" : "unpinned"}.`);
      return failed === 0;
    }
    setBusy(true);
    setBulkProgress({ action, completed: 0, total: articleIds.length, failed: 0 });
    const status: WordPressPostStatus = action === "publish_now" ? "publish" : "draft";
    let completed = 0;
    let failed = 0;
    for (const articleId of articleIds) {
      const res = await fetch(`/api/articles/${articleId}/publish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status })
      });
      const data = await res.json().catch(() => ({})) as { article?: ArticleDocument };
      if (res.ok && data.article) {
        applyUpdatedArticle(data.article);
      } else {
        failed += 1;
      }
      completed += 1;
      setBulkProgress({ action, completed, total: articleIds.length, failed });
    }
    setBusy(false);
    setSelectedInventoryArticleIds(new Set());
    setMessage(failed
      ? `${completed - failed} article${completed - failed === 1 ? "" : "s"} completed, ${failed} failed.`
      : `${completed} article${completed === 1 ? "" : "s"} ${action === "publish_now" ? "published now" : "published as drafts"}.`);
    if (failed) await refresh();
    return failed === 0;
  }

  async function confirmBulkSchedule() {
    const articleIds = [...selectedInventoryArticleIds];
    if (!articleIds.length) {
      setScheduleModalOpen(false);
      setMessage("Select at least one article.");
      return false;
    }
    if (!scheduleForm.date || !scheduleForm.time) {
      setMessage("Choose a schedule date and time.");
      return false;
    }
    const startAt = new Date(`${scheduleForm.date}T${scheduleForm.time}`);
    if (Number.isNaN(startAt.getTime())) {
      setMessage("Enter a valid schedule date and time.");
      return false;
    }

    setBusy(true);
    setBulkProgress({ action: "schedule", completed: 0, total: articleIds.length, failed: 0 });
    const res = await fetch("/api/articles/bulk", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        articleIds,
        action: "schedule",
        schedule: {
          startAt: startAt.toISOString(),
          pattern: scheduleForm.pattern,
          customIntervalValue: scheduleForm.pattern === "custom_interval" ? scheduleForm.customIntervalValue : undefined,
          customIntervalUnit: scheduleForm.pattern === "custom_interval" ? scheduleForm.customIntervalUnit : undefined
        }
      })
    });
    const data = await res.json().catch(() => ({})) as {
      updatedArticles?: ArticleDocument[];
      failed?: Array<{ articleId: string; error: string }>;
      message?: string;
      error?: string;
    };
    setBusy(false);
    if (!res.ok) {
      setMessage(data.error ?? "Bulk scheduling failed.");
      await refresh();
      return false;
    }
    (data.updatedArticles ?? []).forEach((article) => applyUpdatedArticle(article));
    setSelectedInventoryArticleIds(new Set());
    setBulkProgress({
      action: "schedule",
      completed: articleIds.length,
      total: articleIds.length,
      failed: data.failed?.length ?? 0
    });
    setScheduleModalOpen(false);
    setMessage(data.message ?? `Scheduled ${articleIds.length} article${articleIds.length === 1 ? "" : "s"}.`);
    return true;
  }

  async function renameProject() {
    const current = state?.project.name ?? "Default Project";
    const name = window.prompt("Rename project", current)?.trim();
    if (!name || name === current) return;
    const res = await fetch("/api/project", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name })
    });
    const data = await res.json().catch(() => ({})) as { state?: AppState; project?: ProjectDocument; error?: string };
    setProjectMenuOpen(false);
    setMessage(res.ok ? "Project renamed." : "Project rename failed.");
    if (res.ok && data.state) applyServerState(data.state, "project-rename");
    else await refresh();
  }

  async function createProject() {
    const name = window.prompt("New project name", "Untitled Project")?.trim();
    if (!name) return;
    const requestedProfile = window.prompt(
      `Default content profile (${PROJECT_CONTENT_PROFILE_OPTIONS.map((option) => option.value).join(", ")})`,
      "industry_explainer"
    );
    if (requestedProfile === null) return;
    const defaultContentProfile = normalizeContentProfile(requestedProfile.trim()) ?? "industry_explainer";
    if (!window.confirm("Create a new project in the current workspace? Existing projects and their articles will be kept.")) return;
    const res = await fetch("/api/project", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, defaultContentProfile })
    });
    const data = await res.json().catch(() => ({})) as { state?: AppState; project?: ProjectDocument; error?: string };
    setProjectMenuOpen(false);
    if (res.ok) {
      setSelectedArticleId(null);
      setDetails({ research: null, debug: null });
      setMessage("New project created.");
      if (data.state) applyServerState(data.state, "project-create");
    } else {
      setMessage(data.error ?? "New project failed.");
    }
    if (!res.ok || !data.state) await refresh();
  }

  async function switchProject(projectId: string) {
    if (projectId === state?.project.id) return;
    setProjectMenuOpen(false);
    setMessage("Switching project...");
    const nextProject = projects.find((project) => project.id === projectId);
    if (nextProject && state) {
      setState({ ...state, project: nextProject, jobs: [], articles: [] });
    }
    const res = await fetch("/api/project", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ activeProjectId: projectId })
    });
    const data = await res.json().catch(() => ({})) as { article?: ArticleDocument; state?: AppState; error?: string };
    if (res.ok) {
      setSelectedArticleId(null);
      setDetails({ research: null, debug: null });
      if (data.state) applyServerState(data.state, "project-switch");
      setMessage("Project switched.");
    } else {
      setMessage(data.error ?? "Project switch failed.");
      await refresh();
    }
  }

  async function deleteProject(projectId = state?.project.id ?? "default") {
    const project = projects.find((item) => item.id === projectId);
    const isCurrent = projectId === state?.project.id;
    const blocker = isCurrent ? queueMutationBlockedReason : null;
    if (blocker) {
      setMessage(blocker);
      return;
    }
    const name = project?.name ?? "this project";
    const message = projectId === "default"
      ? "Reset Default Project? This removes its queue, articles, research packs, and debug logs."
      : `Delete "${name}"? This removes that project's queue, articles, research packs, and debug logs.`;
    if (!window.confirm(message)) return;
    const res = await fetch("/api/project", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId })
    });
    const data = await res.json().catch(() => ({})) as { state?: AppState; error?: string };
    setProjectMenuOpen(false);
    if (res.ok) {
      if (isCurrent) {
        setSelectedArticleId(null);
        setDetails({ research: null, debug: null });
      }
      setMessage("Project deleted.");
      if (data.state) applyServerState(data.state, "project-delete");
    } else {
      setMessage(data.error ?? "Project delete failed.");
    }
    if (!res.ok || !data.state) await refresh();
  }

  async function shareAccountStats() {
    const text = buildShareStatMessage(accountStats);
    try {
      await navigator.clipboard.writeText(text);
      setMessage("Share text copied.");
    } catch {
      setMessage(text);
    }
  }

  async function copySelectedArticle() {
    if (!selectedArticle) return;
    try {
      await navigator.clipboard.writeText(selectedMarkdown);
      setMessage("Article copied.");
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = selectedMarkdown;
      textarea.setAttribute("readonly", "");
      textarea.style.position = "fixed";
      textarea.style.left = "-9999px";
      document.body.appendChild(textarea);
      textarea.select();
      const copied = document.execCommand("copy");
      document.body.removeChild(textarea);
      setMessage(copied ? "Article copied." : "Copy failed.");
    }
  }

  async function copyQueueTitles() {
    const titles = [...displayJobs]
      .sort((a, b) => (a.queuePosition ?? new Date(a.createdAt).getTime()) - (b.queuePosition ?? new Date(b.createdAt).getTime()) || a.createdAt.localeCompare(b.createdAt))
      .map((job) => job.title.trim())
      .filter(Boolean);
    if (!titles.length) {
      setMessage("No queue titles to copy.");
      return;
    }
    const text = titles.join("\n");
    try {
      await navigator.clipboard.writeText(text);
      setMessage(`Copied ${titles.length} titles.`);
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.setAttribute("readonly", "");
      textarea.style.position = "fixed";
      textarea.style.left = "-9999px";
      document.body.appendChild(textarea);
      textarea.select();
      const copied = document.execCommand("copy");
      document.body.removeChild(textarea);
      setMessage(copied ? `Copied ${titles.length} titles.` : "Copy titles failed.");
    }
  }

  async function confirmRegenerateArticle() {
    if (!regenerateCandidate) return;
    setBusy(true);
    const res = await fetch(`/api/articles/${regenerateCandidate.id}/regenerate`, { method: "POST" });
    const data = await res.json().catch(() => ({})) as { article?: ArticleDocument; state?: AppState; error?: string };
    setBusy(false);
    if (!res.ok) {
      setMessage(data.error ?? "Article regeneration could not be queued.");
      return;
    }
    setRegenerateCandidate(null);
    setMessage("Regeneration queued.");
    if (data.article) applyUpdatedArticle(data.article);
    if (data.state) applyServerState(data.state, "article-regenerate");
    else await refresh();
  }

  async function openSimilarTitles(article: ArticleSummary) {
    setSimilarCandidate(article);
    setSimilarTitles([]);
    setSelectedSimilarTitles(new Set());
    setSimilarError(null);
    setSimilarLoading(true);
    const res = await fetch(`/api/articles/${article.id}/similar`, { method: "POST" });
    const data = await res.json().catch(() => ({})) as { titles?: string[]; error?: string };
    setSimilarLoading(false);
    if (!res.ok || !data.titles) {
      setSimilarError(data.error ?? "Could not generate related article ideas.");
      return;
    }
    setSimilarTitles(data.titles);
    setSelectedSimilarTitles(new Set(data.titles));
  }

  async function addSimilarTitlesToQueue() {
    const selected = similarTitles.filter((title) => selectedSimilarTitles.has(title));
    if (!selected.length) return;
    setBusy(true);
    const res = await fetch("/api/jobs/bulk", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ titles: selected, avoidDuplicates: true })
    });
    const data = await res.json().catch(() => ({})) as { jobs?: QueueJob[]; queueControl?: AppState["queueControl"]; error?: string };
    setBusy(false);
    if (!res.ok) {
      setMessage(data.error ?? "Could not add related titles.");
      return;
    }
    setSimilarCandidate(null);
    const queuedCount = data.jobs?.length ?? selected.length;
    if (data.jobs) reconcileQueuedJobs(data.jobs, data.queueControl);
    setMessage(queuedCount
      ? `${queuedCount} related title${queuedCount === 1 ? "" : "s"} queued.`
      : "Those titles already exist in this project or queue.");
  }

  function updateArticleDraft(articleId: string, patch: { title?: string; markdown?: string }) {
    let nextTitle = patch.title;
    let nextMarkdown = patch.markdown;
    const currentArticle = selectedArticle?.id === articleId ? selectedArticle : null;
    if (!currentArticle) return;
    if (nextTitle === undefined) nextTitle = titleDrafts[articleId] ?? currentArticle.title;
    if (nextMarkdown === undefined) nextMarkdown = drafts[articleId] ?? currentArticle.markdown;
    setDrafts((current) => patch.markdown === undefined ? current : { ...current, [articleId]: patch.markdown });
    setTitleDrafts((current) => patch.title === undefined ? current : { ...current, [articleId]: patch.title });
    setSaveState("saving");
    setState((current) => current ? {
      ...current,
      articles: current.articles.map((article) => article.id === articleId ? {
        ...article,
        title: nextTitle,
        wordCount: countWordsLocal(nextMarkdown),
        updatedAt: new Date().toISOString()
      } : article)
    } : current);
    setSelectedArticle((current) => current?.id === articleId ? {
      ...current,
      title: nextTitle,
      markdown: nextMarkdown,
      wordCount: countWordsLocal(nextMarkdown),
      updatedAt: new Date().toISOString()
    } : current);
    if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
    const revision = saveRevisionRef.current + 1;
    saveRevisionRef.current = revision;
    saveTimerRef.current = window.setTimeout(() => {
      void saveArticleDraft(articleId, { title: nextTitle, markdown: nextMarkdown }, revision);
    }, 700);
  }

  async function saveArticleDraft(articleId: string, payload: { title: string; markdown: string }, revision: number) {
    const res = await fetch(`/api/articles/${articleId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    if (revision !== saveRevisionRef.current) return;
    if (!res.ok) {
      setSaveState("error");
      return;
    }
    const data = await res.json().catch(() => ({})) as { article?: ArticleDocument };
    if (data.article) {
      setSelectedArticle(data.article);
      setState((current) => current ? {
        ...current,
        articles: current.articles.map((article) => article.id === data.article?.id ? toArticleSummary(data.article) : article)
      } : current);
      setDrafts((current) => {
        const next = { ...current };
        delete next[data.article!.id];
        return next;
      });
      setTitleDrafts((current) => {
        const next = { ...current };
        delete next[data.article!.id];
        return next;
      });
    }
    setSaveState("saved");
    setLastSavedAt(new Date().toISOString());
  }

  function applyFormat(command: FormatCommand) {
    if (!selectedArticle) return;
    if (articleViewMode === "rich") {
      applyRichFormat(command);
      return;
    }
    const textarea = editorRef.current;
    const markdown = selectedMarkdown;
    const start = textarea?.selectionStart ?? markdown.length;
    const end = textarea?.selectionEnd ?? markdown.length;
    const next = formatMarkdown(markdown, start, end, command);
    updateArticleDraft(selectedArticle.id, { markdown: next.value });
    window.requestAnimationFrame(() => {
      editorRef.current?.focus();
      editorRef.current?.setSelectionRange(next.selectionStart, next.selectionEnd);
    });
  }

  async function retryOne(jobId: string) {
    const res = await fetch(`/api/jobs/${jobId}/retry`, { method: "POST" });
    if (res.ok) {
      const data = await res.json().catch(() => ({})) as { job?: QueueJob };
      if (data.job) upsertJob(data.job);
    }
    void refresh();
  }

  async function actOnJob(jobId: string, action: "skip" | "remove" | "regenerate_later" | "move_up" | "move_down" | "move_top" | "move_bottom") {
    if (action === "remove" && !confirm("Remove this title from the queue?")) return;
    const res = await fetch(`/api/jobs/${jobId}/action`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action })
    });
    const data = await res.json().catch(() => ({})) as { job?: QueueJob; removedJobId?: string; error?: string };
    setMessage(res.ok ? jobActionMessage(action) : data.error ?? "Queue item action failed.");
    if (data.job) upsertJob(data.job);
    await refresh();
  }

  async function updatePreferences(patch: WorkspacePreferencePatch) {
    if (!state) return false;
    const nextPreferences = mergeWorkspacePreferences(state.preferences, patch);
    setState((current) => current ? { ...current, preferences: nextPreferences } : current);
    const res = await fetch("/api/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ preferences: patch })
    });
    const data = await res.json().catch(() => ({})) as { settings?: AppState["settings"]; preferences?: WorkspacePreferencesDocument; error?: string };
    if (!res.ok) {
      setMessage(data.error ?? "Settings save failed.");
      await refresh();
      return false;
    }
    setMessage("Settings saved.");
    if (data.settings && data.preferences) {
      setState((current) => current ? { ...current, settings: data.settings!, preferences: data.preferences! } : current);
    }
    return true;
  }

  function openSearchResult(result: GlobalSearchResult) {
    if (result.type === "project" && result.projectId !== state?.project.id) {
      void switchProject(result.projectId);
    }
    if (result.articleId) {
      setSelectedArticleId(result.articleId);
    } else {
      setSelectedArticleId(null);
    }
    if (result.type === "research_run" || result.type === "research_finding" || result.type === "research_source") setTab("research");
    setGlobalSearchOpen(false);
    setGlobalSearchQuery("");
  }

  function openProjectBreadcrumb() {
    setSelectedArticleId(null);
    setGlobalMenuOpen(false);
    setProjectMenuOpen(false);
    setSettingsOpen(false);
    setProjectSettingsProjectId(null);
    setTab("project");
  }

  function openWorkspaceSettings() {
    setSelectedArticleId(null);
    setGlobalMenuOpen(false);
    setProjectMenuOpen(false);
    setProjectSettingsProjectId(null);
    setSettingsOpen(true);
    setTab("project");
  }

  function openProjectSwitcher() {
    setGlobalMenuOpen(false);
    setSettingsOpen(false);
    setProjectSettingsProjectId(null);
    setShowLeftPane(true);
    setProjectMenuOpen(true);
  }

  function openCurrentProjectSettings() {
    if (!state?.project.id) return;
    setSelectedArticleId(null);
    setGlobalMenuOpen(false);
    setProjectMenuOpen(false);
    setSettingsOpen(false);
    setProjectSettingsProjectId(state.project.id);
    setTab("project");
  }

  async function signOut() {
    setGlobalMenuOpen(false);
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => null);
    window.location.reload();
  }

  function upsertJob(job: QueueJob) {
    setState((current) => current ? {
      ...current,
      jobs: current.jobs.map((item) => item.id === job.id ? job : item)
    } : current);
  }

  function insertOptimisticQueuedJobs(optimisticJobs: QueueJob[]) {
    setQueueStatus(null);
    setState((current) => {
      if (!current) return current;
      optimisticQueueControlRef.current = current.queueControl;
      const hasProcessing = current.jobs.some((job) => job.status === "processing");
      return {
        ...current,
        queueControl: hasProcessing ? current.queueControl : {
          ...current.queueControl,
          mode: "stopped",
          stoppedAt: new Date().toISOString(),
          reason: "Queued titles waiting for generation start.",
          updatedAt: new Date().toISOString()
        },
        jobs: [
          ...current.jobs.filter((job) => !optimisticQueuedJobIdsRef.current.has(job.id)),
          ...optimisticJobs
        ]
      };
    });
  }

  function reconcileQueuedJobs(confirmedJobs: QueueJob[], queueControl?: AppState["queueControl"]) {
    const optimisticIds = new Set(optimisticQueuedJobIdsRef.current);
    optimisticQueuedJobIdsRef.current.clear();
    optimisticQueueControlRef.current = null;
    setQueueStatus(null);
    setState((current) => {
      if (!current) return current;
      return {
        ...current,
        queueControl: queueControl ?? current.queueControl,
        jobs: [
          ...current.jobs.filter((job) => !optimisticIds.has(job.id)),
          ...confirmedJobs
        ]
      };
    });
  }

  function rollbackOptimisticQueuedJobs() {
    const optimisticIds = new Set(optimisticQueuedJobIdsRef.current);
    const previousQueueControl = optimisticQueueControlRef.current;
    optimisticQueuedJobIdsRef.current.clear();
    optimisticQueueControlRef.current = null;
    setQueueStatus(null);
    setState((current) => {
      if (!current) return current;
      return {
        ...current,
        queueControl: previousQueueControl ?? current.queueControl,
        jobs: current.jobs.filter((job) => !optimisticIds.has(job.id))
      };
    });
  }

  function markNextJobGenerating() {
    const next = jobs.find((job) => job.status === "processing") ?? jobs.find((job) => job.status === "queued");
    if (!next) return null;
    const picked: QueueJob = {
      ...next,
      status: "processing",
      attempts: next.status === "queued" ? next.attempts + 1 : next.attempts,
      updatedAt: new Date().toISOString()
    };
    setState((current) => {
      if (!current) return current;
      return {
        ...current,
        jobs: current.jobs.map((job) => job.id === picked.id ? picked : job)
      };
    });
    return picked;
  }

  return (
    <main className="flex h-screen w-screen flex-col overflow-hidden bg-background text-ink">
      <header className="hairline-b relative z-30 flex h-10 select-none items-center overflow-visible bg-surface-2/85 px-3 backdrop-blur">
        <div className="flex min-w-0 flex-1 items-center gap-1.5 text-[12.5px]">
          <div ref={globalMenuRef} className="relative shrink-0">
            <button
              type="button"
              onClick={() => {
                setGlobalMenuOpen((open) => !open);
                setProjectMenuOpen(false);
              }}
              className={cn(
                "flex items-center gap-2 rounded-md px-1.5 py-1 transition-colors hover:bg-surface-3",
                globalMenuOpen && "bg-surface-3"
              )}
              aria-expanded={globalMenuOpen}
              aria-haspopup="menu"
            >
              <span className="grid size-5 place-items-center rounded bg-ink text-[10px] font-semibold text-white">QW</span>
              <span className="font-semibold tracking-tight text-ink">QueueWrite</span>
            </button>
            {globalMenuOpen && (
              <GlobalMenu
                onOpenBilling={() => {
                  setGlobalMenuOpen(false);
                  window.location.href = "/settings/billing";
                }}
                onOpenAccountSettings={openWorkspaceSettings}
                onSignOut={() => void signOut()}
              />
            )}
          </div>
          <ChevronRight className="size-3 text-ink-subtle" />
          <button
            type="button"
            onClick={openProjectBreadcrumb}
            className="truncate text-ink-muted transition-colors hover:text-ink"
          >
            {state?.project.name ?? "Loading project"}
          </button>
          {breadcrumbArticleTitle ? (
            <>
              <ChevronRight className="size-3 text-ink-subtle" />
              <span
                title={breadcrumbArticleTitle}
                className="truncate text-ink transition-colors"
              >
                {truncateHeaderBreadcrumb(breadcrumbArticleTitle)}
              </span>
            </>
          ) : null}
        </div>
        <div className="flex items-center gap-1">
          <button onClick={() => setGlobalSearchOpen(true)} className="hidden h-7 w-[7.5rem] items-center justify-between gap-1.5 rounded-md border border-line bg-surface-1 px-2 text-[12px] text-ink-muted hover:text-ink lg:flex" title="Global search">
            <Search className="size-3.5" />
            <span>Search</span>
            <span className="mono rounded bg-surface-3 px-1 py-0.5 text-[10px] text-ink-subtle">⌘K</span>
          </button>
          <button onClick={() => setShowLeftPane((visible) => !visible)} className={cn("grid size-7 place-items-center rounded text-ink-subtle hover:bg-surface-3 hover:text-ink", showLeftPane && "bg-surface-3 text-ink")} title={showLeftPane ? "Hide articles" : "Show articles"}>
            <PanelLeft className="size-3.5" />
          </button>
          <button onClick={() => setShowRightPane((visible) => !visible)} className={cn("mr-2 grid size-7 place-items-center rounded text-ink-subtle hover:bg-surface-3 hover:text-ink", showRightPane && "bg-surface-3 text-ink")} title={showRightPane ? "Hide inspector" : "Show inspector"}>
            <PanelRight className="size-3.5" />
          </button>
          <div ref={generateMenuRef} className="relative">
            <div className="flex items-center">
              <button
                onClick={() => void processNext()}
                disabled={generateButton.disabled}
                title={generateButton.title}
                className={cn(
                  "flex h-7 items-center gap-1.5 rounded-l-md px-2.5 text-[12px] font-medium transition-colors",
                  generateButton.disabled ? "bg-surface-3 text-ink-subtle" : "bg-ink text-white hover:bg-ink/90"
                )}
              >
                {generateFeedback.status === "starting" ? <Loader2 className="size-3 animate-spin" /> : <Play className="size-3 fill-current" />}
                {generateButton.label}
              </button>
              <button
                onClick={() => setGenerateMenuOpen((open) => !open)}
                className={cn(
                  "grid h-7 w-7 place-items-center rounded-r-md border-l text-[12px] transition-colors",
                  generateButton.disabled
                    ? "border-line bg-surface-3 text-ink-subtle hover:bg-surface-3"
                    : "border-white/15 bg-ink text-white hover:bg-ink/90"
                )}
                title={`Post-generation action: ${describePostGenerationAction(postGenerationAction)}`}
              >
                <ChevronDown className={cn("size-3.5 transition-transform", generateMenuOpen && "rotate-180")} />
              </button>
            </div>
            {generateMenuOpen && (
              <div className="absolute right-0 top-9 z-30 w-72 overflow-hidden rounded-md border border-line bg-surface-1 shadow-2xl">
                <div className="hairline-b px-3 py-2">
                  <div className="text-[12px] font-semibold text-ink">Post-generation workflow</div>
                  <div className="mt-1 text-[11px] text-ink-muted">Choose what newly generated articles do after queue completion.</div>
                </div>
                <div className="p-1.5">
                  {POST_GENERATION_ACTION_OPTIONS.map((option) => (
                    <button
                      key={option.value}
                      onClick={() => {
                        setPostGenerationAction(option.value);
                        setGenerateMenuOpen(false);
                      }}
                      className={cn(
                        "w-full rounded-md px-2.5 py-2 text-left hover:bg-surface-2",
                        postGenerationAction === option.value && "bg-surface-2"
                      )}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[12px] font-medium text-ink">{option.label}</span>
                        {postGenerationAction === option.value && <CheckCircle2 className="size-3.5 text-success" />}
                      </div>
                      <div className="mt-1 text-[10.5px] leading-snug text-ink-muted">{option.description}</div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
          {(stats.processing > 0 || state?.queueControl.mode === "stop_after_current") && (
            <button
              onClick={stopRun}
              disabled={busy && !running}
              className="h-7 rounded-md bg-surface-3 px-2.5 text-[12px] font-medium text-ink shadow-sm hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Stop after current
            </button>
          )}
          {(stats.processing > 0 || state?.queueControl.mode === "stop_after_current" || resumableQueuedJob) && (
            <button
              onClick={emergencyStopRun}
              className="h-7 rounded-md border border-[#d9a79d] bg-[#f6e3df] px-2.5 text-[12px] font-medium text-[#9f2f20] shadow-sm hover:border-[#c8796c] hover:bg-[#edc9c2] hover:text-[#842719]"
              title="Immediately stop queue processing and mark the current in-flight article as failed so it can be retried."
            >
              Emergency stop
            </button>
          )}
        </div>
      </header>

      <div className={cn(
        "grid min-h-0 flex-1",
        showLeftPane && showRightPane && "grid-cols-[340px_minmax(460px,1fr)_380px]",
        showLeftPane && !showRightPane && "grid-cols-[340px_minmax(460px,1fr)]",
        !showLeftPane && showRightPane && "grid-cols-[minmax(460px,1fr)_380px]",
        !showLeftPane && !showRightPane && "grid-cols-1"
      )}>
        {showLeftPane && <aside className="hairline-r relative z-20 flex min-h-0 flex-col overflow-visible bg-surface-2 text-[13px]">
          <div className="hairline-b px-3 pb-3 pt-3">
            <div className="flex items-start justify-between gap-3">
              <div ref={projectMenuRef} className="relative min-w-0 flex-1">
                <button
                  type="button"
                  onClick={() => {
                    setProjectMenuOpen((open) => !open);
                    setGlobalMenuOpen(false);
                  }}
                  className={cn(
                    "flex w-full min-w-0 items-start gap-2 rounded-md px-1 py-0.5 text-left transition-colors hover:bg-surface-3",
                    projectMenuOpen && "bg-surface-3"
                  )}
                  aria-expanded={projectMenuOpen}
                  aria-haspopup="menu"
                >
                  <span className="grid size-7 shrink-0 place-items-center rounded-md bg-ink text-white">
                    <PanelLeft className="size-3.5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-semibold text-ink">{state?.project.name ?? "Project"}</span>
                    <span className="mono mt-1 block text-[10.5px] text-ink-subtle">{formatNumber(stats.generated)} {stats.generated === 1 ? "Article" : "Articles"}</span>
                  </span>
                  <ChevronDown className={cn("mt-1 size-3 shrink-0 text-ink-subtle transition-transform", projectMenuOpen && "rotate-180")} />
                </button>
                {projectMenuOpen && (
                  <ProjectMenu
                    currentProjectId={state?.project.id ?? ""}
                    projects={projects}
                    onSwitch={switchProject}
                    onProjectSettings={(projectId) => {
                      setSelectedArticleId(null);
                      setSettingsOpen(false);
                      setProjectSettingsProjectId(projectId);
                      setProjectMenuOpen(false);
                    }}
                    onDelete={deleteProject}
                    onNew={createProject}
                  />
                )}
              </div>
            </div>
            <div className="mono mt-3 grid grid-cols-3 gap-2 text-[10.5px]">
              <MetricPill label="Queue" value={stats.queued} />
              <MetricPill label="Running" value={stats.processing} warn={stats.processing > 0} />
              <MetricPill label="Failed" value={stats.failed} danger={stats.failed > 0} />
            </div>
            {(stats.failed > 0 || hasRecoverableQueueWork) && (
              <div className="mt-2 flex items-center gap-1">
                {stats.failed > 0 && (
                  <button onClick={retryFailedJobs} className="rounded bg-surface-1 px-2 py-1 text-[10.5px] text-ink-muted ring-1 ring-line hover:text-ink">Retry failed</button>
                )}
                {hasRecoverableQueueWork && (
                  <button onClick={recoverQueue} className="rounded bg-surface-1 px-2 py-1 text-[10.5px] text-ink-muted ring-1 ring-line hover:text-ink" title="Recover a job that was left processing after a timeout or refresh.">Recover stuck</button>
                )}
              </div>
            )}
            {(stats.queued > 0 || stats.processing > 0 || workerStatus?.remaining) && workerStatus && (
              <div className="mt-3">
                <WorkerStatusCard status={workerStatus} />
              </div>
            )}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto py-1">
            <div className="px-3 pb-1 pt-2">
              <div className="mt-2 flex items-center justify-between">
                <PanelTitle title="Queue" />
                <span className="mono text-[10.5px] text-ink-subtle">{queueJobs.length} active</span>
              </div>
            </div>
            {runningJobs.length > 0 && (
              <QueueSection label="Running" count={runningJobs.length}>
                {runningJobs.map((job) => {
                  const article = articles.find((item) => item.id === job.articleId) ?? null;
                  return (
                    <QueueListItem
                      key={job.id}
                      job={job}
                      article={article}
                      active={selectedArticleId === job.articleId || selectedArticleId === article?.id}
                      onSelect={() => setSelectedArticleId(article?.id ?? job.articleId)}
                      onRetry={() => retryOne(job.id)}
                      onAction={(action) => actOnJob(job.id, action)}
                    />
                  );
                })}
              </QueueSection>
            )}
            {queuedJobs.length > 0 && (
              <QueueSection label="Queued" count={queuedJobs.length}>
                {queuedJobs.map((job) => {
                  const article = articles.find((item) => item.id === job.articleId) ?? null;
                  return (
                    <QueueListItem
                      key={job.id}
                      job={job}
                      article={article}
                      active={selectedArticleId === job.articleId || selectedArticleId === article?.id}
                      onSelect={() => setSelectedArticleId(article?.id ?? job.articleId)}
                      onRetry={() => retryOne(job.id)}
                      onAction={(action) => actOnJob(job.id, action)}
                    />
                  );
                })}
              </QueueSection>
            )}
            {failedQueueJobs.length > 0 && (
              <QueueSection label="Failed" count={failedQueueJobs.length}>
                {failedQueueJobs.map((job) => {
                  const article = articles.find((item) => item.id === job.articleId) ?? null;
                  return (
                    <QueueListItem
                      key={job.id}
                      job={job}
                      article={article}
                      active={selectedArticleId === job.articleId || selectedArticleId === article?.id}
                      onSelect={() => setSelectedArticleId(article?.id ?? job.articleId)}
                      onRetry={() => retryOne(job.id)}
                      onAction={(action) => actOnJob(job.id, action)}
                    />
                  );
                })}
              </QueueSection>
            )}
            {!queueJobs.length && <Empty text="Queued, running, and failed work appears here." />}
          </div>

          <div className="hairline-t px-3 pb-3 pt-2">
            <div className="mb-1 flex items-center justify-between px-1">
              <PanelTitle title="Add titles" />
              <div className="flex items-center gap-2">
                <button onClick={copyQueueTitles} disabled={!displayJobs.length} title="Copy all current project queue titles" className="flex items-center gap-1 text-[10.5px] text-ink-subtle hover:text-ink disabled:cursor-not-allowed disabled:opacity-50">
                  <Copy className="size-3" /> Copy titles
                </button>
                <button onClick={clearQueue} disabled={Boolean(queueMutationBlockedReason)} title={queueMutationBlockedReason ?? "Clear queued, failed and skipped work"} className="flex items-center gap-1 text-[10.5px] text-ink-subtle hover:text-danger disabled:cursor-not-allowed disabled:opacity-50">
                  <Trash2 className="size-3" /> Clear
                </button>
              </div>
            </div>
            <textarea
              value={titles}
              onChange={(e) => {
                setTitles(e.target.value);
                if (uploadFeedback.status !== "submitting") {
                  setUploadFeedback({ status: "idle", titleCount: 0, durationMs: null, message: null });
                }
              }}
              placeholder="Paste one title per line"
              rows={3}
              className="mono w-full resize-none rounded-md border border-line bg-surface-1 p-2 text-[12px] leading-snug text-ink outline-none placeholder:text-ink-subtle focus:border-line-strong"
            />
            <div className="mt-1 flex items-center justify-between gap-2 px-1 text-[10.5px] text-ink-subtle">
              <span>{parsedTitleCount > 0 ? `${parsedTitleCount} title${parsedTitleCount === 1 ? "" : "s"} ready` : "Paste one title per line to queue work."}</span>
              {uploadFeedback.durationMs !== null && <span className="mono">Last add {formatLatencyMs(uploadFeedback.durationMs)}</span>}
            </div>
            {uploadFeedback.message && (
              <div
                className={cn(
                  "mt-1 rounded-md px-2 py-1.5 text-[10.5px]",
                  uploadFeedback.status === "error"
                    ? "bg-danger/5 text-danger"
                    : uploadFeedback.status === "success"
                      ? "bg-success/5 text-success"
                      : "bg-surface-3 text-ink-muted"
                )}
              >
                {uploadFeedback.message}
              </div>
            )}
            <div className="mt-1.5 flex gap-1">
              <button onClick={addTitles} disabled={busy || !titles.trim()} className="flex h-7 flex-1 items-center justify-center gap-1 rounded-md bg-ink px-2 text-[11.5px] font-medium text-white disabled:opacity-50">
                {uploadFeedback.status === "submitting" ? <Loader2 className="size-3.5 animate-spin" /> : <Upload className="size-3.5" />}
                {uploadFeedback.status === "submitting" ? "Adding..." : "Add to queue"}
              </button>
            </div>
          </div>
        </aside>}

        <section className={cn("flex min-h-0 flex-col bg-background", showRightPane && "border-r border-line")}>
          {projectSettingsProject && state ? (
            <ProjectSettingsPanel
              key={projectSettingsProject.id}
              project={projectSettingsProject}
              fallbackTargetWords={state.settings.controls.lengthTargetWords}
              settingsBlockedReason={projectSettingsProject.id === state.project.id ? settingsBlockedReason : null}
              onClose={() => setProjectSettingsProjectId(null)}
              onSaveProjectSettings={(patch, contentProfile) => updateProjectProfile(patch, projectSettingsProject.id, contentProfile)}
              onTestWordPressConnection={(connection) => testProjectWordPressConnection(connection, projectSettingsProject.id)}
              onSaveWordPressConnection={(connection) => saveProjectWordPressConnection(connection, projectSettingsProject.id)}
            />
          ) : settingsOpen && state ? (
            <SettingsPanel
              state={state}
              onClose={() => setSettingsOpen(false)}
              onUpdatePreferences={updatePreferences}
            />
          ) : selectedArticle || selectedJob ? (
            <>
              <ArticleHeader
                article={selectedArticle}
                job={selectedJob}
                research={details.research}
                title={selectedTitle}
                backLabel={state?.project.name ?? "Back to project"}
                onBack={openProjectBreadcrumb}
                onTitleChange={(title) => selectedArticle && updateArticleDraft(selectedArticle.id, { title })}
                projectDefaultContentProfile={state?.project.defaultContentProfile}
                busy={busy}
                onReviewClick={() => {
                  setTab("validation");
                  setHighlightWarnings(true);
                  window.setTimeout(() => warningsRef.current?.scrollIntoView({ block: "center", behavior: "smooth" }), 50);
                  window.setTimeout(() => setHighlightWarnings(false), 1800);
                }}
                onApprove={() => void approveSelectedArticle()}
                onRegenerate={() => selectedArticle && setRegenerateCandidate(toArticleSummary(selectedArticle))}
              />
              <ArticleToolbar
                article={selectedArticle}
                connection={state?.project.publishing?.wordpress}
                busy={busy}
                viewMode={articleViewMode}
                onViewModeChange={setArticleViewMode}
                onFormat={applyFormat}
                onCopyAll={copySelectedArticle}
                onConnectWordPress={() => setProjectSettingsProjectId(state?.project.id ?? null)}
                onPublishDraft={() => void publishSelectedArticle("draft")}
                onPublishNow={() => void publishSelectedArticle("publish")}
              />
              <div className="min-h-0 flex-1">
                {selectedArticle ? (
                  <ArticleWorkspace
                    markdown={selectedMarkdown}
                    viewMode={articleViewMode}
                    editorRef={editorRef}
                    richEditorRef={richEditorRef}
                    onChange={handleSelectedMarkdownChange}
                  />
                ) : selectedJob ? <JobPlaceholder job={selectedJob} onRetry={() => retryOne(selectedJob.id)} /> : null}
              </div>
              {selectedArticle && <ArticleMetricsRail saveState={saveState} lastSavedAt={lastSavedAt} />}
            </>
          ) : (
            <ProjectDashboard
              state={state}
              articles={libraryArticles}
              jobs={displayJobs}
              summary={projectSummary}
              activeFilter={filter === "needs_review" ? "needs_review" : "all"}
              pinnedArticleIds={pinnedArticleIds}
              sourceCounts={articleSourceCounts}
              selectedArticleIds={selectedInventoryArticleIds}
              bulkProgress={bulkProgress}
              bulkBusy={busy}
              activeArticleId={selectedArticleId}
              onSelectArticle={setSelectedArticleId}
              onFilterChange={setFilter}
              onOpenProjectSettings={openCurrentProjectSettings}
              onToggleArticleSelection={toggleInventoryArticleSelection}
              onToggleSelectAll={toggleAllInventoryArticleSelections}
              onRunSelectionAction={(action) => void runSelectionAction(action)}
            />
          )}
        </section>

        {showRightPane && <aside className="flex min-h-0 flex-col bg-surface-2">
          <div className="hairline-b flex h-9 shrink-0 items-center gap-0 overflow-x-auto px-2">
            {(["project", "pipeline", "research", "validation", "seo", "debug"] as const).map((item) => (
              <button key={item} onClick={() => setTab(item)} className={cn("relative h-9 shrink-0 px-2 text-[11.5px] font-medium capitalize", tab === item ? "text-ink after:absolute after:inset-x-2 after:bottom-0 after:h-[1.5px] after:bg-ink" : "text-ink-muted hover:text-ink")}>{item}</button>
            ))}
          </div>
          <Inspector
            tab={tab}
            setTab={setTab}
            state={state}
            articles={inventoryArticles}
            jobs={displayJobs}
            metrics={queueMetrics}
            history={runHistory}
            summary={projectSummary}
            analytics={projectAnalytics}
            article={selectedArticle}
            job={selectedJob}
            markdown={selectedMarkdown}
            onApplyMarkdown={handleSelectedMarkdownChange}
            details={details}
            selectedStage={selectedStage}
            setSelectedStage={setSelectedStage}
            warningsRef={warningsRef}
            highlightWarnings={highlightWarnings}
            busy={busy}
            onApproveArticle={(articleId) => void approveSelectedArticle(articleId)}
            onRegenerateArticle={(article) => setRegenerateCandidate(toArticleSummary(article))}
            onNotify={setMessage}
          />
        </aside>}
      </div>

      <footer className="hairline-t mono flex h-6 items-center gap-3 bg-surface-2/70 px-3 text-[10.5px] text-ink-subtle">
        <span className="flex items-center gap-1.5"><span className="size-1.5 rounded-full bg-success" />{message}</span>
        <div className="ml-auto flex items-center gap-1">
          <UsageIndicator />
          <button onClick={shareAccountStats} className="rounded px-1.5 py-0.5 text-ink-subtle hover:bg-surface-3 hover:text-ink" title="Copy a shareable QueueWrite stat">
          Words {formatNumber(accountStats.words)} · Sources {formatNumber(accountStats.sources)} · Articles {formatNumber(accountStats.articles)} · Time {formatSavedTime(accountStats.savedMinutes)}
          </button>
        </div>
      </footer>
      {globalSearchOpen && (
        <GlobalSearchModal
          query={globalSearchQuery}
          onQueryChange={setGlobalSearchQuery}
          results={globalSearchResults}
          loading={globalSearchLoading}
          onClose={() => setGlobalSearchOpen(false)}
          onOpenResult={openSearchResult}
        />
      )}
      {regenerateCandidate && (
        <RegenerateArticleModal
          article={regenerateCandidate}
          loading={busy}
          onClose={() => setRegenerateCandidate(null)}
          onConfirm={() => void confirmRegenerateArticle()}
        />
      )}
      {similarCandidate && (
        <SimilarTitlesModal
          article={similarCandidate}
          titles={similarTitles}
          selected={selectedSimilarTitles}
          loading={similarLoading}
          submitting={busy}
          error={similarError}
          onClose={() => setSimilarCandidate(null)}
          onToggle={(title) => setSelectedSimilarTitles((current) => {
            const next = new Set(current);
            if (next.has(title)) next.delete(title);
            else next.add(title);
            return next;
          })}
          onSelectAll={() => setSelectedSimilarTitles((current) => current.size === similarTitles.length ? new Set() : new Set(similarTitles))}
          onSubmit={() => void addSimilarTitlesToQueue()}
        />
      )}
      {scheduleModalOpen && (
        <ScheduleArticlesModal
          selectedCount={selectedInventoryArticleIds.size}
          value={scheduleForm}
          submitting={busy}
          onClose={() => setScheduleModalOpen(false)}
          onChange={(patch) => setScheduleForm((current) => ({ ...current, ...patch }))}
          onSubmit={() => void confirmBulkSchedule()}
        />
      )}
    </main>
  );
}

function RegenerateArticleModal({ article, loading, onClose, onConfirm }: {
  article: ArticleSummary;
  loading: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/20 px-4 backdrop-blur-sm" onMouseDown={onClose}>
      <div className="w-full max-w-md rounded-lg border border-line bg-surface-1 p-4 shadow-2xl" onMouseDown={(event) => event.stopPropagation()}>
        <div className="text-[15px] font-semibold text-ink">Regenerate article</div>
        <p className="mt-3 text-[13px] leading-relaxed text-ink-muted">Regenerate this article using the current project settings?</p>
        <p className="mt-2 text-[12px] leading-relaxed text-ink-subtle">The current article will be moved to Review and a new version will be added to the queue.</p>
        <div className="mono mt-3 truncate rounded bg-surface-2 px-3 py-2 text-[11px] text-ink-muted">{article.title}</div>
        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onClose} disabled={loading} className="h-8 rounded px-3 text-[12px] text-ink-muted hover:bg-surface-3 disabled:opacity-50">Cancel</button>
          <button onClick={onConfirm} disabled={loading} className="flex h-8 items-center gap-1.5 rounded bg-ink px-3 text-[12px] font-medium text-white disabled:opacity-50">
            {loading && <Loader2 className="size-3.5 animate-spin" />} Regenerate
          </button>
        </div>
      </div>
    </div>
  );
}

function SimilarTitlesModal({ article, titles, selected, loading, submitting, error, onClose, onToggle, onSelectAll, onSubmit }: {
  article: ArticleSummary;
  titles: string[];
  selected: Set<string>;
  loading: boolean;
  submitting: boolean;
  error: string | null;
  onClose: () => void;
  onToggle: (title: string) => void;
  onSelectAll: () => void;
  onSubmit: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 bg-black/20 px-4 pt-[8vh] backdrop-blur-sm" onMouseDown={onClose}>
      <div className="mx-auto w-full max-w-2xl overflow-hidden rounded-lg border border-line bg-surface-1 shadow-2xl" onMouseDown={(event) => event.stopPropagation()}>
        <div className="hairline-b px-4 py-3">
          <div className="flex items-center gap-2 text-[15px] font-semibold text-ink"><Sparkles className="size-4" /> Generate related article ideas</div>
          <div className="mono mt-1 truncate text-[10.5px] text-ink-subtle">From {article.title}</div>
        </div>
        <div className="max-h-[62vh] overflow-y-auto p-3">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-12 text-[12px] text-ink-muted"><Loader2 className="size-4 animate-spin" /> Generating related titles...</div>
          ) : error ? (
            <div className="rounded border border-danger/20 bg-danger/5 px-3 py-3 text-[12px] text-danger">{error}</div>
          ) : (
            <div className="divide-y divide-line/70 overflow-hidden rounded-md border border-line">
              {titles.map((title) => (
                <label key={title} className="flex cursor-pointer items-start gap-3 px-3 py-2.5 hover:bg-surface-2">
                  <input type="checkbox" checked={selected.has(title)} onChange={() => onToggle(title)} className="mt-0.5" />
                  <span className="text-[13px] text-ink">{title}</span>
                </label>
              ))}
            </div>
          )}
        </div>
        <div className="hairline-t flex items-center justify-between gap-3 px-4 py-3">
          <button onClick={onSelectAll} disabled={loading || !titles.length} className="text-[11.5px] text-ink-muted hover:text-ink disabled:opacity-40">{selected.size === titles.length && titles.length ? "Clear all" : "Select all"}</button>
          <div className="flex items-center gap-2">
            <button onClick={onClose} disabled={submitting} className="h-8 rounded px-3 text-[12px] text-ink-muted hover:bg-surface-3 disabled:opacity-50">Cancel</button>
            <button onClick={onSubmit} disabled={loading || submitting || selected.size === 0} className="flex h-8 items-center gap-1.5 rounded bg-ink px-3 text-[12px] font-medium text-white disabled:opacity-40">
              {submitting && <Loader2 className="size-3.5 animate-spin" />} Add {selected.size || ""} to queue
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ScheduleArticlesModal({
  selectedCount,
  value,
  submitting,
  onClose,
  onChange,
  onSubmit
}: {
  selectedCount: number;
  value: ScheduleFormState;
  submitting: boolean;
  onClose: () => void;
  onChange: (patch: Partial<ScheduleFormState>) => void;
  onSubmit: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 bg-black/20 px-4 pt-[10vh] backdrop-blur-sm" onMouseDown={onClose}>
      <div className="mx-auto w-full max-w-xl overflow-hidden rounded-lg border border-line bg-surface-1 shadow-2xl" onMouseDown={(event) => event.stopPropagation()}>
        <div className="hairline-b px-4 py-3">
          <div className="text-[15px] font-semibold text-ink">Schedule Articles</div>
          <div className="mono mt-1 text-[10.5px] text-ink-subtle">Selected Articles: {selectedCount}</div>
        </div>
        <div className="space-y-4 p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-[11px] font-medium text-ink-muted">Date</span>
              <input
                type="date"
                value={value.date}
                onChange={(event) => onChange({ date: event.currentTarget.value })}
                className="h-9 w-full rounded-md border border-line bg-surface-1 px-3 text-[12px] text-ink outline-none"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-[11px] font-medium text-ink-muted">Time</span>
              <input
                type="time"
                value={value.time}
                onChange={(event) => onChange({ time: event.currentTarget.value })}
                className="h-9 w-full rounded-md border border-line bg-surface-1 px-3 text-[12px] text-ink outline-none"
              />
            </label>
          </div>
          <div>
            <div className="mb-2 text-[11px] font-medium text-ink-muted">Publishing Pattern</div>
            <div className="space-y-2 rounded-md border border-line bg-surface-2 p-3">
              {SCHEDULE_PATTERN_OPTIONS.map((option) => (
                <label key={option.value} className="flex cursor-pointer items-center gap-2 text-[12px] text-ink">
                  <input
                    type="radio"
                    name="schedule-pattern"
                    checked={value.pattern === option.value}
                    onChange={() => onChange({ pattern: option.value })}
                  />
                  <span>{option.label}</span>
                </label>
              ))}
            </div>
          </div>
          {value.pattern === "custom_interval" && (
            <div className="grid gap-3 sm:grid-cols-[120px_minmax(0,1fr)]">
              <label className="block">
                <span className="mb-1 block text-[11px] font-medium text-ink-muted">Every</span>
                <input
                  type="number"
                  min={1}
                  value={value.customIntervalValue}
                  onChange={(event) => onChange({ customIntervalValue: Number(event.currentTarget.value) || 1 })}
                  className="h-9 w-full rounded-md border border-line bg-surface-1 px-3 text-[12px] text-ink outline-none"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-[11px] font-medium text-ink-muted">Interval Unit</span>
                <select
                  value={value.customIntervalUnit}
                  onChange={(event) => onChange({ customIntervalUnit: event.currentTarget.value as PublishingScheduleIntervalUnit })}
                  className="h-9 w-full rounded-md border border-line bg-surface-1 px-3 text-[12px] text-ink outline-none"
                >
                  {SCHEDULE_INTERVAL_UNIT_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </label>
            </div>
          )}
        </div>
        <div className="hairline-t flex items-center justify-between gap-3 px-4 py-3">
          <button onClick={onClose} disabled={submitting} className="h-8 rounded px-3 text-[12px] text-ink-muted hover:bg-surface-3 disabled:opacity-50">Cancel</button>
          <button onClick={onSubmit} disabled={submitting || selectedCount === 0} className="flex h-8 items-center gap-1.5 rounded bg-ink px-3 text-[12px] font-medium text-white disabled:opacity-40">
            {submitting && <Loader2 className="size-3.5 animate-spin" />} Schedule Articles
          </button>
        </div>
      </div>
    </div>
  );
}

function GlobalSearchModal({
  query,
  onQueryChange,
  results,
  loading,
  onClose,
  onOpenResult
}: {
  query: string;
  onQueryChange: (query: string) => void;
  results: GlobalSearchResponse | null;
  loading: boolean;
  onClose: () => void;
  onOpenResult: (result: GlobalSearchResult) => void;
}) {
  const groups: Array<{ type: GlobalSearchResultType; label: string }> = [
    { type: "project", label: "Projects" },
    { type: "article", label: "Articles" },
    { type: "research_run", label: "Research Runs" },
    { type: "research_source", label: "Research Sources" },
    { type: "research_finding", label: "Research Findings" }
  ];
  const total = groups.reduce((sum, group) => sum + (results?.groups[group.type]?.length ?? 0), 0);
  return (
    <div className="fixed inset-0 z-50 bg-black/20 px-4 pt-[12vh] backdrop-blur-sm" onMouseDown={onClose}>
      <div className="mx-auto w-full max-w-2xl overflow-hidden rounded-lg border border-line bg-surface-1 shadow-2xl" onMouseDown={(event) => event.stopPropagation()}>
        <div className="hairline-b flex h-12 items-center gap-2 px-3">
          <Search className="size-4 text-ink-subtle" />
          <input
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            autoFocus
            placeholder="Search projects, articles, research, sources..."
            className="h-full min-w-0 flex-1 bg-transparent text-[14px] text-ink outline-none placeholder:text-ink-subtle"
          />
          {loading && <Loader2 className="size-4 animate-spin text-ink-subtle" />}
        </div>
        <div className="max-h-[62vh] overflow-y-auto p-2">
          {query.trim().length < 2 ? (
            <Empty text="Type at least two characters." />
          ) : total === 0 && !loading ? (
            <Empty text="No matching records found." />
          ) : (
            groups.map((group) => {
              const items = results?.groups[group.type] ?? [];
              if (!items.length) return null;
              return (
                <div key={group.type} className="mb-2 last:mb-0">
                  <div className="mono px-2 pb-1 pt-2 text-[10px] uppercase tracking-[0.16em] text-ink-subtle">{group.label}</div>
                  <div className="divide-y divide-line/70 overflow-hidden rounded-md border border-line">
                    {items.map((item) => (
                      <button key={`${item.type}:${item.id}`} onClick={() => onOpenResult(item)} className="block w-full bg-surface-1 px-3 py-2 text-left hover:bg-surface-2">
                        <span className="block truncate text-[13px] font-medium text-ink">{item.title}</span>
                        <span className="mono mt-0.5 block truncate text-[10.5px] text-ink-subtle">{item.subtitle ?? item.matchedText ?? item.url ?? item.projectId}</span>
                      </button>
                    ))}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

function ProjectDashboard({
  state,
  articles,
  jobs,
  summary,
  activeFilter,
  pinnedArticleIds,
  sourceCounts,
  selectedArticleIds,
  bulkProgress,
  bulkBusy,
  activeArticleId,
  onSelectArticle,
  onFilterChange,
  onOpenProjectSettings,
  onToggleArticleSelection,
  onToggleSelectAll,
  onRunSelectionAction
}: {
  state: AppState | null;
  articles: ArticleSummary[];
  jobs: QueueJob[];
  summary: ProjectSummary | null;
  activeFilter: "all" | "needs_review";
  pinnedArticleIds: Set<string>;
  sourceCounts: Record<string, number>;
  selectedArticleIds: Set<string>;
  bulkProgress: BulkPublishingProgress | null;
  bulkBusy: boolean;
  activeArticleId: string | null;
  onSelectArticle: (id: string) => void;
  onFilterChange: (filter: Filter) => void;
  onOpenProjectSettings: () => void;
  onToggleArticleSelection: (id: string) => void;
  onToggleSelectAll: (articleIds: string[]) => void;
  onRunSelectionAction: (action: SelectionAction) => void;
}) {
  const [sortKey, setSortKey] = useState<InventorySortKey>("updated");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [selectionActionValue, setSelectionActionValue] = useState<"" | SelectionAction>("");
  const inventoryRows = sortInventoryRows(
    articles.map((article) => ({ article, job: jobs.find((job) => job.articleId === article.id) ?? null })),
    sortKey,
    sortDirection
  );
  const contentInventory = inventoryRows;
  const contentInventoryIds = contentInventory.map(({ article }) => article.id);
  const allInventorySelected = contentInventoryIds.length > 0 && contentInventoryIds.every((articleId) => selectedArticleIds.has(articleId));
  const selectedInventoryCount = selectedArticleIds.size;
  const someInventorySelected = selectedInventoryCount > 0 && !allInventorySelected;
  const orderedRows = [
    ...contentInventory.filter(({ article }) => pinnedArticleIds.has(article.id)),
    ...contentInventory.filter(({ article }) => !pinnedArticleIds.has(article.id))
  ];
  const profile = state?.project.profile;
  function changeSort(nextKey: InventorySortKey) {
    if (nextKey === sortKey) setSortDirection((current) => current === "desc" ? "asc" : "desc");
    else {
      setSortKey(nextKey);
      setSortDirection("desc");
    }
  }
  async function handleSelectionAction() {
    if (!selectionActionValue) return;
    await onRunSelectionAction(selectionActionValue);
  }

  const applyDisabled = bulkBusy || !selectionActionValue || (selectionActionValue !== "export_package" && !selectedInventoryCount);

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="hairline-b px-6 pb-4 pt-5 lg:px-8">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="truncate text-[24px] font-semibold leading-tight tracking-tight text-ink">{state?.project.name ?? "Project"}</h1>
            {state?.project.id && (
              <button
                type="button"
                onClick={onOpenProjectSettings}
                className="inline-flex size-7 shrink-0 items-center justify-center rounded-md text-ink-muted transition hover:bg-surface-2 hover:text-ink"
                aria-label="Project settings"
                title="Project settings"
              >
                <Settings className="size-3.5" />
              </button>
            )}
          </div>
          <div className="mono mt-2 text-[11px] text-ink-muted">
            {formatNumber(summary?.articleCount ?? articles.length)} articles
            {profile ? ` • ${profile.regionLabel} • ${profile.audienceLabel} • ${formatNumber(profile.defaultTargetWords)} words` : ""}
          </div>
        </div>
        <div className="mt-4 overflow-x-auto">
          <div className="flex min-w-max items-center whitespace-nowrap">
            <div className="flex items-center gap-2">
              <ContentFilterChip
                label="All articles"
                value={summary?.articleCount ?? articles.length}
                active={activeFilter === "all"}
                onClick={() => onFilterChange("all")}
              />
              <ContentFilterChip
                label="Needs review"
                value={summary?.reviewCount ?? 0}
                active={activeFilter === "needs_review"}
                warn={(summary?.reviewCount ?? 0) > 0}
                onClick={() => onFilterChange("needs_review")}
              />
              <ContentSortSelect sortKey={sortKey} sortDirection={sortDirection} onChangeSort={changeSort} />
            </div>
            <div className="ml-auto flex items-center gap-2">
              <select
                value={selectionActionValue}
                onChange={(event) => setSelectionActionValue(event.currentTarget.value as SelectionAction | "")}
                disabled={bulkBusy}
                className="h-8 min-w-40 rounded-md border border-line bg-surface-1 px-3 text-[12px] text-ink outline-none disabled:opacity-50"
                aria-label="Selection actions"
              >
                <option value="">Actions</option>
                {SELECTION_ACTION_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
              <button
                onClick={() => void handleSelectionAction()}
                disabled={applyDisabled}
                className="inline-flex h-8 items-center rounded-md bg-ink px-3 text-[12px] font-medium text-white disabled:bg-surface-3 disabled:text-ink-subtle"
              >
                {selectionActionValue ? bulkActionLabel(selectionActionValue) : "Apply"}
              </button>
              {bulkProgress && (
                <span className="mono text-[10.5px] text-ink-subtle">
                  {bulkActionLabel(bulkProgress.action)} {bulkProgress.completed}/{bulkProgress.total}
                  {bulkProgress.failed ? ` · ${bulkProgress.failed} failed` : ""}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto px-6 py-5 lg:px-8">
        {orderedRows.length ? (
          <div className="pt-2">
            <InventoryTable
              rows={orderedRows}
              sourceCounts={sourceCounts}
              selectedArticleIds={selectedArticleIds}
              pinnedArticleIds={pinnedArticleIds}
              activeArticleId={activeArticleId}
              allVisibleSelected={allInventorySelected}
              someVisibleSelected={someInventorySelected}
              onToggleArticleSelection={onToggleArticleSelection}
              onToggleSelectAll={() => onToggleSelectAll(contentInventoryIds)}
              onSelectArticle={onSelectArticle}
              sortKey={sortKey}
              sortDirection={sortDirection}
              onSort={changeSort}
            />
          </div>
        ) : (
          <Empty text={activeFilter === "needs_review" ? "Nothing needs review right now." : "Generated articles will appear here."} />
        )}
      </div>
    </div>
  );
}

function ContentFilterChip({
  label,
  value,
  active,
  onClick,
  warn = false
}: {
  label: string;
  value: number;
  active: boolean;
  onClick: () => void;
  warn?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex items-center gap-2 rounded-full border px-3 py-1.5 text-[11.5px] transition-colors",
        active ? "border-line-strong bg-surface-2 text-ink" : "border-line bg-background text-ink-muted hover:border-line-strong hover:text-ink"
      )}
    >
      <span>{label}</span>
      <span className={cn("mono rounded-full px-1.5 py-0.5 text-[10px]", warn ? "bg-warn/10 text-warn" : "bg-surface-3 text-ink-subtle")}>{formatNumber(value)}</span>
    </button>
  );
}

function ContentSortSelect({
  sortKey,
  sortDirection,
  onChangeSort
}: {
  sortKey: InventorySortKey;
  sortDirection: SortDirection;
  onChangeSort: (key: InventorySortKey) => void;
}) {
  const options: Array<{ key: InventorySortKey; label: string }> = [
    { key: "updated", label: "Updated" },
    { key: "quality", label: "Quality" },
    { key: "research", label: "Research" },
    { key: "evidence", label: "Evidence" }
  ];

  return (
    <div className="flex items-center gap-2 rounded-md border border-line bg-surface-1 px-2 py-1">
      <span className="text-[11px] text-ink-subtle">Sort</span>
      <select
        value={sortKey}
        onChange={(event) => onChangeSort(event.currentTarget.value as InventorySortKey)}
        className="bg-transparent text-[11.5px] text-ink outline-none"
      >
        {options.map((option) => <option key={option.key} value={option.key}>{option.label}</option>)}
      </select>
      <span className="mono text-[10px] text-ink-subtle">{sortDirection === "desc" ? "Desc" : "Asc"}</span>
    </div>
  );
}

function SettingsPanel({
  state,
  onClose,
  onUpdatePreferences
}: {
  state: AppState;
  onClose: () => void;
  onUpdatePreferences: (patch: WorkspacePreferencePatch) => Promise<boolean>;
}) {
  const [draft, setDraft] = useState(state.preferences);
  const [dirty, setDirty] = useState(false);
  const writerKeyEnabled = draft.aiProvider.writerKeyEnabled;
  const tavilyKeyConfigured = draft.aiProvider.researchKeyStatus === "configured";
  const updateDraft = (patch: WorkspacePreferencePatch) => {
    setDraft((current) => mergeWorkspacePreferences(current, patch));
    setDirty(true);
  };
  const save = async () => {
    const saved = await onUpdatePreferences({
      account: draft.account,
      notifications: { enabled: draft.notifications.enabled },
      aiProvider: draft.aiProvider
    });
    if (saved) setDirty(false);
  };
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="hairline-b px-6 pb-4 pt-5 lg:px-8">
        <div className="mono text-[10px] uppercase tracking-[0.18em] text-ink-subtle">Settings</div>
        <div className="mt-1 flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="truncate text-[24px] font-semibold leading-tight tracking-tight text-ink">Settings</h1>
            <div className="mono mt-2 text-[11px] text-ink-muted">QueueWrite Research</div>
          </div>
          <button onClick={onClose} className="h-8 rounded-md px-3 text-[12px] text-ink-muted hover:bg-surface-3 hover:text-ink">Close</button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto px-5 py-4 sm:px-6 lg:px-8 xl:px-10">
        <div className="w-full max-w-none">
          <SettingsSection title="Settings">
            <SettingsTextInput label="Name" value={draft.account.name} onSave={(name) => updateDraft({ account: { name } })} />
            <SettingsTextInput label="Email address" value={draft.account.email} type="email" onSave={(email) => updateDraft({ account: { email } })} />
            <SettingsTextInput label="Workspace Name" value={draft.account.workspaceName} onSave={(workspaceName) => updateDraft({ account: { workspaceName } })} />

            <a href="/settings/billing" className="mt-3 flex items-center justify-between rounded-md border border-line bg-surface-2 px-3 py-3 text-sm text-ink hover:border-line-strong hover:bg-surface-3">
              <span>
                <span className="block font-medium">Billing</span>
                <span className="mt-0.5 block text-xs text-ink-muted">Current plan, usage, limits and upgrades</span>
              </span>
              <ChevronRight className="size-4 text-ink-subtle" />
            </a>

            <div className="my-3 h-px bg-line" />

            <SettingsToggle
              label="Notifications"
              checked={draft.notifications.enabled}
              onChange={(enabled) => updateDraft({ notifications: { enabled } })}
            />

            <div className="my-3 h-px bg-line" />

            <SettingsToggle
              label="BYOK Writer Key"
              checked={writerKeyEnabled}
              onChange={(writerKeyEnabled) => updateDraft({
                aiProvider: {
                  writerKeyEnabled,
                  writerApiKey: writerKeyEnabled ? draft.aiProvider.writerApiKey : ""
                }
              })}
              note="Optional. Platform AI remains the fallback until personal keys are wired into generation."
            />
            {writerKeyEnabled && (
              <SettingsSecretInput
                label="Writer API key"
                saved={draft.aiProvider.writerKeyStatus === "configured"}
                onSave={(writerApiKey) => writerApiKey && updateDraft({ aiProvider: { writerApiKey, writerKeyEnabled: true } })}
              />
            )}

            <div className="my-3 h-px bg-line" />

            <SettingsSecretInput
              label="Tavily API Key"
              saved={tavilyKeyConfigured}
              onSave={(researchApiKey) => researchApiKey && updateDraft({
                aiProvider: {
                  researchApiKey,
                  researchKeyEnabled: true,
                  researchKeyStatus: "configured",
                  byokResearchProvider: "tavily"
                }
              })}
            />
            <div className="mt-3">
              <SettingsSelect
                label="Research provider"
                value={draft.aiProvider.researchProvider ?? "queuewrite"}
                options={[
                  { key: "queuewrite", label: "QueueWrite Research" },
                  ...(tavilyKeyConfigured ? [{ key: "byok", label: "BYOK Experimental (Tavily)" }] : [])
                ]}
                onChange={(researchProvider) => updateDraft({ aiProvider: { researchProvider: researchProvider as "queuewrite" | "byok" } })}
              />
            </div>

            <div className="flex items-center justify-between rounded-md border border-line bg-surface-2 px-3 py-3">
              <div>
                <div className="text-[12px] font-medium text-ink">QueueWrite Research</div>
                <div className="mt-0.5 text-[11px] text-ink-muted">Managed source discovery and evidence extraction.</div>
              </div>
              <span className="mono text-[10px] uppercase tracking-[0.14em] text-success">Active</span>
            </div>
            <div className="mt-4 flex items-center justify-between border-t border-line pt-3">
              <span className="text-[11px] text-ink-subtle">{dirty ? "Unsaved changes" : "All changes saved"}</span>
              <button onClick={save} disabled={!dirty} className="h-8 rounded-md bg-ink px-3 text-[12px] font-medium text-white disabled:opacity-40">Save settings</button>
            </div>
          </SettingsSection>
        </div>
      </div>
    </div>
  );
}

function ProjectSettingsPanel({
  project,
  fallbackTargetWords,
  settingsBlockedReason,
  onClose,
  onSaveProjectSettings,
  onTestWordPressConnection,
  onSaveWordPressConnection
}: {
  project: ProjectDocument;
  fallbackTargetWords: number;
  settingsBlockedReason: string | null;
  onClose: () => void;
  onSaveProjectSettings: (patch: ProjectProfilePatch, contentProfile: ContentProfile) => Promise<boolean>;
  onTestWordPressConnection: (connection: WordPressConnectionDraft) => Promise<boolean>;
  onSaveWordPressConnection: (connection: WordPressConnectionDraft) => Promise<boolean>;
}) {
  const initialProfile = normalizeProjectProfile(project.profile, fallbackTargetWords);
  const savedWordPress = project.publishing?.wordpress;
  const [profile, setProfile] = useState(initialProfile);
  const [contentProfile, setContentProfile] = useState<ContentProfile>(project.defaultContentProfile ?? "industry_explainer");
  const [dirty, setDirty] = useState(false);
  const [wordpress, setWordpress] = useState<WordPressConnectionDraft>({
    siteUrl: savedWordPress?.siteUrl ?? "",
    username: savedWordPress?.username ?? "",
    applicationPassword: "",
    defaultPostStatus: savedWordPress?.defaultPostStatus ?? "draft",
    defaultCategory: savedWordPress?.defaultCategory ?? ""
  });
  const [wordpressStatus, setWordpressStatus] = useState<WordPressConnectionStatus>(savedWordPress?.connectionStatus ?? "not_connected");
  const [wordpressLastError, setWordpressLastError] = useState<string | null>(savedWordPress?.lastError ?? null);
  const [wordpressLastValidatedAt, setWordpressLastValidatedAt] = useState<string | null>(savedWordPress?.lastValidatedAt ?? null);
  const [wordpressBusy, setWordpressBusy] = useState<"idle" | "testing" | "saving">("idle");
  const updateProfile = (patch: ProjectProfilePatch) => {
    setProfile((current) => normalizeProjectProfile({ ...current, ...patch }, fallbackTargetWords));
    setDirty(true);
  };
  const save = async () => {
    if (await onSaveProjectSettings(profile, contentProfile)) setDirty(false);
  };
  const savedPasswordConfigured = savedWordPress?.applicationPasswordConfigured ?? false;
  const canSubmitWordPress = Boolean(wordpress.siteUrl.trim() && wordpress.username.trim() && (wordpress.applicationPassword.trim() || savedPasswordConfigured));
  const updateWordpress = (patch: Partial<WordPressConnectionDraft>) => {
    setWordpress((current) => ({ ...current, ...patch }));
  };
  const testWordPress = async () => {
    setWordpressBusy("testing");
    const ok = await onTestWordPressConnection(wordpress);
    setWordpressBusy("idle");
    setWordpressStatus(ok ? "connected" : "failed");
    if (ok) {
      setWordpressLastError(null);
      setWordpressLastValidatedAt(new Date().toISOString());
    } else {
      setWordpressLastError("Most recent WordPress connection check failed.");
    }
  };
  const saveWordPress = async () => {
    setWordpressBusy("saving");
    const ok = await onSaveWordPressConnection(wordpress);
    setWordpressBusy("idle");
    setWordpressStatus(ok ? "connected" : "failed");
    if (!ok) {
      setWordpressLastError("Could not save this WordPress connection.");
      return;
    }
    setWordpress((current) => ({ ...current, applicationPassword: "" }));
    setWordpressLastError(null);
    setWordpressLastValidatedAt(new Date().toISOString());
  };
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="hairline-b px-6 pb-4 pt-5 lg:px-8">
        <div className="mono text-[10px] uppercase tracking-[0.18em] text-ink-subtle">Project settings</div>
        <div className="mt-1 flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="truncate text-[24px] font-semibold leading-tight tracking-tight text-ink">{project.name}</h1>
            <div className="mono mt-2 text-[11px] text-ink-muted">{profile.regionLabel} · {profile.industryLabel} · {profile.audienceLabel} · v{profile.profileVersion}</div>
          </div>
          <button onClick={onClose} className="h-8 rounded-md px-3 text-[12px] text-ink-muted hover:bg-surface-3 hover:text-ink">Close</button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto px-5 py-4 sm:px-6 lg:px-8 xl:px-10">
        <div className="w-full max-w-none space-y-2.5">
          <CollapsibleSettingsSection title="Project Settings" defaultOpen>
            <div className="rounded-md border border-line bg-surface-2 p-3">
              <div className="text-[13px] font-medium text-ink">Generation context</div>
              <div className="mono mt-1 text-[10.5px] text-ink-subtle">{profile.regionLabel} · {profile.industryLabel} · {profile.audienceLabel} · {formatNumber(profile.defaultTargetWords)} words</div>
            </div>
            <SettingsSelect label="Region" value={profile.regionKey} options={REGION_OPTIONS} onChange={(regionKey) => updateProfile({ regionKey })} />
            <SettingsSelect
              label="Industry"
              value={profile.industryKey}
              options={INDUSTRY_OPTIONS}
              onChange={(industryKey) => updateProfile({ industryKey, audienceKey: defaultAudienceForIndustry(industryKey) })}
            />
            <SettingsSelect label="Audience" value={profile.audienceKey} options={audienceOptionsForIndustry(profile.industryKey)} onChange={(audienceKey) => updateProfile({ audienceKey })} />
            <SettingsSelect label="Default content profile" value={contentProfile} options={PROJECT_CONTENT_PROFILE_OPTIONS.map((option) => ({ key: option.value, label: option.label }))} onChange={(value) => { setContentProfile(value as ContentProfile); setDirty(true); }} />
            <label className="flex items-center justify-between gap-3 py-2 text-[13px]">
              <span className="text-ink-muted">Default target words</span>
              <input
                type="number"
                min={300}
                max={5000}
                step={100}
                value={profile.defaultTargetWords}
                disabled={Boolean(settingsBlockedReason)}
                title={settingsBlockedReason ?? "Project default target words"}
                onChange={(event) => updateProfile({ defaultTargetWords: Number(event.currentTarget.value) })}
                className="mono h-8 w-28 rounded border border-line bg-surface-1 px-2 text-right text-xs text-ink outline-none focus:border-ink disabled:opacity-50"
              />
            </label>
            {settingsBlockedReason && <div className="text-[11px] text-warn">{settingsBlockedReason}</div>}
            <div className="mt-4 flex items-center justify-between border-t border-line pt-3">
              <span className="text-[11px] text-ink-subtle">{dirty ? "Unsaved changes" : "All changes saved"}</span>
              <button onClick={save} disabled={!dirty || Boolean(settingsBlockedReason)} className="h-8 rounded-md bg-ink px-3 text-[12px] font-medium text-white disabled:opacity-40">Save project settings</button>
            </div>
          </CollapsibleSettingsSection>
          <KnowledgeBaseSettings
            projectId={project.id}
            businessTypeKey={profile.businessTypeKey}
            businessTypeLabel={profile.businessTypeLabel}
            onSaveBusinessType={async (businessTypeKey) => {
              const ok = await onSaveProjectSettings({ businessTypeKey }, contentProfile);
              if (ok) setProfile((current) => normalizeProjectProfile({ ...current, businessTypeKey }, fallbackTargetWords));
              return ok;
            }}
            disabledReason={settingsBlockedReason}
          />
          <CollapsibleSettingsSection title="Publishing">
            <div className="flex items-center justify-between rounded-md border border-line bg-surface-2 px-3 py-3">
              <div>
                <div className="text-[13px] font-medium text-ink">WordPress Connection</div>
                <div className="mt-0.5 text-[11px] text-ink-muted">Store the publishing destination on this project only.</div>
              </div>
              <WordPressConnectionStatusBadge status={wordpressStatus} />
            </div>
            <label className="block text-[12px] text-ink-muted">
              <span>Site URL</span>
              <input
                type="url"
                value={wordpress.siteUrl}
                onChange={(event) => updateWordpress({ siteUrl: event.currentTarget.value })}
                placeholder="https://example.com"
                className="mt-1 h-8 w-full rounded border border-line bg-background px-2 text-[13px] text-ink outline-none focus:border-ink"
              />
            </label>
            <label className="block text-[12px] text-ink-muted">
              <span>Username</span>
              <input
                type="text"
                value={wordpress.username}
                onChange={(event) => updateWordpress({ username: event.currentTarget.value })}
                placeholder="wordpress-username"
                className="mt-1 h-8 w-full rounded border border-line bg-background px-2 text-[13px] text-ink outline-none focus:border-ink"
              />
            </label>
            <label className="block rounded-md border border-line bg-surface-2 p-3 text-[12px] text-ink-muted">
              <span>Application Password</span>
              <input
                type="password"
                value={wordpress.applicationPassword}
                onChange={(event) => updateWordpress({ applicationPassword: event.currentTarget.value })}
                placeholder={savedPasswordConfigured ? "Saved. Enter a new password to replace it." : "Enter application password"}
                autoComplete="off"
                className="mt-1 h-8 w-full rounded border border-line bg-background px-2 text-[13px] text-ink outline-none focus:border-ink"
              />
              <div className="mt-1 text-[10.5px] text-ink-subtle">Saved passwords are encrypted and never shown again.</div>
            </label>
            <SettingsSelect
              label="Default post status"
              value={wordpress.defaultPostStatus}
              options={[
                { key: "draft", label: "Draft" },
                { key: "publish", label: "Publish" }
              ]}
              onChange={(value) => updateWordpress({ defaultPostStatus: value as WordPressPostStatus })}
            />
            <label className="block text-[12px] text-ink-muted">
              <span>Default Category</span>
              <input
                type="text"
                value={wordpress.defaultCategory}
                onChange={(event) => updateWordpress({ defaultCategory: event.currentTarget.value })}
                placeholder="Optional, for a later phase"
                className="mt-1 h-8 w-full rounded border border-line bg-background px-2 text-[13px] text-ink outline-none focus:border-ink"
              />
            </label>
            {wordpressLastValidatedAt && (
              <div className="text-[11px] text-ink-subtle">Last validated {formatDate(wordpressLastValidatedAt)}</div>
            )}
            {wordpressStatus === "failed" && (
              <div className="text-[11px] text-danger">{wordpressLastError ?? "Most recent WordPress connection check failed."}</div>
            )}
            <div className="mt-2 flex items-center justify-end gap-2 border-t border-line pt-3">
              <button
                onClick={() => void testWordPress()}
                disabled={!canSubmitWordPress || wordpressBusy !== "idle"}
                className="h-8 rounded-md border border-line bg-surface-1 px-3 text-[12px] font-medium text-ink disabled:opacity-40"
              >
                {wordpressBusy === "testing" ? "Testing..." : "Test Connection"}
              </button>
              <button
                onClick={() => void saveWordPress()}
                disabled={!canSubmitWordPress || wordpressBusy !== "idle"}
                className="h-8 rounded-md bg-ink px-3 text-[12px] font-medium text-white disabled:opacity-40"
              >
                {wordpressBusy === "saving" ? "Saving..." : "Save Connection"}
              </button>
            </div>
          </CollapsibleSettingsSection>
        </div>
      </div>
    </div>
  );
}

function CollapsibleSettingsSection({
  title,
  children,
  defaultOpen = false
}: {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  return (
    <details className="group w-full rounded-md border border-line bg-surface-1" open={defaultOpen}>
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3.5 [&::-webkit-details-marker]:hidden">
        <h2 className="text-[13px] font-semibold text-ink">{title}</h2>
        <ChevronDown className="size-4 shrink-0 text-ink-subtle transition-transform group-open:rotate-180" aria-hidden="true" />
      </summary>
      <div className="border-t border-line px-4 pb-4 pt-3">
        <div className="space-y-2">{children}</div>
      </div>
    </details>
  );
}

function SettingsSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-md border border-line bg-surface-1 p-4">
      <h2 className="text-[13px] font-semibold text-ink">{title}</h2>
      <div className="mt-3 space-y-2">{children}</div>
    </section>
  );
}

function SettingsTextInput({ label, value, onSave, type = "text" }: { label: string; value: string; onSave: (value: string) => void; type?: string }) {
  return (
    <label className="block text-[12px] text-ink-muted">
      <span>{label}</span>
      <input
        type={type}
        defaultValue={value}
        onBlur={(event) => onSave(event.currentTarget.value)}
        className="mt-1 h-8 w-full rounded border border-line bg-background px-2 text-[13px] text-ink outline-none focus:border-ink"
      />
    </label>
  );
}

function SettingsSecretInput({ label, saved, onSave }: { label: string; saved: boolean; onSave: (value: string) => void }) {
  return (
    <label className="block rounded-md border border-line bg-surface-2 p-3 text-[12px] text-ink-muted">
      <span>{label}</span>
      <input
        type="password"
        defaultValue=""
        placeholder={saved ? "Key saved. Enter a new key to replace it." : "Enter API key"}
        autoComplete="off"
        onBlur={(event) => onSave(event.currentTarget.value)}
        className="mt-1 h-8 w-full rounded border border-line bg-background px-2 text-[13px] text-ink outline-none focus:border-ink"
      />
    </label>
  );
}

function SettingsSelect({ label, value, options, onChange }: {
  label: string;
  value: string;
  options: readonly { key: string; label: string }[];
  onChange: (value: string) => void;
}) {
  return (
    <label className="block text-[12px] text-ink-muted">
      <span>{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.currentTarget.value)}
        className="mt-1 h-8 w-full rounded border border-line bg-background px-2 text-[13px] text-ink outline-none focus:border-ink"
      >
        {options.map((option) => <option key={option.key} value={option.key}>{option.label}</option>)}
      </select>
    </label>
  );
}

function SettingsToggle({ label, checked, onChange, disabled = false, note }: { label: string; checked: boolean; onChange: (checked: boolean) => void; disabled?: boolean; note?: string }) {
  return (
    <label className={cn("flex items-start justify-between gap-3 rounded py-1.5 text-[13px]", disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer")} title={note}>
      <span className="min-w-0">
        <span className="block text-ink-muted">{label}</span>
        {note && <span className="mt-0.5 block text-[11px] leading-snug text-ink-subtle">{note}</span>}
      </span>
      <span className={cn("relative mt-0.5 inline-flex h-5 w-9 shrink-0 items-center rounded-full border transition-colors", checked ? "border-ink bg-ink" : "border-line-strong bg-surface-2")}>
        <input
          type="checkbox"
          checked={checked}
          disabled={disabled}
          onChange={(event) => onChange(event.currentTarget.checked)}
          className="sr-only"
        />
        <span className={cn("block size-4 rounded-full bg-background shadow-sm transition-transform", checked ? "translate-x-4" : "translate-x-0.5")} />
      </span>
    </label>
  );
}

function WordPressConnectionStatusBadge({ status }: { status: WordPressConnectionStatus }) {
  const label = status === "connected" ? "Connected" : status === "failed" ? "Failed" : "Not Connected";
  const tone = status === "connected"
    ? "bg-success/10 text-success"
    : status === "failed"
      ? "bg-danger/10 text-danger"
      : "bg-surface-3 text-ink-subtle";
  return <span className={cn("mono rounded px-2 py-1 text-[10px] uppercase tracking-[0.14em]", tone)}>{label}</span>;
}

function ProjectInsights({
  state,
  articles,
  jobs,
  metrics,
  history
}: {
  state: AppState | null;
  articles: ArticleSummary[];
  jobs: QueueJob[];
  metrics: QueueMetrics;
  history: RunSummary[];
}) {
  const sourceCount = 0;
  const warnings = 0;
  const reviewReasons = articles.filter((article) => article.status === "needs_review").length;
  const scoreAverages = summaryScoreAverages(articles);
  const failed = jobs.filter((job) => job.status === "failed" || job.status === "research_failed").slice(0, 5);
  const topDomains = buildTopDomains(articles);

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="hairline-b px-3 py-3">
        <div className="mono text-[10px] uppercase tracking-[0.18em] text-ink-subtle">Project insights</div>
        <div className="mt-1 truncate text-[13px] font-semibold text-ink">{state?.project.name ?? "Project"}</div>
      </div>
      <div className="min-h-0 flex-1 space-y-5 overflow-auto p-3 text-sm">
        <ProjectSection title="Operational health">
          <div className="space-y-3">
            <StatusDistribution jobs={jobs} />
            <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
              <MetricLine label="Success rate" value={`${metrics.successRate}%`} />
              <MetricLine label="Approved" value={metrics.generated} />
              <MetricLine label="Review" value={metrics.needsReview} />
              <MetricLine label="Failed" value={metrics.failed} />
              <MetricLine label="Queued" value={jobs.filter((job) => job.status === "queued").length} />
              <MetricLine label="Processing" value={metrics.processingCount} />
            </div>
          </div>
        </ProjectSection>

        <ProjectSection title="Content quality">
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
              <MetricLine label="Average Q" value={scoreAverages.quality || "-"} />
              <MetricLine label="Research" value={scoreAverages.research || "-"} />
              <MetricLine label="Evidence" value={scoreAverages.evidence || "-"} />
              <MetricLine label="Warnings" value={warnings} />
              <MetricLine label="Review reasons" value={reviewReasons} />
              <MetricLine label="Approved" value={articles.filter((article) => article.status === "generated" || isApprovedArticleStatus(article.status)).length} />
            </div>
            <AttentionList articles={articles} jobs={jobs} />
          </div>
        </ProjectSection>

        <ProjectSection title="Research coverage">
          <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
            <MetricLine label="Sources" value={sourceCount} />
            <MetricLine label="Research" value={scoreAverages.research || "-"} />
            <MetricLine label="Evidence" value={scoreAverages.evidence || "-"} />
            <MetricLine label="With sources" value="-" />
            <MetricLine label="Avg/article" value={articles.length ? Math.round(sourceCount / articles.length) : "-"} />
          </div>
        </ProjectSection>

        <ProjectSection title="Source domains">
          {topDomains.length ? <SourceDomainList domains={topDomains} /> : <Empty text="Accepted research domains will appear here." />}
        </ProjectSection>

        <ProjectSection title="Export readiness">
          <ProjectExportReadiness articles={articles} jobs={jobs} metrics={metrics} />
        </ProjectSection>

        <ProjectSection title="Pipeline timings">
          <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
            <MetricLine label="Average" value={formatDuration(metrics.averageRuntimeMs)} />
            <MetricLine label="Research" value={formatDuration(metrics.averageResearchMs)} />
            <MetricLine label="Generation" value={formatDuration(metrics.averageGenerationMs)} />
            <MetricLine label="Save" value={formatDuration(metrics.averageSaveMs)} />
          </div>
        </ProjectSection>

        <ProjectSection title="Generation controls">
          <div className="space-y-3">
            <ControlFlag label="TLDR" enabled={Boolean(state?.settings.controls.includeTldr)} />
            <ControlFlag label="FAQ" enabled={Boolean(state?.settings.controls.includeFaq)} />
            <ControlFlag label="Editor pass" enabled={Boolean(state?.settings.controls.runEditor)} />
            <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
              <MetricLine label="Style" value={state?.settings.controls.styleProfile ?? "-"} />
              <MetricLine label="Tone" value={state?.settings.controls.targetTone || "-"} />
              <MetricLine label="Target words" value={state?.project.profile?.defaultTargetWords ?? state?.settings.controls.lengthTargetWords ?? "-"} />
              <MetricLine label="Stale recovery" value={state?.settings.staleProcessingMinutes ? `${state.settings.staleProcessingMinutes}m` : "-"} />
            </div>
          </div>
        </ProjectSection>

        <ProjectSection title="Failure queue">
          {failed.length ? (
            <div className="divide-y divide-line/70">
              {failed.map((job) => (
                <ProjectRow
                  key={job.id}
                  title={job.title}
                  status="Failed"
                  meta={[`Attempt ${job.attempts}`, job.fatalError ? "Fatal error recorded" : "No fatal error"]}
                />
              ))}
            </div>
          ) : (
            <Empty text="No failed jobs." />
          )}
        </ProjectSection>

        <ProjectSection title="Run history">
          {history.length ? (
            <div className="space-y-2">
              {history.slice(0, 4).map((run, index) => (
                <div key={run.id} className="grid grid-cols-[1fr_auto] gap-2 text-xs">
                  <span className="text-ink">Run #{index + 1}</span>
                  <span className="mono text-ink-subtle">{run.generated}/{run.total} generated</span>
                </div>
              ))}
            </div>
          ) : (
            <Empty text="No run history yet." />
          )}
        </ProjectSection>
      </div>
    </div>
  );
}

function DashboardStat({ label, value, detail, warn = false, danger = false }: { label: string; value: string | number; detail: string; warn?: boolean; danger?: boolean }) {
  return (
    <div className="rounded-md border border-line bg-surface-1 p-3">
      <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-subtle">{label}</div>
      <div className={cn("mono mt-2 text-2xl font-semibold text-ink", warn && "text-warn", danger && "text-danger")}>{value}</div>
      <div className="mt-1 truncate text-xs text-ink-muted">{detail}</div>
    </div>
  );
}

function WorkerStatusCard({ status }: { status: WorkerStatusSnapshot }) {
  const nextTitle = status.nextJob?.title ?? "No queued job";
  const diagnostics = [
    status.diagnostics.workerTakeovers ? `${status.diagnostics.workerTakeovers} takeovers` : null,
    status.diagnostics.manualHandoffs ? `${status.diagnostics.manualHandoffs} handoffs` : null,
    status.diagnostics.blockedContinuations ? `${status.diagnostics.blockedContinuations} blocked` : null,
    status.diagnostics.staleRecoveries ? `${status.diagnostics.staleRecoveries} stale recoveries` : null
  ].filter(Boolean).join(" · ");

  return (
    <div className={cn("rounded-md border px-3 py-2.5", workerHealthTone(status.health))}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className={cn("inline-flex h-2.5 w-2.5 rounded-full", workerHealthDot(status.health))} />
            <span className="text-[12px] font-semibold text-ink">Worker {workerHealthLabel(status.health)}</span>
          </div>
          <div className="mt-1 text-[11px] leading-snug text-ink-muted">{status.detail}</div>
        </div>
        <div className="mono text-[10.5px] text-ink-subtle">{status.remaining} pending</div>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-[10.5px] text-ink-muted">
        <MetricLine label="Next" value={nextTitle} />
        <MetricLine label="Last seen" value={relativeDate(status.lastWorkerSeenAt ?? status.serverTime)} />
        <MetricLine label="Lease" value={status.lease && !status.lease.expired ? "Active" : "Idle"} />
        <MetricLine label="Configured" value={status.configured ? "Yes" : "No"} />
      </div>
      {diagnostics && <div className="mt-2 text-[10.5px] text-ink-subtle">{diagnostics}</div>}
    </div>
  );
}

function ProjectPerformanceTab({ analytics }: { analytics: ProjectAnalytics | null }) {
  if (!analytics) return <Empty text="Loading performance analytics." />;
  const bottlenecks = new Map(analytics.bottlenecks.averages.map((item) => [item.key, item.average_ms]));
  return (
    <div className="space-y-5">
      <ProjectSection title="Performance overview">
        <div className="grid grid-cols-4 gap-3">
          <DashboardStat label="Average active" value={formatDuration(analytics.performance.average_active_total_ms)} detail="Recorded stage time" />
          <DashboardStat label="End-to-end" value={formatDuration(analytics.performance.average_end_to_end_ms)} detail="Queued to completed" />
          <DashboardStat label="Articles/hr" value={analytics.throughput.articles_per_hour ?? "-"} detail="Across completed window" />
          <DashboardStat label="Words/hr" value={analytics.throughput.words_per_hour ? formatNumber(analytics.throughput.words_per_hour) : "-"} detail="Across completed window" />
        </div>
      </ProjectSection>

      <ProjectSection title="Bottlenecks">
        <div className="grid grid-cols-4 gap-3">
          <DashboardStat label="Queue wait" value={formatDuration(bottlenecks.get("queue_wait_ms") ?? null)} detail="Started minus queued" />
          <DashboardStat label="Generation" value={formatDuration(bottlenecks.get("generation_duration_ms") ?? null)} detail="Model writing time" />
          <DashboardStat label="Visibility delay" value={formatDuration(bottlenecks.get("visibility_delay_ms") ?? null)} detail="Visible minus generated" />
          <DashboardStat label="Save" value={formatDuration(bottlenecks.get("save_duration_ms") ?? null)} detail="Article persistence" />
        </div>
        <div className="mt-4 divide-y divide-line/70">
          {analytics.bottlenecks.ranked.map((item, index) => (
            <div key={item.key} className="grid grid-cols-[32px_minmax(0,1fr)_auto] gap-3 py-2 text-xs">
              <span className="mono text-ink-subtle">#{index + 1}</span>
              <span className="font-medium text-ink">{item.label}</span>
              <span className="mono text-ink-muted">{formatDuration(item.average_ms)}</span>
            </div>
          ))}
        </div>
      </ProjectSection>

      <ProjectSection title="Queue wait breakdown">
        <div className="grid grid-cols-3 gap-3">
          {analytics.queue_wait_breakdown.averages.map((item) => (
            <DashboardStat
              key={item.key}
              label={item.label}
              value={formatDuration(item.average_ms)}
              detail={item.percent_of_queue_wait !== null ? `${item.percent_of_queue_wait}% of queue wait` : "Awaiting timestamps"}
            />
          ))}
        </div>
        <div className="mt-4 divide-y divide-line/70">
          {analytics.queue_wait_breakdown.ranked.map((item, index) => (
            <div key={item.key} className="grid grid-cols-[32px_minmax(0,1fr)_auto_auto] gap-3 py-2 text-xs">
              <span className="mono text-ink-subtle">#{index + 1}</span>
              <span className="font-medium text-ink">{item.label}</span>
              <span className="mono text-ink-muted">{formatDuration(item.average_ms)}</span>
              <span className="mono text-ink-subtle">{item.percent_of_queue_wait !== null ? `${item.percent_of_queue_wait}%` : "-"}</span>
            </div>
          ))}
        </div>
      </ProjectSection>

      <ProjectSection title="Recent runs">
        {analytics.recent_articles.length ? (
          <div className="overflow-hidden">
            <div className="grid grid-cols-[minmax(0,1fr)_64px_64px_64px_92px_92px_92px_86px] gap-2 border-b border-line/70 px-1 pb-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-subtle">
              <span>Title</span>
              <span className="text-right">Words</span>
              <span className="text-right">Sources</span>
              <span className="text-right">Quality</span>
              <span className="text-right">Active</span>
              <span className="text-right">End-to-end</span>
              <span className="text-right">Queue wait</span>
              <span>Status</span>
            </div>
            <div className="divide-y divide-line/70">
              {analytics.recent_articles.map((article) => (
                <div key={article.article_id} className="grid grid-cols-[minmax(0,1fr)_64px_64px_64px_92px_92px_92px_86px] gap-2 px-1 py-2 text-[12px]">
                  <span className="truncate font-medium text-ink">{article.title}</span>
                  <span className="mono text-right text-[10.5px] text-ink-subtle">{formatNumber(article.words)}</span>
                  <span className="mono text-right text-[10.5px] text-ink-subtle">{article.sources}</span>
                  <span className="mono text-right text-[10.5px] text-ink-subtle">{article.quality}</span>
                  <span className="mono text-right text-[10.5px] text-ink-subtle">{formatDuration(article.active_total_ms)}</span>
                  <span className="mono text-right text-[10.5px] text-ink-subtle">{formatDuration(article.end_to_end_ms)}</span>
                  <span className="mono text-right text-[10.5px] text-ink-subtle">{formatDuration(article.queue_wait_ms)}</span>
                  <span className={cn("mono text-[10.5px]", article.status === "needs_review" ? "text-warn" : "text-success")}>{article.status === "needs_review" ? "Review" : "Generated"}</span>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <Empty text="Completed articles will appear here." />
        )}
      </ProjectSection>
    </div>
  );
}

function InventoryTable({
  rows,
  sourceCounts,
  pinnedArticleIds,
  activeArticleId,
  selectedArticleIds,
  allVisibleSelected,
  someVisibleSelected,
  onToggleArticleSelection,
  onToggleSelectAll,
  onSelectArticle,
  sortKey,
  sortDirection,
  onSort
}: {
  rows: Array<{ article: ArticleSummary; job: QueueJob | null }>;
  sourceCounts: Record<string, number>;
  pinnedArticleIds: Set<string>;
  activeArticleId: string | null;
  selectedArticleIds: Set<string>;
  allVisibleSelected: boolean;
  someVisibleSelected: boolean;
  onToggleArticleSelection: (id: string) => void;
  onToggleSelectAll: () => void;
  onSelectArticle: (id: string) => void;
  sortKey: InventorySortKey;
  sortDirection: SortDirection;
  onSort: (key: InventorySortKey) => void;
}) {
  const selectAllRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (selectAllRef.current) selectAllRef.current.indeterminate = someVisibleSelected;
  }, [someVisibleSelected]);

  return (
    <div className="overflow-hidden rounded-lg border border-line/80">
      <table className="w-full table-fixed border-collapse">
        <colgroup>
          <col />
          <col className="w-[72px]" />
          <col className="w-[72px]" />
          <col className="w-[78px]" />
          <col className="w-[78px]" />
          <col className="w-[88px]" />
          <col className="w-[88px]" />
          <col className="w-[68px]" />
        </colgroup>
        <thead>
          <tr className="border-b border-line/70 bg-surface-1/70 text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-subtle">
            <th className="px-4 py-2 text-left">Article</th>
            <th className="px-3 py-2 text-right">Sources</th>
            <th className="px-3 py-2 text-right"><InventorySortHeader label="Quality" metric="quality" active={sortKey} direction={sortDirection} onSort={onSort} /></th>
            <th className="px-3 py-2 text-right"><InventorySortHeader label="Research" metric="research" active={sortKey} direction={sortDirection} onSort={onSort} /></th>
            <th className="px-3 py-2 text-right"><InventorySortHeader label="Evidence" metric="evidence" active={sortKey} direction={sortDirection} onSort={onSort} /></th>
            <th className="px-3 py-2 text-right"><InventorySortHeader label="Updated" metric="updated" active={sortKey} direction={sortDirection} onSort={onSort} /></th>
            <th className="px-3 py-2 text-right">Status</th>
            <th className="px-4 py-2 text-right">
              <label className="flex items-center justify-center">
                <input
                  ref={selectAllRef}
                  type="checkbox"
                  checked={allVisibleSelected}
                  onChange={onToggleSelectAll}
                  aria-label="Select visible articles"
                  className="size-3.5"
                />
              </label>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ article, job }) => {
            const selected = selectedArticleIds.has(article.id);
            const pinned = pinnedArticleIds.has(article.id);
            const active = activeArticleId === article.id;
            return (
              <tr
                key={article.id}
                onClick={() => onSelectArticle(article.id)}
                className={cn(
                  "group/row cursor-pointer border-b border-line/70 text-[12px] transition-colors hover:bg-surface-1/80",
                  (selected || active) && "bg-ink/[0.04]"
                )}
              >
                <td className="px-4 py-3 align-middle">
                  <div className="min-w-0">
                    <div className="flex min-w-0 items-center gap-2">
                      <span className={cn("size-1.5 shrink-0 rounded-full", article.status === "needs_review" ? "bg-warn" : article.status === "failed" || article.status === "research_failed" ? "bg-danger" : "bg-success")} />
                      {pinned && <Pin className="size-3 shrink-0 text-ink-subtle" />}
                      <span className={cn("truncate text-ink", active ? "font-semibold" : "font-medium")}>{article.title}</span>
                    </div>
                    <div className="mono mt-1 truncate text-[10.5px] text-ink-subtle">
                      {formatNumber(article.wordCount)} words
                      {job ? ` · ${attentionSummary(article, job) ?? `Attempt ${job.attempts}`}` : ""}
                    </div>
                  </div>
                </td>
                <td className="mono px-3 py-3 text-right text-[10.5px] text-ink-subtle">{sourceCounts[article.id] ?? 0}</td>
                <td className="mono px-3 py-3 text-right text-[10.5px] text-ink-subtle">{article.qualityScore}</td>
                <td className="mono px-3 py-3 text-right text-[10.5px] text-ink-subtle">{article.researchScore}</td>
                <td className="mono px-3 py-3 text-right text-[10.5px] text-ink-subtle">{article.evidenceScore}</td>
                <td className="mono px-3 py-3 text-right text-[10.5px] text-ink-subtle">{relativeDate(article.updatedAt)}</td>
                <td className="px-3 py-3 text-right align-middle">
                  <span className={cn("inline-flex rounded-full px-1.5 py-0.5 text-[9px] font-medium", statusBadgeTone(article.status))}>{statusLabel(article.status)}</span>
                </td>
                <td className="px-4 py-3 align-middle" onClick={(event) => event.stopPropagation()}>
                  <label className="flex items-center justify-center">
                    <input
                      type="checkbox"
                      checked={selected}
                      onChange={() => onToggleArticleSelection(article.id)}
                      aria-label={`Select ${article.title}`}
                      className="size-3.5"
                    />
                  </label>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function InventorySortHeader({ label, metric, active, direction, onSort }: {
  label: string;
  metric: InventorySortKey;
  active: InventorySortKey;
  direction: SortDirection;
  onSort: (metric: InventorySortKey) => void;
}) {
  const isActive = active === metric;
  const directionLabel = direction === "desc" ? "descending" : "ascending";
  return (
    <button
      onClick={() => onSort(metric)}
      className={cn(
        "w-full text-right hover:text-ink",
        isActive ? "font-bold text-ink" : "font-semibold text-ink-subtle"
      )}
      title={isActive ? `Sorted by ${label} (${directionLabel})` : `Sort by ${label}`}
      aria-label={isActive ? `${label}, sorted ${directionLabel}` : `Sort by ${label}`}
    >
      {label}
    </button>
  );
}

function sortInventoryRows(rows: Array<{ article: ArticleSummary; job: QueueJob | null }>, key: InventorySortKey, direction: SortDirection) {
  const multiplier = direction === "desc" ? -1 : 1;
  return [...rows].sort((left, right) => {
    const leftValue = inventorySortValue(left.article, key);
    const rightValue = inventorySortValue(right.article, key);
    const difference = typeof leftValue === "string" && typeof rightValue === "string"
      ? leftValue.localeCompare(rightValue)
      : Number(leftValue) - Number(rightValue);
    return difference * multiplier || right.article.updatedAt.localeCompare(left.article.updatedAt);
  });
}

function inventorySortValue(article: ArticleSummary, key: InventorySortKey) {
  if (key === "updated") return article.updatedAt;
  return key === "quality" ? article.qualityScore : key === "research" ? article.researchScore : article.evidenceScore;
}

function StatusDistribution({ jobs }: { jobs: QueueJob[] }) {
  const total = Math.max(1, jobs.length);
  const segments: { label: string; value: number; className: string }[] = [
    { label: "Approved", value: jobs.filter((job) => job.status === "generated" || isApprovedArticleStatus(job.status)).length, className: "bg-success" },
    { label: "Review", value: jobs.filter((job) => job.status === "needs_review").length, className: "bg-warn" },
    { label: "Failed", value: jobs.filter((job) => job.status === "failed" || job.status === "research_failed").length, className: "bg-danger" },
    { label: "Writing", value: jobs.filter((job) => job.status === "processing").length, className: "bg-info" },
    { label: "Queued", value: jobs.filter((job) => job.status === "queued").length, className: "bg-ink-subtle" },
    { label: "Skipped", value: jobs.filter((job) => job.status === "skipped").length, className: "bg-line-strong" }
  ];
  return (
    <div className="space-y-2">
      <div className="flex h-1.5 overflow-hidden rounded-full bg-surface-3">
        {segments.map((segment) => (
          <div key={segment.label} className={segment.className} style={{ width: `${(segment.value / total) * 100}%` }} />
        ))}
      </div>
      <div className="mono flex flex-wrap gap-x-3 gap-y-1 text-[10.5px] text-ink-subtle">
        {segments.map((segment) => (
          <span key={segment.label}>{segment.label} <span className="text-ink-muted">{segment.value}</span></span>
        ))}
      </div>
    </div>
  );
}

function AttentionList({ articles, jobs }: { articles: ArticleSummary[]; jobs: QueueJob[] }) {
  const items = [
    ...articles
      .filter((article) => article.status === "needs_review")
      .map((article) => ({
        id: article.id,
        title: article.title,
        reason: "Article needs review",
        tone: "warn" as const
      })),
    ...jobs
      .filter((job) => job.status === "failed" || job.status === "research_failed")
      .map((job) => ({
        id: job.id,
        title: job.title,
        reason: job.fatalError ?? job.needsReviewReasons[0] ?? "Failed before article save",
        tone: "danger" as const
      }))
  ].slice(0, 5);

  if (!items.length) return <div className="text-xs text-ink-subtle">No active review reasons.</div>;
  return (
    <div className="divide-y divide-line/70">
      {items.map((item) => (
        <div key={item.id} className="py-2 first:pt-0 last:pb-0">
          <div className="truncate text-[12px] font-medium text-ink">{item.title}</div>
          <div className={cn("mt-0.5 line-clamp-2 text-[11px] leading-snug", item.tone === "danger" ? "text-danger" : "text-warn")}>{item.reason}</div>
        </div>
      ))}
    </div>
  );
}

function SourceDomainList({ domains }: { domains: SourceDomainSummary[] }) {
  return (
    <div className="divide-y divide-line/70">
      {domains.slice(0, 6).map((domain) => (
        <div key={domain.domain} className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 py-2 first:pt-0 last:pb-0">
          <div className="min-w-0">
            <div className="truncate text-[12px] font-medium text-ink">{domain.domain}</div>
            <div className="mono mt-0.5 text-[10.5px] text-ink-subtle">{domain.accepted} accepted · {domain.articleCount} articles</div>
          </div>
          <div className="text-right">
            <div className="mono text-[12px] font-semibold text-ink">{domain.count}</div>
            <div className="mono mt-0.5 text-[10.5px] text-ink-subtle">Source {domain.sourceAuthority || "-"}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

function ProjectExportReadiness({ articles, jobs, metrics }: { articles: ArticleSummary[]; jobs: QueueJob[]; metrics: QueueMetrics }) {
  const generated = articles.filter((article) => article.status === "generated" || isApprovedArticleStatus(article.status)).length;
  const needsReview = articles.filter((article) => article.status === "needs_review").length;
  const failed = jobs.filter((job) => job.status === "failed" || job.status === "research_failed").length;
  const exportable = articles.length > 0;

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
        <MetricLine label="Package" value={exportable ? "Ready" : "Waiting"} />
        <MetricLine label="Articles" value={articles.length} />
        <MetricLine label="Approved" value={generated} />
        <MetricLine label="Needs review" value={needsReview} />
        <MetricLine label="Failed" value={failed} />
        <MetricLine label="Success" value={`${metrics.successRate}%`} />
      </div>
      <div className="grid grid-cols-2 gap-1.5">
        <ExportLink href="/api/export/project/markdown" label="Markdown" icon={<FileText className="size-3.5" />} disabled={!exportable} block />
        <ExportLink href="/api/export/project/docx" label="DOCX" icon={<FileArchive className="size-3.5" />} disabled={!exportable} block />
        <ExportLink href="/api/export/project/html" label="HTML" icon={<FileCode className="size-3.5" />} disabled={!exportable} block />
        <ExportLink href="/api/export/project/json" label="JSON" icon={<FileJson className="size-3.5" />} disabled={!exportable} block />
      </div>
    </div>
  );
}

function attentionSummary(article: ArticleSummary | null | undefined, job: QueueJob) {
  if (article?.status === "needs_review") return "Article needs review";
  if (job.statusReason) return job.statusReason;
  if (job.fatalError) return job.fatalError;
  if (job.needsReviewReasons.length) return job.needsReviewReasons[0];
  return null;
}

function ControlFlag({ label, enabled }: { label: string; enabled: boolean }) {
  return (
    <div className="flex items-center justify-between text-xs">
      <span className="text-ink-muted">{label}</span>
      <span className={cn("mono rounded px-1.5 py-0.5 text-[10.5px]", enabled ? "bg-success/10 text-success" : "bg-surface-2 text-ink-subtle")}>
        {enabled ? "On" : "Off"}
      </span>
    </div>
  );
}

function ProjectSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <div className="mb-2 flex items-center justify-between px-1">
        <PanelTitle title={title} />
      </div>
      <div className="rounded-md border border-line bg-surface-1 p-3">{children}</div>
    </section>
  );
}

function ProjectMenu({
  currentProjectId,
  projects,
  onSwitch,
  onProjectSettings,
  onDelete,
  onNew
}: {
  currentProjectId: string;
  projects: ProjectDocument[];
  onSwitch: (projectId: string) => void;
  onProjectSettings: (projectId: string) => void;
  onDelete: (projectId?: string) => void;
  onNew: () => void;
}) {
  return (
    <div className="absolute left-0 top-10 z-[70] w-[280px] rounded-md border border-line bg-surface-1 p-2 shadow-2xl">
      <div className="px-2 pb-2 pt-1">
        <div className="text-[13px] font-semibold text-ink">Projects</div>
      </div>
      {projects.length > 0 && (
        <div className="my-1 max-h-56 overflow-auto">
          {projects.map((project) => (
            <div
              key={project.id}
              className={cn(
                "group flex h-9 items-center gap-1 rounded-md px-2",
                project.id === currentProjectId
                  ? "bg-surface-2 shadow-sm"
                  : "hover:bg-surface-3"
              )}
            >
              <button
                type="button"
                onClick={() => onSwitch(project.id)}
                disabled={project.id === currentProjectId}
                className="flex min-w-0 flex-1 items-center text-left text-[12px] text-ink disabled:cursor-default"
              >
                <span className="truncate">{project.name}</span>
              </button>
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  onProjectSettings(project.id);
                }}
                className="grid size-6 shrink-0 place-items-center rounded text-ink-subtle opacity-0 transition-opacity hover:bg-surface-3 hover:text-ink group-hover:opacity-100"
                title={`Edit ${project.name} project settings`}
                aria-label={`Edit ${project.name} project settings`}
              >
                <Settings className="size-3" />
              </button>
              {project.id !== "default" && (
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    onDelete(project.id);
                  }}
                  className="grid size-6 shrink-0 place-items-center rounded text-ink-subtle opacity-0 transition-opacity hover:bg-danger/10 hover:text-danger group-hover:opacity-100"
                  title={`Delete ${project.name}`}
                  aria-label={`Delete ${project.name}`}
                >
                  <Trash2 className="size-3" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
      <div className="my-1 h-px bg-line/70" />
      <ProjectMenuAction label="Create Project" detail="New workspace" onClick={onNew} />
    </div>
  );
}

function GlobalMenu({
  onOpenBilling,
  onOpenAccountSettings,
  onSignOut
}: {
  onOpenBilling: () => void;
  onOpenAccountSettings: () => void;
  onSignOut: () => void;
}) {
  return (
    <div className="absolute left-0 top-10 z-[70] w-[220px] rounded-md border border-line bg-surface-1 p-1.5 shadow-2xl">
      <GlobalMenuAction label="Account Settings" onClick={onOpenAccountSettings} />
      <GlobalMenuAction label="Billing" onClick={onOpenBilling} />
      <GlobalMenuAction label="Help" disabled />
      <GlobalMenuAction label="Changelog" disabled />
      <div className="my-1 h-px bg-line/70" />
      <GlobalMenuAction label="Sign Out" onClick={onSignOut} danger />
    </div>
  );
}

function ProjectMenuAction({ label, detail, onClick, danger = false, disabled = false, title }: { label: string; detail: string; onClick: () => void; danger?: boolean; disabled?: boolean; title?: string }) {
  return (
    <button onClick={onClick} disabled={disabled} title={title} className={cn("flex h-9 w-full items-center justify-between rounded px-2 text-left text-[12.5px] hover:bg-surface-3 disabled:cursor-not-allowed disabled:opacity-50", danger ? "text-danger" : "text-ink")}>
      <span>{label}</span>
      <span className="mono text-[10.5px] text-ink-subtle">{detail}</span>
    </button>
  );
}

function GlobalMenuAction({ label, onClick, disabled = false, danger = false }: { label: string; onClick?: () => void; disabled?: boolean; danger?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex h-9 w-full items-center rounded-md px-2 text-left text-[13px] hover:bg-surface-3 disabled:cursor-not-allowed",
        disabled ? "text-ink-subtle" : danger ? "text-danger" : "text-ink"
      )}
    >
      <span>{label}</span>
    </button>
  );
}

function ProjectRow({ title, status, meta, onClick }: { title: string; status: string; meta: string[]; onClick?: () => void }) {
  const content = (
    <>
      <div className="flex items-baseline gap-3">
        <div className="min-w-0 flex-1 truncate text-[13px] font-medium text-ink">{title}</div>
        <div className="mono shrink-0 text-[10.5px] text-ink-subtle">{status}</div>
      </div>
      <div className="mono mt-1 flex flex-wrap gap-x-2 gap-y-1 text-[10.5px] text-ink-subtle">
        {meta.map((item) => <span key={item}>{item}</span>)}
      </div>
    </>
  );
  if (onClick) {
    return (
      <button onClick={onClick} className="block w-full py-2 text-left first:pt-0 last:pb-0 hover:bg-surface-2">
        {content}
      </button>
    );
  }
  return (
    <div className="py-2 first:pt-0 last:pb-0">
      {content}
    </div>
  );
}

function ProgressBar({ value }: { value: number }) {
  return (
    <div className="h-1.5 overflow-hidden rounded-full bg-surface-3">
      <div className="h-full rounded-full bg-ink" style={{ width: `${Math.max(0, Math.min(1, value)) * 100}%` }} />
    </div>
  );
}

function MetricPill({
  label,
  value,
  warn = false,
  danger = false,
  active = false,
  onClick
}: {
  label: string;
  value: number;
  warn?: boolean;
  danger?: boolean;
  active?: boolean;
  onClick?: () => void;
}) {
  return (
    <button onClick={onClick} className={cn("rounded px-2 py-1 text-left transition-colors hover:bg-surface-3", active ? "bg-ink/[0.08] ring-1 ring-line-strong" : "bg-surface-1")}>
      <div className="text-ink-subtle">{label}</div>
      <div className={cn("mt-0.5 text-[13px] font-semibold text-ink", warn && "text-warn", danger && "text-danger")}>{value}</div>
    </button>
  );
}

function QueueProjectionSummary({ projection }: { projection: QueueCostProjection }) {
  return (
    <div className="hairline-t px-3 py-2.5">
      <div className="rounded-md border border-line/80 bg-surface-1 px-2.5 py-2">
        <div className="mb-1.5 flex items-center justify-between">
          <span className="text-[11.5px] font-medium text-ink">{projection.articleCount} {projection.articleCount === 1 ? "article" : "articles"} queued</span>
          <span className="mono rounded bg-surface-3 px-1.5 py-0.5 text-[9px] uppercase tracking-[0.12em] text-ink-subtle">Estimate</span>
        </div>
        <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[10.5px]">
          <ProjectionMetric label="Words" value={formatNumber(projection.estimatedWords)} />
          <ProjectionMetric label="Runtime" value={formatEstimatedRuntime(projection.estimatedRuntimeMs)} />
          <ProjectionMetric label="Research" value={formatProjectedUsd(projection.estimatedResearchCostUsd)} />
          <ProjectionMetric label="Generation" value={formatProjectedUsd(projection.estimatedGenerationCostUsd)} />
        </div>
        <div className="mt-1.5 flex items-center justify-between border-t border-line/70 pt-1.5 text-[11px]">
          <span className="text-ink-muted">Estimated total</span>
          <span className="mono font-medium text-ink">{formatProjectedUsd(projection.estimatedTotalCostUsd)}</span>
        </div>
      </div>
    </div>
  );
}

function ProjectionMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-ink-subtle">{label}</span>
      <span className="mono text-ink-muted">{value}</span>
    </div>
  );
}

function QueueSection({ label, count, children }: { label: string; count: number; children: React.ReactNode }) {
  return (
    <section className="pb-2">
      <div className="mono flex items-center justify-between px-3 py-2 text-[10px] uppercase tracking-[0.16em] text-ink-subtle">
        <span>{label}</span>
        <span>{count}</span>
      </div>
      <div>{children}</div>
    </section>
  );
}

function QueueListItem({
  job,
  article,
  active,
  onSelect,
  onRetry,
  onAction
}: {
  job: QueueJob;
  article: ArticleSummary | null;
  active: boolean;
  onSelect: () => void;
  onRetry: () => void;
  onAction: (action: "skip" | "remove" | "regenerate_later" | "move_up" | "move_down" | "move_top" | "move_bottom") => void;
}) {
  const displayStatus = displayStatusLabel(job, article);
  const summary = attentionSummary(article, job);
  const runtime = article ? calculatePipelineRuntime(job.pipeline).totalMs : job.status === "processing" ? currentJobRuntime(job, Date.now()) : null;
  const facts = article
    ? [`${formatNumber(article.wordCount)} words`, formatDuration(runtime), `Q${article.qualityScore}`, `R${article.researchScore}`, `E${article.evidenceScore}`]
    : [`Attempt ${job.attempts}`, relativeDate(job.updatedAt)];
  return (
    <div className="group relative">
      {active && <span className="absolute inset-y-1 left-0 w-[2px] rounded-r bg-ink" />}
      <button
        onClick={onSelect}
        className={cn(
          "flex w-full items-start gap-2.5 px-3 py-2.5 text-left transition-colors",
          active ? "bg-ink/[0.06]" : "hover:bg-surface-3"
        )}
      >
        <span className={cn("mt-[7px] size-1.5 shrink-0 rounded-full", statusColor(job.status), job.status === "processing" && "animate-pulse")} />
        <span className="min-w-0 flex-1">
          <span className="flex min-w-0 items-start gap-2">
            <span className={cn("min-w-0 flex-1 truncate text-[13px] leading-snug text-ink", active ? "font-semibold" : "font-medium")}>{article?.title ?? job.title}</span>
            <span className={cn("mono shrink-0 rounded px-1.5 py-0.5 text-[10px]", statusBadgeTone(job.status))}>{displayStatus}</span>
          </span>
          <span className="mono mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[10.5px] text-ink-subtle">
            {facts.map((fact, index) => (
              <span key={`${fact}-${index}`} className="contents">
                {index > 0 && <span className="text-line-strong">·</span>}
                <span>{fact}</span>
              </span>
            ))}
          </span>
          {summary && <span className={cn("mt-1 block truncate text-[11px]", job.status === "failed" || job.status === "research_failed" ? "text-danger" : "text-warn")}>{summary}</span>}
        </span>
      </button>
      {(job.status === "failed" || job.status === "research_failed") && (
        <div className="invisible absolute right-2 top-2 flex gap-1 group-hover:visible">
          <button onClick={onRetry} className="rounded bg-surface-1 px-2 py-1 text-[10.5px] text-ink-muted shadow-sm ring-1 ring-line hover:text-ink">Retry</button>
        </div>
      )}
      {(job.status === "queued" || job.status === "processing" || job.status === "skipped") && (
        <QueueItemActions job={job} onAction={onAction} />
      )}
    </div>
  );
}

function QueueItemActions({ job, onAction }: { job: QueueJob; onAction: (action: "skip" | "remove" | "regenerate_later" | "move_up" | "move_down" | "move_top" | "move_bottom") => void }) {
  const locked = job.status === "processing";
  const title = locked ? "This article is processing and cannot be reordered, skipped or regenerated yet." : "Queue item controls";
  return (
    <div className="invisible absolute bottom-2 right-2 flex items-center gap-0.5 rounded bg-surface-1 p-0.5 shadow-sm ring-1 ring-line group-hover:visible" title={title}>
      {locked ? (
        <span className="px-1.5 py-0.5 text-[10.5px] text-ink-subtle">Locked while processing</span>
      ) : (
        <>
          <IconAction title="Move to top" onClick={() => onAction("move_top")}><ChevronsUp className="size-3" /></IconAction>
          <IconAction title="Move up" onClick={() => onAction("move_up")}><ArrowUp className="size-3" /></IconAction>
          <IconAction title="Move down" onClick={() => onAction("move_down")}><ArrowDown className="size-3" /></IconAction>
          <IconAction title="Move to bottom" onClick={() => onAction("move_bottom")}><ChevronsDown className="size-3" /></IconAction>
          <IconAction title="Regenerate later" onClick={() => onAction("regenerate_later")}><RotateCw className="size-3" /></IconAction>
          <IconAction title="Skip" danger onClick={() => onAction("skip")}><SkipForward className="size-3" /></IconAction>
          {job.status === "queued" && <IconAction title="Remove from queue" danger onClick={() => onAction("remove")}><Trash2 className="size-3" /></IconAction>}
        </>
      )}
    </div>
  );
}

function IconAction({ title, onClick, children, danger = false }: { title: string; onClick: () => void; children: React.ReactNode; danger?: boolean }) {
  return (
    <button
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
      title={title}
      className={cn("grid size-6 place-items-center rounded text-ink-subtle hover:bg-surface-3 hover:text-ink", danger && "hover:text-danger")}
    >
      {children}
    </button>
  );
}

function ArticleToolbar({
  article,
  connection,
  busy,
  viewMode,
  onViewModeChange,
  onFormat,
  onCopyAll,
  onConnectWordPress,
  onPublishDraft,
  onPublishNow
}: {
  article: ArticleDocument | null;
  connection?: ProjectWordPressConnection;
  busy: boolean;
  viewMode: ArticleViewMode;
  onViewModeChange: (mode: ArticleViewMode) => void;
  onFormat: (command: FormatCommand) => void;
  onCopyAll: () => void;
  onConnectWordPress: () => void;
  onPublishDraft: () => void;
  onPublishNow: () => void;
}) {
  const [publishMenuOpen, setPublishMenuOpen] = useState(false);
  const formatting = [
    { command: "bold" as const, icon: Bold, title: "Bold" },
    { command: "italic" as const, icon: Italic, title: "Italic" },
    { command: "link" as const, icon: LinkIcon, title: "Add or edit link" },
    { command: "unlink" as const, icon: Unlink, title: "Remove link" },
    { command: "h2" as const, icon: Heading2, title: "Heading 2" },
    { command: "h3" as const, icon: Heading3, title: "Heading 3" },
    { command: "bullet" as const, icon: List, title: "Bullet list" },
    { command: "numbered" as const, icon: ListOrdered, title: "Numbered list" }
  ];
  const connected = connection?.applicationPasswordConfigured && connection.connectionStatus === "connected";
  const publishStatus = article ? getArticlePublishingStatus(article) : null;
  const publishDisabled = !article || !connected || busy || publishStatus === "published";
  const publishTitle = !article
    ? "Select an article to publish."
    : !connected
      ? "Connect WordPress in Project Settings before publishing."
      : publishStatus === "published"
        ? "This article is already published."
        : "Publish to WordPress";
  return (
    <div className="hairline-b flex min-h-9 flex-wrap items-center gap-x-2.5 gap-y-2 px-5 py-2 lg:px-7">
      {article ? <ArticleExportActions articleId={article.id} /> : <span className="text-xs text-ink-subtle">Select an article to review exports.</span>}
      <button
        onClick={onCopyAll}
        disabled={!article}
        className="flex h-7 items-center rounded-md border border-transparent px-2.5 text-[11.5px] font-medium text-ink-muted transition-colors hover:border-line hover:bg-surface-2 hover:text-ink disabled:opacity-40"
        title="Copy full article"
      >
        Copy All
      </button>
      <div className="relative">
        <button
          onClick={() => {
            if (publishDisabled) {
              if (!connected && article && !busy) onConnectWordPress();
              return;
            }
            setPublishMenuOpen((open) => !open);
          }}
          disabled={!article || busy || publishStatus === "published"}
          title={publishTitle}
          className={cn(
            "flex h-7 items-center gap-1 rounded-md border px-2.5 text-[11.5px] font-medium transition-colors",
            publishDisabled
              ? "cursor-not-allowed border-transparent text-ink-subtle"
              : "border-transparent text-ink-muted hover:border-line hover:bg-surface-2 hover:text-ink"
          )}
        >
          Publish
          <ChevronDown className={cn("size-3 transition-transform", publishMenuOpen && "rotate-180")} />
        </button>
        {publishMenuOpen && !publishDisabled && (
          <div className="absolute left-0 top-8 z-30 w-40 overflow-hidden rounded-md border border-line bg-surface-1 p-1 shadow-lg">
            <button
              onClick={() => {
                setPublishMenuOpen(false);
                onPublishDraft();
              }}
              className="block w-full rounded px-2.5 py-2 text-left text-[12px] text-ink hover:bg-surface-2"
            >
              Publish Draft
            </button>
            <button
              onClick={() => {
                setPublishMenuOpen(false);
                onPublishNow();
              }}
              className="block w-full rounded px-2.5 py-2 text-left text-[12px] text-ink hover:bg-surface-2"
            >
              Publish Live
            </button>
          </div>
        )}
      </div>
      <div className="mx-0.5 hidden h-5 w-px bg-line sm:block" />
      <div className="flex shrink-0 items-center gap-1.5 rounded-lg border border-line bg-surface-1/80 px-1.5 py-1">
        {formatting.map(({ command, icon: Icon, title }) => (
          <button
            key={command}
            onClick={() => onFormat(command)}
            disabled={!article}
            className="grid size-7 place-items-center rounded-md border border-transparent bg-background/70 text-ink-muted transition-colors hover:border-line hover:bg-surface-2 hover:text-ink disabled:opacity-40"
            title={title}
          >
            <Icon className="size-3.5" />
          </button>
        ))}
      </div>
      <div className="ml-auto flex shrink-0 items-center rounded-md border border-line/80 bg-background/70 p-0.5">
        {(["rich", "md", "split"] as const).map((mode) => (
          <button
            key={mode}
            onClick={() => onViewModeChange(mode)}
            className={cn(
              "h-6 rounded px-2 text-[10.5px] font-medium capitalize text-ink-subtle hover:text-ink",
              viewMode === mode && "bg-surface-1 text-ink"
            )}
          >
            {mode === "md" ? "MD" : mode}
          </button>
        ))}
      </div>
    </div>
  );
}

function ArticleHeader({
  article,
  job,
  research,
  title,
  backLabel,
  onBack,
  onTitleChange,
  projectDefaultContentProfile,
  busy,
  onReviewClick,
  onApprove,
  onRegenerate
}: {
  article: ArticleDocument | null;
  job: QueueJob | null;
  research: ResearchPack | null;
  title: string;
  backLabel: string;
  onBack: () => void;
  onTitleChange: (title: string) => void;
  projectDefaultContentProfile?: ContentProfile;
  busy: boolean;
  onReviewClick: () => void;
  onApprove: () => void;
  onRegenerate: () => void;
}) {
  const [openScore, setOpenScore] = useState<keyof ArticleScores | null>(null);
  if (!article && job) {
    const profileLabel = contentProfileLabel(job.contentProfile ?? "", projectDefaultContentProfile);
    return (
      <div className="px-6 pb-3 pt-5 lg:px-8">
        <button
          type="button"
          onClick={onBack}
          className="mono inline-flex items-center gap-1 text-[11px] text-ink-muted transition-colors hover:text-ink"
        >
          <span>←</span>
          <span>{backLabel}</span>
        </button>
        <div className="mono text-[10px] uppercase tracking-[0.18em] text-ink-subtle">{displayStatusLabel(job)}</div>
        <h1 className="mt-1 text-[24px] font-semibold leading-tight tracking-tight text-ink">{job.title}</h1>
        <div className="mono mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-ink-muted">
          <div className="mono text-[11px] text-ink-muted">Attempt {job.attempts}</div>
          <MetadataDot />
          <span>{profileLabel}</span>
        </div>
      </div>
    );
  }
  if (!article) return <div className="h-24 p-5" />;
  const readingTime = Math.max(1, Math.round(article.wordCount / 230));
  const scores = calculateArticleScores(article, research);
  const selectedScore = openScore ? scores[openScore] : null;
  const profileLabel = contentProfileLabel(article.contentProfile ?? "", projectDefaultContentProfile);
  return (
    <div className="relative px-6 pb-3 pt-5 lg:px-8">
      <button
        type="button"
        onClick={onBack}
        className="mono inline-flex items-center gap-1 text-[11px] text-ink-muted transition-colors hover:text-ink"
      >
        <span>←</span>
        <span>{backLabel}</span>
      </button>
      <div className="mt-3 flex gap-4">
        <div className="min-w-0 flex-1">
          <textarea
            value={title}
            onChange={(event) => onTitleChange(event.target.value)}
            rows={Math.max(1, Math.ceil(title.length / 72))}
            spellCheck
            className="block min-h-[2.2rem] w-full resize-none overflow-hidden border-0 bg-transparent p-0 text-[24px] font-semibold leading-tight tracking-tight text-ink outline-none placeholder:text-ink-subtle"
            placeholder="Untitled article"
          />
        </div>
      </div>
      <div className="mono mt-2.5 space-y-1 text-[11px] text-ink-muted">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span>{profileLabel}</span>
          <MetadataDot />
          <ScoreMetricButton score={scores.quality} active={openScore === "quality"} onClick={() => setOpenScore(openScore === "quality" ? null : "quality")} />
          <MetadataDot />
          <ScoreMetricButton score={scores.research} active={openScore === "research"} onClick={() => setOpenScore(openScore === "research" ? null : "research")} />
          <MetadataDot />
          <ScoreMetricButton score={scores.evidence} active={openScore === "evidence"} onClick={() => setOpenScore(openScore === "evidence" ? null : "evidence")} />
          {article.status === "needs_review" && article.needsReviewReasons.length > 0 && (
            <>
              <MetadataDot />
              <button onClick={onReviewClick} className="text-warn hover:underline">
                {article.needsReviewReasons.length} review reasons
              </button>
            </>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span>Sources {article.sources.length}</span>
          <MetadataDot />
          <span>{formatNumber(article.wordCount)} words</span>
          <MetadataDot />
          <span>{readingTime} min read</span>
        </div>
      </div>
      {article.status === "needs_review" ? (
        <div className="mt-3 flex flex-wrap items-center gap-2 rounded-md border border-warn/25 bg-warn/5 px-3 py-2 text-[12px] text-ink">
          <AlertCircle className="size-4 shrink-0 text-warn" />
          <div className="min-w-[180px] flex-1">
            <div className="font-medium">Needs review</div>
            <div className="text-ink-muted">This article has validation warnings.</div>
          </div>
          <button type="button" disabled={busy} onClick={onApprove} className="rounded-md border border-line bg-background px-2.5 py-1 text-[11px] font-medium text-ink hover:bg-surface-1 disabled:opacity-50">Approve</button>
          <button type="button" disabled={busy} onClick={onRegenerate} className="inline-flex items-center gap-1 rounded-md border border-line bg-background px-2.5 py-1 text-[11px] font-medium text-ink hover:bg-surface-1 disabled:opacity-50"><RotateCw className="size-3" />Regenerate</button>
        </div>
      ) : article.status === "approved" || article.status === "scheduled" || article.status === "published" ? (
        <div className="mt-3 inline-flex items-center gap-1.5 rounded-md bg-success/10 px-2.5 py-1 text-[12px] font-medium text-success">
          <CheckCircle2 className="size-3.5" />
          Approved
        </div>
      ) : null}
      {selectedScore && <ScoreDetailPanel score={selectedScore} />}
    </div>
  );
}

function contentProfileLabel(value: ContentProfile | "", projectDefault?: ContentProfile) {
  const inheritedProfile = projectDefault ?? "industry_explainer";
  const resolvedProfile = value || inheritedProfile;
  return CONTENT_PROFILES[resolvedProfile].label;
}

function truncateHeaderBreadcrumb(value: string, maxLength = 35) {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength).trimEnd()}...`;
}

function MetadataDot() {
  return <span className="text-ink-subtle">•</span>;
}

function ArticleMetricsRail({ saveState, lastSavedAt }: { saveState: "saved" | "saving" | "error"; lastSavedAt: string | null }) {
  return (
    <div className="hairline-t mono flex h-7 shrink-0 items-center bg-surface-2/40 px-6 text-[10.5px] lg:px-8">
      <div className="flex-1" />
      <span className={cn("truncate text-ink-subtle", saveState === "error" && "text-danger")}>{formatSaveState(saveState, lastSavedAt)}</span>
    </div>
  );
}

function ScoreMetricButton({ score, active, onClick }: { score: ArticleScore; active: boolean; onClick: () => void }) {
  const tone = score.score >= 85 ? "text-ink" : score.score >= 70 ? "text-ink-muted" : "text-warn";
  return (
    <button
      type="button"
      onClick={onClick}
      title={score.tooltip}
      className={cn(
        "inline-flex items-baseline gap-1 text-left transition-colors hover:text-ink",
        active && "text-ink"
      )}
    >
      <span className="text-ink-subtle">{score.label}</span>
      <span className={cn("font-semibold text-[11px] leading-none", tone)}>{score.score}</span>
    </button>
  );
}

function ScoreDetailPanel({ score }: { score: ArticleScore }) {
  return (
    <div className="absolute left-6 top-[calc(100%-0.25rem)] z-30 max-h-[460px] w-[560px] max-w-[calc(100%-3rem)] overflow-auto rounded-md border border-line bg-surface-1 p-3 shadow-lg lg:left-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <PanelTitle title={`${score.label} Profile`} />
          <p className="mt-1 text-[11.5px] leading-snug text-ink-muted">{score.tooltip}</p>
        </div>
        <div className="mono text-right text-[20px] font-semibold text-ink">{score.score}</div>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-x-5 gap-y-1.5 text-xs">
        {score.profile.map((item) => (
          <MetricLine key={item.label} label={item.label} value={item.value} />
        ))}
      </div>
      <div className="mt-3 rounded border border-line bg-surface-2/45 p-2.5">
        <div className="mono mb-2 text-[10px] uppercase tracking-[0.16em] text-ink-subtle">Score diagnostics</div>
        <div className="space-y-1.5">
          {score.components.map((component) => (
            <div key={component.key}>
              <div className="flex items-baseline gap-2 text-[11.5px]">
                <span className="font-medium text-ink">{component.label}</span>
                <span className="mono text-ink-subtle">{Math.round(component.weight * 100)}%</span>
                <span className="mono ml-auto text-ink-muted">{component.value} → {component.contribution.toFixed(1)}</span>
              </div>
              <div className="mt-1 h-0.5 rounded-full bg-line">
                <div className="h-0.5 rounded-full bg-ink-muted" style={{ width: `${component.value}%` }} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function ArticleExportActions({ articleId }: { articleId: string }) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      const target = event.target;
      if (target instanceof Node && menuRef.current?.contains(target)) return;
      setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div ref={menuRef} className="relative shrink-0">
      <button
        onClick={() => setOpen((current) => !current)}
        className="flex h-7 cursor-pointer list-none items-center gap-1 rounded px-2 text-[11.5px] font-medium text-ink-muted hover:bg-surface-3 hover:text-ink"
      >
        Export
        <ChevronDown className={cn("size-3 text-ink-subtle transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <div className="absolute left-0 top-9 z-20 w-44 rounded-md border border-line bg-surface-1 p-1 shadow-lg">
          <ExportMenuLink href={`/api/export/article/${articleId}/markdown`} label="Markdown" icon={<FileText className="size-3.5" />} onClick={() => setOpen(false)} />
          <ExportMenuLink href={`/api/export/article/${articleId}/docx`} label="DOCX" icon={<FileArchive className="size-3.5" />} onClick={() => setOpen(false)} />
          <ExportMenuLink href={`/api/export/article/${articleId}/html`} label="HTML" icon={<FileCode className="size-3.5" />} onClick={() => setOpen(false)} />
          <ExportMenuLink href={`/api/export/article/${articleId}/json`} label="JSON" icon={<FileJson className="size-3.5" />} onClick={() => setOpen(false)} />
        </div>
      )}
    </div>
  );
}

function ExportMenuLink({ href, label, icon, onClick }: { href: string; label: string; icon: React.ReactNode; onClick?: () => void }) {
  return (
    <a href={href} onClick={onClick} className="flex h-8 items-center gap-2 rounded px-2 text-[12px] text-ink-muted hover:bg-surface-3 hover:text-ink">
      {icon}
      <span>{label}</span>
    </a>
  );
}

function ProjectSummaryPanel({ state, metrics }: { state: AppState | null; metrics: QueueMetrics }) {
  const summary = state ? calculateProjectSummary(state, null) : null;
  return (
    <SummarySection
      title="Project Summary"
      tone="context"
      defaultOpen
      summary={summary ? `${summary.articleCount} Articles · ${summary.generatedCount} Approved · ${summary.failedCount} Failed` : "Project context loading"}
    >
      {summary ? (
        <div className="space-y-2">
          <div>
            <div className="truncate text-sm font-semibold text-ink">{summary.projectName}</div>
            <div className="mono mt-1 text-[11px] text-ink-subtle">Created {formatDate(summary.createdDate)} · Last {formatDate(summary.lastActivity)}</div>
          </div>
          <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
            <MetricLine label="Articles" value={formatNumber(summary.articleCount)} />
            <MetricLine label="Approved" value={formatNumber(summary.generatedCount)} />
            <MetricLine label="Needs review" value={formatNumber(summary.reviewCount)} />
            <MetricLine label="Failed" value={formatNumber(summary.failedCount)} />
            <MetricLine label="Words" value={formatNumber(summary.totalWords)} />
            <MetricLine label="Sources" value={formatNumber(summary.totalSources)} />
            <MetricLine label="Quality" value={summary.averageQuality || "-"} />
            <MetricLine label="Research" value={summary.averageResearch || "-"} />
            <MetricLine label="Evidence" value={summary.averageEvidence || "-"} />
            <MetricLine label="Success rate" value={`${summary.successRate}%`} />
          </div>
          <ExportLink href="/api/export/project/package" label="Export All" icon={<Download className="size-3.5" />} disabled={!summary.articleCount} block />
        </div>
      ) : <Empty text="Project summary will appear once state loads." />}
    </SummarySection>
  );
}

function CurrentRunPanel({ metrics }: { metrics: QueueMetrics }) {
  return (
    <SummarySection
      title="Current Run"
      tone="active"
      summary={`${metrics.completed}/${metrics.total} complete · ETA ${formatDuration(metrics.etaMs)}`}
    >
      <div className="space-y-2">
        <div>
          <div className="mono text-xl font-semibold text-ink">{metrics.completed} / {metrics.total} Complete</div>
          {metrics.currentTitle && <div className="mt-1 truncate text-xs text-ink-muted">{metrics.currentTitle}</div>}
        </div>
        <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
          <MetricLine label="Completed" value={`${metrics.completed}/${metrics.total}`} />
          <MetricLine label="Remaining" value={metrics.remaining} />
          <MetricLine label="Processing" value={metrics.processingCount} />
          <MetricLine label="Average" value={formatDuration(metrics.averageRuntimeMs)} />
          <MetricLine label="ETA" value={formatDuration(metrics.etaMs)} />
          <MetricLine label="Run started" value={formatTime(metrics.runStartedAt)} />
        </div>
      </div>
    </SummarySection>
  );
}

function ReliabilityPanel({ metrics, history }: { metrics: QueueMetrics; history: RunSummary[] }) {
  const largestRun = history.reduce((best, run) => run.total > best ? run.total : best, 0);
  const fastestRun = history
    .map((run) => run.averageRuntimeMs)
    .filter((runtime): runtime is number => runtime !== null)
    .sort((a, b) => a - b)[0] ?? null;
  const bestRun = history
    .map((run) => ({ run, score: run.total ? (run.generated + run.needsReview) / run.total : 0 }))
    .sort((a, b) => b.score - a.score || b.run.total - a.run.total)[0]?.run ?? null;

  return (
    <SummarySection
      title="Reliability"
      tone="health"
      summary={`${metrics.successRate}% lifetime success · ${metrics.failed} failed`}
    >
      <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
        <MetricLine label="Generated" value={metrics.generated} />
        <MetricLine label="Failed" value={metrics.failed} />
        <MetricLine label="Needs review" value={metrics.needsReview} />
        <MetricLine label="Success rate" value={`${metrics.successRate}%`} />
        <MetricLine label="Best run" value={bestRun ? `${bestRun.generated}/${bestRun.total}` : "-"} />
        <MetricLine label="Largest run" value={largestRun || "-"} />
        <MetricLine label="Fastest run" value={formatDuration(fastestRun)} />
      </div>
    </SummarySection>
  );
}

function HistoryPanel({ history }: { history: RunSummary[] }) {
  return (
    <SummarySection
      title="History"
      tone="history"
      summary={history.length ? `${history[0].total} articles in latest run` : "No stored runs yet"}
    >
      {history.length ? (
        <div className="space-y-2">
          {history.slice(0, 3).map((run, index) => (
            <details key={run.id} className="rounded border border-line bg-background p-2">
              <summary className="cursor-pointer text-xs font-medium text-ink">Run #{index + 1}</summary>
              <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                <MetricLine label="Articles" value={run.total} />
                <MetricLine label="Generated" value={run.generated} />
                <MetricLine label="Review" value={run.needsReview} />
                <MetricLine label="Failed" value={run.failed} />
                <MetricLine label="Started" value={formatDate(run.startedAt)} />
                <MetricLine label="Average" value={formatDuration(run.averageRuntimeMs)} />
              </div>
            </details>
          ))}
        </div>
      ) : <Empty text="Run history appears after jobs are queued." />}
    </SummarySection>
  );
}

function SummarySection({
  title,
  tone,
  summary,
  defaultOpen = false,
  children
}: {
  title: string;
  tone: "context" | "active" | "health" | "history";
  summary: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className={cn("rounded-md border bg-surface-1", sectionTone(tone))}>
      <button onClick={() => setOpen((current) => !current)} className="flex w-full items-center gap-2 p-2 text-left">
        <span className="min-w-0 flex-1">
          <PanelTitle title={title} />
          {!open && <span className="mono mt-1 block truncate text-[11px] text-ink-subtle">{summary}</span>}
        </span>
        <ChevronDown className={cn("size-3.5 shrink-0 text-ink-subtle transition-transform", open && "rotate-180")} />
      </button>
      {open && <div className="px-2 pb-2">{children}</div>}
    </div>
  );
}

function ExportLink({
  href,
  label,
  icon,
  disabled = false,
  block = false
}: {
  href: string;
  label: string;
  icon: React.ReactNode;
  disabled?: boolean;
  block?: boolean;
}) {
  const className = cn(
    "inline-flex h-8 items-center justify-center gap-1 rounded-md border border-line bg-surface-1 px-2 text-xs text-ink hover:border-ink-subtle",
    block && "mt-1 w-full",
    disabled && "pointer-events-none opacity-45"
  );
  return (
    <a href={href} className={className} aria-disabled={disabled}>
      {icon}
      <span className="truncate">{label}</span>
    </a>
  );
}

function JobPlaceholder({ job, onRetry }: { job: QueueJob; onRetry: () => void }) {
  const runtime = calculatePipelineRuntime(job.pipeline);
  if (job.status !== "failed" && job.status !== "research_failed") {
    return (
      <div className="mx-auto max-w-[760px] px-8 py-10">
        <div className="mono text-[10px] uppercase tracking-[0.18em] text-ink-subtle">{displayStatusLabel(job)}</div>
        <h2 className="mt-2 text-2xl font-semibold tracking-tight text-ink">{job.title}</h2>
        <p className="mt-4 max-w-2xl text-sm leading-6 text-ink-muted">
          {job.status === "processing"
            ? "This title is currently moving through research and writing."
            : "This title is waiting for its turn in the queue."}
        </p>
        <div className="mt-6 grid max-w-xl grid-cols-2 gap-x-6 gap-y-2 text-xs">
          <MetricLine label="Attempt" value={job.attempts} />
          <MetricLine label="Created" value={formatDate(job.createdAt)} />
          <MetricLine label="Updated" value={relativeDate(job.updatedAt)} />
          <MetricLine label="Runtime" value={formatDuration(runtime.totalMs)} />
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[760px] px-8 py-10">
      <div className="mono text-[10px] uppercase tracking-[0.18em] text-danger">{job.status === "research_failed" ? "Research Failed" : "Failed"}</div>
      <h2 className="mt-2 text-2xl font-semibold tracking-tight text-ink">{job.title}</h2>
      <p className="mt-4 max-w-2xl text-sm leading-6 text-ink-muted">
        {job.status === "research_failed" ? "Research stopped before completion. No outline or article generation was started." : "This job has no saved article because it hit a technical failure before draft save."}
      </p>
      <div className="mt-6 grid max-w-xl grid-cols-2 gap-x-6 gap-y-2 text-xs">
        <MetricLine label="Attempt" value={job.attempts} />
        <MetricLine label="Updated" value={relativeDate(job.updatedAt)} />
        <MetricLine label="Runtime" value={formatDuration(runtime.totalMs)} />
        <MetricLine label="Failed stage" value={job.pipeline.find((step) => step.status === "failed")?.stage ?? "-"} />
      </div>
      <pre className="mono mt-6 max-w-2xl whitespace-pre-wrap rounded-md bg-surface-2 p-3 text-xs leading-relaxed text-danger">{job.statusReason ?? job.fatalError ?? "No fatal error recorded."}</pre>
      <div className="mt-4 flex gap-2">
        <button onClick={onRetry} className="h-8 rounded-md bg-ink px-3 text-[12px] font-medium text-white">Retry</button>
      </div>
    </div>
  );
}

function ArticleWorkspace({
  markdown,
  viewMode,
  editorRef,
  richEditorRef,
  onChange
}: {
  markdown: string;
  viewMode: ArticleViewMode;
  editorRef: RefObject<HTMLTextAreaElement | null>;
  richEditorRef: RefObject<HTMLDivElement | null>;
  onChange: (markdown: string) => void;
}) {
  if (viewMode === "split") {
    return (
      <div className="grid h-full min-h-0 grid-cols-2">
        <div className="hairline-r min-h-0 overflow-hidden">
          <MarkdownEditor markdown={markdown} editorRef={editorRef} onChange={onChange} compact />
        </div>
        <div className="min-h-0 overflow-auto">
          <MarkdownPreview markdown={markdown} compact />
        </div>
      </div>
    );
  }

  if (viewMode === "md") {
    return <MarkdownEditor markdown={markdown} editorRef={editorRef} onChange={onChange} />;
  }

  return (
    <div className="h-full min-h-0 overflow-auto">
      <RichMarkdownEditor
        markdown={markdown}
        onChange={onChange}
        editorRef={richEditorRef}
      />
    </div>
  );
}

function MarkdownPreview({ markdown, compact = false }: { markdown: string; compact?: boolean }) {
  return (
    <div className={cn("mx-auto max-w-[820px] px-8 pb-16 pt-10 text-ink", compact && "max-w-none px-8 pt-8")}>
      <div className="space-y-5">
        {renderMarkdownBlocks(markdown)}
      </div>
    </div>
  );
}

function RichMarkdownEditor({
  markdown,
  onChange,
  editorRef
}: {
  markdown: string;
  onChange: (markdown: string) => void;
  editorRef: RefObject<HTMLDivElement | null>;
}) {
  const lastMarkdownRef = useRef(markdown);

  useEffect(() => {
    const element = editorRef.current;
    if (!element) return;
    if (document.activeElement === element && markdown === lastMarkdownRef.current) return;
    if (document.activeElement === element) return;
    element.innerHTML = markdownToEditableHtml(markdown);
    lastMarkdownRef.current = markdown;
  }, [markdown]);

  function handleInput() {
    const next = editableHtmlToMarkdown(editorRef.current);
    lastMarkdownRef.current = next;
    onChange(next);
  }

  return (
    <div className="mx-auto max-w-[820px] px-8 pb-16 pt-10">
      <div
        ref={editorRef}
        contentEditable
        suppressContentEditableWarning
        spellCheck
        onInput={handleInput}
        onBlur={handleInput}
        className="min-h-[520px] space-y-5 text-ink outline-none [&_a]:underline [&_a]:decoration-line-strong [&_a]:underline-offset-4 [&_h1]:text-[30px] [&_h1]:font-semibold [&_h1]:leading-tight [&_h1]:tracking-tight [&_h2]:pt-4 [&_h2]:text-[23px] [&_h2]:font-semibold [&_h2]:leading-tight [&_h2]:tracking-tight [&_h3]:pt-2 [&_h3]:text-[19px] [&_h3]:font-semibold [&_h3]:leading-snug [&_li]:text-[17px] [&_li]:leading-8 [&_p]:text-[17px] [&_p]:leading-8 [&_ul]:list-disc [&_ul]:space-y-2 [&_ul]:pl-6"
        aria-label="Article body"
      />
    </div>
  );
}

function MarkdownEditor({
  markdown,
  editorRef,
  onChange,
  compact = false
}: {
  markdown: string;
  editorRef: RefObject<HTMLTextAreaElement | null>;
  onChange: (markdown: string) => void;
  compact?: boolean;
}) {
  return (
    <div className={cn("h-full min-h-0 overflow-hidden px-6 pb-8 pt-6 lg:px-8", compact && "px-5 pt-5 lg:px-5")}>
      <div className="relative h-full overflow-hidden rounded-md">
        <textarea
          ref={editorRef}
          value={markdown}
          onChange={(event) => onChange(event.target.value)}
          spellCheck
          className="h-full w-full resize-none border-0 bg-transparent px-2 py-2 text-[17px] leading-8 text-ink outline-none placeholder:text-ink-subtle"
          placeholder="Start writing..."
        />
      </div>
    </div>
  );
}

function Inspector({
  tab,
  setTab,
  state,
  articles,
  jobs,
  metrics,
  history,
  summary,
  analytics,
  article,
  job,
  markdown,
  onApplyMarkdown,
  details,
  selectedStage,
  setSelectedStage,
  warningsRef,
  highlightWarnings,
  busy,
  onApproveArticle,
  onRegenerateArticle,
  onNotify
}: {
  tab: InspectorTab;
  setTab: (tab: InspectorTab) => void;
  state: AppState | null;
  articles: ArticleSummary[];
  jobs: QueueJob[];
  metrics: QueueMetrics;
  history: RunSummary[];
  summary: ProjectSummary | null;
  analytics: ProjectAnalyticsSummary | null;
  article: ArticleDocument | null;
  job: QueueJob | null;
  markdown: string;
  onApplyMarkdown: (markdown: string) => void;
  details: Details;
  selectedStage: string;
  setSelectedStage: (stage: string) => void;
  warningsRef: RefObject<HTMLDivElement | null>;
  highlightWarnings: boolean;
  busy: boolean;
  onApproveArticle: (articleId: string) => void;
  onRegenerateArticle: (article: ArticleDocument) => void;
  onNotify: (message: string) => void;
}) {
  return (
    <div className="min-h-0 flex-1 overflow-auto p-3 text-sm">
      {tab === "project" && <ProjectContextPanel state={state} articles={articles} jobs={jobs} metrics={metrics} history={history} summary={summary} analytics={analytics} />}
      {tab === "research" && (article ? <ResearchPanel research={details.research} article={article} /> : <Empty text={job?.status === "queued" ? "Research will appear once generation starts." : "Research is being prepared."} />)}
      {tab === "pipeline" && <PipelinePanel pipeline={(article?.pipeline ?? job?.pipeline) ?? []} article={article} job={job} details={details} selectedStage={selectedStage} setSelectedStage={setSelectedStage} setTab={setTab} />}
      {tab === "validation" && (article ? <ValidationPanel article={article} warningsRef={warningsRef} highlightWarnings={highlightWarnings} busy={busy} onApprove={() => onApproveArticle(article.id)} onRegenerate={() => onRegenerateArticle(article)} /> : <Empty text={job?.fatalError ?? "Validation will appear after the article is generated."} />)}
      {tab === "seo" && (article ? (
        <SeoDecisionPanel
          key={article.id}
          article={article}
          markdown={markdown}
          research={details.research}
          profile={state ? normalizeProjectProfile(state.project.profile, state.settings.controls.lengthTargetWords) : null}
          projectId={state?.project.id ?? article.projectId}
          onApplyMarkdown={onApplyMarkdown}
          onNotify={onNotify}
        />
      ) : <Empty text="No article available for SEO checks." />)}
      {tab === "debug" && <DebugPanel debug={details.debug} />}
    </div>
  );
}

function ProjectContextPanel({
  state,
  articles,
  jobs,
  metrics,
  history,
  summary,
  analytics
}: {
  state: AppState | null;
  articles: ArticleSummary[];
  jobs: QueueJob[];
  metrics: QueueMetrics;
  history: RunSummary[];
  summary: ProjectSummary | null;
  analytics: ProjectAnalyticsSummary | null;
}) {
  const latestRun = history[0] ?? null;
  const averageLength = articles.length && summary ? Math.round(summary.totalWords / articles.length) : null;
  const status = projectStatus(metrics, jobs);
  const profile = state ? normalizeProjectProfile(state.project.profile, state.settings.controls.lengthTargetWords) : null;
  return (
    <div className="space-y-5">
      {state && summary ? (
        <ProjectSection title="Project context">
          <div className="space-y-3">
            <div>
              <div className="truncate text-[13px] font-semibold text-ink">{state.project.name}</div>
              <div className="mono mt-1 text-[10.5px] text-ink-subtle">{status}</div>
            </div>
            {profile && (
              <div className="rounded-md border border-line bg-surface-2 p-3">
                <div className="mono text-[10px] uppercase tracking-[0.14em] text-ink-subtle">Active Project Profile</div>
                <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                  <MetricLine label="Region" value={profile.regionLabel} />
                  <MetricLine label="Industry" value={profile.industryLabel} />
                  <MetricLine label="Audience" value={profile.audienceLabel} />
                  <MetricLine label="Target Words" value={formatNumber(profile.defaultTargetWords)} />
                  <MetricLine label="Profile Version" value={`v${profile.profileVersion}`} />
                </div>
              </div>
            )}
            <div className="text-[11px] leading-relaxed text-ink-muted">
              The left rail manages queued work. The centre holds the article library. This panel stays focused on context, quality, and supporting signals.
            </div>
          </div>
        </ProjectSection>
      ) : null}

      {summary && articles.length ? (
        <ProjectSection title="Content metrics">
          <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
            <MetricLine label="Average Quality" value={summary.averageQuality || "-"} />
            <MetricLine label="Average Research" value={summary.averageResearch || "-"} />
            <MetricLine label="Average Evidence" value={summary.averageEvidence || "-"} />
            <MetricLine label="Words" value={formatNumber(summary.totalWords)} />
            {averageLength !== null && <MetricLine label="Avg length" value={formatNumber(averageLength)} />}
            <MetricLine label="Sources" value={formatNumber(summary.totalSources)} />
          </div>
        </ProjectSection>
      ) : null}

      {jobs.length || analytics ? (
        <ProjectSection title="Operational health">
          <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
            <MetricLine label="Success rate" value={`${metrics.successRate}%`} />
            {metrics.throughputPerHour !== null && <MetricLine label="Throughput" value={`${metrics.throughputPerHour}/hr`} />}
            {metrics.averageGenerationMs !== null && <MetricLine label="Avg generation" value={formatDuration(metrics.averageGenerationMs)} />}
            {latestRun && <MetricLine label="Last run" value={formatDate(latestRun.startedAt)} />}
          </div>
        </ProjectSection>
      ) : null}
    </div>
  );
}

function projectStatus(metrics: QueueMetrics, jobs: QueueJob[]) {
  if (metrics.processingCount > 0) return "Processing";
  if (jobs.some((job) => job.status === "queued")) return "Queued";
  if (metrics.failed > 0) return "Needs attention";
  if (jobs.length > 0) return "Ready";
  return "No articles queued";
}

function ResearchPanel({ research, article }: { research: ResearchPack | null; article: ArticleDocument }) {
  const sources = research?.sources ?? article.sources;
  return (
    <div className="space-y-5">
      <MetricGrid compact items={[
        ["Sources", sources.length],
        ["Rejected", research?.rejectedSources.length ?? 0],
        ["Avg source authority", research?.authorityScore ?? 0],
        ["Confidence", research?.confidence ?? 0]
      ]} />
      <SectionTitle title="Accepted sources" />
      <SourceList sources={sources.slice(0, 6)} />
      <PanelTitle title="Useful facts" />
      {(research?.usefulFacts ?? []).length ? (
        <ul className="space-y-1 text-xs leading-snug text-ink-muted">
          {(research?.usefulFacts ?? []).map((fact) => <li key={fact}>{fact}</li>)}
        </ul>
      ) : <Empty text="No useful facts recorded." />}
      <PanelTitle title="Questions found" />
      {(research?.questionsFound ?? []).length ? (
        <ul className="space-y-1 text-xs leading-snug text-ink-muted">
          {(research?.questionsFound ?? []).map((question) => <li key={question}>{question}</li>)}
        </ul>
      ) : <Empty text="No questions recorded." />}
      <PanelTitle title="Headings found" />
      {(research?.headingsFound ?? []).length ? (
        <ul className="space-y-1 text-xs leading-snug text-ink-muted">
          {(research?.headingsFound ?? []).map((heading) => <li key={heading}>{heading}</li>)}
        </ul>
      ) : <Empty text="No headings recorded." />}
    </div>
  );
}

function SourcesPanel({ research, article }: { research: ResearchPack | null; article: ArticleDocument }) {
  const accepted = research?.sources ?? article.sources;
  const rejected = research?.rejectedSources ?? [];
  return (
    <div className="space-y-5">
      <SectionTitle title="Evidence index" />
      <SourceList sources={accepted} />
      {rejected.length ? (
        <>
          <SectionTitle title="Rejected sources" />
          <SourceList sources={rejected.slice(0, 12)} rejected />
        </>
      ) : null}
    </div>
  );
}

function SourceList({ sources, rejected = false }: { sources: ResearchSource[]; rejected?: boolean }) {
  if (!sources.length) return <Empty text="No sources recorded." />;
  return (
    <ul className="divide-y divide-line/70">
      {sources.map((source) => {
        const fullTitle = getSourceDisplayTitle(source.title, source.url, source.domain);
        return (
          <li key={source.url} className="group px-1 py-3">
            <div className="flex items-start gap-2.5">
              <SourceFavicon url={source.url || source.domain} className="mt-0.5" />
              <div className="min-w-0 flex-1">
                <div title={fullTitle} className="text-[12.5px] font-medium leading-snug text-ink">{truncateSourceTitle(fullTitle)}</div>
                <a className="mono mt-1 flex items-center gap-1 truncate text-[11px] font-semibold text-ink-muted hover:text-ink" href={source.url} target="_blank" rel="noreferrer">
                  <ExternalLink className="size-2.5 shrink-0" /> {getSourceDisplayDomain(source.url, source.domain) || "Open source"}
                </a>
                <div className="mono mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-ink-subtle">
                  <span>Sources <span className="text-ink-muted">{source.authorityScore}</span></span>
                  <span>Relevance <span className="text-ink-muted">{source.relevanceScore}</span></span>
                  {rejected && <span className="text-danger">{source.rejectionReason ?? "rejected"}</span>}
                </div>
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function PipelinePanel({
  pipeline,
  article,
  job,
  details,
  selectedStage,
  setSelectedStage,
  setTab
}: {
  pipeline: ArticleDocument["pipeline"];
  article: ArticleDocument | null;
  job: QueueJob | null;
  details: Details;
  selectedStage: string;
  setSelectedStage: (stage: string) => void;
  setTab: (tab: InspectorTab) => void;
}) {
  const selected = pipeline.find((step) => step.stage === selectedStage) ?? pipeline[0];
  const runtime = calculatePipelineRuntime(pipeline);
  return (
    <div className="space-y-4">
      <ol className="relative space-y-2.5 pl-5">
        <div className="absolute bottom-2 left-[7px] top-2 w-px bg-line" />
        {pipeline.map((step) => (
          <li key={step.stage} className="relative">
            <span className="absolute -left-[18px] top-1 grid size-3 place-items-center bg-surface-2">
              {pipelineIcon(step.status)}
            </span>
            <button
              onClick={() => {
                setSelectedStage(step.stage);
                if (step.stage === "research" && article) setTab("research");
              }}
              className={cn(
                "w-full rounded px-1.5 py-1 text-left hover:bg-surface-3",
                selected?.stage === step.stage && "bg-surface-1"
              )}
            >
              <div className="flex items-baseline gap-2">
                <span className="text-[12.5px] font-medium capitalize text-ink">{step.stage}</span>
                <span className="mono ml-auto text-[10.5px] text-ink-subtle">{step.durationMs ? `${(step.durationMs / 1000).toFixed(1)}s` : step.status}</span>
              </div>
              {step.error && <p className="mt-1 text-[11px] leading-snug text-danger">{step.error}</p>}
              {step.message && <p className="mt-1 text-[11px] leading-snug text-ink-muted">{step.message}</p>}
            </button>
        </li>
      ))}
    </ol>
      {selected && <StageDetails step={selected} article={article} details={details} />}
      <MetricGrid compact items={[
        ["Active total", formatDuration(runtime.totalMs)],
        ["Research", formatDuration(runtime.researchMs)],
        ["Generation", formatDuration(runtime.generationMs)],
        ["Validation", formatDuration(runtime.validationMs)],
        ["Save", formatDuration(runtime.saveMs)]
      ]} />
      <PipelineTimingDiagnostics pipeline={pipeline} article={article} job={job} />
    </div>
  );
}

function PipelineTimingDiagnostics({ pipeline, article, job }: { pipeline: ArticleDocument["pipeline"]; article: ArticleDocument | null; job: QueueJob | null }) {
  const timing = calculateTimingDiagnostics(pipeline, article, job);
  if (!timing) return null;
  return (
    <div className="rounded-md border border-line bg-surface-1 p-3">
      <div className="mb-3 flex items-center justify-between gap-3">
        <PanelTitle title="Timing diagnostics" />
        <span className="mono text-[10.5px] text-ink-subtle">Existing timestamps</span>
      </div>
      <MetricGrid items={[
        ["Queued", formatTime(timing.queuedAt)],
        ["Started", formatTime(timing.startedAt)],
        ["Generated", formatTime(timing.generatedAt)],
        ["Pipeline active", formatDuration(timing.pipelineDurationMs)],
        ["End-to-end", formatDuration(timing.endToEndMs)],
        ["Waiting / visibility", formatDuration(timing.waitingMs)]
      ]} />
      <div className="mt-3 space-y-1.5 text-[11.5px] leading-snug text-ink-muted">
        <div>Active time is the sum of recorded stage durations.</div>
        <div>End-to-end runs from queue creation to generated article visibility in saved state.</div>
        {timing.waitingMs > 0 && <div>Difference includes queue wait, cron cadence gaps, storage/list freshness, and UI polling delay.</div>}
      </div>
    </div>
  );
}

function pipelineIcon(status: ArticleDocument["pipeline"][number]["status"]) {
  if (status === "done") return <CheckCircle2 className="size-3 text-success" />;
  if (status === "failed") return <AlertCircle className="size-3 text-danger" />;
  if (status === "running") return <Search className="size-3 animate-pulse text-info" />;
  return <span className="size-2 rounded-full border border-line-strong bg-surface-2" />;
}

function StageDetails({ step, article, details }: { step: ArticleDocument["pipeline"][number]; article: ArticleDocument | null; details: Details }) {
  const summary = (
    <MetricGrid items={[
      ["Status", step.status],
      ["Duration", formatDuration(step.durationMs ?? null)],
      ["Started", formatTime(step.startedAt)],
      ["Completed", formatTime(step.completedAt)]
    ]} />
  );

  if (step.stage === "research") {
    const research = details.research;
    const sources = research?.sources ?? article?.sources ?? [];
    return (
      <div className="space-y-3 rounded-md border border-line bg-surface-1 p-3">
        <PanelTitle title="Research detail" />
        {summary}
        <MetricGrid items={[
          ["Sources found", sources.length],
          ["Rejected", research?.rejectedSources.length ?? 0],
          ["Avg source authority", research?.authorityScore ?? 0],
          ["Confidence", research?.confidence ?? 0]
        ]} />
        {research?.queries?.length ? (
          <>
            <PanelTitle title="Queries" />
            <ul className="space-y-1 text-xs text-ink-muted">
              {research.queries.map((query) => <li key={query}>{query}</li>)}
            </ul>
          </>
        ) : null}
        <PanelTitle title="Sources" />
        <ul className="space-y-2">
          {sources.map((source) => (
            <li key={source.url} className="rounded border border-line p-2">
              <div className="text-xs font-medium">{source.title}</div>
              <a href={source.url} target="_blank" className="mono mt-1 block truncate text-[11px] text-ink-subtle">{source.domain}</a>
            </li>
          ))}
        </ul>
        {research?.rejectedSources.length ? (
          <>
            <PanelTitle title="Rejected" />
            <ul className="space-y-1 text-xs text-ink-muted">
              {research.rejectedSources.slice(0, 8).map((source) => <li key={source.url}>{source.title} - {source.rejectionReason ?? "low relevance"}</li>)}
            </ul>
          </>
        ) : null}
      </div>
    );
  }

  if (step.stage === "validation" && article) {
    return (
      <div className="space-y-3 rounded-md border border-line bg-surface-1 p-3">
        <PanelTitle title="Validation detail" />
        {summary}
        <MetricGrid items={[
          ["Quality", article.validation.qualityScore],
          ["FAQ", article.validation.faqScore],
          ["SEO", article.validation.seoScore],
          ["Warnings", article.validation.warnings.length]
        ]} />
        {article.validation.warnings.length ? (
          <ul className="space-y-2 text-xs text-ink-muted">
            {article.validation.warnings.map((warning) => <li key={warning}>{warning}</li>)}
          </ul>
        ) : <Empty text="No validation warnings." />}
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-md border border-line bg-surface-1 p-3">
      <PanelTitle title={`${step.stage} detail`} />
      {summary}
      <pre className="mono mt-2 whitespace-pre-wrap text-xs text-ink-muted">{JSON.stringify(step, null, 2)}</pre>
    </div>
  );
}

function ValidationPanel({
  article,
  warningsRef,
  highlightWarnings,
  busy,
  onApprove,
  onRegenerate
}: {
  article: ArticleDocument;
  warningsRef: RefObject<HTMLDivElement | null>;
  highlightWarnings: boolean;
  busy: boolean;
  onApprove: () => void;
  onRegenerate: () => void;
}) {
  const reviewItems = [...new Set([...article.needsReviewReasons, ...article.validation.warnings])];
  const validationGroups = buildValidationIssueGroups(reviewItems);
  const snapshot = article.profileSnapshot;
  const planning = article.planningDiagnostics;
  const readyToPublish = article.validation.pass && validationGroups.length === 0;
  return (
    <div className="space-y-4">
      <div className={cn(
        "rounded-md border p-3",
        readyToPublish ? "border-success/20 bg-success/5" : "border-warn/20 bg-warn/5"
      )}>
        <div className="flex items-start gap-2">
          {readyToPublish ? <CheckCircle2 className="mt-0.5 size-4 text-success" /> : <AlertCircle className="mt-0.5 size-4 text-warn" />}
          <div>
            <div className={cn("text-[13px] font-semibold", readyToPublish ? "text-success" : "text-warn")}>
              {readyToPublish ? "Ready to publish" : "Needs review"}
            </div>
            <div className="mt-1 text-[11.5px] leading-snug text-ink-muted">
              {readyToPublish
                ? "All validation checks passed."
                : `${validationGroups.length} validation issue${validationGroups.length === 1 ? "" : "s"} require attention before publishing.`}
            </div>
          </div>
        </div>
      </div>
      {snapshot && (
        <div className="rounded-md border border-line bg-surface-1 p-3">
          <PanelTitle title="Article profile snapshot" />
          <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
            <MetricLine label="Region" value={snapshot.regionLabel} />
            <MetricLine label="Industry" value={snapshot.industryLabel} />
            <MetricLine label="Audience" value={snapshot.audienceLabel} />
            <MetricLine label="Target words" value={formatNumber(snapshot.targetWords)} />
            <MetricLine label="Version" value={`v${snapshot.profileVersion}`} />
          </div>
        </div>
      )}
      {planning && (
        <div className="rounded-md border border-line bg-surface-1 p-3">
          <PanelTitle title="Planning" />
          <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
            <MetricLine label="Planned H2" value={formatNumber(planning.plannedH2Count)} />
            <MetricLine label="Actual H2" value={formatNumber(planning.actualH2Count)} />
            <MetricLine label="Planned H3" value={formatNumber(planning.plannedH3Count)} />
            <MetricLine label="Actual H3" value={formatNumber(planning.actualH3Count)} />
            <MetricLine label="Expected depth" value={titleCase(planning.expectedDepth)} />
            <MetricLine label="Actual depth" value={titleCase(planning.actualDepth)} />
            <MetricLine label="Plan completed" value={`${formatNumber(planning.targetAchievementPercent)}%`} />
            <MetricLine label="Plan outcome" value={titleCase(planning.plannerOutcome)} />
            <MetricLine label="Planned concepts" value={formatNumber(planning.researchConceptCount ?? 0)} />
            <MetricLine label="Coverage ratio" value={(planning.plannedBreadthRatio ?? 0).toFixed(2)} />
            <MetricLine label="Concepts covered" value={formatNumber(planning.actualBreadthCoverage ?? 0)} />
            <MetricLine label="Coverage" value={`${formatNumber(planning.actualBreadthCoveragePercent ?? 0)}%`} />
            <MetricLine label="Coverage status" value={titleCase(planning.breadthStatus ?? "sufficient")} />
          </div>
        </div>
      )}
      <div
        ref={warningsRef}
        className={cn(
          "space-y-2 rounded-md transition-shadow",
          highlightWarnings && "shadow-[0_0_0_3px_rgba(183,121,31,0.28)]"
        )}
      >
        <PanelTitle title="Validation findings" />
        {validationGroups.length ? (
          <div className="space-y-2">
            {validationGroups.map((group) => (
              <ValidationIssueCard
                key={group.title}
                group={group}
                busy={busy}
                onApprove={onApprove}
                onRegenerate={onRegenerate}
              />
            ))}
          </div>
        ) : article.status === "approved" || article.status === "scheduled" || article.status === "published" ? (
          <div className="rounded-md border border-success/20 bg-success/5 p-3 text-xs text-success">This article is ready for publication review.</div>
        ) : <Empty text="No validation warnings." />}
        {article.validation.advisories?.length ? (
          <div className="rounded-md border border-line bg-surface-1 p-3">
            <div className="text-[11px] font-medium text-ink">Editorial notes</div>
            <ul className="mt-2 space-y-2 text-xs text-ink-muted">
              {article.validation.advisories.map((advisory) => <li key={advisory} className="rounded-md bg-surface-2 p-2">{advisory}</li>)}
            </ul>
          </div>
        ) : null}
      </div>
      <ValidationScoreSummary
        items={[
          ["Quality", article.validation.qualityScore],
          ["SEO", article.validation.seoScore],
          ["Profile Match", article.profileRelevanceScore ?? article.validation.profileRelevanceScore ?? "-"],
          ["FAQ Coverage", article.validation.faqScore],
          ["Warnings", article.validation.warnings.length]
        ]}
      />
    </div>
  );
}

function ValidationIssueCard({
  group,
  busy,
  onApprove,
  onRegenerate
}: {
  group: ValidationIssueGroup;
  busy: boolean;
  onApprove: () => void;
  onRegenerate: () => void;
}) {
  return (
    <div className="rounded-md border border-line bg-surface-1 p-3 text-xs">
      <div className="flex items-center gap-2 text-[13px] font-semibold text-ink">
        <AlertCircle className="size-4 text-warn" />
        {group.title}
      </div>
      <div className="mt-1 text-[11px] font-medium text-warn">Needs review</div>
      <p className="mt-2 text-[11.5px] leading-relaxed text-ink-muted">
        {group.summary}
      </p>
      {group.issues.length > 1 ? (
        <div className="mt-3">
          <div className="text-[11px] font-medium text-ink">Issues found</div>
          <ul className="mt-2 space-y-1 text-[11px] leading-snug text-ink-muted">
            {group.issues.map((issue) => (
              <li key={issue} className="flex items-start gap-2">
                <span className="mt-[5px] size-1 shrink-0 rounded-full bg-warn" />
                <span>{issue}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <div className="mt-3">
        <div className="text-[11px] font-medium text-ink">Suggested action</div>
        <p className="mt-1 text-[11px] leading-snug text-ink-muted">{group.action}</p>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" disabled={busy} onClick={onApprove} className="rounded-md border border-line bg-background px-2.5 py-1 text-[11px] font-medium text-ink hover:bg-surface-2 disabled:opacity-50">Approve anyway</button>
        <button type="button" disabled={busy} onClick={onRegenerate} className="inline-flex items-center gap-1 rounded-md border border-line bg-background px-2.5 py-1 text-[11px] font-medium text-ink hover:bg-surface-2 disabled:opacity-50"><RotateCw className="size-3" />Regenerate</button>
      </div>
    </div>
  );
}

function DebugPanel({ debug }: { debug: DebugDocument | null }) {
  if (!debug) return <Empty text="No debug record yet." />;
  return (
    <pre className="mono whitespace-pre-wrap rounded-md bg-surface-1 p-3 text-[11px] leading-relaxed text-ink-muted">
      {debug.events.map((event) => `[${event.at}] ${event.level.toUpperCase()} ${event.stage}: ${event.message}${event.data ? `\n${JSON.stringify(event.data, null, 2)}` : ""}`).join("\n\n")}
    </pre>
  );
}

function MetricGrid({ items, compact = false }: { items: [string, string | number][]; compact?: boolean }) {
  return (
    <div className={cn("grid grid-cols-2", compact ? "gap-x-4 gap-y-2 px-1" : "gap-2")}>
      {items.map(([label, value]) => (
        <div key={label} className={cn(!compact && "rounded-md border border-line bg-surface-1 p-2")}>
          <div className="text-[10px] uppercase tracking-[0.14em] text-ink-subtle">{label}</div>
          <div className={cn("mono mt-1 font-semibold text-ink", compact ? "text-[15px]" : "text-lg")}>{value}</div>
        </div>
      ))}
    </div>
  );
}

function ValidationScoreSummary({ items }: { items: [string, string | number][] }) {
  return (
    <div className="rounded-md border border-line bg-surface-1 p-3">
      <PanelTitle title="Quality scores" />
      <div className="mt-2 space-y-2">
        {items.map(([label, value]) => (
          <div key={label} className="flex items-center gap-2 text-[11px]">
            <span className="text-ink-muted">{label}</span>
            <span className="min-w-0 flex-1 border-b border-dotted border-line/80" />
            <span className="mono font-semibold text-ink">{value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function QueueMetricsPanel({ metrics }: { metrics: QueueMetrics }) {
  const [open, setOpen] = useState({
    current: false,
    reliability: false,
    history: false
  });

  return (
    <div className="mt-3 space-y-2">
      <CollapsibleMetricCard
        title="Current queue run"
        summary={`${metrics.completed}/${metrics.total} done · ETA ${formatDuration(metrics.etaMs)}`}
        open={open.current}
        onToggle={() => setOpen((current) => ({ ...current, current: !current.current }))}
      >
        <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
          <MetricLine label="Queue size" value={metrics.total} />
          <MetricLine label="Completed" value={`${metrics.completed}/${metrics.total}`} />
          <MetricLine label="Remaining" value={metrics.remaining} />
          <MetricLine label="Processing" value={metrics.processingCount} />
          <MetricLine label="Run started" value={formatTime(metrics.runStartedAt)} />
          <MetricLine label="Current" value={formatDuration(metrics.currentRuntimeMs)} />
          <MetricLine label="Average" value={formatDuration(metrics.averageRuntimeMs)} />
          <MetricLine label="ETA" value={formatDuration(metrics.etaMs)} />
        </div>
        {metrics.currentTitle && <div className="mono mt-2 truncate text-[11px] text-ink-subtle">{metrics.currentTitle}</div>}
      </CollapsibleMetricCard>

      <CollapsibleMetricCard
        title="Reliability dashboard"
        summary={`${metrics.successRate}% success · ${metrics.throughputPerHour ? `${metrics.throughputPerHour}/hr` : "throughput pending"}`}
        open={open.reliability}
        onToggle={() => setOpen((current) => ({ ...current, reliability: !current.reliability }))}
      >
        <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
          <MetricLine label="Generated" value={metrics.generated} />
          <MetricLine label="Needs review" value={metrics.needsReview} />
          <MetricLine label="Failed" value={metrics.failed} />
          <MetricLine label="Success rate" value={`${metrics.successRate}%`} />
          <MetricLine label="Avg research" value={formatDuration(metrics.averageResearchMs)} />
          <MetricLine label="Avg generation" value={formatDuration(metrics.averageGenerationMs)} />
          <MetricLine label="Avg save" value={formatDuration(metrics.averageSaveMs)} />
          <MetricLine label="Throughput" value={metrics.throughputPerHour ? `${metrics.throughputPerHour}/hr` : "-"} />
        </div>
      </CollapsibleMetricCard>

      <CollapsibleMetricCard
        title="Reliability history"
        summary={`${metrics.completed} lifetime done · ${metrics.failed} failed`}
        open={open.history}
        onToggle={() => setOpen((current) => ({ ...current, history: !current.history }))}
      >
        <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
          <MetricLine label="Last stored run" value={`${metrics.completed} done`} />
          <MetricLine label="Last failed" value={metrics.failed} />
          <MetricLine label="Best stored run" value={`${metrics.completed} done`} />
          <MetricLine label="Best failed" value={metrics.failed} />
          <MetricLine label="Lifetime done" value={metrics.completed} />
          <MetricLine label="Lifetime failed" value={metrics.failed} />
        </div>
      </CollapsibleMetricCard>
    </div>
  );
}

function CollapsibleMetricCard({
  title,
  summary,
  open,
  onToggle,
  children
}: {
  title: string;
  summary: string;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-md border border-line bg-surface-1">
      <button onClick={onToggle} className="flex w-full items-center gap-2 p-2 text-left">
        <span className="min-w-0 flex-1">
          <PanelTitle title={title} />
          {!open && <span className="mono mt-1 block truncate text-[11px] text-ink-subtle">{summary}</span>}
        </span>
        <ChevronDown className={cn("size-3.5 shrink-0 text-ink-subtle transition-transform", open && "rotate-180")} />
      </button>
      {open && <div className="px-2 pb-2">{children}</div>}
    </div>
  );
}

function MetricLine({ label, value }: { label: string; value: string | number }) {
  return (
    <>
      <span className="text-ink-subtle">{label}</span>
      <span className="mono text-right text-ink">{value}</span>
    </>
  );
}

function PanelTitle({ title }: { title: string }) {
  return <h3 className="text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-subtle">{title}</h3>;
}

function SectionTitle({ title }: { title: string }) {
  return (
    <div className="mb-2 flex items-center justify-between px-1">
      <PanelTitle title={title} />
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <div className="p-5 text-center text-xs text-ink-subtle">{text}</div>;
}

function renderMarkdownBlocks(markdown: string) {
  const lines = markdown.split("\n");
  const blocks: React.ReactNode[] = [];
  let paragraph: string[] = [];
  let list: string[] = [];

  const flushParagraph = () => {
    if (!paragraph.length) return;
    const text = paragraph.join(" ").trim();
    if (text) {
      blocks.push(
        <p key={`p-${blocks.length}`} className="text-[17px] leading-8 text-ink">
          {renderInlineMarkdown(text)}
        </p>
      );
    }
    paragraph = [];
  };

  const flushList = () => {
    if (!list.length) return;
    blocks.push(
      <ul key={`ul-${blocks.length}`} className="list-disc space-y-2 pl-6 text-[17px] leading-8 text-ink">
        {list.map((item, index) => <li key={`${item}-${index}`}>{renderInlineMarkdown(item)}</li>)}
      </ul>
    );
    list = [];
  };

  lines.forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed) {
      flushParagraph();
      flushList();
      return;
    }

    const heading = /^(#{1,3})\s+(.+)$/.exec(trimmed);
    if (heading) {
      flushParagraph();
      flushList();
      const level = heading[1].length;
      const text = heading[2];
      if (level === 1) blocks.push(<h1 key={`h-${blocks.length}`} className="text-[30px] font-semibold leading-tight tracking-tight text-ink">{renderInlineMarkdown(text)}</h1>);
      else if (level === 2) blocks.push(<h2 key={`h-${blocks.length}`} className="pt-4 text-[23px] font-semibold leading-tight tracking-tight text-ink">{renderInlineMarkdown(text)}</h2>);
      else blocks.push(<h3 key={`h-${blocks.length}`} className="pt-2 text-[19px] font-semibold leading-snug text-ink">{renderInlineMarkdown(text)}</h3>);
      return;
    }

    const listItem = /^[-*]\s+(.+)$/.exec(trimmed) ?? /^\d+\.\s+(.+)$/.exec(trimmed);
    if (listItem) {
      flushParagraph();
      list.push(listItem[1]);
      return;
    }

    flushList();
    paragraph.push(trimmed);
  });

  flushParagraph();
  flushList();

  return blocks.length ? blocks : <p className="text-[17px] leading-8 text-ink-subtle">Start writing...</p>;
}

function markdownToEditableHtml(markdown: string) {
  return markdown.split(/\n{2,}/).map((block) => {
    const lines = block.split("\n").map((line) => line.trim()).filter(Boolean);
    if (!lines.length) return "";
    const first = lines[0];
    const heading = /^(#{1,3})\s+(.+)$/.exec(first);
    if (heading) {
      const level = heading[1].length;
      return `<h${level}>${inlineMarkdownToHtml(heading[2])}</h${level}>`;
    }
    if (lines.every((line) => /^[-*]\s+/.test(line) || /^\d+\.\s+/.test(line))) {
      return `<ul>${lines.map((line) => `<li>${inlineMarkdownToHtml(line.replace(/^[-*]\s+|^\d+\.\s+/, ""))}</li>`).join("")}</ul>`;
    }
    return `<p>${inlineMarkdownToHtml(lines.join(" "))}</p>`;
  }).filter(Boolean).join("");
}

function inlineMarkdownToHtml(value: string) {
  return escapeHtml(value)
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>')
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>");
}

function editableHtmlToMarkdown(element: HTMLElement | null) {
  if (!element) return "";
  const blocks = Array.from(element.childNodes)
    .map((node) => editableNodeToMarkdown(node))
    .map((block) => block.trim())
    .filter(Boolean);
  return blocks.join("\n\n");
}

function editableNodeToMarkdown(node: ChildNode): string {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent?.trim() ?? "";
  if (!(node instanceof HTMLElement)) return "";
  const tag = node.tagName.toLowerCase();
  if (tag === "h1") return `# ${inlineHtmlToMarkdown(node)}`;
  if (tag === "h2") return `## ${inlineHtmlToMarkdown(node)}`;
  if (tag === "h3") return `### ${inlineHtmlToMarkdown(node)}`;
  if (tag === "ul" || tag === "ol") {
    return Array.from(node.children)
      .filter((child) => child.tagName.toLowerCase() === "li")
      .map((child) => `- ${inlineHtmlToMarkdown(child as HTMLElement)}`)
      .join("\n");
  }
  if (tag === "div" && node.childElementCount === 1) return editableNodeToMarkdown(node.firstChild as ChildNode);
  return inlineHtmlToMarkdown(node);
}

function inlineHtmlToMarkdown(element: HTMLElement): string {
  return Array.from(element.childNodes).map((node) => {
    if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? "";
    if (!(node instanceof HTMLElement)) return "";
    const tag = node.tagName.toLowerCase();
    const text: string = inlineHtmlToMarkdown(node);
    if (tag === "strong" || tag === "b") return `**${text}**`;
    if (tag === "em" || tag === "i") return `*${text}*`;
    if (tag === "a") return `[${text}](${node.getAttribute("href") ?? ""})`;
    return text;
  }).join("").replace(/\s+/g, " ").trim();
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderInlineMarkdown(text: string) {
  const nodes: React.ReactNode[] = [];
  const pattern = /(\[([^\]]+)\]\(([^)]+)\)|\*\*([^*]+)\*\*|\*([^*]+)\*)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text))) {
    if (match.index > lastIndex) nodes.push(text.slice(lastIndex, match.index));
    if (match[2] && match[3]) {
      nodes.push(<a key={`a-${match.index}`} href={match[3]} className="underline decoration-line-strong underline-offset-4" target="_blank" rel="noreferrer">{match[2]}</a>);
    } else if (match[4]) {
      nodes.push(<strong key={`b-${match.index}`}>{match[4]}</strong>);
    } else if (match[5]) {
      nodes.push(<em key={`i-${match.index}`}>{match[5]}</em>);
    }
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) nodes.push(text.slice(lastIndex));
  return nodes;
}

function statusColor(status: JobStatus) {
  return {
    queued: "bg-ink-subtle",
    processing: "bg-info",
    generated: "bg-success",
    needs_review: "bg-warn",
    approved: "bg-success",
    scheduled: "bg-info",
    published: "bg-success",
    research_failed: "bg-danger",
    failed: "bg-danger",
    skipped: "bg-ink-subtle"
  }[status];
}

function statusBadgeTone(status: JobStatus) {
  return {
    queued: "bg-surface-3 text-ink-muted",
    processing: "bg-info/10 text-info",
    generated: "bg-success/10 text-success",
    needs_review: "bg-warn/10 text-warn",
    approved: "bg-success/10 text-success",
    scheduled: "bg-info/10 text-info",
    published: "bg-success/10 text-success",
    research_failed: "bg-danger/10 text-danger",
    failed: "bg-danger/10 text-danger",
    skipped: "bg-surface-3 text-ink-subtle"
  }[status];
}

function statusTextTone(status: JobStatus) {
  return {
    queued: "text-ink-subtle",
    processing: "text-info",
    generated: "text-success",
    needs_review: "text-warn",
    approved: "text-success",
    scheduled: "text-info",
    published: "text-success",
    research_failed: "text-danger",
    failed: "text-danger",
    skipped: "text-ink-subtle"
  }[status];
}

function statusLabel(status: JobStatus) {
  return {
    queued: "Queued",
    processing: "Generating",
    generated: "Generated",
    needs_review: "Needs review",
    approved: "Approved",
    scheduled: "Scheduled",
    published: "Published",
    research_failed: "Research Failed",
    failed: "Failed",
    skipped: "Skipped"
  }[status];
}

function validationIssueTitle(issue: string) {
  if (/complete|below|shorter|word target/i.test(issue)) return "Completeness";
  if (/faq/i.test(issue)) return "FAQ";
  if (/heading|h2|section/i.test(issue)) return "Structure";
  if (/research|source/i.test(issue)) return "Research";
  if (/profile|format|guide|comparison|how-to|definition/i.test(issue)) return "Format";
  return "Quality";
}

interface ValidationIssueGroup {
  title: string;
  issues: string[];
  summary: string;
  action: string;
}

function buildValidationIssueGroups(issues: string[]): ValidationIssueGroup[] {
  const grouped = new Map<string, string[]>();
  for (const issue of issues) {
    const title = validationIssueTitle(issue);
    grouped.set(title, [...(grouped.get(title) ?? []), issue]);
  }
  return [...grouped.entries()].map(([title, groupedIssues]) => ({
    title,
    issues: groupedIssues,
    summary: validationGroupSummary(title, groupedIssues),
    action: validationGroupAction(title)
  }));
}

function validationGroupSummary(title: string, issues: string[]) {
  if (title === "Completeness") return "The article is not yet complete enough for publication and may miss important planned decision points or target depth.";
  if (title === "FAQ") return "The article is missing some answer-led coverage that helps readers resolve common questions before publishing.";
  if (title === "Structure") return "The article structure needs another pass so readers can follow the argument more easily from section to section.";
  if (title === "Research") return "The draft needs a cleaner evidence pass so readers can trust the claims without seeing process or source leakage.";
  if (title === "Format") return "The article is close, but it is missing one or more format elements expected for this type of piece.";
  return issues[0] ?? "This article needs a final editorial pass before publishing.";
}

function validationGroupAction(title: string) {
  if (title === "Completeness") return "Expand the thin sections, cover the planned decision points more directly, or regenerate the article.";
  if (title === "FAQ") return "Add concise buyer questions and answers that match the article intent before publishing.";
  if (title === "Structure") return "Split broad sections, add missing headings, and make the reading flow easier to scan.";
  if (title === "Research") return "Rewrite the affected lines as reader-facing guidance and remove any process language or unsupported claims.";
  if (title === "Format") return "Add the missing structural element expected for this content type, or regenerate if the draft is too far off brief.";
  return "Review the draft carefully, edit where needed, or regenerate if the article is not ready for publication.";
}

function publishingStatusTone(status: PublishingWorkflowStatus) {
  if (status === "published") return "bg-success/10 text-success";
  if (status === "scheduled") return "bg-[#f0e4ff] text-[#6d3bb8]";
  if (status === "draft") return "bg-[#eef2ff] text-[#4256b8]";
  return "bg-surface-3 text-ink-subtle";
}

function publishingStatusLabel(status: PublishingWorkflowStatus) {
  if (status === "published") return "Published";
  if (status === "scheduled") return "Scheduled";
  if (status === "draft") return "Draft";
  return "Not Published";
}

function bulkActionLabel(action: SelectionAction) {
  return SELECTION_ACTION_OPTIONS.find((option) => option.value === action)?.label
    ?? BULK_PUBLISHING_ACTION_OPTIONS.find((option) => option.value === action)?.label
    ?? action;
}

function formatMarkdown(markdown: string, start: number, end: number, command: FormatCommand) {
  const selected = markdown.slice(start, end);
  const lineStart = markdown.lastIndexOf("\n", Math.max(0, start - 1)) + 1;
  const lineEndIndex = markdown.indexOf("\n", end);
  const lineEnd = lineEndIndex === -1 ? markdown.length : lineEndIndex;
  const selectedLines = markdown.slice(lineStart, lineEnd);

  if (command === "bold") return wrapSelection(markdown, start, end, "**", selected || "bold text");
  if (command === "italic") return wrapSelection(markdown, start, end, "*", selected || "italic text");
  if (command === "link") {
    const existing = findMarkdownLinkAt(markdown, start, end);
    if (existing) {
      const label = window.prompt("Link text", existing.label)?.trim();
      if (label === null || label === undefined) return replaceRange(markdown, start, end, selected, start, end);
      const url = window.prompt("Link URL", existing.url)?.trim();
      if (url === null || url === undefined) return replaceRange(markdown, start, end, selected, start, end);
      const safeLabel = label || existing.label;
      const safeUrl = url || existing.url;
      return replaceRange(markdown, existing.start, existing.end, `[${safeLabel}](${safeUrl})`, existing.start + 1, existing.start + 1 + safeLabel.length);
    }
    const label = selected || "link text";
    const url = window.prompt("Link URL", "https://")?.trim();
    if (url === null || url === undefined || !url) return replaceRange(markdown, start, end, selected, start, end);
    const insertion = `[${label}](${url})`;
    return replaceRange(markdown, start, end, insertion, start + 1, start + 1 + label.length);
  }
  if (command === "unlink") {
    const existing = findMarkdownLinkAt(markdown, start, end);
    if (!existing) return replaceRange(markdown, start, end, selected, start, end);
    return replaceRange(markdown, existing.start, existing.end, existing.label, existing.start, existing.start + existing.label.length);
  }
  if (command === "h2" || command === "h3") {
    const prefix = command === "h2" ? "## " : "### ";
    const cleaned = selectedLines.replace(/^#{1,6}\s+/gm, "");
    return replaceRange(markdown, lineStart, lineEnd, prefixLines(cleaned || "Heading", prefix), lineStart + prefix.length, lineStart + prefix.length + (cleaned || "Heading").length);
  }
  if (command === "bullet") {
    const next = prefixLines(selectedLines || "List item", "- ");
    return replaceRange(markdown, lineStart, lineEnd, next, lineStart + 2, lineStart + next.length);
  }
  const lines = (selectedLines || "List item").split("\n");
  const next = lines.map((line, index) => `${index + 1}. ${line.replace(/^\d+\.\s+/, "")}`).join("\n");
  return replaceRange(markdown, lineStart, lineEnd, next, lineStart + 3, lineStart + next.length);
}

function findMarkdownLinkAt(markdown: string, start: number, end: number) {
  const pattern = /\[([^\]]+)\]\(([^)]+)\)/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(markdown))) {
    const linkStart = match.index;
    const linkEnd = linkStart + match[0].length;
    const labelStart = linkStart + 1;
    const labelEnd = labelStart + match[1].length;
    const cursorInsideLink = start >= linkStart && start <= linkEnd;
    const selectionTouchesLink = end > linkStart && start < linkEnd;
    const selectionInsideLabel = start >= labelStart && end <= labelEnd;
    if (cursorInsideLink || selectionTouchesLink || selectionInsideLabel) {
      return {
        start: linkStart,
        end: linkEnd,
        label: match[1],
        url: match[2]
      };
    }
  }
  return null;
}

function wrapSelection(markdown: string, start: number, end: number, marker: string, fallback: string) {
  const selected = markdown.slice(start, end) || fallback;
  const insertion = `${marker}${selected}${marker}`;
  return replaceRange(markdown, start, end, insertion, start + marker.length, start + marker.length + selected.length);
}

function replaceRange(markdown: string, start: number, end: number, insertion: string, selectionStart: number, selectionEnd: number) {
  return {
    value: `${markdown.slice(0, start)}${insertion}${markdown.slice(end)}`,
    selectionStart,
    selectionEnd
  };
}

function prefixLines(value: string, prefix: string) {
  return value.split("\n").map((line) => `${prefix}${line.replace(/^[-*]\s+/, "")}`).join("\n");
}

function applyRichFormat(command: FormatCommand) {
  const target = document.activeElement;
  if (command === "bold") document.execCommand("bold");
  else if (command === "italic") document.execCommand("italic");
  else if (command === "link") {
    const anchor = currentRichLink();
    if (anchor) {
      const label = window.prompt("Link text", anchor.textContent ?? "")?.trim();
      if (label === undefined) return;
      const url = window.prompt("Link URL", anchor.getAttribute("href") ?? "")?.trim();
      if (url === undefined) return;
      anchor.textContent = label || anchor.textContent || "link text";
      if (url) anchor.setAttribute("href", url);
    } else {
      const url = window.prompt("Link URL", "https://")?.trim();
      if (url) document.execCommand("createLink", false, url);
    }
  } else if (command === "unlink") {
    const anchor = currentRichLink();
    if (anchor) {
      const text = document.createTextNode(anchor.textContent ?? "");
      anchor.replaceWith(text);
    } else {
      document.execCommand("unlink");
    }
  } else if (command === "h2") document.execCommand("formatBlock", false, "h2");
  else if (command === "h3") document.execCommand("formatBlock", false, "h3");
  else if (command === "bullet") document.execCommand("insertUnorderedList");
  else if (command === "numbered") document.execCommand("insertOrderedList");
  window.setTimeout(() => target?.dispatchEvent(new InputEvent("input", { bubbles: true })), 0);
}

function currentRichLink() {
  const selection = window.getSelection();
  const node = selection?.anchorNode;
  if (!node) return null;
  const element = node.nodeType === Node.ELEMENT_NODE ? node as Element : node.parentElement;
  return element?.closest("a") as HTMLAnchorElement | null;
}

function countWordsLocal(markdown: string) {
  return markdown.trim().split(/\s+/).filter(Boolean).length;
}

function resetTransitionTrace() {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(TRANSITION_TRACE_KEY, "[]");
}

function recordStateTrace(state: AppState, jobId: string | null, event: string) {
  if (!jobId) return;
  const job = state.jobs.find((item) => item.id === jobId);
  if (!job) return;
  const article = state.articles.find((item) => item.id === job.articleId) ?? null;
  recordTransitionTrace(event, job, article);
}

function recordTransitionTrace(event: string, job: QueueJob, article: ArticleSummary | ArticleDocument | null = null) {
  if (typeof window === "undefined") return;
  const displayedJob = article ? { ...job, status: article.status } : job;
  const entry: TransitionTraceEntry = {
    at: new Date().toISOString(),
    event,
    jobId: job.id,
    articleId: job.articleId,
    title: job.title,
    serverStatus: job.status,
    displayedStatus: displayStatusLabel(displayedJob, article),
    activeStage: currentPipelineStage(job.pipeline),
    queued_at: job.timings?.queued_at ?? null,
    processing_at: job.timings?.processing_at ?? job.timings?.started_at ?? null,
    research_started_at: job.timings?.research_started_at ?? null,
    research_completed_at: job.timings?.research_completed_at ?? null,
    outline_started_at: job.timings?.outline_started_at ?? null,
    outline_completed_at: job.timings?.outline_completed_at ?? null,
    generation_started_at: job.timings?.generation_started_at ?? null,
    generation_completed_at: job.timings?.generation_completed_at ?? null
  };
  const previous = readTransitionTrace();
  const next = [...previous, entry].slice(-200);
  window.localStorage.setItem(TRANSITION_TRACE_KEY, JSON.stringify(next));
  console.info("oswriter.transition", entry);
}

function readTransitionTrace() {
  try {
    return JSON.parse(window.localStorage.getItem(TRANSITION_TRACE_KEY) ?? "[]") as TransitionTraceEntry[];
  } catch {
    return [];
  }
}

function displayStatusLabel(job: QueueJob, article?: ArticleSummary | ArticleDocument | null) {
  if (isOptimisticQueuedJob(job)) return "Adding";
  if (job.status !== "processing") return statusLabel(article?.status ?? job.status);
  const activeStage = currentPipelineStage(job.pipeline);
  if (activeStage === "research") return "Researching";
  if (activeStage === "outline") return "Outlining";
  if (activeStage === "generation" || activeStage === "editor" || activeStage === "save") return "Writing";
  if (activeStage === "validation") return "Validating";
  if (activeStage === "export") return "Exporting";
  return "Writing";
}

function isQueueJobVisible(job: QueueJob) {
  return job.status === "queued" || job.status === "processing" || job.status === "research_failed" || job.status === "failed" || job.status === "skipped";
}

function mergeOptimisticProcessingClaims(state: AppState, claims: Map<string, QueueJob>): AppState {
  if (!claims.size) return state;
  let changed = false;
  const jobs = state.jobs.map((job) => {
    const claimed = claims.get(job.id);
    if (!claimed) return job;
    const article = state.articles.find((item) => item.id === job.articleId);
    if (article || job.status !== "queued" || claimed.status !== "processing") {
      claims.delete(job.id);
      return job;
    }
    changed = true;
    return {
      ...job,
      status: "processing" as const,
      attempts: Math.max(job.attempts, claimed.attempts),
      updatedAt: claimed.updatedAt
    };
  });
  return changed ? { ...state, jobs } : state;
}

export function reconcileQueueStatusState(state: AppState, status: QueueStatus): AppState {
  if (!status.activeJob) return state;
  const jobs = state.jobs.map((job) => status.activeJob?.id === job.id ? {
    ...job,
    status: "processing" as const,
    attempts: status.activeJob.attempts ?? job.attempts,
    pipeline: status.activeJob.pipeline ?? job.pipeline,
    timings: status.activeJob.timings ?? job.timings,
    updatedAt: status.activeJob.updatedAt ?? job.updatedAt
  } : job);
  return jobs.every((job, index) => job === state.jobs[index]) ? state : { ...state, jobs };
}

function queueStatusNeedsFullRefresh(state: AppState, status: QueueStatus) {
  if (status.activeJob) return false;
  if (state.jobs.some((job) => job.status === "processing")) return true;
  return state.jobs.filter((job) => job.status === "generated" || isApprovedArticleStatus(job.status)).length !== status.generated
    || state.jobs.filter((job) => job.status === "needs_review").length !== status.review
    || state.jobs.filter((job) => job.status === "failed" || job.status === "research_failed").length !== status.failed;
}

function isInventoryArticle(article: ArticleSummary) {
  return article.status === "generated" || article.status === "needs_review" || isApprovedArticleStatus(article.status);
}

function isApprovedArticleStatus(status: JobStatus) {
  return status === "approved" || status === "scheduled" || status === "published";
}

function currentPipelineStage(pipeline: QueueJob["pipeline"]) {
  return pipeline.find((step) => step.status === "running")?.stage
    ?? pipeline.find((step) => step.status === "idle")?.stage
    ?? [...pipeline].reverse().find((step) => step.status === "done")?.stage
    ?? pipeline[0]?.stage
    ?? null;
}

function filterLabel(filter: Filter) {
  return {
    all: "All",
    queued: "Queued",
    processing: "Writing",
    generated: "Generated",
    needs_review: "Review",
    approved: "Approved",
    scheduled: "Scheduled",
    published: "Published",
    research_failed: "Research Failed",
    failed: "Failed",
    skipped: "Skipped"
  }[filter];
}

function workerHealthLabel(health: WorkerHealthState) {
  return {
    ready: "Ready",
    busy: "Busy",
    offline: "Offline",
    recovering: "Recovering",
    blocked: "Blocked"
  }[health];
}

function workerHealthTone(health: WorkerHealthState) {
  return {
    ready: "border-success/25 bg-success/5",
    busy: "border-info/25 bg-info/5",
    offline: "border-danger/25 bg-danger/5",
    recovering: "border-warn/25 bg-warn/5",
    blocked: "border-danger/25 bg-danger/5"
  }[health];
}

function workerHealthDot(health: WorkerHealthState) {
  return {
    ready: "bg-success",
    busy: "bg-info",
    offline: "bg-danger",
    recovering: "bg-warn",
    blocked: "bg-danger"
  }[health];
}

function queueMutationBlockReason(state: AppState | null, jobs: QueueJob[]) {
  const processing = jobs.find((job) => job.status === "processing");
  if (processing) return `Queue is processing "${processing.title}". Stop after current or wait before changing queue-critical state.`;
  return null;
}

function settingsMutationBlockReason(jobs: QueueJob[]) {
  return jobs.some((job) => job.status === "queued" || job.status === "processing")
    ? "Generation settings are locked while queued or processing articles exist."
    : null;
}

function isRecoverableProcessingJob(job: QueueJob, staleMinutes: number, now: number) {
  if (job.status !== "processing") return false;
  return now - new Date(job.updatedAt).getTime() > staleMinutes * 60_000;
}

function jobActionMessage(action: string) {
  return {
    skip: "Queue item skipped.",
    remove: "Queue item removed.",
    regenerate_later: "Queue item moved to the end.",
    move_up: "Queue item moved up.",
    move_down: "Queue item moved down.",
    move_top: "Queue item moved to top.",
    move_bottom: "Queue item moved to bottom."
  }[action] ?? "Queue item updated.";
}

function mergeWorkspacePreferences(preferences: WorkspacePreferencesDocument, patch: WorkspacePreferencePatch): WorkspacePreferencesDocument {
  const notificationsEnabled = patch.notifications?.enabled ?? preferences.notifications.enabled;
  const writerKeyEnabled = patch.aiProvider?.writerKeyEnabled ?? preferences.aiProvider.writerKeyEnabled;
  const writerApiKey = patch.aiProvider?.writerApiKey ?? preferences.aiProvider.writerApiKey;
  const replacementResearchKey = patch.aiProvider?.researchApiKey;
  const researchKeyConfigured = Boolean(replacementResearchKey?.trim()) || preferences.aiProvider.researchKeyStatus === "configured";
  const requestedResearchProvider = patch.aiProvider?.researchProvider ?? preferences.aiProvider.researchProvider ?? "queuewrite";
  const providerPreference = writerKeyEnabled ? "bring_your_own_key" : "platform_managed";
  return {
    ...preferences,
    account: {
      ...preferences.account,
      ...patch.account
    },
    notifications: {
      ...preferences.notifications,
      ...patch.notifications,
      enabled: notificationsEnabled,
      queueCompleted: notificationsEnabled,
      queueCompletedWithWarnings: notificationsEnabled,
      queueFailed: notificationsEnabled,
      dailySummaryEmail: false,
      weeklySummaryEmail: false
    },
    aiProvider: {
      ...preferences.aiProvider,
      ...patch.aiProvider,
      preference: providerPreference,
      personalKeyStatus: providerPreference === "bring_your_own_key" ? "placeholder" : "not_configured",
      writerKeyEnabled,
      writerApiKey: writerKeyEnabled ? writerApiKey : "",
      writerKeyStatus: writerKeyEnabled && writerApiKey ? "configured" : writerKeyEnabled ? "placeholder" : "not_configured",
      researchKeyEnabled: researchKeyConfigured,
      researchApiKey: replacementResearchKey ?? preferences.aiProvider.researchApiKey,
      researchKeyStatus: researchKeyConfigured ? "configured" : "not_configured",
      researchProvider: requestedResearchProvider === "byok" && researchKeyConfigured ? "byok" : "queuewrite",
      byokResearchProvider: "tavily"
    },
    operational: {
      ...preferences.operational,
      ...patch.operational,
      autoStartQueueOnAdd: false,
      confirmBeforeDeletingArticles: true,
      confirmBeforeDeletingProjects: true,
      defaultTargetWordCount: patch.operational?.defaultTargetWordCount === undefined
        ? preferences.operational.defaultTargetWordCount
        : clampTargetWords(patch.operational.defaultTargetWordCount),
      reuseProjectResearch: false,
      reuseTitleResearch: false
    },
    updatedAt: new Date().toISOString()
  };
}

function clampTargetWords(value: number) {
  return Number.isFinite(value) ? Math.max(300, Math.min(5000, Math.round(value))) : 1400;
}

interface QueueMetrics {
  total: number;
  completed: number;
  remaining: number;
  generated: number;
  needsReview: number;
  failed: number;
  skipped: number;
  processingCount: number;
  successRate: number;
  currentTitle: string | null;
  runStartedAt: string | null;
  currentRuntimeMs: number | null;
  averageRuntimeMs: number | null;
  averageResearchMs: number | null;
  averageGenerationMs: number | null;
  averageSaveMs: number | null;
  etaMs: number | null;
  throughputPerHour: number | null;
}

function describeGenerateButton(
  stats: Record<"queued" | "processing" | "generated" | "needs_review" | "failed" | "skipped", number>,
  _metrics: QueueMetrics,
  blocked: boolean,
  queueMode: QueueControlMode,
  hasResumableCurrent: boolean,
  starting: boolean
) {
  if (starting) {
    return {
      label: "Starting...",
      disabled: true,
      title: "Queue start is being requested."
    };
  }
  if (stats.processing > 0) {
    const total = Math.max(1, stats.processing + stats.queued);
    const current = Math.min(total, stats.processing);
    return {
      label: `Generating ${current} of ${total}`,
      disabled: true,
      title: "Generation is currently running."
    };
  }
  if (queueMode === "stop_after_current" && hasResumableCurrent) {
    return {
      label: "Resume current",
      disabled: blocked,
      title: "Continue the article that already started, then stop before the next item."
    };
  }
  if (stats.queued > 0) {
    return {
      label: "Generate",
      disabled: blocked,
      title: blocked ? "Queue is busy." : "Start queued article generation."
    };
  }
  return {
    label: "Generate",
    disabled: true,
    title: "Add titles to create queue work."
  };
}

function isResumableQueuedJob(job: QueueJob) {
  return job.status === "queued" && (
    job.attempts > 0 ||
    job.pipeline.some((step) => step.status === "done" || step.status === "running")
  );
}

function isOptimisticQueuedJob(job: QueueJob) {
  return job.id.startsWith("optimistic-job-");
}

function createOptimisticQueuedJobs(
  projectId: string | undefined,
  titles: string[],
  existingJobs: QueueJob[],
  postGenerationAction: PostGenerationPublishingAction
) {
  if (!projectId) return [];
  const basePosition = Math.max(
    Date.now(),
    ...existingJobs.map((job) => job.queuePosition ?? new Date(job.createdAt).getTime())
  );
  return titles.map((title, index) => {
    const createdAt = new Date(basePosition + index + 1).toISOString();
    return {
      id: `optimistic-job-${basePosition}-${index}`,
      projectId,
      articleId: `optimistic-article-${basePosition}-${index}`,
      title,
      postGenerationAction,
      status: "queued" as const,
      statusReason: "Saving to queue...",
      createdAt,
      updatedAt: createdAt,
      attempts: 0,
      queuePosition: basePosition + index + 1,
      needsReviewReasons: [],
      pipeline: [],
      timings: { queued_at: createdAt }
    } satisfies QueueJob;
  });
}

function parseSubmittedTitles(value: string) {
  return value
    .split("\n")
    .map((title) => title.trim())
    .filter(Boolean);
}

function formatLatencyMs(value: number) {
  if (!Number.isFinite(value)) return "0ms";
  if (value >= 1000) return `${(value / 1000).toFixed(1)}s`;
  return `${Math.max(1, Math.round(value))}ms`;
}

interface ProjectSummary {
  projectName: string;
  createdDate: string;
  lastActivity: string;
  articleCount: number;
  generatedCount: number;
  reviewCount: number;
  failedCount: number;
  totalWords: number;
  totalSources: number;
  averageQuality: number;
  averageResearch: number;
  averageEvidence: number;
  successRate: number;
}

interface AccountOutcomeStats {
  words: number;
  sources: number;
  articles: number;
  savedMinutes: number;
}

interface RunSummary {
  id: string;
  startedAt: string;
  total: number;
  generated: number;
  needsReview: number;
  failed: number;
  averageRuntimeMs: number | null;
}

interface SourceDomainSummary {
  domain: string;
  count: number;
  accepted: number;
  articleCount: number;
  sourceAuthority: number;
}

function calculateAccountOutcomeStats(articles: ArticleSummary[], sources: number): AccountOutcomeStats {
  const words = articles.reduce((sum, article) => sum + article.wordCount, 0);
  const articlesWritten = articles.length;
  return {
    words,
    sources,
    articles: articlesWritten,
    savedMinutes: Math.round(words / 40)
  };
}

const SHARE_STAT_COMMENTS = [
  "My keyboard is considering early retirement.",
  "The blank page lost.",
  "Research did the heavy lifting.",
  "Coffee consumption remains untracked.",
  "My cursor travelled surprisingly little.",
  "The sources worked harder than I did.",
  "Several search engines contributed to this achievement.",
  "That's a lot of tabs I never opened.",
  "My browser fan appreciates the help.",
  "The deadline arrived before the panic did.",
  "Research first. Guesswork never.",
  "A questionable amount of reading happened on my behalf.",
  "The article count keeps rising. The effort does not.",
  "Somewhere, a search engine is exhausted.",
  "That's approximately {time} not spent researching.",
  "The internet was consulted extensively.",
  "My productivity graph would look suspicious.",
  "Sources were gathered. Articles emerged.",
  "Fewer tabs. More content.",
  "Human oversight was still technically involved."
];

function buildShareStatMessage(stats: AccountOutcomeStats) {
  const milestone = pickMilestoneShareMessage(stats);
  if (milestone && Math.random() < 0.35) return milestone;

  const comment = SHARE_STAT_COMMENTS[Math.floor(Math.random() * SHARE_STAT_COMMENTS.length)].replace("{time}", formatSavedTime(stats.savedMinutes));
  return `${baseShareStatMessage(stats)} ${comment}`;
}

function baseShareStatMessage(stats: AccountOutcomeStats) {
  return `I have saved roughly ${formatSavedTime(stats.savedMinutes)}, written ${formatNumber(stats.words)} words, analysed ${formatNumber(stats.sources)} sources, and delivered ${formatNumber(stats.articles)} articles.`;
}

function pickMilestoneShareMessage(stats: AccountOutcomeStats) {
  const hours = stats.savedMinutes / 60;
  const milestones = [
    stats.articles >= 1000 ? "I've delivered 1,000 articles. We may need a bigger sitemap." : null,
    stats.articles >= 500 ? "I've delivered 500 articles. The content calendar is no longer a concern." : null,
    stats.articles >= 100 ? "I've delivered 100 articles. At this point this is a publishing operation." : null,
    stats.sources >= 10_000 ? "I've analysed 10,000 sources. Somebody should probably thank the internet." : null,
    hours >= 100 ? "I've saved over 100 hours. That's two and a half working weeks reclaimed." : null
  ].filter((message): message is string => Boolean(message));
  return milestones.length ? milestones[Math.floor(Math.random() * milestones.length)] : null;
}

function calculateProjectSummary(state: AppState, analytics: ProjectAnalyticsSummary | null): ProjectSummary {
  const articles = state.articles;
  const scoreAverages = summaryScoreAverages(articles);
  const generatedCount = articles.filter((article) => article.status === "generated" || isApprovedArticleStatus(article.status)).length;
  const reviewCount = articles.filter((article) => article.status === "needs_review").length;
  const failedCount = state.jobs.filter((job) => job.status === "failed" || job.status === "research_failed").length;
  const completedAssets = generatedCount + reviewCount + failedCount;
  const timestamps = [
    state.project.updatedAt,
    ...articles.map((article) => article.updatedAt),
    ...state.jobs.map((job) => job.updatedAt)
  ].filter(Boolean).sort();

  return {
    projectName: state.project.name,
    createdDate: state.project.createdAt,
    lastActivity: timestamps[timestamps.length - 1] ?? state.project.createdAt,
    articleCount: analytics?.article_count ?? articles.length,
    generatedCount: analytics?.generated_count ?? generatedCount,
    reviewCount: analytics?.review_count ?? reviewCount,
    failedCount: analytics?.failed_count ?? failedCount,
    totalWords: analytics?.total_words ?? articles.reduce((sum, article) => sum + article.wordCount, 0),
    totalSources: analytics?.source_count ?? 0,
    averageQuality: analytics?.average_quality ?? scoreAverages.quality,
    averageResearch: analytics?.average_research ?? scoreAverages.research,
    averageEvidence: analytics?.average_evidence ?? scoreAverages.evidence,
    successRate: completedAssets ? Number((((generatedCount + reviewCount) / completedAssets) * 100).toFixed(1)) : 100
  };
}

function summaryScoreAverages(articles: ArticleSummary[]) {
  const average = (values: number[]) => values.length ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length) : 0;
  return {
    quality: average(articles.map((article) => article.qualityScore)),
    research: average(articles.map((article) => article.researchScore)),
    evidence: average(articles.map((article) => article.evidenceScore))
  };
}

function buildTopDomains(_articles: ArticleSummary[]): SourceDomainSummary[] {
  return [];
}

function buildRunHistory(jobs: QueueJob[], _articles: ArticleSummary[]): RunSummary[] {
  const sorted = [...jobs].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const runs: QueueJob[][] = [];

  for (const job of sorted) {
    const latestRun = runs[runs.length - 1];
    const latestJob = latestRun?.[latestRun.length - 1];
    if (!latestRun || !latestJob || new Date(job.createdAt).getTime() - new Date(latestJob.createdAt).getTime() > 30 * 60 * 1000) {
      runs.push([job]);
    } else {
      latestRun.push(job);
    }
  }

  return runs.reverse().map((run) => {
    const runtimes = run
      .map((job) => calculatePipelineRuntime(job.pipeline).totalMs)
      .filter((runtime) => runtime > 0);
    return {
      id: run[0]?.id ?? "run",
      startedAt: run[0]?.createdAt ?? "",
      total: run.length,
      generated: run.filter((job) => job.status === "generated" || isApprovedArticleStatus(job.status)).length,
      needsReview: run.filter((job) => job.status === "needs_review").length,
      failed: run.filter((job) => job.status === "failed" || job.status === "research_failed").length,
      averageRuntimeMs: runtimes.length ? Math.round(runtimes.reduce((sum, runtime) => sum + runtime, 0) / runtimes.length) : null
    };
  });
}

function calculateQueueMetrics(jobs: QueueJob[], _articles: ArticleSummary[], now: number): QueueMetrics {
  const total = jobs.length;
  const generated = jobs.filter((job) => job.status === "generated" || isApprovedArticleStatus(job.status)).length;
  const needsReview = jobs.filter((job) => job.status === "needs_review").length;
  const failed = jobs.filter((job) => job.status === "failed" || job.status === "research_failed").length;
  const skipped = jobs.filter((job) => job.status === "skipped").length;
  const processingJobs = jobs.filter((job) => job.status === "processing");
  const processingCount = processingJobs.length;
  const completed = generated + needsReview + failed + skipped;
  const successful = generated + needsReview;
  const remaining = jobs.filter((job) => job.status === "queued" || job.status === "processing").length;
  const successRate = completed ? Number(((successful / completed) * 100).toFixed(1)) : 100;
  const runStartedAt = jobs.map((job) => job.createdAt).sort()[0] ?? null;
  const completedRuntimes = jobs
    .map((job) => calculatePipelineRuntime(job.pipeline).totalMs)
    .filter((runtime) => runtime > 0);
  const averageResearchMs = averageStageRuntime(jobs, "research");
  const averageGenerationMs = averageStageRuntime(jobs, "generation");
  const averageSaveMs = averageStageRuntime(jobs, "save");
  const averageRuntimeMs = completedRuntimes.length
    ? Math.round(completedRuntimes.reduce((sum, runtime) => sum + runtime, 0) / completedRuntimes.length)
    : null;
  const processing = processingJobs[0];
  const currentRuntimeMs = processing ? currentJobRuntime(processing, now) : null;
  const etaMs = averageRuntimeMs ? Math.max(0, averageRuntimeMs * remaining - (currentRuntimeMs ?? 0)) : null;
  const throughputPerHour = averageRuntimeMs ? Math.round(3_600_000 / averageRuntimeMs) : null;
  return {
    total,
    completed,
    remaining,
    generated,
    needsReview,
    failed,
    skipped,
    processingCount,
    successRate,
    currentTitle: processing?.title ?? null,
    runStartedAt,
    currentRuntimeMs,
    averageRuntimeMs,
    averageResearchMs,
    averageGenerationMs,
    averageSaveMs,
    etaMs,
    throughputPerHour
  };
}

function calculatePipelineRuntime(pipeline: ArticleDocument["pipeline"]) {
  const stageMs = (stage: string) => pipeline.find((step) => step.stage === stage)?.durationMs ?? 0;
  const totalMs = pipeline.reduce((sum, step) => sum + (step.durationMs ?? 0), 0);
  return {
    totalMs,
    researchMs: stageMs("research"),
    generationMs: stageMs("generation"),
    validationMs: stageMs("validation"),
    saveMs: stageMs("save")
  };
}

function calculateTimingDiagnostics(pipeline: ArticleDocument["pipeline"], article: ArticleDocument | null, job: QueueJob | null) {
  const queuedAt = job?.createdAt ?? article?.createdAt ?? null;
  const startedAt = earliestTimestamp(pipeline.map((step) => step.startedAt));
  const generatedAt = article?.updatedAt ?? completedGeneratedJobAt(job);
  if (!queuedAt && !startedAt && !generatedAt) return null;
  const pipelineDurationMs = calculatePipelineRuntime(pipeline).totalMs;
  const endToEndMs = queuedAt && generatedAt ? Math.max(0, new Date(generatedAt).getTime() - new Date(queuedAt).getTime()) : null;
  const waitingMs = endToEndMs !== null ? Math.max(0, endToEndMs - pipelineDurationMs) : null;
  return {
    queuedAt,
    startedAt,
    generatedAt,
    pipelineDurationMs,
    endToEndMs,
    waitingMs: waitingMs ?? 0
  };
}

function completedGeneratedJobAt(job: QueueJob | null) {
  if (!job || (job.status !== "generated" && job.status !== "needs_review")) return null;
  return job.updatedAt;
}

function earliestTimestamp(values: Array<string | undefined>) {
  return values.filter(Boolean).sort()[0] ?? null;
}

function averageStageRuntime(jobs: QueueJob[], stage: string) {
  const runtimes = jobs
    .map((job) => job.pipeline.find((step) => step.stage === stage)?.durationMs ?? 0)
    .filter((runtime) => runtime > 0);
  return runtimes.length ? Math.round(runtimes.reduce((sum, runtime) => sum + runtime, 0) / runtimes.length) : null;
}

function currentJobRuntime(job: QueueJob, now: number) {
  const startedAt = job.pipeline
    .map((step) => step.startedAt)
    .filter(Boolean)
    .sort()[0];
  const start = startedAt ?? job.updatedAt ?? job.createdAt;
  return Math.max(0, now - new Date(start).getTime());
}

function formatDuration(ms: number | null) {
  if (!ms || ms <= 0) return "-";
  const totalSeconds = Math.round(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes <= 0) return `${seconds}s`;
  return `${minutes}m ${seconds.toString().padStart(2, "0")}s`;
}

function formatEstimatedRuntime(ms: number) {
  const minutes = Math.max(1, Math.round(ms / 60_000));
  return `~${minutes} min`;
}

function formatProjectedUsd(value: number) {
  return `$${value.toFixed(3)}`;
}

function formatSavedTime(minutes: number) {
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  if (!remainder) return `${hours}h`;
  return `${hours}h ${remainder}m`;
}

function formatSaveState(saveState: "saved" | "saving" | "error", savedAt: string | null) {
  if (saveState === "saving") return "Saving...";
  if (saveState === "error") return "Save failed";
  if (!savedAt) return "Saved";
  const diffSeconds = Math.floor((Date.now() - new Date(savedAt).getTime()) / 1000);
  if (diffSeconds < 4) return "✓ Saved";
  return "Saved";
}

function formatTime(value?: string | null) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  }).format(new Date(value));
}

function formatDate(value?: string | null) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric"
  }).format(new Date(value));
}

function relativeDate(value?: string | null) {
  if (!value) return "-";
  const diff = Date.now() - new Date(value).getTime();
  const minutes = Math.max(0, Math.floor(diff / 60_000));
  if (minutes < 1) return "now";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  return formatDate(value);
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("en-GB").format(value);
}

function titleCase(value: string) {
  return value.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function safeDomain(value: string) {
  try {
    return new URL(value).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function countMarkdownHeadings(markdown: string) {
  return (markdown.match(/^#{1,3}\s+/gm) ?? []).length;
}

function averageNumber(values: number[]) {
  const valid = values.filter((value) => Number.isFinite(value));
  if (!valid.length) return 0;
  return Math.round(valid.reduce((sum, value) => sum + value, 0) / valid.length);
}

function sectionTone(tone: "context" | "active" | "health" | "history") {
  return {
    context: "border-info/30",
    active: "border-success/30",
    health: "border-warn/30",
    history: "border-line"
  }[tone];
}

async function fetchWithTimeout(input: RequestInfo | URL, init: RequestInit = {}, timeoutMs = 20_000) {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: init.signal ?? controller.signal });
  } catch (error) {
    if (controller.signal.aborted) return null;
    throw error;
  } finally {
    window.clearTimeout(timeout);
  }
}
