import { useOSStore, selectArticle, type PipelineStep, type Validator } from "@/lib/os-writer-store";
import { cn } from "@/lib/utils";
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "@/components/ui/tabs";
import {
  ExternalLink,
  Lock,
  X,
  Plus,
  Check,
  AlertCircle,
  CircleDot,
  Circle as CircleIcon,
  XCircle,
  CheckCircle2,
} from "lucide-react";

export function Inspector() {
  const article = useOSStore(selectArticle);
  const tab = useOSStore((s) => s.inspectorTab);
  const setPref = useOSStore((s) => s.setPref);

  if (!article) {
    return <div className="grid h-full place-items-center bg-surface-2 text-ink-subtle">No article</div>;
  }

  return (
    <aside className="flex h-full flex-col overflow-hidden bg-surface-2">
      <Tabs value={tab} onValueChange={(v) => setPref("inspectorTab", v as any)} className="flex min-h-0 flex-1 flex-col">
        {/* Text-only tabs, underline indicator */}
        <TabsList className="hairline-b flex h-9 w-full min-w-0 justify-start gap-0 overflow-x-auto rounded-none bg-transparent px-2 p-0">
          {[
            { v: "research", label: "Research" },
            { v: "pipeline", label: "Pipeline" },
            { v: "validation", label: "Validate" },
            { v: "seo", label: "SEO" },
            { v: "debug", label: "Debug" },
          ].map((t) => (
            <TabsTrigger
              key={t.v}
              value={t.v}
              className={cn(
                "relative h-9 shrink-0 rounded-none border-0 bg-transparent px-2 text-[11.5px] font-medium text-ink-muted shadow-none",
                "data-[state=active]:bg-transparent data-[state=active]:text-ink data-[state=active]:shadow-none",
                "data-[state=active]:after:absolute data-[state=active]:after:inset-x-2 data-[state=active]:after:-bottom-px data-[state=active]:after:h-[1.5px] data-[state=active]:after:bg-ink",
              )}
            >
              {t.label}
            </TabsTrigger>
          ))}
        </TabsList>

        <div className="min-h-0 flex-1 overflow-auto">
          <TabsContent value="research" className="m-0 px-3 py-3"><ResearchPanel article={article} /></TabsContent>
          <TabsContent value="pipeline" className="m-0 px-3 py-3"><PipelinePanel article={article} /></TabsContent>
          <TabsContent value="validation" className="m-0 px-3 py-3"><ValidationPanel article={article} /></TabsContent>
          <TabsContent value="seo" className="m-0 px-3 py-3"><SEOPanel article={article} /></TabsContent>
          <TabsContent value="debug" className="m-0 px-3 py-3"><DebugPanel article={article} /></TabsContent>
        </div>
      </Tabs>
    </aside>
  );
}

function Section({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="mb-5">
      <div className="mb-2 flex items-center justify-between px-1">
        <h3 className="text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-subtle">{title}</h3>
        {action}
      </div>
      {children}
    </div>
  );
}

