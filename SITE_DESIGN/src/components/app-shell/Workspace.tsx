import { useOSStore, selectArticle } from "@/lib/os-writer-store";
import {
  Bold,
  Italic,
  Link as LinkIcon,
  List,
  ListOrdered,
  Heading2,
  Heading3,
  Wand2,
  Maximize2,
  Minimize2,
  RotateCcw,
  Sparkles,
  Download,
  ChevronDown,
  FileText,
  Code2,
  Columns2,
  Play,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { useMemo } from "react";

export function Workspace() {
  const article = useOSStore(selectArticle);
  const viewMode = useOSStore((s) => s.viewMode);
  const setPref = useOSStore((s) => s.setPref);
  const toggleEditorPass = useOSStore((s) => s.toggleEditorPass);
  const updateArticle = useOSStore((s) => s.updateArticle);

  if (!article) {
    return (
      <div className="grid h-full place-items-center text-ink-subtle">No article selected</div>
    );
  }

  const readingTime = Math.max(1, Math.round(article.wordCount / 230));

  return (
    <div className="flex h-full flex-col overflow-hidden bg-background">
      {/* Article header — typography-led, no surrounding box */}
      <div className="px-6 pb-3 pt-5 lg:px-8">
        <div className="mono text-[10px] uppercase tracking-[0.18em] text-ink-subtle">
          {article.status === "generated" ? "Generated · ready" : article.status}
        </div>
        <input
          value={article.title}
          onChange={(e) => updateArticle(article.id, { title: e.target.value })}
          className="-mx-1 mt-0.5 w-full bg-transparent px-1 text-[22px] font-semibold leading-tight tracking-[-0.018em] text-ink focus:outline-none focus:ring-1 focus:ring-line-strong lg:text-[24px]"
        />

        {article.status === "generated" && (
          <div className="mono mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[11px] text-ink-muted">
            <QualityBadge value={article.quality} />
            <Sep />
            <Meta label="Sources" v={article.sources.length} />
            <Meta label="Facts" v={article.facts.length} />
            <Meta label="Words" v={article.wordCount.toLocaleString()} />
            <Meta label="Read" v={`${readingTime}m`} />
          </div>
        )}
      </div>

      {/* Action toolbar — primary group separated from secondary, wraps when narrow */}
      <div className="hairline-b flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 px-4 py-1.5 lg:px-6">
        {/* Primary group */}
        <div className="flex shrink-0 items-center gap-1">
          <PrimaryButton icon={Play} label="Generate" />
          <PrimaryButton icon={Sparkles} label="AI Pass" onClick={() => toggleEditorPass(true)} />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex h-7 shrink-0 items-center gap-1.5 rounded-md border border-line bg-surface-1 px-2.5 text-[12px] font-medium text-ink hover:bg-surface-3">
                <Download className="size-3.5" /> Export
                <ChevronDown className="size-3 text-ink-subtle" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              {["Markdown", "HTML", "DOCX", "CSV", "JSON"].map((f) => (
                <DropdownMenuItem key={f}>{f}</DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <div className="mx-1 hidden h-4 w-px bg-line sm:block" />

        {/* Secondary group — editing actions */}
        <div className="flex shrink-0 items-center gap-0.5">
          <SecondaryButton icon={RotateCcw} label="Rewrite" />
          <SecondaryButton icon={Maximize2} label="Expand" />
          <SecondaryButton icon={Minimize2} label="Shorten" />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex h-7 items-center gap-1 rounded px-2 text-[12px] text-ink-muted hover:bg-surface-3 hover:text-ink">
                Adjust <ChevronDown className="size-3" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem>Tone — Professional</DropdownMenuItem>
              <DropdownMenuItem>Tone — Conversational</DropdownMenuItem>
              <DropdownMenuItem>Reading level — Grade 8</DropdownMenuItem>
              <DropdownMenuItem>Reading level — Expert</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <SecondaryButton icon={Wand2} label="Optimise" />
        </div>

        <div className="ml-auto shrink-0">
          <Segmented
            value={viewMode}
            onChange={(v) => setPref("viewMode", v as any)}
            options={[
              { v: "rich", label: "Rich", icon: FileText },
              { v: "markdown", label: "MD", icon: Code2 },
              { v: "split", label: "Split", icon: Columns2 },
            ]}
          />
        </div>
      </div>

      {/* Inline formatting bar — very quiet */}
      <div className="flex items-center gap-0.5 px-6 py-1">
        {[Bold, Italic, LinkIcon, Heading2, Heading3, List, ListOrdered].map((Icon, i) => (
          <button
            key={i}
            className="flex size-6 items-center justify-center rounded text-ink-subtle hover:bg-surface-3 hover:text-ink"
          >
            <Icon className="size-3.5" />
          </button>
        ))}
        <div className="flex-1" />
        <span className="mono text-[10.5px] text-ink-subtle">Select text for inline actions</span>
      </div>

      {/* Editor body */}
      <div className="min-h-0 flex-1 overflow-auto">
        <EditorBody article={article} mode={viewMode} onChange={(md) => updateArticle(article.id, { markdown: md })} />
      </div>

      {/* Metrics rail */}
      <div className="hairline-t mono flex items-center gap-5 bg-surface-2/40 px-6 py-1.5 text-[10.5px] text-ink-muted">
        <Metric label="Words" v={article.wordCount.toLocaleString()} />
        <Metric label="Read" v={`${readingTime}m`} />
        <Metric label="Quality" v={`Q${article.quality}`} />
        <Metric label="Sources" v={article.sources.length} />
        <Metric label="Headings" v={article.headings.length} />
        <div className="flex-1" />
        <span className="text-ink-subtle">Autosaved {new Date(article.updatedAt).toLocaleTimeString()}</span>
      </div>
    </div>
  );
}

function EditorBody({
  article,
  mode,
  onChange,
}: {
  article: ReturnType<typeof selectArticle>;
  mode: "rich" | "markdown" | "split";
  onChange: (md: string) => void;
}) {
  const md = article?.markdown || "";
  const rendered = useMemo(() => renderMarkdown(md), [md]);
  if (!article) return null;

  if (mode === "markdown") {
    return (
      <textarea
        value={md}
        onChange={(e) => onChange(e.target.value)}
        className="mono h-full w-full resize-none bg-background p-8 text-[13px] leading-relaxed text-ink focus:outline-none"
      />
    );
  }
  if (mode === "split") {
    return (
      <div className="grid h-full grid-cols-2 divide-x divide-line">
        <textarea
          value={md}
          onChange={(e) => onChange(e.target.value)}
          className="mono h-full w-full resize-none bg-background p-8 text-[13px] leading-relaxed text-ink focus:outline-none"
        />
        <div className="overflow-auto px-10 py-8">
          <article className="prose-os">{rendered}</article>
        </div>
      </div>
    );
  }
  return (
    <div className="mx-auto max-w-[720px] px-8 py-10">
      <article className="prose-os">{rendered}</article>
    </div>
  );
}

function renderMarkdown(md: string) {
  if (!md.trim()) {
    return <div className="text-ink-subtle">This article hasn't been generated yet.</div>;
  }
  const lines = md.split("\n");
  const out: React.ReactElement[] = [];
  let buf: string[] = [];
  const flush = () => {
    if (buf.length) {
      out.push(<p key={out.length} className="my-4 text-[15.5px] leading-[1.75] text-ink">{buf.join(" ")}</p>);
      buf = [];
    }
  };
  let listBuf: string[] = [];
  const flushList = () => {
    if (listBuf.length) {
      out.push(
        <ul key={out.length} className="my-4 list-disc space-y-1.5 pl-5 text-[15.5px] leading-[1.7] text-ink">
          {listBuf.map((b, i) => <li key={i}>{b}</li>)}
        </ul>
      );
      listBuf = [];
    }
  };
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) { flush(); flushList(); continue; }
    if (line.startsWith("### ")) { flush(); flushList(); out.push(<h3 key={out.length} className="mt-7 text-[16px] font-semibold tracking-[-0.005em] text-ink">{line.slice(4)}</h3>); continue; }
    if (line.startsWith("## ")) { flush(); flushList(); out.push(<h2 key={out.length} className="mt-10 text-[20px] font-semibold tracking-[-0.012em] text-ink">{line.slice(3)}</h2>); continue; }
    if (line.startsWith("# ")) { flush(); flushList(); out.push(<h1 key={out.length} className="mt-2 text-[28px] font-semibold tracking-[-0.02em] text-ink">{line.slice(2)}</h1>); continue; }
    if (line.startsWith("- ")) { flush(); listBuf.push(line.slice(2)); continue; }
    flushList();
    buf.push(line);
  }
  flush(); flushList();
  return out;
}

function QualityBadge({ value }: { value: number }) {
  const tone =
    value >= 90 ? "text-ink" : value >= 70 ? "text-ink-muted" : "text-warn";
  return (
    <span className="inline-flex items-baseline gap-1">
      <span className="mono text-[10px] uppercase tracking-[0.14em] text-ink-subtle">Quality</span>
      <span className={cn("mono text-[15px] font-semibold leading-none tracking-tight", tone)}>
        {value}
      </span>
      <span className="mono text-[10px] text-ink-subtle">/100</span>
    </span>
  );
}

function Meta({ label, v }: { label: string; v: React.ReactNode }) {
  return (
    <span className="inline-flex items-baseline gap-1">
      <span className="text-ink-subtle">{label}</span>
      <span className="text-ink">{v}</span>
    </span>
  );
}

function Sep() {
  return <span className="h-3 w-px bg-line" />;
}

function Segmented<T extends string>({
  value, onChange, options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { v: T; label: string; icon: any }[];
}) {
  return (
    <div className="flex h-7 items-center rounded-md bg-surface-2 p-0.5">
      {options.map((o) => (
        <button
          key={o.v}
          onClick={() => onChange(o.v)}
          className={cn(
            "flex h-6 items-center gap-1 rounded px-1.5 text-[11.5px] transition-colors",
            value === o.v ? "bg-surface-1 text-ink shadow-[0_1px_0_var(--line)]" : "text-ink-muted hover:text-ink",
          )}
        >
          <o.icon className="size-3" />
          {o.label}
        </button>
      ))}
    </div>
  );
}

function PrimaryButton({ icon: Icon, label, onClick }: { icon: any; label: string; onClick?: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex h-7 items-center gap-1.5 rounded-md bg-ink px-2.5 text-[12px] font-medium text-primary-foreground hover:bg-ink/90"
    >
      <Icon className="size-3.5" />
      {label}
    </button>
  );
}

function SecondaryButton({ icon: Icon, label, onClick }: { icon: any; label: string; onClick?: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex h-7 items-center gap-1.5 rounded px-2 text-[12px] text-ink-muted hover:bg-surface-3 hover:text-ink"
    >
      <Icon className="size-3.5" />
      {label}
    </button>
  );
}

function Metric({ label, v }: { label: string; v: React.ReactNode }) {
  return (
    <span className="inline-flex items-baseline gap-1">
      <span className="text-ink-subtle">{label}</span>
      <span className="text-ink">{v}</span>
    </span>
  );
}
