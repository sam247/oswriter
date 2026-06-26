"use client";

import { ArrowRight, Check, Minus, ChevronDown } from "lucide-react";
import { useState } from "react";
import { RouteLink as Link } from "@/components/site/RouteLink";
import { cn } from "@/lib/utils";

export default function PricingPage() {
  return (
    <div className="min-h-screen bg-[#f5f5f7] font-sans text-[#0a0a0a] antialiased [color-scheme:light]">
      <Nav />
      <Hero />
      <PricingCards />
      <Comparison />
      <FAQ />
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
          <Link to="/features" className="hover:text-black">Features</Link>
          <Link to="/" hash="apps" className="hover:text-black">Integrations</Link>
          <Link to="/pricing" className="text-black">Pricing</Link>
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
          Pricing
        </div>
        <h1 className="mt-5 text-balance text-[44px] font-semibold leading-[1.02] tracking-[-0.035em] lg:text-[64px]">
          Priced around the workflow,
          <span className="text-[#9a9a9a]"> not the tokens.</span>
        </h1>
        <p className="mx-auto mt-5 max-w-2xl text-[16px] leading-relaxed text-[#3a3a3a]">
          QueueWrite manages the publishing workflow — research, validation, SEO, queueing and publishing. You decide how AI is provided: fully managed, or bring your own supported providers.
        </p>
        <div className="mt-7 flex items-center justify-center gap-3">
          <Link
            to="/dashboard"
            className="flex h-11 items-center gap-1.5 rounded-full bg-[#0a0a0a] px-5 text-[13.5px] font-medium text-white hover:bg-black"
          >
            Create Your Workspace <ArrowRight className="size-3.5" />
          </Link>
          <Link
            to="/features"
            className="flex h-11 items-center rounded-full bg-white px-5 text-[13.5px] font-medium text-[#0a0a0a] ring-1 ring-black/10 hover:bg-[#f0f0f3]"
          >
            View Workflow
          </Link>
        </div>
      </div>
    </section>
  );
}

/* ---------- Pricing Cards ---------- */
const PLANS = [
  {
    name: "Free",
    price: "0",
    subtitle: "Experience QueueWrite",
    description:
      "Run a small project end-to-end. Managed research and managed writing included so you can experience the full workflow before upgrading.",
    cta: "Create Your First Project",
    badge: "No credit card required",
    features: [
      "1 Project",
      "Managed research",
      "Managed writing",
      "5 articles per month",
      "Content profiles",
      "Quality scoring",
      "Export",
    ],
  },
  {
    name: "BYOK",
    price: "19",
    subtitle: "Bring your own providers",
    description:
      "Connect your own AI and research providers. QueueWrite runs the workflow — queueing, validation, scoring, publishing — across unlimited projects. Built for agencies and technical teams.",
    cta: "Build Your Workspace",
    badge: "For agencies & technical users",
    popular: true,
    features: [
      "Unlimited projects",
      "Bring your own AI providers",
      "Bring your own research providers",
      "Switch between supported models",
      "Queue & background processing",
      "Validation & quality scoring",
      "Content profiles",
      "MCP access",
      "Publishing integrations",
    ],
  },
  {
    name: "Pro",
    price: "39",
    subtitle: "Fully managed",
    description:
      "Everything included. No API keys, no provider setup. QueueWrite handles research, writing and publishing end-to-end.",
    cta: "Start Pro",
    badge: "Most popular",
    features: [
      "Unlimited projects",
      "Managed research & writing",
      "No API keys required",
      "Validation & quality scoring",
      "Content profiles",
      "MCP access",
      "Publishing integrations",
      "Scheduled publishing",
      "Priority features",
    ],
  },
];

