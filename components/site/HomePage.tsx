"use client";

import Image from "next/image";
import { ArrowRight, Check, Star } from "lucide-react";
import { useEffect, useState } from "react";
import { RouteLink as Link } from "@/components/site/RouteLink";
import { cn } from "@/lib/utils";

export default function HomePage() {
  return (
    <div className="min-h-screen bg-[#f5f5f7] font-sans text-[#0a0a0a] antialiased [color-scheme:light]">
      <Nav />
      <Hero />
      <TrustedBy />
      <ProcessSteps />
      <ResearchVisual />
      <QueueShowcase />
      <Quotes />
      <FeatureGrid />
      <OperationsStory />
      <BatchProof />
      <Apps />
      <Pricing />
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
          <a href="#process" className="hover:text-black">Workflow</a>
          <Link to="/features" className="hover:text-black">Platform</Link>
          <a href="#apps" className="hover:text-black">Integrations</a>
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
            Create Your Workspace
          </Link>
        </div>
      </div>
    </header>
  );
}

/* ---------- Hero ---------- */
function Hero() {
  return (
    <section className="px-4 pt-16 pb-20 lg:pt-24">
      <div className="mx-auto grid max-w-6xl items-center gap-12 lg:grid-cols-[1.05fr_1fr] lg:gap-16">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-1 text-[11.5px] font-medium tracking-tight text-[#3a3a3a] ring-1 ring-black/5">
            <span className="size-1.5 rounded-full bg-[#0a0a0a]" />
            The content operating system
          </div>
          <h1 className="mt-5 text-balance text-[44px] font-semibold leading-[0.98] tracking-[-0.04em] text-[#0a0a0a] sm:text-[64px] lg:text-[76px]">
            Run your content
            <br />
            operation from one workspace.
          </h1>
          <p className="mt-6 max-w-lg text-balance text-[17px] leading-[1.5] text-[#4a4a4a] lg:text-[19px]">
            Research, generate, review, optimise and publish — managed end-to-end. QueueWrite handles site intelligence, evidence validation, internal linking and queue execution so your team owns editorial, not operations.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link
              to="/dashboard"
              className="flex h-12 items-center gap-2 rounded-full bg-[#0a0a0a] px-6 text-[14px] font-medium text-white hover:bg-black"
            >
              Start Publishing <ArrowRight className="size-4" />
            </Link>
            <a
              href="#process"
              className="flex h-12 items-center gap-2 rounded-full bg-white px-6 text-[14px] font-medium text-[#0a0a0a] ring-1 ring-black/10 hover:ring-black/20"
            >
              View Workflow
            </a>
          </div>
          <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-3">
            <RatingPill source="Trustpilot" score="4.8" color="#00b67a" />
            <RatingPill source="Product Hunt" score="4.9" color="#da552f" />
          </div>
        </div>

        <WorkflowCard />
      </div>
    </section>
  );
}

function RatingPill({ source, score, color }: { source: string; score: string; color: string }) {
  return (
    <div className="flex items-center gap-2 rounded-full bg-white px-3 py-1.5 text-[12px] shadow-sm ring-1 ring-black/5">
      <span className="size-2 rounded-full" style={{ background: color }} />
      <span className="font-medium text-[#0a0a0a]">{source}</span>
      <div className="flex items-center gap-0.5">
        {Array.from({ length: 5 }).map((_, i) => (
          <Star key={i} className="size-3 fill-[#0a0a0a] text-[#0a0a0a]" />
        ))}
      </div>
      <span className="text-[#4a4a4a]">{score}</span>
    </div>
  );
}

/* ---------- Workflow Card (hero right) ----------
   Fixed-size queue card. Frame never resizes; only inner data animates. */

const QUEUE_TITLES = [
  "Best CRM Software For Small Businesses",
  "How To Improve Customer Retention",
  "Email Marketing Best Practices",
  "Best Project Management Tools",
  "How To Reduce Customer Acquisition Costs",
];

const ARTICLE_SCORES = [
  { q: 94, r: 93, e: 96, w: 4182 },
  { q: 96, r: 95, e: 94, w: 3914 },
  { q: 95, r: 94, e: 97, w: 3760 },
  { q: 93, r: 96, e: 92, w: 4021 },
  { q: 97, r: 95, e: 95, w: 2865 },
];

// Phase durations (ms)
const PHASE_INPUT = 2600;
const PHASE_QUEUED = 1400;
const ARTICLE_DURATION = 3400;
const PHASE_SUMMARY = 4200;

// Per-article micro-step offsets
const STEP_RESEARCH = 150;
const STEP_SOURCES = 550;
const STEP_ACCEPTED = 1050;
const STEP_EVIDENCE = 1500;
const STEP_WRITING = 1900;
const STEP_SCORE_Q = 2200;
const STEP_SCORE_R = 2450;
const STEP_SCORE_E = 2700;

type Phase = "input" | "queued" | "processing" | "summary";

function WorkflowCard() {
  const [phase, setPhase] = useState<Phase>("input");
  const [active, setActive] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [completedCount, setCompletedCount] = useState(0);

  useEffect(() => {
    let raf = 0;
    let start = performance.now();
    let cancelled = false;

    const loop = (now: number) => {
      if (cancelled) return;
      const t = now - start;

      if (phase === "input") {
        if (t >= PHASE_INPUT) {
          setPhase("queued");
          start = now;
        }
      } else if (phase === "queued") {
        if (t >= PHASE_QUEUED) {
          setPhase("processing");
          setActive(0);
          setElapsed(0);
          start = now;
        }
      } else if (phase === "processing") {
        if (t >= ARTICLE_DURATION) {
          const next = active + 1;
          setCompletedCount(next);
          if (next >= QUEUE_TITLES.length) {
            setPhase("summary");
          } else {
            setActive(next);
            setElapsed(0);
          }
          start = now;
        } else {
          setElapsed(t);
        }
      } else if (phase === "summary") {
        if (t >= PHASE_SUMMARY) {
          setPhase("input");
          setActive(0);
          setElapsed(0);
          setCompletedCount(0);
          start = now;
        }
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
    };
  }, [phase, active]);

  const scores = ARTICLE_SCORES[active] ?? ARTICLE_SCORES[0];
  const show = (offset: number) => phase === "processing" && elapsed >= offset;
  const isInputView = phase === "input" || phase === "queued";
  const isSummary = phase === "summary";
  const queued = phase === "queued";

  const statusLabel =
    phase === "input"
      ? "Draft"
      : phase === "queued"
        ? "Queued"
        : phase === "summary"
          ? "Complete"
          : "Running";

  return (
    <div className="relative">
      <div className="absolute -inset-6 -z-10 rounded-[32px] bg-gradient-to-b from-[#d8d8de]/60 to-transparent blur-2xl" />
      <div className="flex h-[600px] flex-col overflow-hidden rounded-[24px] bg-white ring-1 ring-black/10 shadow-[0_30px_80px_-30px_rgba(0,0,0,0.25)]">
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-black/5 px-6 py-4">
          <div>
            <div className="text-[16px] font-semibold tracking-[-0.01em] text-[#0a0a0a]">
              Article Queue
            </div>
            <div className="mt-0.5 text-[12px] text-[#6a6a6a]">
              {isInputView
                ? "5 articles ready for generation"
                : isSummary
                  ? "Run complete"
                  : `Generating Article ${active + 1} of ${QUEUE_TITLES.length}`}
            </div>
          </div>
          <div className="flex items-center gap-2 font-mono text-[10.5px] uppercase tracking-[0.18em] text-[#6a6a6a]">
            <span
              className={cn(
                "size-1.5 rounded-full bg-[#0a0a0a]",
                (phase === "processing" || phase === "queued") && "animate-pulse",
              )}
            />
            {statusLabel}
          </div>
        </div>

        {/* Body — fixed area, two views cross-fade in place */}
        <div className="relative flex-1 overflow-hidden">
          {/* === INPUT VIEW (paste + queue button) === */}
          <div
            className={cn(
              "absolute inset-0 flex flex-col px-6 py-5 transition-opacity duration-500",
              isInputView ? "opacity-100" : "pointer-events-none opacity-0",
            )}
          >
            <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-[#6a6a6a]">
              Titles
            </div>
            <div className="mt-2 flex-1 rounded-xl bg-[#f7f7f9] ring-1 ring-black/5 px-4 py-3 overflow-hidden">
              <div className="flex flex-col gap-2 text-[13px] leading-relaxed text-[#1a1a1a]">
                {QUEUE_TITLES.map((t, i) => (
                  <div
                    key={t}
                    className="transition-opacity duration-300"
                    style={{
                      opacity: phase === "input" ? (elapsed > -1 ? 1 : 0) : 1,
                    }}
                  >
                    {t}
                  </div>
                ))}
              </div>
            </div>
            <button
              className={cn(
                "mt-4 flex h-11 items-center justify-center gap-2 rounded-xl text-[13.5px] font-medium transition-all duration-300",
                queued
                  ? "bg-[#0a0a0a] text-white"
                  : "bg-[#0a0a0a] text-white hover:bg-black",
              )}
              type="button"
            >
              {queued ? (
                <>
                  <span className="grid size-4 place-items-center rounded-full bg-white/15">
                    <Check className="size-2.5" strokeWidth={3} />
                  </span>
                  Queued 5 Articles
                </>
              ) : (
                <>Queue 5 Articles</>
              )}
            </button>
          </div>

          {/* === PROCESSING / SUMMARY VIEW === */}
          <div
            className={cn(
              "absolute inset-0 flex flex-col transition-opacity duration-500",
              isInputView ? "pointer-events-none opacity-0" : "opacity-100",
            )}
          >
            {/* Article list */}
            <ul className="shrink-0 border-b border-black/5 px-6 py-3">
              {QUEUE_TITLES.map((t, i) => {
                const state =
                  isSummary || i < completedCount
                    ? "done"
                    : i === active && phase === "processing"
                      ? "active"
                      : "queued";
                return (
                  <li
                    key={t}
                    className="flex h-8 items-center gap-3 text-[13px] tracking-[-0.005em]"
                  >
                    <RowIcon state={state} />
                    <span
                      className={cn(
                        "truncate transition-colors duration-300",
                        state === "done"
                          ? "text-[#9a9a9a]"
                          : state === "active"
                            ? "font-medium text-[#0a0a0a]"
                            : "text-[#9a9a9a]",
                      )}
                    >
                      {t}
                    </span>
                    {state === "done" && (
                      <span className="ml-auto flex shrink-0 items-center gap-1.5 text-[11px] font-medium text-[#6a6a6a] tabular-nums">
                        <Check className="size-3" strokeWidth={3} />
                        {ARTICLE_SCORES[i].w.toLocaleString()}w · Q{ARTICLE_SCORES[i].q}
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>

            {/* Processing panel */}
            <div className="relative flex-1 px-6 py-4">
              <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-[#6a6a6a]">
                {isSummary ? "Summary" : "Processing"}
              </div>

              {/* Live processing */}
              <div
                className={cn(
                  "absolute inset-x-6 top-[40px] transition-opacity duration-500",
                  isSummary ? "pointer-events-none opacity-0" : "opacity-100",
                )}
              >
                <FadeLine on={show(STEP_RESEARCH) && elapsed < STEP_WRITING}>
                  <span className="text-[13.5px] font-medium text-[#0a0a0a]">
                    Researching<span className="text-[#9a9a9a]">…</span>
                  </span>
                </FadeLine>
                <FadeLine on={show(STEP_WRITING)}>
                  <span className="text-[13.5px] font-medium text-[#0a0a0a]">
                    Writing article<span className="text-[#9a9a9a]">…</span>
                  </span>
                </FadeLine>
                <div className="mt-3 flex flex-col gap-1.5">
                  <FadeLine on={show(STEP_SOURCES)}>
                    <CheckRow>12 sources discovered</CheckRow>
                  </FadeLine>
                  <FadeLine on={show(STEP_ACCEPTED)}>
                    <CheckRow>8 sources accepted</CheckRow>
                  </FadeLine>
                  <FadeLine on={show(STEP_EVIDENCE)}>
                    <CheckRow>Evidence extracted</CheckRow>
                  </FadeLine>
                  <FadeLine on={show(STEP_WRITING)}>
                    <CheckRow>Research completed in 34s</CheckRow>
                  </FadeLine>
                </div>

                <div className="mt-4 grid grid-cols-3 gap-2">
                  <Score label="Words" value={scores.w} on={show(STEP_WRITING)} />
                  <Score label="Quality" value={scores.q} on={show(STEP_SCORE_Q)} />
                  <Score label="Research" value={scores.r} on={show(STEP_SCORE_R)} />
                  <Score label="Evidence" value={scores.e} on={show(STEP_SCORE_E)} />
                </div>
              </div>

              {/* Summary */}
              <div
                className={cn(
                  "absolute inset-x-6 top-[40px] transition-opacity duration-500",
                  isSummary ? "opacity-100" : "pointer-events-none opacity-0",
                )}
              >
                <div className="grid grid-cols-2 gap-2.5">
                  <SummaryStat label="Articles Generated" value="5" />
                  <SummaryStat label="Words Written" value="18,742" />
                  <SummaryStat label="Sources Analysed" value="63" />
                  <SummaryStat label="Average Quality" value="95" />
                </div>
                <div className="mt-4 flex items-center justify-center gap-2 rounded-xl bg-[#0a0a0a] px-4 py-3 text-[13px] font-medium text-white">
                  <span className="grid size-4 place-items-center rounded-full bg-white/15">
                    <Check className="size-2.5" strokeWidth={3} />
                  </span>
                  Ready To Publish
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer counter — stable across all states */}
        <div className="flex shrink-0 items-center justify-between border-t border-black/5 px-6 py-4">
          <div className="font-mono text-[10.5px] uppercase tracking-[0.18em] text-[#6a6a6a]">
            Progress
          </div>
          <div className="text-[15px] font-semibold tabular-nums tracking-[-0.01em] text-[#0a0a0a]">
            {completedCount} of {QUEUE_TITLES.length} Articles Complete
          </div>
        </div>
      </div>
    </div>
  );
}

function RowIcon({ state }: { state: "queued" | "active" | "done" }) {
  if (state === "done") {
    return (
      <span className="grid size-5 shrink-0 place-items-center rounded-full bg-[#0a0a0a] text-white">
        <Check className="size-3" strokeWidth={3} />
      </span>
    );
  }
  if (state === "active") {
    return (
      <span className="relative grid size-5 shrink-0 place-items-center rounded-full ring-1 ring-[#0a0a0a]">
        <span className="size-2 rounded-full bg-[#0a0a0a]" />
        <span className="absolute inset-0 rounded-full ring-1 ring-[#0a0a0a]/40 animate-ping" />
      </span>
    );
  }
  return <span className="size-5 shrink-0 rounded-full ring-1 ring-black/15" />;
}

function FadeLine({ on, children }: { on: boolean; children: React.ReactNode }) {
  return (
    <div
      className={cn(
        "transition-all duration-300",
        on ? "translate-y-0 opacity-100" : "translate-y-1 opacity-0",
      )}
    >
      {children}
    </div>
  );
}

function CheckRow({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 text-[13px] text-[#2a2a2a]">
      <span className="grid size-4 place-items-center rounded-full bg-[#0a0a0a] text-white">
        <Check className="size-2.5" strokeWidth={3} />
      </span>
      {children}
    </div>
  );
}

function Score({ label, value, on }: { label: string; value: number; on: boolean }) {
  return (
    <div
      className={cn(
        "rounded-xl bg-[#f7f7f9] px-3 py-2.5 ring-1 ring-black/5 transition-all duration-300",
        on ? "translate-y-0 opacity-100" : "translate-y-1 opacity-0",
      )}
    >
      <div className="font-mono text-[9.5px] uppercase tracking-[0.16em] text-[#6a6a6a]">
        {label}
      </div>
      <div className="mt-0.5 text-[20px] font-semibold tabular-nums tracking-[-0.02em] text-[#0a0a0a]">
        {value}
      </div>
    </div>
  );
}

function SummaryStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-[#f7f7f9] px-3 py-3 ring-1 ring-black/5">
      <div className="font-mono text-[9.5px] uppercase tracking-[0.16em] text-[#6a6a6a]">
        {label}
      </div>
      <div className="mt-0.5 text-[20px] font-semibold tabular-nums tracking-[-0.02em] text-[#0a0a0a]">
        {value}
      </div>
    </div>
  );
}



/* ---------- Trusted by ---------- */
function TrustedBy() {
  const logos = ["Northwind", "Acme", "Vercel", "Linear", "Stripe", "Notion"];
  return (
    <section className="px-4 pb-12">
      <div className="mx-auto max-w-6xl">
        <p className="text-center text-[12px] font-medium uppercase tracking-[0.18em] text-[#6a6a6a]">
          Trusted by content operations at
        </p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-x-10 gap-y-4 opacity-70">
          {logos.map((l) => (
            <span key={l} className="text-[16px] font-semibold tracking-tight text-[#3a3a3a]">
              {l}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ---------- Process Steps ---------- */
function ProcessSteps() {
  const steps = [
    { n: "01", t: "Research", d: "Sources are gathered, scored and validated. Evidence is extracted before a single sentence is written." },
    { n: "02", t: "Generate", d: "Each article is drafted from the verified research, structured for your site and audience." },
    { n: "03", t: "Review", d: "Quality scoring, grammar checks and evidence validation flag anything before it reaches an editor." },
    { n: "04", t: "Optimise", d: "SEO checks and internal link suggestions tighten each article against the rest of your site." },
    { n: "05", t: "Publish", d: "Push to WordPress as draft or live, or export to your CMS. Nothing ships without a review pass." },
  ];
  return (
    <section id="process" className="px-4 py-24 lg:py-32">
      <div className="mx-auto max-w-6xl">
        <div className="mx-auto max-w-3xl text-center">
          <div className="text-[12px] font-medium uppercase tracking-[0.18em] text-[#6a6a6a]">
            The workflow
          </div>
          <h2 className="mt-4 text-balance text-[40px] font-semibold leading-[1.02] tracking-[-0.035em] lg:text-[64px]">
            Research → Generate → Review → Optimise → Publish.
          </h2>
          <p className="mx-auto mt-5 max-w-xl text-[16px] leading-[1.55] text-[#4a4a4a]">
            A single editorial pipeline, not a writing tool. Every article moves through the same stages — and nothing publishes without passing them.
          </p>
        </div>

        <div className="relative mt-20 grid gap-12 md:grid-cols-5 md:gap-6">
          {/* connector */}
          <div className="absolute left-0 right-0 top-[22px] hidden md:block">
            <div className="mx-auto h-px max-w-[88%] bg-gradient-to-r from-transparent via-black/15 to-transparent" />
          </div>
          {steps.map((s) => (
            <div key={s.n} className="relative flex flex-col items-center text-center">
              <div className="grid size-11 place-items-center rounded-full bg-[#f5f5f7] font-mono text-[12px] font-semibold tracking-tight text-[#0a0a0a] ring-1 ring-black/10">
                {s.n}
              </div>
              <h3 className="mt-6 text-[22px] font-semibold tracking-[-0.02em]">{s.t}</h3>
              <p className="mt-2 max-w-[20ch] text-[14px] leading-relaxed text-[#4a4a4a]">
                {s.d}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ---------- Research Visual ---------- */
function ResearchVisual() {
  const sources = [
    "Industry reports",
    "Reputable publications",
    "Original research studies",
    "Competitor SERP analysis",
    "Government & official data",
  ];
  const facts = [
    "Companies that prioritise retention see 1.7x faster revenue growth",
    "Email marketing returns an average of $36 for every $1 spent",
    "68% of B2B buyers research independently before contacting sales",
    "Customer acquisition costs have risen 60% over the last five years",
  ];
  return (
    <section className="px-4 pb-24">
      <div className="mx-auto max-w-6xl overflow-hidden rounded-[28px] bg-white p-8 ring-1 ring-black/5 sm:p-12 lg:p-16">
        <div className="max-w-2xl">
          <div className="text-[12px] font-medium uppercase tracking-[0.18em] text-[#6a6a6a]">
            Research, validated.
          </div>
          <h2 className="mt-4 text-balance text-[34px] font-semibold leading-[1.04] tracking-[-0.03em] lg:text-[44px]">
            Every claim traces back to a source.
          </h2>
          <p className="mt-4 max-w-xl text-[16px] leading-[1.55] text-[#4a4a4a]">
            QueueWrite reads your site, gathers candidate sources, scores them for authority and relevance, and extracts the specific facts your article needs. Writing only starts after research passes validation — so editors review evidence-backed drafts, not AI guesses.
          </p>
        </div>

        <div className="mt-12 grid gap-8 lg:grid-cols-[1fr_auto_1fr] lg:items-center lg:gap-4">
          {/* Sources */}
          <div className="rounded-2xl bg-[#f7f7f9] p-6 ring-1 ring-black/5">
            <div className="font-mono text-[10.5px] uppercase tracking-[0.18em] text-[#6a6a6a]">
              Sources
            </div>
            <ul className="mt-4 flex flex-col gap-2">
              {sources.map((s, i) => (
                <li
                  key={s}
                  className="flex items-center gap-3 rounded-lg bg-white px-3.5 py-2.5 ring-1 ring-black/5"
                >
                  <span className="grid size-5 place-items-center rounded-md bg-[#0a0a0a] font-mono text-[9px] font-semibold text-white">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <span className="text-[13.5px] font-medium text-[#0a0a0a]">{s}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Flow arrow */}
          <div className="flex items-center justify-center lg:px-2">
            <div className="hidden lg:flex items-center gap-2">
              <div className="h-px w-10 bg-black/15" />
              <div className="grid size-9 place-items-center rounded-full bg-[#0a0a0a] text-white">
                <ArrowRight className="size-4" />
              </div>
              <div className="h-px w-10 bg-black/15" />
            </div>
            <div className="flex lg:hidden items-center gap-2 text-[#6a6a6a]">
              <div className="h-px w-8 bg-black/15" />
              <span className="font-mono text-[10px] uppercase tracking-[0.18em]">Extracted</span>
              <div className="h-px w-8 bg-black/15" />
            </div>
          </div>

          {/* Facts */}
          <div className="rounded-2xl bg-[#0a0a0a] p-6 text-white">
            <div className="font-mono text-[10.5px] uppercase tracking-[0.18em] text-white/60">
              Useful Facts
            </div>
            <ul className="mt-4 flex flex-col gap-3">
              {facts.map((f, i) => (
                <li key={f} className="flex gap-3 text-[14px] leading-snug">
                  <span className="mt-1 grid size-4 shrink-0 place-items-center rounded-full bg-white/15 font-mono text-[9px] text-white/80">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <span>{f}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ---------- Queue Showcase (the one premium screenshot) ---------- */
function QueueShowcase() {
  return (
    <section id="features" className="px-4 pb-24">
      <div className="mx-auto max-w-6xl overflow-hidden rounded-[28px] bg-[#eeeef1] p-8 sm:p-12 lg:p-16">
        <div className="grid items-center gap-12 lg:grid-cols-[1fr_1.2fr] lg:gap-16">
          <div className="flex flex-col gap-5">
            <div className="text-[12px] font-medium uppercase tracking-[0.18em] text-[#4a4a4a]">
              Autonomous queue
            </div>
            <h2 className="text-balance text-[36px] font-semibold leading-[1.02] tracking-[-0.03em] lg:text-[52px]">
              An editorial pipeline that runs in the background.
            </h2>
            <p className="max-w-md text-[16px] leading-[1.55] text-[#4a4a4a]">
              The queue executes research, generation, review and optimisation in parallel — across projects, in the background, with full status visibility. Your team reviews finished drafts instead of orchestrating each step.
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {["Multi-project workspaces", "Background execution", "Live queue status", "Per-article controls"].map((p) => (
                <span
                  key={p}
                  className="rounded-full bg-white px-3 py-1 text-[12.5px] text-[#3a3a3a] ring-1 ring-black/5"
                >
                  {p}
                </span>
              ))}
            </div>
            <Link
              to="/dashboard"
              className="mt-2 inline-flex w-fit items-center gap-1.5 text-[14px] font-medium text-[#0a0a0a] underline-offset-4 hover:underline"
            >
              Open the workspace <ArrowRight className="size-4" />
            </Link>
          </div>
          <div>
            <div className="overflow-hidden rounded-xl shadow-[0_30px_80px_-30px_rgba(0,0,0,0.35)] ring-1 ring-black/5">
              <Image
                src="/site/product-bulk.jpg"
                alt="QueueWrite workspace showing the article queue, validation results and SEO checks"
                width={1536}
                height={1024}
                className="block w-full"
              />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ---------- Quotes ---------- */
function Quotes() {
  const quotes = [
    {
      q: "We stopped treating content as a writing problem and started treating it as an operations problem. QueueWrite is the system we wish we'd built ourselves.",
      a: "Brad T.",
      r: "Head of Content Operations",
    },
    {
      q: "Evidence scoring and research validation changed how our editors review drafts. They're reviewing finished work, not rewriting AI guesses.",
      a: "Rommel C.",
      r: "SEO Lead, Agency",
    },
    {
      q: "Internal linking and SEO checks run before anything publishes. Our site architecture has never been tighter.",
      a: "Rachel C.",
      r: "Founder, Affiliate Studio",
    },
  ];
  return (
    <section className="px-4 py-16">
      <div className="mx-auto grid max-w-6xl gap-5 md:grid-cols-3">
        {quotes.map((t) => (
          <figure
            key={t.a}
            className="flex flex-col gap-4 rounded-2xl bg-white p-6 ring-1 ring-black/5"
          >
            <div className="flex gap-0.5">
              {Array.from({ length: 5 }).map((_, i) => (
                <Star key={i} className="size-3.5 fill-[#0a0a0a] text-[#0a0a0a]" />
              ))}
            </div>
            <blockquote className="text-[15.5px] leading-relaxed text-[#0a0a0a]">
              "{t.q}"
            </blockquote>
            <figcaption className="mt-auto text-[12.5px] text-[#4a4a4a]">
              <span className="font-medium text-[#0a0a0a]">{t.a}</span> · {t.r}
            </figcaption>
          </figure>
        ))}
      </div>
    </section>
  );
}

/* ---------- Feature grid ---------- */
function FeatureGrid() {
  const items = [
    { t: "Website Intelligence", d: "QueueWrite reads your sitemap, existing content and site context so every article fits the publication, not a generic template." },
    { t: "Research Engine", d: "Source discovery, authority scoring, evidence extraction and research validation — every article is built on receipts." },
    { t: "Quality & Evidence Scoring", d: "Articles arrive with quality, research and evidence scores. Editors see what to review, not what to rewrite." },
    { t: "SEO & Internal Linking", d: "Automated SEO checks and internal link suggestions tighten architecture before anything reaches publish." },
    { t: "Queue Management", d: "Background execution across projects with live status, retries and per-article controls. The operator owns the workflow." },
    { t: "Publishing Workflows", d: "Push to WordPress as draft or live, or export to Markdown, Webflow and Ghost. Reviewed first, published second." },
    { t: "Multi-Project Workspaces", d: "Separate sites, profiles and queues. Run a portfolio of publications from a single operating system." },
  ];
  return (
    <section className="px-4 py-16">
      <div className="mx-auto max-w-6xl">
        <h2 className="max-w-2xl text-[34px] font-semibold leading-[1.05] tracking-[-0.03em] lg:text-[44px]">
          One workspace for the entire content operation.
          <span className="text-[#9a9a9a]"> Not another writing tool.</span>
        </h2>
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

/* ---------- Operations Story ---------- */
function OperationsStory() {
  const cards = [
    {
      t: "Validation Before Publish",
      d: "Research validation, SEO checks, grammar, evidence strength and internal link coverage all run before a draft reaches a human reviewer.",
    },
    {
      t: "Site-Aware Generation",
      d: "Sitemap parsing, content profiles and project context mean every article is written for your publication — not a generic AI template.",
    },
    {
      t: "Operational Scale",
      d: "Background queues, multi-project workspaces and parallel execution let one operator run the output of an entire content team.",
    },
  ];
  return (
    <section className="px-4 py-20">
      <div className="mx-auto max-w-6xl">
        <div className="max-w-2xl">
          <div className="text-[12px] font-medium uppercase tracking-[0.18em] text-[#6a6a6a]">
            The content OS
          </div>
          <h2 className="mt-3 text-balance text-[34px] font-semibold leading-[1.05] tracking-[-0.03em] lg:text-[44px]">
            Editorial quality at operational scale.
          </h2>
          <p className="mt-4 max-w-xl text-[16px] leading-[1.55] text-[#4a4a4a]">
            Writing tools generate one article at a time. QueueWrite runs the system around the writing — research, validation, SEO, linking, queueing and publishing — so content quality and throughput stop fighting each other.
          </p>
        </div>
        <div className="mt-10 grid grid-cols-1 gap-5 md:grid-cols-3">
          {cards.map((c) => (
            <div key={c.t} className="rounded-2xl bg-white p-7 ring-1 ring-black/5">
              <h3 className="text-[18px] font-semibold tracking-[-0.01em]">{c.t}</h3>
              <p className="mt-3 text-[14px] leading-relaxed text-[#4a4a4a]">{c.d}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ---------- Batch Proof ---------- */
function BatchProof() {
  const stats = [
    { v: "50", l: "Articles Published" },
    { v: "182,000", l: "Words Reviewed" },
    { v: "640", l: "Sources Validated" },
    { v: "95", l: "Avg Quality Score" },
  ];
  return (
    <section className="px-4 pb-20">
      <div className="mx-auto max-w-6xl overflow-hidden rounded-[28px] bg-[#0a0a0a] p-8 text-white sm:p-12 lg:p-14">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="font-mono text-[10.5px] uppercase tracking-[0.18em] text-white/50">
              Workspace · Last 7 Days
            </div>
            <h2 className="mt-3 text-balance text-[30px] font-semibold leading-[1.05] tracking-[-0.025em] lg:text-[40px]">
              One operator. One workspace. The output of a content team.
            </h2>
          </div>
          <div className="flex items-center gap-2 font-mono text-[10.5px] uppercase tracking-[0.18em] text-white/50">
            <span className="size-1.5 rounded-full bg-emerald-400" />
            Run complete
          </div>
        </div>
        <div className="mt-10 grid grid-cols-2 gap-px overflow-hidden rounded-2xl bg-white/10 lg:grid-cols-4">
          {stats.map((s) => (
            <div key={s.l} className="flex flex-col gap-2 bg-[#0a0a0a] p-6">
              <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-white/50">
                {s.l}
              </div>
              <div className="text-[36px] font-semibold tabular-nums tracking-[-0.03em] lg:text-[44px]">
                {s.v}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ---------- Apps ---------- */

function Apps() {
  const apps = [
    { n: "WordPress", d: "Push reviewed drafts straight into your CMS as scheduled posts." },
    { n: "Webflow", d: "Sync collections with one click. Keep your CMS as the source of truth." },
    { n: "Ghost", d: "Publish to Ghost with tags, excerpts, and feature images." },
    { n: "Notion", d: "Drop articles into a Notion database for team review." },
    { n: "Google Docs", d: "Export drafts to Docs with comments and suggestions." },
    { n: "Markdown", d: "Plain .md files with frontmatter — your repo, your rules." },
    { n: "Ahrefs", d: "Pull keyword data and SERP context into every brief." },
    { n: "Semrush", d: "Sync keyword lists and gap reports directly into your queue." },
  ];
  return (
    <section id="apps" className="px-4 py-16">
      <div className="mx-auto max-w-6xl rounded-[28px] bg-white p-8 ring-1 ring-black/5 sm:p-12 lg:p-16">
        <div className="max-w-2xl">
          <div className="text-[12px] font-medium uppercase tracking-[0.18em] text-[#4a4a4a]">
            Integrations
          </div>
          <h2 className="mt-3 text-[34px] font-semibold leading-[1.05] tracking-[-0.03em] lg:text-[44px]">
            Fits your publishing stack.
          </h2>
          <p className="mt-3 text-[16px] leading-[1.55] text-[#4a4a4a]">
            WordPress, Webflow, Ghost, Notion. And more.
          </p>
        </div>
        <div className="mt-10 grid grid-cols-1 gap-px overflow-hidden rounded-2xl bg-black/5 sm:grid-cols-2 lg:grid-cols-4">
          {apps.map((a) => (
            <div key={a.n} className="flex flex-col gap-2 bg-white p-5">
              <div className="grid size-10 place-items-center rounded-lg bg-[#eeeef1] text-[12px] font-semibold tracking-tight">
                {a.n.slice(0, 2)}
              </div>
              <div className="mt-1 text-[14.5px] font-semibold tracking-tight">{a.n}</div>
              <p className="text-[12.5px] leading-relaxed text-[#4a4a4a]">{a.d}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ---------- Pricing (homepage summary) ---------- */
function Pricing() {
  const plans = [
    {
      name: "Free",
      price: "0",
      blurb: "One project, five managed articles a month. See the full workflow end-to-end.",
      cta: "Start Free",
      badge: "No credit card required",
    },
    {
      name: "BYOK",
      price: "19",
      blurb: "Connect your own AI and research providers. QueueWrite orchestrates the workflow.",
      cta: "Create Your Workspace",
      badge: "Popular with agencies",
      popular: true,
    },
    {
      name: "Pro",
      price: "39",
      blurb: "Fully managed research, writing, validation and publishing. No API keys to wire up.",
      cta: "Start Publishing",
      badge: "Most Popular",
    },
  ];
  return (
    <section id="pricing" className="px-4 py-20">
      <div className="mx-auto max-w-6xl">
        <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
          <div className="max-w-2xl">
            <div className="text-[12px] font-medium uppercase tracking-[0.18em] text-[#4a4a4a]">Pricing</div>
            <h2 className="mt-3 text-[34px] font-semibold leading-[1.05] tracking-[-0.03em] lg:text-[44px]">
              Pricing built around workflows,
              <span className="text-[#9a9a9a]"> not tokens.</span>
            </h2>
          </div>
          <Link
            to="/pricing"
            className="inline-flex h-10 items-center gap-1.5 self-start rounded-full bg-white px-4 text-[13.5px] font-medium text-[#0a0a0a] ring-1 ring-black/10 hover:bg-[#f0f0f3]"
          >
            Compare all features <ArrowRight className="size-3.5" />
          </Link>
        </div>
        <div className="mt-10 grid grid-cols-1 gap-5 md:grid-cols-3">
          {plans.map((p) => (
            <div
              key={p.name}
              className={cn(
                "flex flex-col rounded-2xl p-7 ring-1",
                p.popular
                  ? "bg-[#0a0a0a] text-white ring-black"
                  : "bg-white text-[#0a0a0a] ring-black/5",
              )}
            >
              <div className="flex items-center justify-between">
                <div className="text-[14px] font-semibold tracking-tight">{p.name}</div>
                {p.badge && (
                  <span
                    className={cn(
                      "rounded-full px-2 py-0.5 text-[10px] uppercase tracking-[0.14em]",
                      p.popular ? "bg-white/10 text-white" : "bg-[#f0f0f3] text-[#4a4a4a]",
                    )}
                  >
                    {p.badge}
                  </span>
                )}
              </div>
              <div className="mt-4 flex items-baseline gap-1">
                <span className="text-[44px] font-semibold tracking-[-0.03em]">£{p.price}</span>
                <span className={cn("text-[13px]", p.popular ? "text-white/60" : "text-[#4a4a4a]")}>/mo</span>
              </div>
              <p className={cn("mt-2 text-[14px]", p.popular ? "text-white/70" : "text-[#4a4a4a]")}>
                {p.blurb}
              </p>
              <Link
                to="/pricing"
                className={cn(
                  "mt-6 flex h-10 items-center justify-center rounded-full text-[13.5px] font-medium",
                  p.popular ? "bg-white text-[#0a0a0a] hover:bg-white/90" : "bg-[#0a0a0a] text-white hover:bg-black",
                )}
              >
                {p.cta}
              </Link>
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
      <div className="mx-auto max-w-6xl overflow-hidden rounded-[28px] bg-[#0a0a0a] px-8 py-20 text-center text-white lg:py-28">
        <h2 className="mx-auto max-w-3xl text-balance text-[40px] font-semibold leading-[1.02] tracking-[-0.035em] lg:text-[64px]">
          Run your content operation on one workspace.
        </h2>
        <p className="mx-auto mt-5 max-w-lg text-[16px] text-white/70">
          Free workspace. Evidence-backed articles. Reviewed before publish.
        </p>
        <div className="mt-8 flex items-center justify-center gap-3">
          <Link
            to="/dashboard"
            className="flex h-12 items-center gap-2 rounded-full bg-white px-6 text-[14px] font-medium text-[#0a0a0a] hover:bg-white/90"
          >
            Create Your Workspace <ArrowRight className="size-4" />
          </Link>
          <a
            href="#process"
            className="flex h-12 items-center gap-2 rounded-full bg-white/10 px-6 text-[14px] font-medium text-white ring-1 ring-white/15 hover:bg-white/15"
          >
            View Workflow
          </a>
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
          <a href="#" className="hover:text-black">Privacy</a>
          <a href="#" className="hover:text-black">Terms</a>
          <a href="#" className="hover:text-black">Twitter</a>
          <a href="#" className="hover:text-black">Changelog</a>
        </div>
      </div>
    </footer>
  );
}
