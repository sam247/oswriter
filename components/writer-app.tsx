"use client";

import { AlertCircle, CheckCircle2, Loader2, Play, RotateCw, Search, Square, Trash2, Upload } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { AppState, ArticleDocument, DebugDocument, JobStatus, QueueJob, ResearchPack } from "@/lib/types";
import { cn } from "@/lib/utils";

type Details = { research: ResearchPack | null; debug: DebugDocument | null };
type Filter = JobStatus | "all";

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
  const [tab, setTab] = useState<"research" | "pipeline" | "validation" | "seo" | "debug">("research");
  const stopRequested = useRef(false);
  const activeRequest = useRef<AbortController | null>(null);

  const jobs = state?.jobs ?? [];
  const articles = state?.articles ?? [];
  const selectedArticle = useMemo(
    () => articles.find((article) => article.id === selectedArticleId) ?? articles[0] ?? null,
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

  async function refresh() {
    const res = await fetch("/api/state", { cache: "no-store" });
    if (res.ok) {
      const next = await res.json() as AppState;
      setState(next);
      if (!selectedArticleId && next.articles[0]) setSelectedArticleId(next.articles[0].id);
    } else {
      setMessage("Unable to load state.");
    }
  }

  useEffect(() => {
    void refresh();
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
      await refresh();
      return false;
    }
    const data = await res.json().catch(() => ({})) as { processed?: boolean; job?: QueueJob; error?: string };
    setBusy(false);
    if (!res.ok) {
      setMessage(data.error ? String(data.error) : "Processing failed.");
      await refresh();
      return false;
    }
    setMessage(data.processed ? `Processed: ${data.job?.title}` : "No queued jobs.");
    await refresh();
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

  return (
    <main className="flex h-screen flex-col overflow-hidden bg-background text-ink">
      <header className="hairline-b flex h-10 items-center gap-3 bg-surface-1 px-3">
        <div className="font-semibold tracking-tight">OS Writer V2</div>
        <span className="mono text-xs text-ink-subtle">No clever blocking logic</span>
        <div className="ml-auto mono text-xs text-ink-muted">{message}</div>
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
              <button key={job.id} onClick={() => setSelectedArticleId(job.articleId)} className="hairline-b flex w-full gap-2 px-3 py-2 text-left hover:bg-surface-3">
                <span className={cn("status-dot mt-1.5 shrink-0", statusColor(job.status))} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{job.title}</span>
                  <span className="mono mt-1 block text-[11px] text-ink-subtle">
                    {job.status.replace("_", " ")} · attempt {job.attempts}
                  </span>
                </span>
              </button>
            ))}
          </div>
        </aside>

        <section className="flex min-h-0 flex-col">
          <ArticleHeader article={selectedArticle} job={selectedJob} />
          <div className="min-h-0 flex-1 overflow-auto px-8 py-6">
            {selectedArticle ? <MarkdownPreview markdown={selectedArticle.markdown} /> : selectedJob ? <FailedJob job={selectedJob} /> : <Empty text="No article selected." />}
          </div>
        </section>

        <aside className="hairline-l flex min-h-0 flex-col bg-surface-2">
          <div className="hairline-b flex h-9 shrink-0 items-center gap-1 overflow-x-auto px-2">
            {(["research", "pipeline", "validation", "seo", "debug"] as const).map((item) => (
              <button key={item} onClick={() => setTab(item)} className={cn("h-7 rounded px-2 text-xs capitalize", tab === item ? "bg-surface-1 text-ink shadow-sm" : "text-ink-muted")}>{item}</button>
            ))}
          </div>
          <Inspector tab={tab} article={selectedArticle} job={selectedJob} details={details} />
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

function ArticleHeader({ article, job }: { article: ArticleDocument | null; job: QueueJob | null }) {
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
        {article.needsReviewReasons.length > 0 && <span className="text-warn">{article.needsReviewReasons.length} review reasons</span>}
      </div>
    </div>
  );
}

function FailedJob({ job }: { job: QueueJob }) {
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

function Inspector({ tab, article, job, details }: { tab: string; article: ArticleDocument | null; job: QueueJob | null; details: Details }) {
  if (!article && !job) return <Empty text="No article selected." />;
  return (
    <div className="min-h-0 flex-1 overflow-auto p-3 text-sm">
      {tab === "research" && (article ? <ResearchPanel research={details.research} article={article} /> : <Empty text="No research pack saved before failure." />)}
      {tab === "pipeline" && <PipelinePanel pipeline={(article?.pipeline ?? job?.pipeline) ?? []} />}
      {tab === "validation" && (article ? <ValidationPanel article={article} /> : <Empty text={job?.fatalError ?? "No validation record saved before failure."} />)}
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

function PipelinePanel({ pipeline }: { pipeline: ArticleDocument["pipeline"] }) {
  return (
    <ol className="space-y-2">
      {pipeline.map((step) => (
        <li key={step.stage} className="rounded-md border border-line bg-surface-1 p-2">
          <div className="flex items-center gap-2">
            {step.status === "done" ? <CheckCircle2 className="size-4 text-success" /> : step.status === "failed" ? <AlertCircle className="size-4 text-danger" /> : <Search className="size-4 text-ink-subtle" />}
            <span className="font-medium capitalize">{step.stage}</span>
            <span className="mono ml-auto text-xs text-ink-subtle">{step.durationMs ? `${(step.durationMs / 1000).toFixed(1)}s` : step.status}</span>
          </div>
          {step.error && <p className="mt-1 text-xs text-danger">{step.error}</p>}
          {step.message && <p className="mt-1 text-xs text-ink-muted">{step.message}</p>}
        </li>
      ))}
    </ol>
  );
}

function ValidationPanel({ article }: { article: ArticleDocument }) {
  return (
    <div className="space-y-4">
      <MetricGrid items={[
        ["Quality", article.validation.qualityScore],
        ["FAQ", article.validation.faqScore],
        ["SEO", article.validation.seoScore],
        ["Warnings", article.validation.warnings.length]
      ]} />
      <PanelTitle title="Warnings" />
      {article.validation.warnings.length ? (
        <ul className="space-y-2 text-xs text-ink-muted">
          {article.validation.warnings.map((warning) => <li key={warning} className="rounded-md bg-surface-1 p-2">{warning}</li>)}
        </ul>
      ) : <Empty text="No validation warnings." />}
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
