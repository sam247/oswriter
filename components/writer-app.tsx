"use client";

import { AlertCircle, Bold, CheckCircle2, ChevronDown, ChevronRight, Code2, Columns2, Download, ExternalLink, FileArchive, FileCode, FileJson, FileText, Heading2, Heading3, Italic, Link as LinkIcon, List, ListOrdered, Loader2, PanelLeft, PanelRight, Play, RotateCw, Search, Square, Trash2, Upload } from "lucide-react";
import { type RefObject, useEffect, useMemo, useRef, useState } from "react";
import type { AppState, ArticleDocument, DebugDocument, JobStatus, QueueJob, ResearchPack, ResearchSource } from "@/lib/types";
import { cn } from "@/lib/utils";

type Details = { research: ResearchPack | null; debug: DebugDocument | null };
type Filter = JobStatus | "all";
type InspectorTab = "research" | "pipeline" | "validation" | "seo" | "debug" | "sources";

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
          <h1 className="text-lg font-semibold tracking-tight text-ink">OS Writer</h1>
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
  const [selectedArticleId, setSelectedArticleId] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [running, setRunning] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("Ready");
  const [details, setDetails] = useState<Details>({ research: null, debug: null });
  const [tab, setTab] = useState<InspectorTab>("research");
  const [selectedStage, setSelectedStage] = useState<string>("research");
  const [highlightWarnings, setHighlightWarnings] = useState(false);
  const [tick, setTick] = useState(Date.now());
  const stopRequested = useRef(false);
  const activeRequest = useRef<AbortController | null>(null);
  const warningsRef = useRef<HTMLDivElement | null>(null);

  const jobs = state?.jobs ?? [];
  const articles = state?.articles ?? [];
  const controls = state?.settings.controls;
  const selectedArticle = useMemo(
    () => selectedArticleId ? articles.find((article) => article.id === selectedArticleId) ?? null : null,
    [articles, selectedArticleId]
  );
  const selectedJob = useMemo(
    () => {
      const article = articles.find((item) => item.id === selectedArticleId);
      return jobs.find((job) => job.articleId === selectedArticleId || job.id === article?.jobId) ?? null;
    },
    [articles, jobs, selectedArticleId]
  );
  const displayJobs = useMemo(() => jobs.map((job) => {
    const article = articles.find((item) => item.jobId === job.id);
    return article ? { ...job, status: article.status } : job;
  }), [articles, jobs]);
  const visibleJobs = displayJobs.filter((job) => filter === "all" || job.status === filter);
  const stats = useMemo(() => ({
    queued: displayJobs.filter((job) => job.status === "queued").length,
    processing: displayJobs.filter((job) => job.status === "processing").length,
    generated: displayJobs.filter((job) => job.status === "generated").length,
    needs_review: displayJobs.filter((job) => job.status === "needs_review").length,
    failed: displayJobs.filter((job) => job.status === "failed").length
  }), [displayJobs]);
  const queueMetrics = useMemo(() => calculateQueueMetrics(displayJobs, articles, tick), [articles, displayJobs, tick]);
  const runHistory = useMemo(() => buildRunHistory(displayJobs, articles), [articles, displayJobs]);
  const projectSummary = useMemo(() => state ? calculateProjectSummary(state, queueMetrics) : null, [queueMetrics, state]);

  async function refresh() {
    const res = await fetchWithTimeout("/api/state", { cache: "no-store" }, 8_000);
    if (res?.ok) {
      const next = await res.json() as AppState;
      setState(next);
      const selectedExists = selectedArticleId && (
        next.jobs.some((job) => job.articleId === selectedArticleId) ||
        next.articles.some((article) => article.id === selectedArticleId)
      );
      if (!selectedExists) {
        const active = next.jobs.find((job) => job.status === "processing");
        setSelectedArticleId(active?.articleId ?? null);
      }
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => setTick(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!selectedArticle) return;
    void fetch(`/api/articles/${selectedArticle.id}/details`, { cache: "no-store" })
      .then((res) => res.ok ? res.json() : { research: null, debug: null })
      .then((data: Details) => setDetails(data));
  }, [selectedArticle?.id]);

  async function addTitles() {
    setBusy(true);
    const res = await fetch("/api/jobs/bulk", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ titles: titles.split("\n") })
    });
    setBusy(false);
    if (res.ok) {
      setTitles("");
      setMessage("Titles queued.");
      await refresh();
    } else setMessage("Could not add titles.");
  }

  async function processNext() {
    setBusy(true);
    setMessage("Processing next queued title...");
    const optimisticJob = markNextJobGenerating();
    if (optimisticJob) setSelectedArticleId(optimisticJob.articleId);
    const controller = new AbortController();
    activeRequest.current = controller;
    const res = await fetch("/api/queue/process-next", { method: "POST", signal: controller.signal }).catch((error) => {
      if (controller.signal.aborted) return null;
      throw error;
    });
    activeRequest.current = null;
    if (!res) {
      setBusy(false);
      setMessage("Run stopped locally. Current server job may finish or recover on next refresh.");
      void refresh();
      return false;
    }
    const data = await res.json().catch(() => ({})) as { processed?: boolean; job?: QueueJob; error?: string };
    setBusy(false);
    if (!res.ok) {
      setMessage(data.error ? String(data.error) : "Processing failed.");
      void refresh();
      return res.status === 504;
    }
    if (data.job) {
      upsertJob(data.job);
      if (data.job.status !== "failed") setSelectedArticleId(data.job.articleId);
    }
    setMessage(data.processed ? `Processed: ${data.job?.title}` : "No queued jobs.");
    void refresh();
    return Boolean(data.processed);
  }

  async function runSequential() {
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
    stopRequested.current = true;
    activeRequest.current?.abort();
    setRunning(false);
    setBusy(false);
    setMessage("Stopping run...");
    await post("/api/queue/cancel-current", "Run stopped. Current job returned to queue if still processing.");
  }

  async function post(path: string, success: string) {
    setBusy(true);
    const res = await fetch(path, { method: "POST" });
    setBusy(false);
    setMessage(res.ok ? success : "Action failed.");
    await refresh();
  }

  async function clearQueue() {
    if (!confirm("Clear all queued jobs, failed jobs, generated articles, research packs, and debug logs for this project?")) return;
    stopRequested.current = true;
    activeRequest.current?.abort();
    setRunning(false);
    setBusy(true);
    const res = await fetch("/api/queue/clear", { method: "POST" });
    setBusy(false);
    if (res.ok) {
      setSelectedArticleId(null);
      setDetails({ research: null, debug: null });
      setMessage("Queue and generated records cleared.");
      await refresh();
    } else {
      setMessage("Clear queue failed.");
    }
  }

  async function updateLengthTarget(lengthTargetWords: number) {
    setState((current) => current ? {
      ...current,
      settings: {
        ...current.settings,
        controls: { ...current.settings.controls, lengthTargetWords }
      }
    } : current);
    const res = await fetch("/api/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lengthTargetWords })
    });
    if (!res.ok) void refresh();
  }

  async function retryOne(jobId: string) {
    const res = await fetch(`/api/jobs/${jobId}/retry`, { method: "POST" });
    if (res.ok) {
      const data = await res.json().catch(() => ({})) as { job?: QueueJob };
      if (data.job) upsertJob(data.job);
    }
    void refresh();
  }

  function upsertJob(job: QueueJob) {
    setState((current) => current ? {
      ...current,
      jobs: current.jobs.map((item) => item.id === job.id ? job : item)
    } : current);
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
      <header className="hairline-b flex h-10 select-none items-center bg-surface-2/85 px-3 backdrop-blur">
        <div className="flex min-w-0 flex-1 items-center gap-1.5 text-[12.5px]">
          <button className="mr-1 grid size-7 place-items-center rounded text-ink-subtle hover:bg-surface-3 hover:text-ink" title="Projects">
            <PanelLeft className="size-3.5" />
          </button>
          <button className="mr-2 grid size-7 place-items-center rounded text-ink-subtle hover:bg-surface-3 hover:text-ink" title="Inspector">
            <PanelRight className="size-3.5" />
          </button>
          <span className="font-semibold tracking-tight text-ink">OS Writer V2</span>
          <ChevronRight className="size-3 text-ink-subtle" />
          <span className="truncate text-ink-muted">{state?.project.name ?? "Loading project"}</span>
          {selectedArticle || selectedJob ? (
            <>
              <ChevronRight className="size-3 text-ink-subtle" />
              <span className="truncate text-ink">{selectedArticle?.title ?? selectedJob?.title}</span>
            </>
          ) : null}
        </div>
        <div className="flex items-center gap-1">
          <button onClick={processNext} disabled={busy || running} className="flex h-7 items-center gap-1.5 rounded-md bg-ink px-2.5 text-[12px] font-medium text-white disabled:opacity-50">
            <Play className="size-3 fill-current" /> Generate
          </button>
          <button onClick={running ? stopRun : runSequential} disabled={busy && !running} className="h-7 rounded-md px-2 text-[12px] text-ink-muted hover:bg-surface-3 hover:text-ink">
            {running ? "Stop run" : "Run queue"}
          </button>
        </div>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-[340px_minmax(460px,1fr)_380px]">
        <aside className="hairline-r flex min-h-0 flex-col bg-surface-2 text-[13px]">
          <div className="hairline-b px-3 pb-3 pt-3">
            <div className="flex items-start justify-between gap-3">
              <button onClick={() => setSelectedArticleId(null)} className="min-w-0 text-left">
                <div className="truncate text-[13px] font-semibold text-ink">{state?.project.name ?? "Project"}</div>
                <div className="mono mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[10.5px] text-ink-subtle">
                  <span>{projectSummary?.articleCount ?? jobs.length} articles</span>
                  <span>{projectSummary?.totalWords ? formatNumber(projectSummary.totalWords) : 0} words</span>
                  <span>{queueMetrics.successRate}% success</span>
                </div>
              </button>
              <ProjectExportMenu summary={projectSummary} />
            </div>
            <div className="mono mt-3 grid grid-cols-4 gap-2 text-[10.5px]">
              <MetricPill label="Review" value={stats.needs_review} warn={stats.needs_review > 0} />
              <MetricPill label="Failed" value={stats.failed} danger={stats.failed > 0} />
              <MetricPill label="Queue" value={stats.queued} />
              <MetricPill label="Writing" value={stats.processing} />
            </div>
          </div>

          <div className="hairline-b px-2 py-2">
            <div className="flex flex-wrap gap-px">
              {(["all", "queued", "processing", "generated", "needs_review", "failed"] as Filter[]).map((item) => (
                <button key={item} onClick={() => setFilter(item)} className={cn("flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] transition-colors", filter === item ? "bg-ink/[0.08] text-ink" : "text-ink-muted hover:bg-surface-3 hover:text-ink")}>
                  <span>{filterLabel(item)}</span>
                  <span className="mono text-[10px] text-ink-subtle">{item === "all" ? jobs.length : stats[item]}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto py-1">
            <div className="flex items-center justify-between px-3 pb-1 pt-2">
              <PanelTitle title="Articles" />
              <span className="mono text-[10.5px] text-ink-subtle">{visibleJobs.length} shown</span>
            </div>
            <button
              onClick={() => setSelectedArticleId(null)}
              className={cn(
                "group relative flex w-full items-start gap-2.5 px-3 py-2 text-left transition-colors",
                !selectedArticleId ? "bg-ink/[0.06]" : "hover:bg-surface-3"
              )}
            >
              {!selectedArticleId && <span className="absolute inset-y-1 left-0 w-[2px] rounded-r bg-ink" />}
              <span className="mt-[7px] size-1.5 shrink-0 rounded-full bg-ink" />
              <span className="min-w-0 flex-1">
                <span className={cn("block truncate text-[13px] leading-snug text-ink", !selectedArticleId ? "font-semibold" : "font-medium")}>Project overview</span>
                <span className="mono mt-1 flex flex-wrap gap-x-1.5 gap-y-0.5 text-[10.5px] text-ink-subtle">
                  <span>{formatNumber(projectSummary?.articleCount ?? jobs.length)} articles</span>
                  <span className="text-line-strong">·</span>
                  <span>{metricsLabel(queueMetrics)}</span>
                  <span className="text-line-strong">·</span>
                  <span>Q{projectSummary?.averageConfidence ?? 0}</span>
                </span>
              </span>
            </button>
            {visibleJobs.length ? visibleJobs.map((job) => {
              const article = articles.find((item) => item.jobId === job.id || item.id === job.articleId) ?? null;
              return (
                <ArticleListItem
                  key={job.id}
                  job={job}
                  article={article}
                  active={selectedArticleId === job.articleId || selectedArticleId === article?.id}
                  onSelect={() => setSelectedArticleId(article?.id ?? job.articleId)}
                  onRetry={() => retryOne(job.id)}
                />
              );
            }) : <Empty text="No articles in this view." />}
          </div>

          <div className="hairline-t px-3 pb-3 pt-2">
            <div className="mb-1 flex items-center justify-between px-1">
              <PanelTitle title="Add titles" />
              <button onClick={clearQueue} className="flex items-center gap-1 text-[10.5px] text-ink-subtle hover:text-danger">
                <Trash2 className="size-3" /> Clear
              </button>
            </div>
            <textarea
              value={titles}
              onChange={(e) => setTitles(e.target.value)}
              placeholder="Paste one title per line"
              rows={3}
              className="mono w-full resize-none rounded-md border border-line bg-surface-1 p-2 text-[12px] leading-snug text-ink outline-none placeholder:text-ink-subtle focus:border-line-strong"
            />
            <div className="mt-1.5 flex gap-1">
              <button onClick={addTitles} disabled={busy || !titles.trim()} className="flex h-7 flex-1 items-center justify-center gap-1 rounded-md bg-ink px-2 text-[11.5px] font-medium text-white disabled:opacity-50">
                <Upload className="size-3.5" /> Add
              </button>
              <button onClick={() => post("/api/queue/retry-failed", "Failed jobs requeued.")} className="flex h-7 items-center justify-center gap-1 rounded-md px-2 text-[11.5px] text-ink-muted hover:bg-surface-3 hover:text-ink">
                <RotateCw className="size-3.5" /> Retry
              </button>
              <button onClick={() => post("/api/queue/recover", "Stale processing jobs recovered.")} className="h-7 rounded-md px-2 text-[11.5px] text-ink-muted hover:bg-surface-3 hover:text-ink">Recover</button>
            </div>
            <label className="mt-2 flex items-center justify-between px-1 text-[11.5px] text-ink-muted">
              <span>Target words</span>
              <input
                type="number"
                min={300}
                max={5000}
                step={100}
                value={controls?.lengthTargetWords ?? 1400}
                onChange={(event) => updateLengthTarget(Number(event.target.value))}
                className="mono h-7 w-24 rounded border border-line bg-surface-1 px-2 text-right text-xs text-ink outline-none focus:border-ink"
              />
            </label>
          </div>
        </aside>

        <section className="flex min-h-0 flex-col bg-background">
          {selectedArticle || selectedJob ? (
            <>
              <ArticleHeader
                article={selectedArticle}
                job={selectedJob}
                onReviewClick={() => {
                  setTab("validation");
                  setHighlightWarnings(true);
                  window.setTimeout(() => warningsRef.current?.scrollIntoView({ block: "center", behavior: "smooth" }), 50);
                  window.setTimeout(() => setHighlightWarnings(false), 1800);
                }}
              />
              <ArticleToolbar
                article={selectedArticle}
                busy={busy}
                running={running}
                onGenerate={processNext}
                onRunQueue={runSequential}
                onStopRun={stopRun}
                onRetryFailed={() => post("/api/queue/retry-failed", "Failed jobs requeued.")}
              />
              <div className="min-h-0 flex-1 overflow-auto">
                {selectedArticle ? <MarkdownPreview markdown={selectedArticle.markdown} /> : selectedJob ? <JobPlaceholder job={selectedJob} /> : null}
              </div>
              {selectedArticle && <ArticleMetricsRail article={selectedArticle} />}
            </>
          ) : (
            <ProjectDashboard
              state={state}
              articles={articles}
              jobs={displayJobs}
              metrics={queueMetrics}
              history={runHistory}
              summary={projectSummary}
              onSelectArticle={setSelectedArticleId}
            />
          )}
        </section>

        <aside className="hairline-l flex min-h-0 flex-col bg-surface-2">
          {selectedArticle || selectedJob ? (
            <>
              <div className="hairline-b flex h-9 shrink-0 items-center gap-0 overflow-x-auto px-2">
                {(["research", "pipeline", "validation", "seo", "sources", "debug"] as const).map((item) => (
                  <button key={item} onClick={() => setTab(item)} className={cn("relative h-9 shrink-0 px-2 text-[11.5px] font-medium capitalize", tab === item ? "text-ink after:absolute after:inset-x-2 after:bottom-0 after:h-[1.5px] after:bg-ink" : "text-ink-muted hover:text-ink")}>{item}</button>
                ))}
              </div>
              <Inspector
                tab={tab}
                setTab={setTab}
                article={selectedArticle}
                job={selectedJob}
                details={details}
                selectedStage={selectedStage}
                setSelectedStage={setSelectedStage}
                warningsRef={warningsRef}
                highlightWarnings={highlightWarnings}
              />
            </>
          ) : (
            <ProjectInsights state={state} articles={articles} jobs={displayJobs} metrics={queueMetrics} history={runHistory} />
          )}
        </aside>
      </div>

      <footer className="hairline-t mono flex h-6 items-center gap-3 bg-surface-2/70 px-3 text-[10.5px] text-ink-subtle">
        <span className="flex items-center gap-1.5"><span className="size-1.5 rounded-full bg-success" />{message}</span>
        <span className="h-3 w-px bg-line" />
        <span>{stats.generated} generated</span>
        <span>{stats.needs_review} review</span>
        <span className={stats.failed ? "text-danger" : ""}>{stats.failed} failed</span>
        <span>{queueMetrics.remaining} remaining</span>
        <span className="ml-auto">{selectedArticle ? `${formatNumber(selectedArticle.wordCount)} words · Q${selectedArticle.qualityScore} · ${selectedArticle.sources.length} sources` : "No article"}</span>
      </footer>
    </main>
  );
}

function ProjectDashboard({
  state,
  articles,
  jobs,
  metrics,
  history,
  summary,
  onSelectArticle
}: {
  state: AppState | null;
  articles: ArticleDocument[];
  jobs: QueueJob[];
  metrics: QueueMetrics;
  history: RunSummary[];
  summary: ProjectSummary | null;
  onSelectArticle: (id: string) => void;
}) {
  const attentionJobs = jobs.filter((job) => job.status === "needs_review" || job.status === "failed" || job.status === "processing").slice(0, 8);
  const contentInventory = [...jobs].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 10);
  const latestRun = history[0] ?? null;
  const generatedWords = articles.reduce((sum, article) => sum + article.wordCount, 0);

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="hairline-b px-6 pb-4 pt-5 lg:px-8">
        <div className="mono text-[10px] uppercase tracking-[0.18em] text-ink-subtle">Project dashboard</div>
        <div className="mt-1 flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="truncate text-[24px] font-semibold leading-tight tracking-tight text-ink">{state?.project.name ?? "Project"}</h1>
            <div className="mono mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-ink-muted">
              <span>{formatNumber(summary?.articleCount ?? jobs.length)} articles</span>
              <span>{formatNumber(generatedWords)} words</span>
              <span>{formatNumber(summary?.totalSources ?? 0)} sources</span>
              <span>{metrics.successRate}% success</span>
            </div>
          </div>
          <ProjectExportMenu summary={summary} />
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto px-6 py-5 lg:px-8">
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
          <section className="min-w-0 space-y-5">
            <div className="grid grid-cols-4 gap-3">
              <DashboardStat label="Generated" value={metrics.generated} detail={`${formatNumber(generatedWords)} words`} />
              <DashboardStat label="Needs review" value={metrics.needsReview} detail="Editorial attention" warn={metrics.needsReview > 0} />
              <DashboardStat label="Failed" value={metrics.failed} detail="Retry or inspect" danger={metrics.failed > 0} />
              <DashboardStat label="Remaining" value={metrics.remaining} detail={metrics.currentTitle ? "Run active" : "Queue depth"} />
            </div>

            <ProjectSection title="Needs attention">
              {attentionJobs.length ? (
                <InventoryTable jobs={attentionJobs} articles={articles} onSelectArticle={onSelectArticle} compact />
              ) : (
                <Empty text="No articles currently need attention." />
              )}
            </ProjectSection>

            <ProjectSection title="Content inventory">
              {contentInventory.length ? (
                <InventoryTable jobs={contentInventory} articles={articles} onSelectArticle={onSelectArticle} />
              ) : (
                <Empty text="Queued and generated articles will appear here." />
              )}
            </ProjectSection>
          </section>

          <section className="space-y-5">
            <ProjectSection title="Project profile">
              <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
                <MetricLine label="Style" value={state?.settings.controls.styleProfile ?? "-"} />
                <MetricLine label="Tone" value={state?.settings.controls.targetTone || "-"} />
                <MetricLine label="Target words" value={state?.settings.controls.lengthTargetWords ?? "-"} />
                <MetricLine label="Editor" value={state?.settings.controls.runEditor ? "On" : "Off"} />
              </div>
            </ProjectSection>

            <ProjectSection title="Current run">
              <div className="space-y-3">
                <div>
                  <div className="mono text-2xl font-semibold text-ink">{metrics.completed}/{metrics.total}</div>
                  <div className="mt-1 text-xs text-ink-muted">complete across the active project</div>
                </div>
                <ProgressBar value={metrics.total ? metrics.completed / metrics.total : 0} />
                <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
                  <MetricLine label="Processing" value={metrics.processingCount} />
                  <MetricLine label="ETA" value={formatDuration(metrics.etaMs)} />
                  <MetricLine label="Average" value={formatDuration(metrics.averageRuntimeMs)} />
                  <MetricLine label="Throughput" value={metrics.throughputPerHour ? `${metrics.throughputPerHour}/hr` : "-"} />
                </div>
                {metrics.currentTitle && <div className="truncate text-xs text-ink-muted">{metrics.currentTitle}</div>}
              </div>
            </ProjectSection>

            <ProjectSection title="Latest run">
              {latestRun ? (
                <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
                  <MetricLine label="Articles" value={latestRun.total} />
                  <MetricLine label="Generated" value={latestRun.generated} />
                  <MetricLine label="Review" value={latestRun.needsReview} />
                  <MetricLine label="Failed" value={latestRun.failed} />
                  <MetricLine label="Started" value={formatDate(latestRun.startedAt)} />
                  <MetricLine label="Average" value={formatDuration(latestRun.averageRuntimeMs)} />
                </div>
              ) : (
                <Empty text="Run history appears after jobs are queued." />
              )}
            </ProjectSection>
          </section>
        </div>
      </div>
    </div>
  );
}