function PricingCards() {
  return (
    <section id="features" className="px-4 py-12">
      <div className="mx-auto max-w-6xl">
        <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
          {PLANS.map((p) => (
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
                <span
                  className={cn(
                    "max-w-[60%] truncate rounded-full px-2 py-0.5 text-[10px] uppercase tracking-[0.14em]",
                    p.popular ? "bg-white/10 text-white" : "bg-[#f0f0f3] text-[#4a4a4a]",
                  )}
                >
                  {p.badge}
                </span>
              </div>
              <div className={cn("mt-3 text-[12.5px]", p.popular ? "text-white/60" : "text-[#4a4a4a]")}>
                {p.subtitle}
              </div>
              <div className="mt-4 flex items-baseline gap-1">
                <span className="text-[44px] font-semibold tracking-[-0.03em]">£{p.price}</span>
                <span className={cn("text-[13px]", p.popular ? "text-white/60" : "text-[#4a4a4a]")}>/month</span>
              </div>
              <p className={cn("mt-3 text-[14px] leading-relaxed", p.popular ? "text-white/70" : "text-[#4a4a4a]")}>
                {p.description}
              </p>
              <Link
                to="/dashboard"
                className={cn(
                  "mt-6 flex h-10 items-center justify-center rounded-full text-[13.5px] font-medium",
                  p.popular ? "bg-white text-[#0a0a0a] hover:bg-white/90" : "bg-[#0a0a0a] text-white hover:bg-black",
                )}
              >
                {p.cta}
              </Link>
              <ul className="mt-7 flex flex-col gap-2.5 text-[14px]">
                {p.features.map((f) => (
                  <li key={f} className="flex items-start gap-2.5">
                    <Check className={cn("mt-0.5 size-4 shrink-0", p.popular ? "text-white/70" : "text-[#0a0a0a]")} />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ---------- Comparison ---------- */
type Cell = boolean | string;
const ROWS: { label: string; values: [Cell, Cell, Cell] }[] = [
  { label: "Who it's for", values: ["Trying QueueWrite", "Agencies & technical teams", "Teams who want it handled"] },
  { label: "AI providers", values: ["Managed", "Bring your own", "Managed"] },
  { label: "Research providers", values: ["Managed", "Bring your own", "Managed"] },
  { label: "API keys required", values: ["No", "Yes", "No"] },
  { label: "Projects", values: ["1", "Unlimited", "Unlimited"] },
  { label: "Article volume", values: ["5 / month", "Your provider limits", "Unlimited"] },
  { label: "Workflow & queue", values: [true, true, true] },
  { label: "Validation & quality scoring", values: [true, true, true] },
  { label: "Switch between supported models", values: [false, true, false] },
  { label: "Publishing integrations", values: [false, true, true] },
  { label: "Scheduled publishing", values: [false, false, true] },
  { label: "Priority features & support", values: [false, false, true] },
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
          <div className="text-[12px] font-medium uppercase tracking-[0.18em] text-[#4a4a4a]">Which workflow fits</div>
          <h2 className="mt-3 text-[34px] font-semibold leading-[1.05] tracking-[-0.03em] lg:text-[40px]">
            Pick by how you want to operate,
            <span className="text-[#9a9a9a]"> not by feature count.</span>
          </h2>
          <p className="mt-4 text-[15px] leading-relaxed text-[#3a3a3a]">
            Every plan runs the same workflow. The difference is who supplies the AI — and how much QueueWrite handles for you.
          </p>
        </div>

        <div className="mt-10 overflow-hidden rounded-2xl bg-white ring-1 ring-black/5">
          <div className="grid grid-cols-[1.4fr_1fr_1fr_1fr] border-b border-black/5 bg-[#fafafb] px-5 py-4 text-[12.5px] font-medium tracking-tight text-[#4a4a4a]">
            <div>Operational difference</div>
            <div className="text-center text-[#0a0a0a]">Free</div>
            <div className="text-center text-[#0a0a0a]">BYOK</div>
            <div className="text-center text-[#0a0a0a]">Pro</div>
          </div>
          {ROWS.map((row, i) => (
            <div
              key={row.label}
              className={cn(
                "grid grid-cols-[1.4fr_1fr_1fr_1fr] items-center px-5 py-3.5 text-[13.5px]",
                i !== ROWS.length - 1 && "border-b border-black/5",
              )}
            >
              <div className="text-[#0a0a0a]">{row.label}</div>
              <div className="text-center">{renderCell(row.values[0])}</div>
              <div className="text-center">{renderCell(row.values[1])}</div>
              <div className="text-center">{renderCell(row.values[2])}</div>
            </div>
          ))}
        </div>

        <p className="mt-5 text-[12.5px] text-[#6a6a6a]">
          BYOK works with a growing list of supported AI and research providers. Switch models any time — you're not locked into one vendor.
        </p>
      </div>
    </section>
  );
}

/* ---------- FAQ ---------- */
const FAQS = [
  {
    q: "What does BYOK mean?",
    a: "Bring Your Own Keys. You connect your own AI and research provider accounts, and QueueWrite runs the publishing workflow on top — queueing, validation, scoring, internal linking and publishing.",
  },
  {
    q: "Do I need API keys?",
    a: "Only on the BYOK plan. Free and Pro are fully managed — no keys, no provider setup.",
  },
  {
    q: "Can I switch plans?",
    a: "Yes. Upgrade, downgrade or move between managed and BYOK at any time. Your projects, content profiles and history carry across.",
  },
  {
    q: "Which research providers are supported?",
    a: "QueueWrite supports a curated set of research providers and is designed so you can swap between them. We expand the list as providers mature.",
  },
  {
    q: "Which AI models are supported?",
    a: "BYOK supports the major model families across the leading providers. You choose which model handles which step of the workflow — and switch any time.",
  },
  {
    q: "Will more providers be added?",
    a: "Yes. The product is built around provider flexibility. New AI and research integrations are added on an ongoing basis.",
  },
];

function FAQ() {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <section className="px-4 py-20">
      <div className="mx-auto max-w-3xl">
        <div className="text-center">
          <div className="text-[12px] font-medium uppercase tracking-[0.18em] text-[#4a4a4a]">FAQ</div>
          <h2 className="mt-3 text-[34px] font-semibold leading-[1.05] tracking-[-0.03em] lg:text-[40px]">
            Questions, answered.
          </h2>
        </div>
        <div className="mt-10 overflow-hidden rounded-2xl bg-white ring-1 ring-black/5">
          {FAQS.map((f, i) => {
            const isOpen = open === i;
            return (
              <div key={f.q} className={cn(i !== FAQS.length - 1 && "border-b border-black/5")}>
                <button
                  onClick={() => setOpen(isOpen ? null : i)}
                  className="flex w-full items-center justify-between gap-4 px-6 py-5 text-left"
                >
                  <span className="text-[15px] font-medium tracking-tight text-[#0a0a0a]">{f.q}</span>
                  <ChevronDown
                    className={cn(
                      "size-4 shrink-0 text-[#4a4a4a] transition-transform",
                      isOpen && "rotate-180",
                    )}
                  />
                </button>
                {isOpen && (
                  <div className="px-6 pb-5 text-[14px] leading-relaxed text-[#3a3a3a]">{f.a}</div>
                )}
              </div>
            );
          })}
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
          Build your publishing workspace.
        </h2>
        <p className="mx-auto mt-5 max-w-lg text-[16px] text-white/70">
          Create your first project in minutes. Bring your own providers, or let QueueWrite handle everything.
        </p>
        <div className="mt-8 flex items-center justify-center gap-3">
          <Link
            to="/dashboard"
            className="flex h-12 items-center gap-2 rounded-full bg-white px-6 text-[14px] font-medium text-[#0a0a0a] hover:bg-white/90"
          >
            Create Your First Project <ArrowRight className="size-4" />
          </Link>
          <Link
            to="/features"
            className="flex h-12 items-center rounded-full bg-white/10 px-6 text-[14px] font-medium text-white hover:bg-white/15"
          >
            View Workflow
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
          <a href="#" className="hover:text-black">Privacy</a>
          <a href="#" className="hover:text-black">Terms</a>
          <a href="#" className="hover:text-black">Changelog</a>
        </div>
      </div>
    </footer>
  );
}
