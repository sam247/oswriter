import {
  ArrowRight,
  MessageSquare,
  LifeBuoy,
  Briefcase,
  ShieldAlert,
  Lightbulb,
  Github,
  Mail,
} from "lucide-react";
import type { ComponentType, SVGProps } from "react";
import { RouteLink as Link } from "@/components/site/RouteLink";
import { appUrl } from "@/lib/server/urls";

export default function ContactPage() {
  return (
    <div className="min-h-screen bg-[#f5f5f7] font-sans text-[#0a0a0a] antialiased [color-scheme:light]">
      <Nav />
      <Hero />
      <Channels />
      <ResponseTimes />
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
          <Link to="/features" className="hover:text-black">Features</Link>
          <Link to="/pricing" className="hover:text-black">Pricing</Link>
          <Link to="/blog" className="hover:text-black">Blog</Link>
          <Link to="/contact" className="text-black">Contact</Link>
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <Link to={appUrl("/login")} className="hidden text-[13.5px] text-[#3a3a3a] hover:text-black sm:inline">
            Sign in
          </Link>
          <Link
            to={appUrl("/signup")}
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
    <section className="px-4 pt-16 pb-10 lg:pt-24">
      <div className="mx-auto max-w-4xl text-center">
        <div className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-1 text-[11.5px] font-medium tracking-tight text-[#3a3a3a] ring-1 ring-black/5">
          <span className="size-1.5 rounded-full bg-[#0a0a0a]" />
          Contact
        </div>
        <h1 className="mt-5 text-balance text-[44px] font-semibold leading-[1.02] tracking-[-0.035em] lg:text-[64px]">
          Talk to the right team,
          <span className="text-[#9a9a9a]"> faster.</span>
        </h1>
        <p className="mx-auto mt-5 max-w-2xl text-[16px] leading-relaxed text-[#3a3a3a]">
          Pick the channel that matches what you need. Each one routes directly to the people who own it — no shared inbox, no triage queue.
        </p>
      </div>
    </section>
  );
}

/* ---------- Channels ---------- */
type Channel = {
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  name: string;
  description: string;
  action: string;
  href: string;
  meta?: string;
  disabled?: boolean;
  accent?: boolean;
};

const CHANNELS: Channel[] = [
  {
    icon: MessageSquare,
    name: "General enquiries",
    description:
      "Questions about the product, partnerships, press or anything that doesn't fit the other channels.",
    action: "hello@queuewrite.com",
    href: "mailto:hello@queuewrite.com",
    meta: "Replies within 2 business days",
  },
  {
    icon: LifeBuoy,
    name: "Support",
    description:
      "Stuck on a queue, a publish step or a workspace issue. Include your project ID and the run you'd like us to look at.",
    action: "support@queuewrite.com",
    href: "mailto:support@queuewrite.com",
    meta: "Priority support on Pro",
    accent: true,
  },
  {
    icon: Briefcase,
    name: "Sales",
    description:
      "Multi-seat workspaces, agency rollouts, custom volume or procurement. We'll get on a call if it's useful.",
    action: "sales@queuewrite.com",
    href: "mailto:sales@queuewrite.com",
    meta: "For teams of 3+",
  },
  {
    icon: ShieldAlert,
    name: "Security / Responsible disclosure",
    description:
      "Reporting a vulnerability or a sensitive issue. Please include reproduction steps and impact. We acknowledge within one business day.",
    action: "security@queuewrite.com",
    href: "mailto:security@queuewrite.com",
    meta: "PGP available on request",
  },
  {
    icon: Lightbulb,
    name: "Feature requests",
    description:
      "Tell us what's missing from your workflow. Real use cases get prioritised — describe the job you're trying to do.",
    action: "feedback@queuewrite.com",
    href: "mailto:feedback@queuewrite.com",
    meta: "Reviewed weekly",
  },
  {
    icon: Github,
    name: "GitHub",
    description:
      "Public issue tracker, integration SDKs and example workspaces. Coming as we open up parts of the platform.",
    action: "Coming soon",
    href: "#",
    meta: "On the roadmap",
    disabled: true,
  },
];

function Channels() {
  return (
    <section className="px-4 pb-16">
      <div className="mx-auto grid max-w-6xl grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {CHANNELS.map((c) => {
          const Icon = c.icon;
          return (
            <div
              key={c.name}
              className={[
                "group flex flex-col rounded-2xl bg-white p-6 ring-1 ring-black/5 transition",
                c.disabled ? "opacity-60" : "hover:ring-black/15",
              ].join(" ")}
            >
              <div className="flex items-center justify-between">
                <div className="grid size-9 place-items-center rounded-xl bg-[#f0f0f3] ring-1 ring-black/5">
                  <Icon className="size-4 text-[#0a0a0a]" />
                </div>
                {c.accent && (
                  <span className="rounded-full bg-[#0a0a0a] px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.14em] text-white">
                    Fastest
                  </span>
                )}
              </div>
              <h3 className="mt-5 text-[16px] font-semibold tracking-tight text-[#0a0a0a]">{c.name}</h3>
              <p className="mt-2 text-[13.5px] leading-relaxed text-[#3a3a3a]">{c.description}</p>
              <div className="mt-5 flex items-center justify-between border-t border-black/5 pt-4">
                {c.disabled ? (
                  <span className="inline-flex items-center gap-1.5 text-[13px] font-medium text-[#9a9a9a]">
                    {c.action}
                  </span>
                ) : (
                  <a
                    href={c.href}
                    className="inline-flex items-center gap-1.5 text-[13px] font-medium text-[#0a0a0a] hover:underline"
                  >
                    <Mail className="size-3.5" />
                    {c.action}
                  </a>
                )}
                {c.meta && <span className="text-[11.5px] text-[#6a6a6a]">{c.meta}</span>}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

/* ---------- Response Times ---------- */
function ResponseTimes() {
  const rows = [
    { label: "Critical security reports", value: "< 24 hours" },
    { label: "Pro plan support", value: "< 1 business day" },
    { label: "BYOK plan support", value: "1–2 business days" },
    { label: "Free plan support", value: "Best-effort, community first" },
    { label: "Sales enquiries", value: "Same day, weekdays" },
  ];
  return (
    <section className="px-4 py-12">
      <div className="mx-auto max-w-6xl">
        <div className="grid grid-cols-1 gap-8 rounded-2xl bg-white p-8 ring-1 ring-black/5 lg:grid-cols-[1fr_1.4fr] lg:p-10">
          <div>
            <div className="text-[12px] font-medium uppercase tracking-[0.18em] text-[#4a4a4a]">Response times</div>
            <h2 className="mt-3 text-[28px] font-semibold leading-[1.05] tracking-[-0.03em] lg:text-[32px]">
              What to expect after you hit send.
            </h2>
            <p className="mt-4 text-[14px] leading-relaxed text-[#3a3a3a]">
              We aim for human replies on every channel. Targets are guidelines, not SLAs — for a contractual SLA, talk to sales.
            </p>
          </div>
          <div className="overflow-hidden rounded-xl ring-1 ring-black/5">
            {rows.map((r, i) => (
              <div
                key={r.label}
                className={[
                  "grid grid-cols-[1.4fr_1fr] items-center px-5 py-3.5 text-[13.5px]",
                  i !== rows.length - 1 && "border-b border-black/5",
                ]
                  .filter(Boolean)
                  .join(" ")}
              >
                <div className="text-[#0a0a0a]">{r.label}</div>
                <div className="text-right text-[#3a3a3a]">{r.value}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

/* ---------- Final CTA ---------- */
function FinalCTA() {
  return (
    <section className="px-4 pb-20">
      <div className="mx-auto max-w-6xl overflow-hidden rounded-[28px] bg-[#0a0a0a] px-8 py-16 text-center text-white lg:py-20">
        <h2 className="mx-auto max-w-3xl text-balance text-[34px] font-semibold leading-[1.05] tracking-[-0.035em] lg:text-[48px]">
          Prefer to see it before you write?
        </h2>
        <p className="mx-auto mt-4 max-w-lg text-[15px] text-white/70">
          Create a workspace, run a project end-to-end, then bring questions back to the team.
        </p>
        <div className="mt-7 flex items-center justify-center gap-3">
          <Link
            to={appUrl("/signup")}
            className="flex h-11 items-center gap-2 rounded-full bg-white px-5 text-[13.5px] font-medium text-[#0a0a0a] hover:bg-white/90"
          >
            Create Your Workspace <ArrowRight className="size-4" />
          </Link>
          <Link
            to="/features"
            className="flex h-11 items-center rounded-full bg-white/10 px-5 text-[13.5px] font-medium text-white hover:bg-white/15"
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
          <Link to="/features" className="hover:text-black">Features</Link>
          <Link to="/pricing" className="hover:text-black">Pricing</Link>
          <Link to="/blog" className="hover:text-black">Blog</Link>
          <Link to="/contact" className="hover:text-black">Contact</Link>
        </div>
      </div>
    </footer>
  );
}