function ProjectInsights({
  state,
  articles,
  jobs,
  metrics,
  history
}: {
  state: AppState | null;
  articles: ArticleDocument[];
  jobs: QueueJob[];
  metrics: QueueMetrics;
  history: RunSummary[];
}) {
  const sourceCount = articles.reduce((sum, article) => sum + article.sources.length, 0);
  const warnings = articles.reduce((sum, article) => sum + article.validation.warnings.length, 0);
  const reviewReasons = articles.reduce((sum, article) => sum + article.needsReviewReasons.length, 0);
  const authority = averageNumber(articles.flatMap((article) => article.sources.map((source) => source.authorityScore)));
  const quality = averageNumber(articles.map((article) => article.qualityScore));
  const failed = jobs.filter((job) => job.status === "failed").slice(0, 5);
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
              <MetricLine label="Generated" value={metrics.generated} />
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
              <MetricLine label="Average Q" value={quality || "-"} />
              <MetricLine label="Warnings" value={warnings} />
              <MetricLine label="Review reasons" value={reviewReasons} />
              <MetricLine label="Validated" value={articles.filter((article) => article.validation.pass).length} />
            </div>
            <AttentionList articles={articles} jobs={jobs} />
          </div>
        </ProjectSection>

        <ProjectSection title="Research coverage">
          <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
            <MetricLine label="Sources" value={sourceCount} />
            <MetricLine label="Authority" value={authority || "-"} />
            <MetricLine label="With sources" value={articles.filter((article) => article.sources.length > 0).length} />
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
              <MetricLine label="Target words" value={state?.settings.controls.lengthTargetWords ?? "-"} />
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

function InventoryTable({
  jobs,
  articles,
  onSelectArticle,
  compact = false
}: {
  jobs: QueueJob[];
  articles: ArticleDocument[];
  onSelectArticle: (id: string) => void;
  compact?: boolean;
}) {
  return (
    <div className="overflow-hidden">
      <div className="grid grid-cols-[minmax(0,1fr)_86px_64px_56px_56px_64px] gap-2 border-b border-line/70 px-1 pb-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-subtle">
        <span>Title</span>
        <span>Status</span>
        <span className="text-right">Words</span>
        <span className="text-right">Src</span>
        <span className="text-right">Q</span>
        <span className="text-right">Updated</span>
      </div>
      <div className="divide-y divide-line/70">
        {jobs.map((job) => {
          const article = articles.find((item) => item.jobId === job.id || item.id === job.articleId);
          return (
            <button
              key={job.id}
              onClick={() => onSelectArticle(article?.id ?? job.articleId)}
              className="grid w-full grid-cols-[minmax(0,1fr)_86px_64px_56px_56px_64px] gap-2 px-1 py-2 text-left text-[12px] hover:bg-surface-2"
            >
              <span className="min-w-0">
                <span className="block truncate font-medium text-ink">{article?.title ?? job.title}</span>
                {!compact && <span className="mono mt-0.5 block truncate text-[10.5px] text-ink-subtle">{attentionSummary(article, job) ?? `Attempt ${job.attempts}`}</span>}
              </span>
              <span className={cn("mono text-[10.5px]", statusTextTone(job.status))}>{displayStatusLabel(job, article)}</span>
              <span className="mono text-right text-[10.5px] text-ink-subtle">{article ? formatNumber(article.wordCount) : "-"}</span>
              <span className="mono text-right text-[10.5px] text-ink-subtle">{article?.sources.length ?? "-"}</span>
              <span className="mono text-right text-[10.5px] text-ink-subtle">{article ? article.qualityScore : "-"}</span>
              <span className="mono text-right text-[10.5px] text-ink-subtle">{relativeDate(article?.updatedAt ?? job.updatedAt)}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function StatusDistribution({ jobs }: { jobs: QueueJob[] }) {
  const total = Math.max(1, jobs.length);
  const segments: { label: string; value: number; className: string }[] = [
    { label: "Generated", value: jobs.filter((job) => job.status === "generated").length, className: "bg-success" },
    { label: "Review", value: jobs.filter((job) => job.status === "needs_review").length, className: "bg-warn" },
    { label: "Failed", value: jobs.filter((job) => job.status === "failed").length, className: "bg-danger" },
    { label: "Writing", value: jobs.filter((job) => job.status === "processing").length, className: "bg-info" },
    { label: "Queued", value: jobs.filter((job) => job.status === "queued").length, className: "bg-ink-subtle" }
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

function AttentionList({ articles, jobs }: { articles: ArticleDocument[]; jobs: QueueJob[] }) {
  const items = [
    ...articles
      .filter((article) => article.needsReviewReasons.length || article.validation.warnings.length)
      .map((article) => ({
        id: article.id,
        title: article.title,
        reason: article.needsReviewReasons[0] ?? article.validation.warnings[0],
        tone: "warn" as const
      })),
    ...jobs
      .filter((job) => job.status === "failed")
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
            <div className="mono mt-0.5 text-[10.5px] text-ink-subtle">Auth {domain.authority || "-"}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

function ProjectExportReadiness({ articles, jobs, metrics }: { articles: ArticleDocument[]; jobs: QueueJob[]; metrics: QueueMetrics }) {
  const generated = articles.filter((article) => article.status === "generated").length;
  const needsReview = articles.filter((article) => article.status === "needs_review" || article.needsReviewReasons.length || article.validation.warnings.length).length;
  const failed = jobs.filter((job) => job.status === "failed").length;
  const exportable = articles.length > 0;

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
        <MetricLine label="Package" value={exportable ? "Ready" : "Waiting"} />
        <MetricLine label="Articles" value={articles.length} />
        <MetricLine label="Generated" value={generated} />
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

function attentionSummary(article: ArticleDocument | null | undefined, job: QueueJob) {
  if (article?.needsReviewReasons.length) return article.needsReviewReasons[0];
  if (article?.validation.warnings.length) return article.validation.warnings[0];
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

function ProjectExportMenu({ summary }: { summary: ProjectSummary | null }) {
  return (
    <ExportLink
      href="/api/export/project/package"
      label="Export"
      icon={<Download className="size-3.5" />}
      disabled={!summary?.articleCount}
    />
  );
}

function MetricPill({ label, value, warn = false, danger = false }: { label: string; value: number; warn?: boolean; danger?: boolean }) {
  return (
    <div className="rounded bg-surface-1 px-2 py-1">
      <div className="text-ink-subtle">{label}</div>
      <div className={cn("mt-0.5 text-[13px] font-semibold text-ink", warn && "text-warn", danger && "text-danger")}>{value}</div>
    </div>
  );
}

function ArticleListItem({
  job,
  article,
  active,
  onSelect,
  onRetry
}: {
  job: QueueJob;
  article: ArticleDocument | null;
  active: boolean;
  onSelect: () => void;
  onRetry: () => void;
}) {
  const sourceCount = article?.sources.length ?? 0;
  const authority = article ? averageNumber(article.sources.map((source) => source.authorityScore)) : 0;
  const confidence = article?.qualityScore ?? 0;
  const displayStatus = displayStatusLabel(job, article);
  const summary = attentionSummary(article, job);
  const facts = article
    ? [`${formatNumber(article.wordCount)} words`, `${sourceCount} sources`, `Q${confidence}`, `Auth ${authority}`, relativeDate(article.updatedAt)]
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
          {summary && <span className={cn("mt-1 block truncate text-[11px]", job.status === "failed" ? "text-danger" : "text-warn")}>{summary}</span>}
        </span>
      </button>
      {job.status === "failed" && (
        <button onClick={onRetry} className="invisible absolute right-2 top-2 rounded bg-surface-1 px-2 py-1 text-[10.5px] text-ink-muted shadow-sm ring-1 ring-line hover:text-ink group-hover:visible">
          Retry
        </button>
      )}
    </div>
  );
}

function ArticleToolbar({
  article,
  busy,
  running,
  onGenerate,
  onRunQueue,
  onStopRun,
  onRetryFailed
}: {
  article: ArticleDocument | null;
  busy: boolean;
  running: boolean;
  onGenerate: () => void;
  onRunQueue: () => void;
  onStopRun: () => void;
  onRetryFailed: () => void;
}) {
  const viewModes = [
    { label: "Read", icon: FileText },
    { label: "MD", icon: Code2 },
    { label: "Split", icon: Columns2 }
  ];
  return (
    <div className="hairline-b flex min-h-9 flex-wrap items-center gap-x-2 gap-y-1 px-5 py-1.5 lg:px-7">
      <div className="flex shrink-0 items-center gap-1">
        <button onClick={onGenerate} disabled={busy || running} className="flex h-8 items-center gap-1.5 rounded-md bg-ink px-2.5 text-[12px] font-medium text-white disabled:opacity-50">
          <Play className="size-3.5 fill-current" /> Generate next
        </button>
        <button onClick={running ? onStopRun : onRunQueue} disabled={busy && !running} className="flex h-8 items-center gap-1.5 rounded-md border border-line bg-surface-1 px-2.5 text-[12px] font-medium text-ink hover:bg-surface-3 disabled:opacity-50">
          {running ? <Square className="size-3.5" /> : <RotateCw className="size-3.5" />}
          {running ? "Stop" : "Run queue"}
        </button>
        <button onClick={onRetryFailed} className="flex h-8 items-center gap-1.5 rounded-md px-2 text-[12px] text-ink-muted hover:bg-surface-3 hover:text-ink">
          <RotateCw className="size-3.5" /> Retry failed
        </button>
      </div>
      <div className="mx-1 hidden h-4 w-px bg-line sm:block" />
      {article ? <ArticleExportActions articleId={article.id} /> : <span className="text-xs text-ink-subtle">Select an article to review exports.</span>}
      <div className="mx-1 hidden h-4 w-px bg-line sm:block" />
      <div className="flex shrink-0 items-center gap-0.5">
        {[Bold, Italic, LinkIcon, Heading2, Heading3, List, ListOrdered].map((Icon, index) => (
          <button key={index} className="grid size-7 place-items-center rounded text-ink-subtle hover:bg-surface-3 hover:text-ink" title="Formatting control">
            <Icon className="size-3.5" />
          </button>
        ))}
      </div>
      <div className="ml-auto flex h-7 items-center rounded-md bg-surface-2 p-0.5">
        {viewModes.map(({ label, icon: Icon }) => (
          <button key={label} className={cn("flex h-6 items-center gap-1 rounded px-1.5 text-[11.5px]", label === "Read" ? "bg-surface-1 text-ink shadow-[0_1px_0_var(--line)]" : "text-ink-muted hover:text-ink")}>
            <Icon className="size-3" /> {label}
          </button>
        ))}
      </div>
    </div>
  );
}

function ArticleHeader({ article, job, onReviewClick }: { article: ArticleDocument | null; job: QueueJob | null; onReviewClick: () => void }) {
  if (!article && job) {
    return (
      <div className="px-6 pb-3 pt-5 lg:px-8">
        <div className="mono text-[10px] uppercase tracking-[0.18em] text-ink-subtle">{statusLabel(job.status)}</div>
        <h1 className="mt-1 text-[24px] font-semibold leading-tight tracking-tight text-ink">{job.title}</h1>
        <div className="mono mt-2 text-[11px] text-ink-muted">Attempt {job.attempts}</div>
      </div>
    );
  }
  if (!article) return <div className="h-24 p-5" />;
  const readingTime = Math.max(1, Math.round(article.wordCount / 230));
  return (
    <div className="px-6 pb-3 pt-5 lg:px-8">
      <div className="flex gap-4">
        <div className="min-w-0 flex-1">
          <div className="mono text-[10px] uppercase tracking-[0.18em] text-ink-subtle">{statusLabel(article.status)}</div>
          <h1 className="mt-1 text-[24px] font-semibold leading-tight tracking-tight text-ink">{article.title}</h1>
        </div>
      </div>
      <div className="mono mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[11px] text-ink-muted">
        <QualityBadge value={article.qualityScore} />
        <span className="h-3 w-px bg-line" />
        <span><span className="text-ink-subtle">Sources</span> <span className="text-ink">{article.sources.length}</span></span>
        <span><span className="text-ink-subtle">Words</span> <span className="text-ink">{formatNumber(article.wordCount)}</span></span>
        <span><span className="text-ink-subtle">Read</span> <span className="text-ink">{readingTime}m</span></span>
        <span><span className="text-ink-subtle">Authority</span> <span className="text-ink">{averageNumber(article.sources.map((source) => source.authorityScore))}</span></span>
        {article.needsReviewReasons.length > 0 && (
          <button onClick={onReviewClick} className="text-warn hover:underline">
            {article.needsReviewReasons.length} review reasons
          </button>
        )}
      </div>
    </div>
  );
}

function ArticleMetricsRail({ article }: { article: ArticleDocument }) {
  const headings = countMarkdownHeadings(article.markdown);
  const readingTime = Math.max(1, Math.round(article.wordCount / 230));
  return (
    <div className="hairline-t mono flex h-8 shrink-0 items-center gap-5 bg-surface-2/40 px-6 text-[10.5px] text-ink-muted">
      <MetricRailItem label="Words" value={formatNumber(article.wordCount)} />
      <MetricRailItem label="Read" value={`${readingTime}m`} />
      <MetricRailItem label="Quality" value={`Q${article.qualityScore}`} />
      <MetricRailItem label="Sources" value={article.sources.length} />
      <MetricRailItem label="Headings" value={headings} />
      <MetricRailItem label="Warnings" value={article.validation.warnings.length} warn={article.validation.warnings.length > 0} />
      <div className="flex-1" />
      <span className="truncate text-ink-subtle">Updated {formatTime(article.updatedAt)}</span>
    </div>
  );
}

function MetricRailItem({ label, value, warn = false }: { label: string; value: string | number; warn?: boolean }) {
  return (
    <span className="inline-flex items-baseline gap-1">
      <span className="text-ink-subtle">{label}</span>
      <span className={cn("text-ink-muted", warn && "text-warn")}>{value}</span>
    </span>
  );
}

function QualityBadge({ value }: { value: number }) {
  const tone = value >= 85 ? "text-ink" : value >= 70 ? "text-ink-muted" : "text-warn";
  return (
    <span className="inline-flex items-baseline gap-1">
      <span className="text-ink-subtle">Quality</span>
      <span className={cn("text-[15px] font-semibold leading-none", tone)}>{value}</span>
      <span className="text-ink-subtle">/100</span>
    </span>
  );
}

function ArticleExportActions({ articleId }: { articleId: string }) {
  return (
    <details className="group relative shrink-0">
      <summary className="flex h-8 cursor-pointer list-none items-center gap-1.5 rounded-md border border-line bg-surface-1 px-2.5 text-[12px] font-medium text-ink hover:bg-surface-3">
        <Download className="size-3.5" />
        Export
        <ChevronDown className="size-3 text-ink-subtle transition-transform group-open:rotate-180" />
      </summary>
      <div className="absolute left-0 top-9 z-20 w-44 rounded-md border border-line bg-surface-1 p-1 shadow-lg">
        <ExportMenuLink href={`/api/export/article/${articleId}/markdown`} label="Markdown" icon={<FileText className="size-3.5" />} />
        <ExportMenuLink href={`/api/export/article/${articleId}/docx`} label="DOCX" icon={<FileArchive className="size-3.5" />} />
        <ExportMenuLink href={`/api/export/article/${articleId}/html`} label="HTML" icon={<FileCode className="size-3.5" />} />
        <ExportMenuLink href={`/api/export/article/${articleId}/json`} label="JSON" icon={<FileJson className="size-3.5" />} />
      </div>
    </details>
  );
}

function ExportMenuLink({ href, label, icon }: { href: string; label: string; icon: React.ReactNode }) {
  return (
    <a href={href} className="flex h-8 items-center gap-2 rounded px-2 text-[12px] text-ink-muted hover:bg-surface-3 hover:text-ink">
      {icon}
      <span>{label}</span>
    </a>
  );
}

function ProjectSummaryPanel({ state, metrics }: { state: AppState | null; metrics: QueueMetrics }) {
  const summary = state ? calculateProjectSummary(state, metrics) : null;
  return (
    <SummarySection
      title="Project Summary"
      tone="context"
      defaultOpen
      summary={summary ? `${summary.articleCount} Articles · ${summary.generatedCount} Generated · ${summary.failedCount} Failed` : "Project context loading"}
    >
      {summary ? (
        <div className="space-y-2">
          <div>
            <div className="truncate text-sm font-semibold text-ink">{summary.projectName}</div>
            <div className="mono mt-1 text-[11px] text-ink-subtle">Created {formatDate(summary.createdDate)} · Last {formatDate(summary.lastActivity)}</div>
          </div>
          <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
            <MetricLine label="Articles" value={formatNumber(summary.articleCount)} />
            <MetricLine label="Generated" value={formatNumber(summary.generatedCount)} />
            <MetricLine label="Needs review" value={formatNumber(summary.reviewCount)} />
            <MetricLine label="Failed" value={formatNumber(summary.failedCount)} />
            <MetricLine label="Words" value={formatNumber(summary.totalWords)} />
            <MetricLine label="Sources" value={formatNumber(summary.totalSources)} />
            <MetricLine label="Authority" value={summary.averageAuthority || "-"} />
            <MetricLine label="Confidence" value={summary.averageConfidence || "-"} />
            <MetricLine label="Success rate" value={`${summary.successRate}%`} />
          </div>
          <ExportLink href="/api/export/project/package" label="Export Project" icon={<Download className="size-3.5" />} disabled={!summary.articleCount} block />
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

function JobPlaceholder({ job }: { job: QueueJob }) {
  const runtime = calculatePipelineRuntime(job.pipeline);
  if (job.status !== "failed") {
    return (
      <div className="mx-auto max-w-[760px] px-8 py-10">
        <div className="mono text-[10px] uppercase tracking-[0.18em] text-ink-subtle">{statusLabel(job.status)}</div>
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
        <div className="mt-8 max-w-xl">
          <PanelTitle title="Pipeline state" />
          <CompactPipelineList pipeline={job.pipeline} />
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[760px] px-8 py-10">
      <div className="mono text-[10px] uppercase tracking-[0.18em] text-danger">Failed</div>
      <h2 className="mt-2 text-2xl font-semibold tracking-tight text-ink">{job.title}</h2>
      <p className="mt-4 max-w-2xl text-sm leading-6 text-ink-muted">
        This job has no saved article because it hit a technical failure before draft save.
      </p>
      <div className="mt-6 grid max-w-xl grid-cols-2 gap-x-6 gap-y-2 text-xs">
        <MetricLine label="Attempt" value={job.attempts} />
        <MetricLine label="Updated" value={relativeDate(job.updatedAt)} />
        <MetricLine label="Runtime" value={formatDuration(runtime.totalMs)} />
        <MetricLine label="Failed stage" value={job.pipeline.find((step) => step.status === "failed")?.stage ?? "-"} />
      </div>
      <pre className="mono mt-6 max-w-2xl whitespace-pre-wrap rounded-md bg-surface-2 p-3 text-xs leading-relaxed text-danger">{job.fatalError ?? "No fatal error recorded."}</pre>
      <div className="mt-8 max-w-xl">
        <PanelTitle title="Pipeline state" />
        <CompactPipelineList pipeline={job.pipeline} />
      </div>
    </div>
  );
}

function MarkdownPreview({ markdown }: { markdown: string }) {
  return (
    <div className="mx-auto max-w-[760px] px-8 py-10">
      <article className="prose-os">{renderMarkdown(markdown)}</article>
    </div>
  );
}

function renderMarkdown(markdown: string) {
  if (!markdown.trim()) return <p className="text-ink-subtle">This article has not been generated yet.</p>;
  const nodes: React.ReactElement[] = [];
  let paragraph: string[] = [];
  let list: string[] = [];

  const flushParagraph = () => {
    if (!paragraph.length) return;
    nodes.push(<p key={nodes.length}>{paragraph.join(" ")}</p>);
    paragraph = [];
  };
  const flushList = () => {
    if (!list.length) return;
    nodes.push(<ul key={nodes.length}>{list.map((item, index) => <li key={index}>{item}</li>)}</ul>);
    list = [];
  };

  for (const rawLine of markdown.split("\n")) {
    const line = rawLine.trim();
    if (!line) {
      flushParagraph();
      flushList();
      continue;
    }
    if (line.startsWith("### ")) {
      flushParagraph();
      flushList();
      nodes.push(<h3 key={nodes.length}>{line.slice(4)}</h3>);
      continue;
    }
    if (line.startsWith("## ")) {
      flushParagraph();
      flushList();
      nodes.push(<h2 key={nodes.length}>{line.slice(3)}</h2>);
      continue;
    }
    if (line.startsWith("# ")) {
      flushParagraph();
      flushList();
      nodes.push(<h1 key={nodes.length}>{line.slice(2)}</h1>);
      continue;
    }
    if (line.startsWith("- ")) {
      flushParagraph();
      list.push(line.slice(2));
      continue;
    }
    flushList();
    paragraph.push(line);
  }
  flushParagraph();
  flushList();
  return nodes;
}

function Inspector({
  tab,
  setTab,
  article,
  job,
  details,
  selectedStage,
  setSelectedStage,
  warningsRef,
  highlightWarnings
}: {
  tab: InspectorTab;
  setTab: (tab: InspectorTab) => void;
  article: ArticleDocument | null;
  job: QueueJob | null;
  details: Details;
  selectedStage: string;
  setSelectedStage: (stage: string) => void;
  warningsRef: RefObject<HTMLDivElement | null>;
  highlightWarnings: boolean;
}) {
  if (!article && !job) return <Empty text="No article selected." />;
  return (
    <div className="min-h-0 flex-1 overflow-auto p-3 text-sm">
      {tab === "research" && (article ? <ResearchPanel research={details.research} article={article} /> : <Empty text={job?.status === "queued" ? "Research will appear once generation starts." : "Research is being prepared."} />)}
      {tab === "pipeline" && <PipelinePanel pipeline={(article?.pipeline ?? job?.pipeline) ?? []} article={article} details={details} selectedStage={selectedStage} setSelectedStage={setSelectedStage} setTab={setTab} />}
      {tab === "validation" && (article ? <ValidationPanel article={article} warningsRef={warningsRef} highlightWarnings={highlightWarnings} /> : <Empty text={job?.fatalError ?? "Validation will appear after the article is generated."} />)}
      {tab === "seo" && (article ? <SeoPanel article={article} /> : <Empty text="No article available for SEO checks." />)}
      {tab === "sources" && (article ? <SourcesPanel research={details.research} article={article} /> : <Empty text="Sources will appear after research completes." />)}
      {tab === "debug" && <DebugPanel debug={details.debug} />}
    </div>
  );
}

function ResearchPanel({ research, article }: { research: ResearchPack | null; article: ArticleDocument }) {
  const sources = research?.sources ?? article.sources;
  return (
    <div className="space-y-5">
      <MetricGrid compact items={[
        ["Sources", sources.length],
        ["Rejected", research?.rejectedSources.length ?? 0],
        ["Authority", research?.authorityScore ?? 0],
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
      {sources.map((source, index) => (
        <li key={source.url} className="group px-1 py-2">
          <div className="flex items-start gap-2">
            <span className="mono mt-0.5 w-6 shrink-0 text-[10px] text-ink-subtle">#{index + 1}</span>
            <div className="min-w-0 flex-1">
              <div className="text-[12.5px] font-medium leading-snug text-ink">{source.title}</div>
              <a className="mono mt-0.5 flex items-center gap-1 truncate text-[10.5px] text-ink-subtle hover:text-ink-muted" href={source.url} target="_blank" rel="noreferrer">
                <ExternalLink className="size-2.5 shrink-0" /> {source.domain || source.url}
              </a>
              <div className="mono mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-ink-subtle">
                <span>Auth <span className="text-ink-muted">{source.authorityScore}</span></span>
                <span>Rel <span className="text-ink-muted">{source.relevanceScore}</span></span>
                {rejected && <span className="text-danger">{source.rejectionReason ?? "rejected"}</span>}
              </div>
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}

function PipelinePanel({
  pipeline,
  article,
  details,
  selectedStage,
  setSelectedStage,
  setTab
}: {
  pipeline: ArticleDocument["pipeline"];
  article: ArticleDocument | null;
  details: Details;
  selectedStage: string;
  setSelectedStage: (stage: string) => void;
  setTab: (tab: InspectorTab) => void;
}) {
  const selected = pipeline.find((step) => step.stage === selectedStage) ?? pipeline[0];
  const runtime = calculatePipelineRuntime(pipeline);
  return (
    <div className="space-y-4">
      <MetricGrid compact items={[
        ["Total", formatDuration(runtime.totalMs)],
        ["Research", formatDuration(runtime.researchMs)],
        ["Generation", formatDuration(runtime.generationMs)],
        ["Validation", formatDuration(runtime.validationMs)],
        ["Save", formatDuration(runtime.saveMs)]
      ]} />
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
    </div>
  );
}

function CompactPipelineList({ pipeline }: { pipeline: ArticleDocument["pipeline"] }) {
  if (!pipeline.length) return <Empty text="No pipeline steps recorded." />;
  return (
    <ol className="relative mt-3 space-y-2.5 pl-5">
      <div className="absolute bottom-2 left-[7px] top-2 w-px bg-line" />
      {pipeline.map((step) => (
        <li key={step.stage} className="relative">
          <span className="absolute -left-[18px] top-1 grid size-3 place-items-center bg-background">
            {pipelineIcon(step.status)}
          </span>
          <div className="flex items-baseline gap-2">
            <span className="text-[12.5px] font-medium capitalize text-ink">{step.stage}</span>
            <span className="mono ml-auto text-[10.5px] text-ink-subtle">{step.durationMs ? `${(step.durationMs / 1000).toFixed(1)}s` : step.status}</span>
          </div>
          {step.error && <div className="mt-1 text-[11px] leading-snug text-danger">{step.error}</div>}
          {step.message && <div className="mt-1 text-[11px] leading-snug text-ink-muted">{step.message}</div>}
        </li>
      ))}
    </ol>
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
          ["Authority", research?.authorityScore ?? 0],
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
  highlightWarnings
}: {
  article: ArticleDocument;
  warningsRef: RefObject<HTMLDivElement | null>;
  highlightWarnings: boolean;
}) {
  const reviewItems = [...article.needsReviewReasons, ...article.validation.warnings];
  return (
    <div className="space-y-4">
      <MetricGrid items={[
        ["Quality", article.validation.qualityScore],
        ["FAQ", article.validation.faqScore],
        ["SEO", article.validation.seoScore],
        ["Warnings", article.validation.warnings.length]
      ]} />
      <div
        ref={warningsRef}
        className={cn(
          "rounded-md transition-shadow",
          highlightWarnings && "shadow-[0_0_0_3px_rgba(183,121,31,0.28)]"
        )}
      >
        <PanelTitle title="Review reasons" />
        {reviewItems.length ? (
          <ul className="mt-2 space-y-2 text-xs text-ink-muted">
            {reviewItems.map((warning) => <li key={warning} className="rounded-md bg-surface-1 p-2">{warning}</li>)}
          </ul>
        ) : <Empty text="No validation warnings." />}
      </div>
    </div>
  );
}

function SeoPanel({ article }: { article: ArticleDocument }) {
  const headings = (article.markdown.match(/^## /gm) ?? []).length;
  const faqs = (article.markdown.match(/^### .*\\?/gm) ?? []).length;
  return <MetricGrid items={[["Words", article.wordCount], ["H2s", headings], ["FAQs", faqs], ["Sources", article.sources.length]]} />;
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

function statusColor(status: JobStatus) {
  return {
    queued: "bg-ink-subtle",
    processing: "bg-info",
    generated: "bg-success",
    needs_review: "bg-warn",
    failed: "bg-danger"
  }[status];
}

function statusBadgeTone(status: JobStatus) {
  return {
    queued: "bg-surface-3 text-ink-muted",
    processing: "bg-info/10 text-info",
    generated: "bg-success/10 text-success",
    needs_review: "bg-warn/10 text-warn",
    failed: "bg-danger/10 text-danger"
  }[status];
}

function statusTextTone(status: JobStatus) {
  return {
    queued: "text-ink-subtle",
    processing: "text-info",
    generated: "text-success",
    needs_review: "text-warn",
    failed: "text-danger"
  }[status];
}

function statusLabel(status: JobStatus) {
  return {
    queued: "Queued",
    processing: "Generating",
    generated: "Generated",
    needs_review: "Needs review",
    failed: "Failed"
  }[status];
}

function displayStatusLabel(job: QueueJob, article?: ArticleDocument | null) {
  if (job.status !== "processing") return statusLabel(article?.status ?? job.status);
  const activeStage = currentPipelineStage(job.pipeline);
  if (activeStage === "research") return "Researching";
  if (activeStage === "outline") return "Outlining";
  if (activeStage === "generation" || activeStage === "editor" || activeStage === "save") return "Writing";
  if (activeStage === "validation") return "Validating";
  if (activeStage === "export") return "Exporting";
  return "Writing";
}

function currentPipelineStage(pipeline: QueueJob["pipeline"]) {
  return pipeline.find((step) => step.status === "running")?.stage
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
    failed: "Failed"
  }[filter];
}

function metricsLabel(metrics: QueueMetrics) {
  if (metrics.processingCount) return `${metrics.processingCount} writing`;
  if (metrics.failed) return `${metrics.failed} failed`;
  if (metrics.needsReview) return `${metrics.needsReview} review`;
  if (metrics.remaining) return `${metrics.remaining} queued`;
  return "Ready";
}

interface QueueMetrics {
  total: number;
  completed: number;
  remaining: number;
  generated: number;
  needsReview: number;
  failed: number;
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
  averageAuthority: number;
  averageConfidence: number;
  successRate: number;
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
  authority: number;
}

function calculateProjectSummary(state: AppState, metrics: QueueMetrics): ProjectSummary {
  const articles = state.articles;
  const sourceScores = articles.flatMap((article) => article.sources.map((source) => source.authorityScore));
  const confidenceScores = articles.map((article) => article.qualityScore).filter((score) => Number.isFinite(score));
  const timestamps = [
    state.project.updatedAt,
    ...state.jobs.map((job) => job.updatedAt),
    ...articles.map((article) => article.updatedAt)
  ].filter(Boolean).sort();

  return {
    projectName: state.project.name,
    createdDate: state.project.createdAt,
    lastActivity: timestamps[timestamps.length - 1] ?? state.project.createdAt,
    articleCount: state.jobs.length || articles.length,
    generatedCount: metrics.generated,
    reviewCount: metrics.needsReview,
    failedCount: metrics.failed,
    totalWords: articles.reduce((sum, article) => sum + article.wordCount, 0),
    totalSources: articles.reduce((sum, article) => sum + article.sources.length, 0),
    averageAuthority: averageNumber(sourceScores),
    averageConfidence: averageNumber(confidenceScores),
    successRate: metrics.successRate
  };
}

function buildTopDomains(articles: ArticleDocument[]): SourceDomainSummary[] {
  const domains = new Map<string, { count: number; accepted: number; articleIds: Set<string>; authorityScores: number[] }>();
  for (const article of articles) {
    for (const source of article.sources) {
      const key = source.domain || safeDomain(source.url);
      if (!key) continue;
      const current = domains.get(key) ?? { count: 0, accepted: 0, articleIds: new Set<string>(), authorityScores: [] };
      current.count += 1;
      if (source.accepted) current.accepted += 1;
      current.articleIds.add(article.id);
      current.authorityScores.push(source.authorityScore);
      domains.set(key, current);
    }
  }

  return [...domains.entries()]
    .map(([domain, data]) => ({
      domain,
      count: data.count,
      accepted: data.accepted,
      articleCount: data.articleIds.size,
      authority: averageNumber(data.authorityScores)
    }))
    .sort((a, b) => b.count - a.count || b.authority - a.authority);
}

function buildRunHistory(jobs: QueueJob[], articles: ArticleDocument[]): RunSummary[] {
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
    const runArticles = run
      .map((job) => articles.find((article) => article.jobId === job.id))
      .filter((article): article is ArticleDocument => Boolean(article));
    const runtimes = runArticles
      .map((article) => calculatePipelineRuntime(article.pipeline).totalMs)
      .filter((runtime) => runtime > 0);
    return {
      id: run[0]?.id ?? "run",
      startedAt: run[0]?.createdAt ?? "",
      total: run.length,
      generated: run.filter((job) => job.status === "generated").length,
      needsReview: run.filter((job) => job.status === "needs_review").length,
      failed: run.filter((job) => job.status === "failed").length,
      averageRuntimeMs: runtimes.length ? Math.round(runtimes.reduce((sum, runtime) => sum + runtime, 0) / runtimes.length) : null
    };
  });
}

function calculateQueueMetrics(jobs: QueueJob[], articles: ArticleDocument[], now: number): QueueMetrics {
  const total = jobs.length;
  const generated = jobs.filter((job) => job.status === "generated").length;
  const needsReview = jobs.filter((job) => job.status === "needs_review").length;
  const failed = jobs.filter((job) => job.status === "failed").length;
  const processingJobs = jobs.filter((job) => job.status === "processing");
  const processingCount = processingJobs.length;
  const completed = generated + needsReview + failed;
  const successful = generated + needsReview;
  const remaining = jobs.filter((job) => job.status === "queued" || job.status === "processing").length;
  const successRate = completed ? Number(((successful / completed) * 100).toFixed(1)) : 100;
  const runStartedAt = jobs.map((job) => job.createdAt).sort()[0] ?? null;
  const completedRuntimes = articles
    .map((article) => calculatePipelineRuntime(article.pipeline).totalMs)
    .filter((runtime) => runtime > 0);
  const averageResearchMs = averageStageRuntime(articles, "research");
  const averageGenerationMs = averageStageRuntime(articles, "generation");
  const averageSaveMs = averageStageRuntime(articles, "save");
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

function averageStageRuntime(articles: ArticleDocument[], stage: string) {
  const runtimes = articles
    .map((article) => article.pipeline.find((step) => step.stage === stage)?.durationMs ?? 0)
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
