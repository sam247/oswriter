import type { ReactNode } from "react";
import { ArrowRight, Check, Minus } from "lucide-react";
import { RouteLink as Link } from "@/components/site/RouteLink";
import { cn } from "@/lib/utils";

export default function FeaturesPage() {
  return (
    <div className="min-h-screen bg-[#f5f5f7] font-sans text-[#0a0a0a] antialiased [color-scheme:light]">
      <Nav />
      <Hero />
      <WorkflowChain />
      <FeatureSections />
      <BuiltForMac />
      <QualityControls />
      <ActivityVisibility />
      <Comparison />
      <FinalCTA />
      <Footer />
    </div>
  );
}

/* ---------- Nav ---------- */
function Nav() {
  return (
    <header className="sticky top-4 z-50 px-4">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-6 rounded-2xl border border-black/5 bg-white/90 px-5 shadow-[0_2px_20px_-8px_rgba(0,0,0,0.08)] backdrop-blur-xl">
        <Link to="/" className="flex items-center gap-2 text-[15px] font-semibold tracking-tight">
          <span className="grid size-6 place-items-center rounded-md bg-[#0a0a0a] text-[10px] font-bold text-white">QW</span>
          QueueWrite
        </Link>
        <nav className="ml-4 hidden items-center gap-6 text-[13.5px] text-[#3a3a3a] md:flex">
          <Link to="/" hash="process" className="hover:text-black">Process</Link>
          <Link to="/features" className="text-black">Features</Link>
          <Link to="/" hash="apps" className="hover:text-black">Integrations</Link>
          <Link to="/pricing" className="hover:text-black">Pricing</Link>
          <Link to="/blog" className="hover:text-black">Blog</Link>
          <Link to="/contact" className="hover:text-black">Contact</Link>
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <Link to="/dashboard" className="hidden text-[13.5px] text-[#3a3a3a] hover:text-black sm:inline">
            Sign in
          </Link>
          <Link
            to="/dashboard"
            className="flex h-9 items-center gap-1.5 rounded-full bg-[#0a0a0a] px-4 text-[13px] font-medium text-white hover:bg-black"
          >
            Start Free
          </Link>
        </div>
      </div>
    </header>
  );
}

