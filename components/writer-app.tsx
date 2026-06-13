"use client";

import { AlertCircle, Bold, CheckCircle2, ChevronDown, Code2, Columns2, Download, ExternalLink, FileArchive, FileCode, FileJson, FileText, Heading2, Heading3, Italic, Link as LinkIcon, List, ListOrdered, Loader2, PanelLeft, PanelRight, Play, RotateCw, Search, Square, Trash2, Upload } from "lucide-react";
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
    () => selectedArticleId ? articles.find((article) => article.id === selectedArticleId) ?? null : articles[0] ?? null,
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
        const nonFailedJob = next.jobs.find((job) => job.status !== "failed");
        setSelectedArticleId(active?.articleId ?? next.articles[0]?.id ?? nonFailedJob?.articleId ?? next.jobs[0]?.articleId ?? null);
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
          <span className="text-ink-subtle">/</span>
          <span className="truncate text-ink-muted">{state?.project.name ?? "Loading project"}</span>
          {selectedArticle || selectedJob ? (
            <>
              <span className="text-ink-subtle">/</span>
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
              <div className="min-w-0">
                <div className="truncate text-[13px] font-semibold text-ink">{state?.project.name ?? "Project"}</div>
                <div className="mono mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[10.5px] text-ink-subtle">
                  <span>{projectSummary?.articleCount ?? jobs.length} articles</span>
                  <span>{projectSummary?.totalWords ? formatNumber(projectSummary.totalWords) : 0} words</span>
                  <span>{queueMetrics.successRate}% success</span>
                </div>
              </div>
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
          <ArticleToolbar article={selectedArticle} />
          <div className="min-h-0 flex-1 overflow-auto">
            {selectedArticle ? <MarkdownPreview markdown={selectedArticle.markdown} /> : selectedJob ? <JobPlaceholder job={selectedJob} /> : <Empty text="No article selected." />}
          </div>
        </section>

        <aside className="hairline-l flex min-h-0 flex-col bg-surface-2">
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
  return (
    <div className="group relative">
      {active && <span className="absolute inset-y-1 left-0 w-[2px] rounded-r bg-ink" />}
      <button
        onClick={onSelect}
        className={cn(
          "flex w-full items-start gap-2.5 px-3 py-2 text-left transition-colors",
          active ? "bg-ink/[0.06]" : "hover:bg-surface-3"
        )}
      >
        <span className={cn("mt-[7px] size-1.5 shrink-0 rounded-full", statusColor(job.status), job.status === "processing" && "animate-pulse")} />
        <span className="min-w-0 flex-1">
          <span className={cn("block truncate text-[13px] leading-snug text-ink", active ? "font-semibold" : "font-medium")}>{article?.title ?? job.title}</span>
          <span className="mono mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[10.5px] text-ink-subtle">
            <span>{statusLabel(job.status)}</span>
            <span className="text-line-strong">·</span>
            <span>{article?.wordCount ? `${formatNumber(article.wordCount)} w` : `Attempt ${job.attempts}`}</span>
            <span className="text-line-strong">·</span>
            <span>{sourceCount} src</span>
            {article ? (
              <>
                <span className="text-line-strong">·</span>
                <span>Conf {confidence}</span>
                <span className="text-line-strong">·</span>
                <span>Auth {authority}</span>
              </>
            ) : null}
          </span>
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

function ArticleToolbar({ article }: { article: ArticleDocument | null }) {
  const viewModes = [
    { label: "Read", icon: FileText },
    { label: "MD", icon: Code2 },
    { label: "Split", icon: Columns2 }
  ];
  return (
    <div className="hairline-b flex min-h-9 flex-wrap items-center gap-x-2 gap-y-1 px-5 py-1.5 lg:px-7">
      <div className="flex shrink-0 items-center gap-1">
        {article ? <ArticleExportActions articleId={article.id} /> : <span className="text-xs text-ink-subtle">Select an article to review exports.</span>}
      </div>
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
    <div className="flex shrink-0 items-start gap-1">
      <ExportLink href={`/api/export/article/${articleId}/markdown`} label="Markdown" icon={<FileText className="size-3.5" />} />
      <ExportLink href={`/api/export/article/${articleId}/docx`} label="DOCX" icon={<FileArchive className="size-3.5" />} />
      <ExportLink href={`/api/export/article/${articleId}/html`} label="HTML" icon={<FileCode className="size-3.5" />} />
      <ExportLink href={`/api/export/article/${articleId}/json`} label="JSON" icon={<FileJson className="size-3.5" />} />
    </div>
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
  if (job.status !== "failed") {
    return (
      <div className="mx-auto mt-10 max-w-2xl rounded-md border border-line bg-surface-1 p-5 shadow-sm">
        <h2 className="font-semibold text-ink">{statusLabel(job.status)}</h2>
        <p className="mt-2 text-sm text-ink-muted">
          {job.status === "processing"
            ? "This title is currently moving through research and writing."
            : "This title is waiting for its turn in the queue."}
        </p>
        <div className="mono mt-3 text-xs text-ink-subtle">Attempt {job.attempts}</div>
      </div>
    );
  }

  return (
    <div className="mx-auto mt-10 max-w-2xl rounded-md border border-danger/30 bg-surface-1 p-5 shadow-sm">
      <h2 className="font-semibold text-danger">Technical failure</h2>
      <p className="mt-2 text-sm text-ink-muted">
        This job has no saved article because it hit a technical failure before draft save.
      </p>
      <pre className="mono mt-3 whitespace-pre-wrap rounded bg-surface-2 p-3 text-xs text-danger">{job.fatalError ?? "No fatal error recorded."}</pre>
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
      <ul className="space-y-1 text-xs leading-snug text-ink-muted">
        {(research?.usefulFacts ?? []).map((fact) => <li key={fact}>{fact}</li>)}
      </ul>
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
      <MetricGrid items={[
        ["Total", formatDuration(runtime.totalMs)],
        ["Research", formatDuration(runtime.researchMs)],
        ["Generation", formatDuration(runtime.generationMs)],
        ["Validation", formatDuration(runtime.validationMs)],
        ["Save", formatDuration(runtime.saveMs)]
      ]} />
      <ol className="space-y-2">
        {pipeline.map((step) => (
          <li key={step.stage}>
            <button
              onClick={() => {
                setSelectedStage(step.stage);
                if (step.stage === "research" && article) setTab("research");
              }}
              className={cn(
                "w-full rounded-md border border-line bg-surface-1 p-2 text-left hover:border-ink-subtle",
                selected?.stage === step.stage && "border-ink-subtle"
              )}
            >
          <div className="flex items-center gap-2">
            {step.status === "done" ? <CheckCircle2 className="size-4 text-success" /> : step.status === "failed" ? <AlertCircle className="size-4 text-danger" /> : <Search className="size-4 text-ink-subtle" />}
            <span className="font-medium capitalize">{step.stage}</span>
            <span className="mono ml-auto text-xs text-ink-subtle">{step.durationMs ? `${(step.durationMs / 1000).toFixed(1)}s` : step.status}</span>
          </div>
          {step.error && <p className="mt-1 text-xs text-danger">{step.error}</p>}
          {step.message && <p className="mt-1 text-xs text-ink-muted">{step.message}</p>}
            </button>
        </li>
      ))}
    </ol>
      {selected && <StageDetails step={selected} article={article} details={details} />}
    </div>
  );
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
        <PanelTitle title="Warnings" />
        {article.validation.warnings.length ? (
          <ul className="mt-2 space-y-2 text-xs text-ink-muted">
            {article.validation.warnings.map((warning) => <li key={warning} className="rounded-md bg-surface-1 p-2">{warning}</li>)}
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

function statusLabel(status: JobStatus) {
  return {
    queued: "Queued",
    processing: "Generating",
    generated: "Generated",
    needs_review: "Needs review",
    failed: "Failed"
  }[status];
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

function formatNumber(value: number) {
  return new Intl.NumberFormat("en-GB").format(value);
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
