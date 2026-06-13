"use client";

import { AlertCircle, CheckCircle2, Loader2, Play, RotateCw, Search, Square, Trash2, Upload } from "lucide-react";
import { type RefObject, useEffect, useMemo, useRef, useState } from "react";
import type { AppState, ArticleDocument, DebugDocument, JobStatus, QueueJob, ResearchPack } from "@/lib/types";
import { cn } from "@/lib/utils";

type Details = { research: ResearchPack | null; debug: DebugDocument | null };
type Filter = JobStatus | "all";
type InspectorTab = "research" | "pipeline" | "validation" | "seo" | "debug";

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
    () => jobs.find((job) => job.articleId === selectedArticleId) ?? null,
    [jobs, selectedArticleId]
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
    <main className="flex h-screen flex-col overflow-hidden bg-background text-ink">
      <header className="hairline-b flex h-10 items-center gap-3 bg-surface-1 px-3">
        <div className="font-semibold tracking-tight">OS Writer V2</div>
        <span className="mono text-xs text-ink-subtle">No clever blocking logic</span>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-[320px_minmax(420px,1fr)_360px]">
        <aside className="hairline-r flex min-h-0 flex-col bg-surface-2">
          <div className="hairline-b p-3">
            <textarea
              value={titles}
              onChange={(e) => setTitles(e.target.value)}
              placeholder="Paste one title per line"
              rows={5}
              className="mono w-full resize-none rounded-md border border-line bg-surface-1 p-2 text-xs outline-none focus:border-ink"
            />
            <div className="mt-2 flex gap-1">
              <button onClick={addTitles} disabled={busy || !titles.trim()} className="flex h-8 flex-1 items-center justify-center gap-1 rounded-md bg-ink px-2 text-xs font-medium text-white disabled:opacity-50">
                <Upload className="size-3.5" /> Queue
              </button>
              <button onClick={processNext} disabled={busy || running} className="flex h-8 items-center gap-1 rounded-md border border-line bg-surface-1 px-2 text-xs">
                <Play className="size-3.5" /> Next
              </button>
            </div>
            <div className="mt-2 grid grid-cols-3 gap-1">
              <button onClick={running ? stopRun : runSequential} disabled={busy && !running} className="h-8 rounded-md border border-line bg-surface-1 text-xs">{running ? "Stop run" : "Start run"}</button>
              <button onClick={stopRun} className="flex h-8 items-center justify-center gap-1 rounded-md border border-line bg-surface-1 text-xs"><Square className="size-3" /> Stop</button>
              <button onClick={() => post("/api/queue/retry-failed", "Failed jobs requeued.")} className="flex h-8 items-center justify-center gap-1 rounded-md border border-line bg-surface-1 text-xs"><RotateCw className="size-3" /> Retry</button>
            </div>
            <div className="mt-2 grid grid-cols-2 gap-1">
              <button onClick={() => post("/api/queue/recover", "Stale processing jobs recovered.")} className="h-8 rounded-md border border-line bg-surface-1 text-xs">Recover</button>
              <button onClick={clearQueue} className="flex h-8 items-center justify-center gap-1 rounded-md border border-danger/30 bg-surface-1 text-xs text-danger"><Trash2 className="size-3" /> Clear queue</button>
            </div>
            <div className="mt-3 rounded-md border border-line bg-surface-1 p-2">
              <label className="flex items-center justify-between text-xs text-ink-muted">
                <span>Target words</span>
                <input
                  type="number"
                  min={300}
                  max={5000}
                  step={100}
                  value={controls?.lengthTargetWords ?? 1400}
                  onChange={(event) => updateLengthTarget(Number(event.target.value))}
                  className="mono h-7 w-24 rounded border border-line bg-background px-2 text-right text-xs text-ink outline-none focus:border-ink"
                />
              </label>
            </div>
            <QueueMetricsPanel metrics={queueMetrics} />
          </div>

          <div className="hairline-b flex flex-wrap gap-1 p-2">
            {(["all", "queued", "processing", "generated", "needs_review", "failed"] as Filter[]).map((item) => (
              <button key={item} onClick={() => setFilter(item)} className={cn("rounded px-2 py-1 text-[11px]", filter === item ? "bg-ink text-white" : "bg-surface-1 text-ink-muted")}>
                {item.replace("_", " ")} <span className="mono">{item === "all" ? jobs.length : stats[item]}</span>
              </button>
            ))}
          </div>

          <div className="min-h-0 flex-1 overflow-auto">
            {visibleJobs.map((job) => (
              <div key={job.id} className="hairline-b flex w-full gap-2 px-3 py-2 hover:bg-surface-3">
                <button onClick={() => setSelectedArticleId(job.articleId)} className="flex min-w-0 flex-1 gap-2 text-left">
                  <span className={cn("status-dot mt-1.5 shrink-0", statusColor(job.status))} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{job.title}</span>
                  <span className="mono mt-1 block text-[11px] text-ink-subtle">
                    {statusLabel(job.status)} - Attempt {job.attempts}
                  </span>
                </span>
                </button>
                {job.status === "failed" && (
                  <button onClick={() => retryOne(job.id)} className="self-center rounded border border-line bg-surface-1 px-2 py-1 text-[11px] text-ink-muted hover:text-ink">
                    Retry
                  </button>
                )}
              </div>
            ))}
          </div>
        </aside>

        <section className="flex min-h-0 flex-col">
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
          <div className="min-h-0 flex-1 overflow-auto px-8 py-6">
            {selectedArticle ? <MarkdownPreview markdown={selectedArticle.markdown} /> : selectedJob ? <JobPlaceholder job={selectedJob} /> : <Empty text="No article selected." />}
          </div>
        </section>

        <aside className="hairline-l flex min-h-0 flex-col bg-surface-2">
          <div className="hairline-b flex h-9 shrink-0 items-center gap-1 overflow-x-auto px-2">
            {(["research", "pipeline", "validation", "seo", "debug"] as const).map((item) => (
              <button key={item} onClick={() => setTab(item)} className={cn("h-7 rounded px-2 text-xs capitalize", tab === item ? "bg-surface-1 text-ink shadow-sm" : "text-ink-muted")}>{item}</button>
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

      <footer className="hairline-t mono flex h-7 items-center gap-4 bg-surface-1 px-3 text-[11px] text-ink-muted">
        <span>{stats.queued} queued</span>
        <span>{stats.processing} processing</span>
        <span>{stats.generated} generated</span>
        <span>{stats.needs_review} needs review</span>
        <span className={stats.failed ? "text-danger" : ""}>{stats.failed} failed</span>
        <span className="ml-auto">{selectedArticle ? `${selectedArticle.wordCount} words · Q${selectedArticle.qualityScore}` : "No article"}</span>
      </footer>
    </main>
  );
}

function ArticleHeader({ article, job, onReviewClick }: { article: ArticleDocument | null; job: QueueJob | null; onReviewClick: () => void }) {
  if (!article && job) {
    return (
      <div className="hairline-b bg-background px-6 py-4">
        <div className="mono text-[11px] uppercase tracking-[0.16em] text-danger">{job.status.replace("_", " ")}</div>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">{job.title}</h1>
        <div className="mono mt-2 text-xs text-ink-muted">attempt {job.attempts}</div>
      </div>
    );
  }
  if (!article) return <div className="hairline-b h-24 p-5" />;
  return (
    <div className="hairline-b bg-background px-6 py-4">
      <div className="mono text-[11px] uppercase tracking-[0.16em] text-ink-subtle">{article.status.replace("_", " ")}</div>
      <h1 className="mt-1 text-2xl font-semibold tracking-tight">{article.title}</h1>
      <div className="mono mt-2 flex flex-wrap gap-3 text-xs text-ink-muted">
        <span>{article.sources.length} sources</span>
        <span>{article.wordCount} words</span>
        <span>Q{article.qualityScore}</span>
        {article.needsReviewReasons.length > 0 && (
          <button onClick={onReviewClick} className="text-warn hover:underline">
            {article.needsReviewReasons.length} review reasons
          </button>
        )}
      </div>
    </div>
  );
}

function JobPlaceholder({ job }: { job: QueueJob }) {
  if (job.status !== "failed") {
    return (
      <div className="mx-auto max-w-3xl rounded-md border border-line bg-surface-1 p-4">
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
    <div className="mx-auto max-w-3xl rounded-md border border-danger/30 bg-surface-1 p-4">
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
    <article className="mx-auto max-w-3xl whitespace-pre-wrap text-[15px] leading-7 text-ink">
      {markdown}
    </article>
  );
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
      {tab === "debug" && <DebugPanel debug={details.debug} />}
    </div>
  );
}

function ResearchPanel({ research, article }: { research: ResearchPack | null; article: ArticleDocument }) {
  const sources = research?.sources ?? article.sources;
  return (
    <div className="space-y-5">
      <MetricGrid items={[
        ["Sources", sources.length],
        ["Rejected", research?.rejectedSources.length ?? 0],
        ["Authority", research?.authorityScore ?? 0],
        ["Confidence", research?.confidence ?? 0]
      ]} />
      <PanelTitle title="Sources" />
      <ul className="space-y-2">
        {sources.map((source) => (
          <li key={source.url} className="rounded-md border border-line bg-surface-1 p-2">
            <div className="text-xs font-medium leading-snug">{source.title}</div>
            <a className="mono mt-1 block truncate text-[11px] text-ink-subtle" href={source.url} target="_blank">{source.domain}</a>
          </li>
        ))}
      </ul>
      <PanelTitle title="Useful facts" />
      <ul className="space-y-1 text-xs leading-snug text-ink-muted">
        {(research?.usefulFacts ?? []).map((fact) => <li key={fact}>{fact}</li>)}
      </ul>
    </div>
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

function MetricGrid({ items }: { items: [string, string | number][] }) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {items.map(([label, value]) => (
        <div key={label} className="rounded-md border border-line bg-surface-1 p-2">
          <div className="text-[10px] uppercase tracking-[0.14em] text-ink-subtle">{label}</div>
          <div className="mono mt-1 text-lg font-semibold">{value}</div>
        </div>
      ))}
    </div>
  );
}

function QueueMetricsPanel({ metrics }: { metrics: QueueMetrics }) {
  return (
    <div className="mt-3 space-y-2">
      <div className="rounded-md border border-line bg-surface-1 p-2">
        <PanelTitle title="Current queue run" />
        <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
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
      </div>

      <div className="rounded-md border border-line bg-surface-1 p-2">
        <PanelTitle title="Reliability dashboard" />
        <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
          <MetricLine label="Generated" value={metrics.generated} />
          <MetricLine label="Needs review" value={metrics.needsReview} />
          <MetricLine label="Failed" value={metrics.failed} />
          <MetricLine label="Success rate" value={`${metrics.successRate}%`} />
          <MetricLine label="Avg research" value={formatDuration(metrics.averageResearchMs)} />
          <MetricLine label="Avg generation" value={formatDuration(metrics.averageGenerationMs)} />
          <MetricLine label="Avg save" value={formatDuration(metrics.averageSaveMs)} />
          <MetricLine label="Throughput" value={metrics.throughputPerHour ? `${metrics.throughputPerHour}/hr` : "-"} />
        </div>
      </div>

      <div className="rounded-md border border-line bg-surface-1 p-2">
        <PanelTitle title="Reliability history" />
        <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
          <MetricLine label="Last stored run" value={`${metrics.completed} done`} />
          <MetricLine label="Last failed" value={metrics.failed} />
          <MetricLine label="Best stored run" value={`${metrics.completed} done`} />
          <MetricLine label="Best failed" value={metrics.failed} />
          <MetricLine label="Lifetime done" value={metrics.completed} />
          <MetricLine label="Lifetime failed" value={metrics.failed} />
        </div>
      </div>
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

function Empty({ text }: { text: string }) {
  return <div className="rounded-md border border-dashed border-line p-4 text-center text-xs text-ink-subtle">{text}</div>;
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