/* ---------- Hero ---------- */
function Hero() {
  return (
    <section className="px-4 pt-16 pb-12 lg:pt-24">
      <div className="mx-auto max-w-4xl text-center">
        <div className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-1 text-[11.5px] font-medium tracking-tight text-[#3a3a3a] ring-1 ring-black/5">
          <span className="size-1.5 rounded-full bg-[#0a0a0a]" />
          Features
        </div>
        <h1 className="mt-5 text-balance text-[44px] font-semibold leading-[1.02] tracking-[-0.035em] lg:text-[64px]">
          One workflow. From sitemap to published article.
        </h1>
        <p className="mx-auto mt-5 max-w-2xl text-[16px] leading-relaxed text-[#3a3a3a]">
          QueueWrite connects website intelligence, research, generation, validation, SEO and publishing into a single pipeline. Queue hundreds of articles, leave them running overnight, review the output in the morning.
        </p>
        <div className="mt-7 flex items-center justify-center gap-3">
          <Link
            to="/dashboard"
            className="flex h-11 items-center gap-1.5 rounded-full bg-[#0a0a0a] px-5 text-[13.5px] font-medium text-white hover:bg-black"
          >
            Start Publishing <ArrowRight className="size-3.5" />
          </Link>
          <a
            href="#features"
            className="flex h-11 items-center rounded-full bg-white px-5 text-[13.5px] font-medium text-[#0a0a0a] ring-1 ring-black/10 hover:bg-[#f0f0f3]"
          >
            View Workflow
          </a>
        </div>
      </div>
    </section>
  );
}

/* ---------- Workflow Chain ---------- */
function WorkflowChain() {
  const stages = [
    "Website Intelligence",
    "Research",
    "Generation",
    "Validation",
    "SEO",
    "Publishing",
  ];
  return (
    <section className="px-4 pb-12">
      <div className="mx-auto max-w-6xl rounded-2xl bg-white p-5 ring-1 ring-black/5">
        <div className="flex flex-wrap items-center justify-between gap-y-3">
          {stages.map((s, i) => (
            <div key={s} className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <span className="grid size-6 place-items-center rounded-md bg-[#0a0a0a] font-mono text-[10px] font-semibold text-white">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span className="text-[13px] font-medium tracking-tight">{s}</span>
              </div>
              {i < stages.length - 1 && (
                <ArrowRight className="hidden size-3.5 text-[#bdbdc3] md:block" />
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ---------- Feature Sections ---------- */
type Visual =
  | "intelligence"
  | "research"
  | "queue"
  | "validation"
  | "seo"
  | "links"
  | "publish"
  | "projects";

function FeatureSections() {
  const sections: {
    label: string;
    title: string;
    description: string;
    points: string[];
    visual: Visual;
  }[] = [
    {
      label: "01 · Website Intelligence",
      title: "Your site, understood before the first article.",
      description:
        "Import a sitemap and QueueWrite indexes your pages, products, categories, brands and audiences. Every article downstream is generated against your real site context, not a generic template.",
      points: [
        "Sitemap import and refresh",
        "Page-level context extraction",
        "Brand, product and category awareness",
        "Reusable across every project article",
      ],
      visual: "intelligence",
    },
    {
      label: "02 · Research Engine",
      title: "Evidence first. Words second.",
      description:
        "Each title triggers live web research. Sources are ranked, evidence is extracted, FAQs and entities are surfaced. The article is planned against verified material before generation begins.",
      points: [
        "Live web research per article",
        "Source ranking and authority scoring",
        "Evidence extraction with citations",
        "FAQ and entity discovery",
      ],
      visual: "research",
    },
    {
      label: "03 · Queue Management",
      title: "Run entire publishing schedules.",
      description:
        "Add 10 titles or 500. Set priority, concurrency and project. The queue handles ordering, retries and per-article state — built for publishers managing hundreds of articles a month.",
      points: [
        "Bulk title import (CSV or paste)",
        "Priority and concurrency controls",
        "Per-article state and retries",
        "Multi-project queueing",
      ],
      visual: "queue",
    },
    {
      label: "04 · Background Execution",
      title: "Close the browser. The queue keeps running.",
      description:
        "Generation runs server-side. Start a run before you leave for the day and review the finished batch in the morning. No desktop process, no machine that has to stay awake.",
      points: [
        "Server-side workers, not the browser",
        "Continues after sign-out or tab close",
        "Resumable runs and crash recovery",
        "Overnight and long-running jobs",
      ],
      visual: "queue",
    },
    {
      label: "05 · Validation Workflow",
      title: "Catch problems before an editor does.",
      description:
        "Every draft is scored for research depth, evidence strength, grammar and structural quality. Flags surface in the validation panel so editors review the work, not the basics.",
      points: [
        "Research and evidence scoring",
        "Grammar checks via Harper",
        "Hallucination and unsupported-claim flags",
        "Per-article validation panel",
      ],
      visual: "validation",
    },
    {
      label: "06 · SEO Optimisation",
      title: "On-page SEO, automated.",
      description:
        "Title, meta, headings, keyword coverage and readability are checked against the target query. Recommendations are inline and actionable — no separate SEO tool required.",
      points: [
        "Title, meta and heading checks",
        "Keyword coverage and intent match",
        "Readability and structure analysis",
        "Inline, per-article recommendations",
      ],
      visual: "seo",
    },
    {
      label: "07 · Internal Linking",
      title: "Tighten site architecture on every publish.",
      description:
        "QueueWrite scans your imported pages and suggests relevant internal links for each new article. Duplicates and existing links are respected, so the architecture compounds over time.",
      points: [
        "Suggestions drawn from imported pages",
        "Anchor and context-aware matching",
        "Duplicate and self-link prevention",
        "One-click insert during review",
      ],
      visual: "links",
    },
    {
      label: "08 · Editorial Review",
      title: "Review the batch. Approve what ships.",
      description:
        "Finished drafts land in a review queue with scores, sources and SEO notes attached. Approve, request a regeneration pass, or edit in place before publishing.",
      points: [
        "Batch review queue",
        "Sources and scores attached to each draft",
        "Regenerate or edit in place",
        "Approval gates before publish",
      ],
      visual: "validation",
    },
    {
      label: "09 · Bulk Publishing",
      title: "Ship the batch in one action.",
      description:
        "Publish approved articles as drafts or live posts. Schedule across days, target categories and authors, and push the entire run without leaving the workspace.",
      points: [
        "Publish as draft or live",
        "Scheduled publishing across a run",
        "Category, tag and author mapping",
        "Per-project publishing defaults",
      ],
      visual: "publish",
    },
    {
      label: "10 · Publishing Integrations",
      title: "WordPress today. More to follow.",
      description:
        "Native WordPress publishing with draft and live modes. Markdown, Webflow and Ghost exports cover the rest. Articles arrive structured, with internal links and SEO fields populated.",
      points: [
        "WordPress: draft or live",
        "Markdown export",
        "Webflow and Ghost export",
        "SEO fields and internal links preserved",
      ],
      visual: "publish",
    },
    {
      label: "11 · Multi-Project Workspaces",
      title: "One workspace. Every site you run.",
      description:
        "Each project has its own sitemap, knowledge base, queue and publishing target. Designed for agencies and publishers running a portfolio of sites in parallel.",
      points: [
        "Independent knowledge bases",
        "Independent queues and workers",
        "Per-project publishing targets",
        "Switch projects without losing state",
      ],
      visual: "projects",
    },
  ];

  return (
    <section id="features" className="px-4 pb-20">
      <div className="mx-auto max-w-6xl space-y-24 lg:space-y-32">
        {sections.map((s, i) => (
          <div key={s.label} className="grid gap-10 lg:grid-cols-2 lg:gap-16 lg:items-center">
            <div className={cn(i % 2 === 1 && "lg:order-2")}>
              <div className="font-mono text-[11px] uppercase tracking-[0.18em] text-[#6a6a6a]">
                {s.label}
              </div>
              <h2 className="mt-4 text-balance text-[32px] font-semibold leading-[1.04] tracking-[-0.03em] lg:text-[40px]">
                {s.title}
              </h2>
              <p className="mt-4 max-w-xl text-[15.5px] leading-[1.55] text-[#4a4a4a]">
                {s.description}
              </p>
              <ul className="mt-6 flex flex-col gap-2.5">
                {s.points.map((p) => (
                  <li key={p} className="flex items-start gap-2.5 text-[14px] text-[#0a0a0a]">
                    <Check className="mt-0.5 size-4 shrink-0 text-[#0a0a0a]" />
                    <span>{p}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className={cn(i % 2 === 1 && "lg:order-1")}>
              <VisualPanel kind={s.visual} />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ---------- Visual Panels (interface mockups) ---------- */
function PanelShell({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="overflow-hidden rounded-2xl bg-white ring-1 ring-black/5 shadow-[0_2px_24px_-12px_rgba(0,0,0,0.12)]">
      <div className="flex items-center justify-between border-b border-black/5 bg-[#fafafb] px-4 py-2.5">
        <div className="flex items-center gap-1.5">
          <span className="size-2 rounded-full bg-black/10" />
          <span className="size-2 rounded-full bg-black/10" />
          <span className="size-2 rounded-full bg-black/10" />
        </div>
        <span className="font-mono text-[10.5px] uppercase tracking-[0.16em] text-[#6a6a6a]">
          {title}
        </span>
        <span className="w-6" />
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}

function Row({
  label,
  meta,
  state = "default",
  progress,
}: {
  label: string;
  meta?: string;
  state?: "default" | "muted" | "ok" | "warn";
  progress?: number;
}) {
  const dot =
    state === "ok"
      ? "bg-[#0a0a0a]"
      : state === "warn"
        ? "bg-[#8a8a8a]"
        : state === "muted"
          ? "bg-black/15"
          : "bg-[#0a0a0a]";
  return (
    <div
      className={cn(
        "rounded-xl bg-[#f7f7f9] px-3.5 py-2.5 ring-1 ring-black/5",
        state === "muted" && "opacity-60",
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className={cn("size-1.5 shrink-0 rounded-full", dot)} />
          <span className="truncate text-[13px] font-medium text-[#0a0a0a]">{label}</span>
        </div>
        {meta && (
          <span className="font-mono text-[10.5px] uppercase tracking-[0.14em] text-[#6a6a6a]">
            {meta}
          </span>
        )}
      </div>
      {typeof progress === "number" && (
        <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-black/5">
          <div className="h-full rounded-full bg-[#0a0a0a]" style={{ width: `${progress}%` }} />
        </div>
      )}
    </div>
  );
}

function VisualPanel({ kind }: { kind: Visual }) {
  if (kind === "queue") {
    return (
      <PanelShell title="Queue · Project Alpha">
        <div className="mb-3 flex items-center justify-between text-[12px] text-[#6a6a6a]">
          <span>12 articles · 3 workers</span>
          <span className="font-mono text-[10.5px] uppercase tracking-[0.14em]">Running</span>
        </div>
        <div className="space-y-2">
          <Row label="Best espresso machines 2026" meta="Writing" progress={62} />
          <Row label="Pour-over vs French press" meta="Research" progress={28} />
          <Row label="Burr grinder buying guide" meta="Validation" progress={88} />
          <Row label="Decaf process explained" meta="Queued" state="muted" />
          <Row label="Single origin starter pack" meta="Queued" state="muted" />
        </div>
      </PanelShell>
    );
  }
  if (kind === "validation") {
    return (
      <PanelShell title="Validation · Article 3">
        <div className="mb-4 grid grid-cols-3 gap-2">
          {[
            { l: "Research", v: "92" },
            { l: "Evidence", v: "88" },
            { l: "Grammar", v: "97" },
          ].map((s) => (
            <div key={s.l} className="rounded-xl bg-[#f7f7f9] px-3 py-2.5 ring-1 ring-black/5">
              <div className="font-mono text-[9.5px] uppercase tracking-[0.16em] text-[#6a6a6a]">
                {s.l}
              </div>
              <div className="mt-1 text-[20px] font-semibold tracking-tight">{s.v}</div>
            </div>
          ))}
        </div>
        <div className="space-y-2">
          <Row label="12 sources verified" meta="OK" state="ok" />
          <Row label="2 claims flagged for review" meta="Review" state="warn" />
          <Row label="Readability · Grade 8" meta="OK" state="ok" />
        </div>
      </PanelShell>
    );
  }
  if (kind === "seo") {
    return (
      <PanelShell title="SEO · Recommendations">
        <div className="mb-3 flex items-center justify-between">
          <span className="text-[13px] font-medium">Target: best espresso machines 2026</span>
          <span className="font-mono text-[10.5px] uppercase tracking-[0.14em] text-[#6a6a6a]">
            Score 84
          </span>
        </div>
        <div className="space-y-2">
          <Row label="Title tag length within range" meta="Pass" state="ok" />
          <Row label="Meta description present" meta="Pass" state="ok" />
          <Row label="H2 coverage: 4 of 6 subtopics" meta="Improve" state="warn" />
          <Row label="Add internal link to 'grinders' hub" meta="Suggest" state="warn" />
          <Row label="Readability OK" meta="Pass" state="ok" />
        </div>
      </PanelShell>
    );
  }
  if (kind === "research") {
    return (
      <PanelShell title="Research · Sources">
        <div className="mb-3 text-[12px] text-[#6a6a6a]">14 sources · 38 evidence snippets</div>
        <div className="space-y-2">
          {[
            { d: "consumerreports.org", a: "A", t: "Top-rated espresso machines tested" },
            { d: "seriouseats.com", a: "A", t: "What makes a great home espresso setup" },
            { d: "wirecutter.com", a: "A", t: "The best espresso machine for most people" },
            { d: "reddit.com/r/espresso", a: "B", t: "2026 buyer recommendations" },
          ].map((s) => (
            <div
              key={s.d}
              className="flex items-center justify-between rounded-xl bg-[#f7f7f9] px-3.5 py-2.5 ring-1 ring-black/5"
            >
              <div className="min-w-0">
                <div className="truncate text-[13px] font-medium">{s.t}</div>
                <div className="font-mono text-[10.5px] text-[#6a6a6a]">{s.d}</div>
              </div>
              <span className="ml-3 grid size-5 shrink-0 place-items-center rounded-md bg-[#0a0a0a] font-mono text-[9px] font-semibold text-white">
                {s.a}
              </span>
            </div>
          ))}
        </div>
      </PanelShell>
    );
  }
  if (kind === "intelligence") {
    return (
      <PanelShell title="Project · Site Knowledge">
        <div className="mb-3 flex items-center justify-between text-[12px] text-[#6a6a6a]">
          <span>example.com</span>
          <span className="font-mono text-[10.5px] uppercase tracking-[0.14em]">Synced</span>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {[
            { l: "Pages indexed", v: "184" },
            { l: "Categories", v: "12" },
            { l: "Products", v: "47" },
            { l: "Internal links mapped", v: "1,206" },
          ].map((s) => (
            <div key={s.l} className="rounded-xl bg-[#f7f7f9] px-3.5 py-3 ring-1 ring-black/5">
              <div className="font-mono text-[9.5px] uppercase tracking-[0.16em] text-[#6a6a6a]">
                {s.l}
              </div>
              <div className="mt-1 text-[18px] font-semibold tracking-tight">{s.v}</div>
            </div>
          ))}
        </div>
        <div className="mt-3 space-y-2">
          <Row label="Sitemap parsed · sitemap.xml" meta="OK" state="ok" />
          <Row label="Brand voice profile attached" meta="OK" state="ok" />
        </div>
      </PanelShell>
    );
  }
  if (kind === "links") {
    return (
      <PanelShell title="Internal Links · Suggested">
        <div className="mb-3 text-[12px] text-[#6a6a6a]">6 suggestions from 184 indexed pages</div>
        <div className="space-y-2">
          <Row label="/guides/grinders → 'burr grinder'" meta="Insert" state="ok" />
          <Row label="/reviews/breville-barista → 'entry machine'" meta="Insert" state="ok" />
          <Row label="/learn/extraction → 'extraction time'" meta="Insert" state="ok" />
          <Row label="/blog/water-quality → 'water'" meta="Skip · exists" state="muted" />
        </div>
      </PanelShell>
    );
  }
  if (kind === "publish") {
    return (
      <PanelShell title="Publishing · Batch">
        <div className="mb-3 flex items-center justify-between text-[12px] text-[#6a6a6a]">
          <span>8 approved · 2 scheduled · 1 draft</span>
          <span className="font-mono text-[10.5px] uppercase tracking-[0.14em]">WordPress</span>
        </div>
        <div className="space-y-2">
          <Row label="Best espresso machines 2026" meta="Live · today" state="ok" />
          <Row label="Pour-over vs French press" meta="Scheduled · Fri" state="ok" />
          <Row label="Burr grinder buying guide" meta="Draft" state="warn" />
          <Row label="Decaf process explained" meta="Live · today" state="ok" />
        </div>
      </PanelShell>
    );
  }
  // projects
  return (
    <PanelShell title="Workspace · Projects">
      <div className="space-y-2">
        {[
          { n: "Coffee Atlas", q: "12 in queue", t: "WordPress" },
          { n: "Field Notes", q: "4 in queue", t: "Ghost" },
          { n: "Studio Affiliate", q: "31 in queue", t: "WordPress" },
          { n: "Outdoor Weekly", q: "Idle", t: "Markdown" },
        ].map((p) => (
          <div
            key={p.n}
            className="flex items-center justify-between rounded-xl bg-[#f7f7f9] px-3.5 py-3 ring-1 ring-black/5"
          >
            <div>
              <div className="text-[13.5px] font-medium">{p.n}</div>
              <div className="font-mono text-[10.5px] text-[#6a6a6a]">{p.q}</div>
            </div>
            <span className="rounded-md bg-white px-2 py-1 font-mono text-[10px] uppercase tracking-[0.14em] text-[#3a3a3a] ring-1 ring-black/5">
              {p.t}
            </span>
          </div>
        ))}
      </div>
    </PanelShell>
  );
}

/* ---------- Built For Mac ---------- */
function BuiltForMac() {
  const points = [
    "Browser based",
    "No Windows required",
    "No Parallels required",
    "No virtual machines",
    "Works anywhere",
  ];
  return (
    <section className="px-4 py-20">
      <div className="mx-auto max-w-6xl overflow-hidden rounded-[28px] bg-[#0a0a0a] p-8 text-white sm:p-12 lg:p-16">
        <div className="grid gap-12 lg:grid-cols-[1fr_1.2fr] lg:gap-16 lg:items-center">
          <div>
            <div className="font-mono text-[10.5px] uppercase tracking-[0.18em] text-white/50">
              Built For Mac
            </div>
            <h2 className="mt-4 text-balance text-[34px] font-semibold leading-[1.04] tracking-[-0.03em] lg:text-[44px]">
              Mac-native workflow. Browser-based.
            </h2>
            <p className="mt-4 max-w-md text-[16px] leading-[1.55] text-white/70">
              Most bulk writers are Windows-only. QueueWrite runs in any browser and executes server-side, so Mac, Linux and ChromeOS users get the same workflow — without Parallels, VMs or a machine left running overnight.
            </p>
            <ul className="mt-6 flex flex-col gap-2.5">
              {points.map((p) => (
                <li key={p} className="flex items-start gap-2.5 text-[14px] text-white/90">
                  <Check className="mt-0.5 size-4 shrink-0 text-white/70" />
                  <span>{p}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-2xl bg-white/5 p-8 ring-1 ring-white/10 lg:p-10">
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="h-2 w-2 rounded-full bg-white/30" />
                <div className="h-2 flex-1 rounded-full bg-white/10" />
              </div>
              <div className="flex items-center gap-3">
                <div className="h-2 w-2 rounded-full bg-white/30" />
                <div className="h-2 flex-1 rounded-full bg-white/10" />
              </div>
              <div className="flex items-center gap-3">
                <div className="h-2 w-2 rounded-full bg-white/30" />
                <div className="h-2 flex-1 rounded-full bg-white/10" />
              </div>
              <div className="flex items-center gap-3">
                <div className="h-2 w-2 rounded-full bg-white/30" />
                <div className="h-2 flex-1 rounded-full bg-white/10" />
              </div>
              <div className="mt-4 flex items-center gap-2 rounded-xl bg-white/10 px-4 py-3">
                <span className="grid size-4 place-items-center rounded-full bg-white/20">
                  <Check className="size-2.5" strokeWidth={3} />
                </span>
                <span className="text-[13px] font-medium">Queue running in background</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ---------- Quality Controls ---------- */
function QualityControls() {
  const items = [
    {
      t: "Research-first by default",
      d: "Sources are gathered and evidence extracted before drafting. Nothing is written from a blank prompt.",
    },
    {
      t: "Site-aware generation",
      d: "Brand voice, structure and product knowledge flow into every article. No generic templates.",
    },
    {
      t: "Validation before review",
      d: "Research, evidence, grammar and SEO scores attach to each draft. Editors review, not rewrite.",
    },
    {
      t: "Citations attached",
      d: "Statistics and quotes trace back to the source they came from. Transparent by default.",
    },
    {
      t: "Hallucination flags",
      d: "Unsupported claims surface in the validation panel and block publish until cleared.",
    },
    {
      t: "Approval gates",
      d: "Nothing publishes without passing validation and editorial sign-off. The pipeline enforces it.",
    },
  ];
  return (
    <section className="px-4 py-16">
      <div className="mx-auto max-w-6xl">
        <div className="max-w-2xl">
          <div className="text-[12px] font-medium uppercase tracking-[0.18em] text-[#6a6a6a]">
            Quality Controls
          </div>
          <h2 className="mt-3 text-balance text-[34px] font-semibold leading-[1.05] tracking-[-0.03em] lg:text-[44px]">
            Throughput without losing the standard.
          </h2>
        </div>
        <div className="mt-10 grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
          {items.map((i) => (
            <div key={i.t} className="rounded-2xl bg-white p-6 ring-1 ring-black/5">
              <h3 className="text-[17px] font-semibold tracking-tight">{i.t}</h3>
              <p className="mt-2 text-[14px] leading-relaxed text-[#4a4a4a]">{i.d}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ---------- Activity & Queue Visibility ---------- */
function ActivityVisibility() {
  const points = [
    "Server-side workers — not the browser tab",
    "Runs continue after sign-out or browser close",
    "Resumable jobs after network drops or restarts",
    "Per-article stage, retries and worker health",
    "Full job history with timings and source counts",
  ];
  return (
    <section className="px-4 py-16">
      <div className="mx-auto max-w-6xl">
        <div className="grid gap-10 rounded-[28px] bg-white p-8 ring-1 ring-black/5 sm:p-12 lg:grid-cols-2 lg:gap-16 lg:items-center lg:p-16">
          <div>
            <div className="text-[12px] font-medium uppercase tracking-[0.18em] text-[#6a6a6a]">
              Durable Background Execution
            </div>
            <h2 className="mt-4 text-balance text-[34px] font-semibold leading-[1.04] tracking-[-0.03em] lg:text-[44px]">
              Start the run. Close the laptop.
            </h2>
            <p className="mt-4 max-w-md text-[16px] leading-[1.55] text-[#4a4a4a]">
              Generation executes on QueueWrite's workers, not in the browser. Queue an overnight batch, sign out, and the work continues — with full stage visibility when you return.
            </p>
            <ul className="mt-6 flex flex-col gap-2.5">
              {points.map((p) => (
                <li key={p} className="flex items-start gap-2.5 text-[14px] text-[#0a0a0a]">
                  <Check className="mt-0.5 size-4 shrink-0 text-[#0a0a0a]" />
                  <span>{p}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="space-y-3">
            <div className="rounded-xl bg-[#f7f7f9] px-4 py-3 ring-1 ring-black/5">
              <div className="flex items-center justify-between">
                <span className="text-[13.5px] font-medium">Article 3 of 12</span>
                <span className="font-mono text-[10.5px] uppercase tracking-[0.18em] text-[#6a6a6a]">Writing</span>
              </div>
              <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-black/5">
                <div className="h-full w-3/5 rounded-full bg-[#0a0a0a]" />
              </div>
            </div>
            <div className="rounded-xl bg-[#f7f7f9] px-4 py-3 ring-1 ring-black/5 opacity-60">
              <div className="flex items-center justify-between">
                <span className="text-[13.5px] font-medium">Article 4 of 12</span>
                <span className="font-mono text-[10.5px] uppercase tracking-[0.18em] text-[#6a6a6a]">Queued</span>
              </div>
              <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-black/5">
                <div className="h-full w-0 rounded-full bg-[#0a0a0a]" />
              </div>
            </div>
            <div className="rounded-xl bg-[#f7f7f9] px-4 py-3 ring-1 ring-black/5 opacity-40">
              <div className="flex items-center justify-between">
                <span className="text-[13.5px] font-medium">Article 5 of 12</span>
                <span className="font-mono text-[10.5px] uppercase tracking-[0.18em] text-[#6a6a6a]">Queued</span>
              </div>
              <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-black/5">
                <div className="h-full w-0 rounded-full bg-[#0a0a0a]" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ---------- Comparison ---------- */
type Cell = boolean | string;
const COMPARISON_ROWS: { label: string; qw: Cell; traditional: Cell }[] = [
  { label: "Website intelligence (sitemap, products, categories)", qw: true, traditional: false },
  { label: "Live per-article research with sources", qw: true, traditional: false },
  { label: "Validation panel (research, evidence, grammar)", qw: true, traditional: false },
  { label: "Inline SEO recommendations", qw: true, traditional: "Limited" },
  { label: "Internal link suggestions from your own site", qw: true, traditional: false },
  { label: "Editorial review queue before publish", qw: true, traditional: false },
  { label: "Durable background queue (survives browser close)", qw: true, traditional: false },
  { label: "Native WordPress publishing", qw: true, traditional: "Export only" },
  { label: "Runs on Mac without Parallels or a VM", qw: true, traditional: false },
  { label: "Multi-project workspaces", qw: true, traditional: false },
];

function Comparison() {
  const renderCell = (v: Cell) => {
    if (v === true) return <Check className="mx-auto size-4 text-[#0a0a0a]" />;
    if (v === false) return <Minus className="mx-auto size-4 text-[#bdbdc3]" />;
    return <span className="text-[13px] text-[#3a3a3a]">{v}</span>;
  };
  return (
    <section className="px-4 py-20">
      <div className="mx-auto max-w-6xl">
        <div className="max-w-2xl">
          <div className="text-[12px] font-medium uppercase tracking-[0.18em] text-[#4a4a4a]">
            Comparison
          </div>
          <h2 className="mt-3 text-[34px] font-semibold leading-[1.05] tracking-[-0.03em] lg:text-[44px]">
            QueueWrite vs Traditional AI Writers
          </h2>
        </div>

        <div className="mt-10 overflow-hidden rounded-2xl bg-white ring-1 ring-black/5">
          <div className="grid grid-cols-[1.5fr_1fr_1fr] border-b border-black/5 bg-[#fafafb] px-5 py-4 text-[12.5px] font-medium tracking-tight text-[#4a4a4a]">
            <div>Feature</div>
            <div className="text-center text-[#0a0a0a]">QueueWrite</div>
            <div className="text-center text-[#0a0a0a]">Traditional AI Writers</div>
          </div>
          {COMPARISON_ROWS.map((row, i) => (
            <div
              key={row.label}
              className={cn(
                "grid grid-cols-[1.5fr_1fr_1fr] items-center px-5 py-3.5 text-[13.5px]",
                i !== COMPARISON_ROWS.length - 1 && "border-b border-black/5",
              )}
            >
              <div className="text-[#0a0a0a]">{row.label}</div>
              <div className="text-center">{renderCell(row.qw)}</div>
              <div className="text-center">{renderCell(row.traditional)}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ---------- Final CTA ---------- */
function FinalCTA() {
  return (
    <section className="px-4 pb-20">
      <div className="mx-auto max-w-6xl overflow-hidden rounded-[28px] bg-[#0a0a0a] px-8 py-20 text-center text-white lg:py-24">
        <h2 className="mx-auto max-w-3xl text-balance text-[40px] font-semibold leading-[1.02] tracking-[-0.035em] lg:text-[56px]">
          Queue the run. Review in the morning.
        </h2>
        <p className="mx-auto mt-5 max-w-lg text-[16px] text-white/70">
          One workspace for research, generation, validation, SEO and publishing — built for publishers shipping at volume.
        </p>
        <div className="mt-8 flex items-center justify-center gap-3">
          <Link
            to="/dashboard"
            className="flex h-12 items-center gap-2 rounded-full bg-white px-6 text-[14px] font-medium text-[#0a0a0a] hover:bg-white/90"
          >
            Create Your Workspace <ArrowRight className="size-4" />
          </Link>
          <Link
            to="/pricing"
            className="flex h-12 items-center gap-2 rounded-full bg-white/10 px-6 text-[14px] font-medium text-white ring-1 ring-white/15 hover:bg-white/15"
          >
            View Pricing
          </Link>
        </div>
      </div>
    </section>
  );
}

/* ---------- Footer ---------- */
function Footer() {
  return (
    <footer className="px-4 pb-10">
      <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-4 border-t border-black/10 pt-8 text-[12.5px] text-[#4a4a4a] md:flex-row md:items-center">
        <div className="flex items-center gap-2 text-[#0a0a0a]">
          <span className="grid size-5 place-items-center rounded bg-[#0a0a0a] text-[9px] font-bold text-white">QW</span>
          <span className="font-semibold tracking-tight">QueueWrite</span>
          <span className="ml-2 text-[#4a4a4a]">© 2026</span>
        </div>
        <div className="flex items-center gap-5">
          <Link to="/pricing" className="hover:text-black">Pricing</Link>
          <Link to="/features" className="hover:text-black">Features</Link>
          <a href="#" className="hover:text-black">Privacy</a>
          <a href="#" className="hover:text-black">Terms</a>
          <a href="#" className="hover:text-black">Changelog</a>
        </div>
      </div>
    </footer>
  );
}