function ResearchPanel({ article }: { article: ReturnType<typeof selectArticle> }) {
  if (!article) return null;
  return (
    <>
      <Section
        title="Sources"
        action={
          <button className="flex items-center gap-1 text-[10.5px] text-ink-muted hover:text-ink">
            <Plus className="size-3" /> Add
          </button>
        }
      >
        {article.sources.length === 0 ? (
          <Empty>No sources yet.</Empty>
        ) : (
          <ul className="divide-y divide-line/70">
            {article.sources.map((s) => (
              <li key={s.id} className="group px-1 py-2">
                <div className="flex items-start gap-2">
                  <span className="mono mt-0.5 w-6 shrink-0 text-[10px] tabular-nums text-ink-subtle">#{s.index}</span>
                  <div className="min-w-0 flex-1">
                    <div className="text-[12.5px] font-medium leading-snug text-ink">{s.title}</div>
                    <a href={s.url} target="_blank" rel="noreferrer" className="mono mt-0.5 flex items-center gap-1 truncate text-[10.5px] text-ink-subtle hover:text-ink-muted">
                      <ExternalLink className="size-2.5 shrink-0" /> {s.url}
                    </a>
                    <div className="mono mt-1 flex items-center gap-3 text-[10px] text-ink-subtle">
                      <span>Auth <span className="text-ink-muted">{s.authority}</span></span>
                      <span>Rel <span className="text-ink-muted">{s.relevance}</span></span>
                    </div>
                  </div>
                  <div className="invisible flex gap-0.5 group-hover:visible">
                    <IconBtn title="Lock"><Lock className="size-3" /></IconBtn>
                    <IconBtn title="Exclude"><X className="size-3" /></IconBtn>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Useful facts">
        {article.facts.length === 0 ? <Empty>—</Empty> : (
          <ul className="space-y-1.5 px-1">
            {article.facts.map((f, i) => (
              <li key={i} className="text-[12.5px] leading-snug text-ink">{f}</li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Questions found">
        <ul className="px-1">
          {article.questions.map((q, i) => (
            <li key={i} className="py-1 text-[12.5px] text-ink">{q}</li>
          ))}
          {article.questions.length === 0 && <Empty>—</Empty>}
        </ul>
      </Section>

      <Section title="Headings found">
        <ul className="px-1">
          {article.headings.map((h, i) => (
            <li key={i} className="py-1 text-[12.5px] text-ink">{h}</li>
          ))}
          {article.headings.length === 0 && <Empty>—</Empty>}
        </ul>
      </Section>

      <Section title="Diagnostics">
        <div className="grid grid-cols-2 gap-x-4 gap-y-2 px-1">
          <MiniMetric label="Accepted" value={article.sources.filter((s) => s.accepted).length} />
          <MiniMetric label="Rejected" value={0} />
          <MiniMetric label="Authority" value={avg(article.sources.map((s) => s.authority))} suffix="/100" />
          <MiniMetric label="Relevance" value={avg(article.sources.map((s) => s.relevance))} suffix="/100" />
        </div>
      </Section>
    </>
  );
}

function PipelinePanel({ article }: { article: ReturnType<typeof selectArticle> }) {
  if (!article) return null;
  return (
    <Section title="Generation pipeline">
      <ol className="relative space-y-2.5 pl-5">
        <div className="absolute bottom-2 left-[7px] top-2 w-px bg-line" />
        {article.pipeline.map((step) => <PipelineRow key={step.stage} step={step} />)}
      </ol>
    </Section>
  );
}

function PipelineRow({ step }: { step: PipelineStep }) {
  const iconFor = {
    idle: <CircleIcon className="size-3 text-ink-subtle" />,
    running: <CircleDot className="size-3 animate-pulse text-info" />,
    done: <CheckCircle2 className="size-3 text-success" />,
    failed: <XCircle className="size-3 text-danger" />,
  }[step.status];
  return (
    <li className="relative">
      <span className="absolute -left-[18px] top-0.5 grid size-3 place-items-center bg-surface-2">{iconFor}</span>
      <div className="flex items-baseline justify-between">
        <span className="text-[12.5px] font-medium capitalize text-ink">{step.stage}</span>
        <span className="mono text-[10.5px] tabular-nums text-ink-subtle">
          {step.durationMs ? `${(step.durationMs / 1000).toFixed(1)}s` : "—"}
        </span>
      </div>
      {step.error && (
        <div className="mt-1 text-[11px] leading-snug text-danger">{step.error}</div>
      )}
    </li>
  );
}

function ValidationPanel({ article }: { article: ReturnType<typeof selectArticle> }) {
  if (!article) return null;
  const passed = article.validators.filter((v) => v.passed).length;
  const total = article.validators.length;
  return (
    <Section
      title="Validation"
      action={<span className="mono text-[10.5px] tabular-nums text-ink-muted">{passed}/{total} pass</span>}
    >
      <ul className="divide-y divide-line/70">
        {article.validators.map((v) => <ValidatorRow key={v.id} v={v} />)}
        {!article.validators.length && <Empty>No validators run yet.</Empty>}
      </ul>
    </Section>
  );
}

function ValidatorRow({ v }: { v: Validator }) {
  return (
    <li>
      <div className="flex items-center gap-2 px-1 py-1.5">
        {v.passed ? (
          <Check className="size-3 shrink-0 text-success" />
        ) : (
          <AlertCircle className="size-3 shrink-0 text-danger" />
        )}
        <span className="flex-1 text-[12.5px] text-ink">{v.name}</span>
        <span className="mono text-[10px] uppercase text-ink-subtle">{v.group}</span>
      </div>
      {!v.passed && v.trigger && (
        <div className="space-y-1 px-1 pb-2 pl-6 text-[11.5px]">
          <div className="text-ink-muted">{v.trigger}</div>
          {v.fix && (
            <div className="flex items-center justify-between rounded bg-surface-3 px-2 py-1 text-ink">
              <span>Suggested fix: {v.fix}</span>
              <button className="text-[10.5px] font-medium text-ink hover:underline">Apply</button>
            </div>
          )}
        </div>
      )}
    </li>
  );
}

function SEOPanel({ article }: { article: ReturnType<typeof selectArticle> }) {
  if (!article) return null;
  const rt = Math.max(1, Math.round(article.wordCount / 230));
  return (
    <>
      <Section title="Article SEO">
        <div className="grid grid-cols-2 gap-x-4 gap-y-2 px-1">
          <MiniMetric label="Words" value={article.wordCount} />
          <MiniMetric label="Headings" value={article.headings.length} />
          <MiniMetric label="FAQs" value={article.questions.length} />
          <MiniMetric label="Internal" value={0} />
          <MiniMetric label="External" value={article.sources.length} />
          <MiniMetric label="Read" value={`${rt}m`} />
        </div>
      </Section>
      <Section title="SEO validation">
        <ul className="divide-y divide-line/70">
          {[
            "H1 present",
            "Intro present",
            "FAQ present",
            "No duplicate headings",
            "No research leakage",
            "No CTA contamination",
          ].map((c) => (
            <li key={c} className="flex items-center gap-2 px-1 py-1.5">
              <Check className="size-3 text-success" />
              <span className="text-[12.5px] text-ink">{c}</span>
            </li>
          ))}
        </ul>
      </Section>
    </>
  );
}

function DebugPanel({ article }: { article: ReturnType<typeof selectArticle> }) {
  if (!article) return null;
  const max = Math.max(...article.pipeline.map((p) => p.durationMs ?? 0), 1);
  return (
    <>
      <Section title="Article timeline">
        <ul className="space-y-1.5 px-1">
          {article.pipeline.map((p) => (
            <li key={p.stage} className="flex items-center gap-2">
              <span className="mono w-20 shrink-0 text-[11px] capitalize text-ink-muted">{p.stage}</span>
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-3">
                <div
                  className={cn(
                    "h-full rounded-full",
                    p.status === "failed" ? "bg-danger" : "bg-ink",
                  )}
                  style={{ width: `${((p.durationMs ?? 0) / max) * 100}%` }}
                />
              </div>
              <span className="mono w-12 shrink-0 text-right text-[10.5px] tabular-nums text-ink-subtle">
                {p.durationMs ? `${(p.durationMs / 1000).toFixed(1)}s` : "—"}
              </span>
            </li>
          ))}
        </ul>
      </Section>
      <Section title="Generation logs">
        <pre className="mono max-h-72 overflow-auto whitespace-pre-wrap rounded-md bg-surface-1 p-2.5 text-[10.5px] leading-relaxed text-ink-muted">
{`[research]   query="${article.title}"
[research]   ${article.sources.length} sources kept · 0 rejected
[intent]     score=0.92  match=true
[outline]    headings=${article.headings.length}  score=0.88
[faq]        questions=${article.questions.length}  score=0.90
[validate]   ${article.validators.filter((v) => v.passed).length}/${article.validators.length} pass`}
        </pre>
      </Section>
    </>
  );
}

function avg(nums: number[]) {
  if (!nums.length) return 0;
  return Math.round(nums.reduce((a, b) => a + b, 0) / nums.length);
}

function MiniMetric({ label, value, suffix }: { label: string; value: React.ReactNode; suffix?: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <div className="text-[9.5px] uppercase tracking-[0.14em] text-ink-subtle">{label}</div>
      <div className="mono text-[14px] font-semibold tabular-nums text-ink">
        {value}
        {suffix && <span className="ml-0.5 text-[10px] font-normal text-ink-subtle">{suffix}</span>}
      </div>
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div className="px-1 py-2 text-[11.5px] text-ink-subtle">{children}</div>;
}

function IconBtn({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <button title={title} className="flex size-5 items-center justify-center rounded text-ink-muted hover:bg-surface-3 hover:text-ink">
      {children}
    </button>
  );
}
