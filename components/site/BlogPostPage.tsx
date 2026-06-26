import { ArrowLeft, ArrowRight } from "lucide-react";
import type { ReactNode } from "react";
import { RouteLink as Link } from "@/components/site/RouteLink";
import type { BlogPost } from "@/lib/site/blog-posts";

export function BlogPostPage({ post }: { post: BlogPost }) {
  const Body = POST_BODIES[post.slug] ?? DefaultBody;
  return (
    <div className="min-h-screen bg-[#f5f5f7] font-sans text-[#0a0a0a] antialiased [color-scheme:light]">
      <Nav />
      <article className="px-4 pt-12 pb-16 lg:pt-20">
        <div className="mx-auto max-w-3xl">
          <Link to="/blog" className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-[#4a4a4a] hover:text-black">
            <ArrowLeft className="size-3.5" />
            Back to blog
          </Link>
          <div className="mt-6 flex items-center gap-3 text-[11.5px] text-[#6a6a6a]">
            <span className="rounded-full bg-white px-2 py-0.5 font-medium uppercase tracking-[0.12em] text-[#3a3a3a] ring-1 ring-black/5">
              {post.category}
            </span>
            <span>{post.publishedLabel}</span>
            <span>·</span>
            <span>{post.readingTime}</span>
          </div>
          <h1 className="mt-4 text-balance text-[40px] font-semibold leading-[1.05] tracking-[-0.03em] lg:text-[52px]">
            {post.title}
          </h1>
          <p className="mt-5 text-[17px] leading-relaxed text-[#3a3a3a]">{post.description}</p>
          <div className="mt-6 flex items-center gap-3 border-b border-black/10 pb-8 text-[12.5px] text-[#4a4a4a]">
            <span className="grid size-7 place-items-center rounded-full bg-[#0a0a0a] text-[10px] font-bold text-white">QW</span>
            <span>
              <span className="font-medium text-[#0a0a0a]">{post.author.name}</span> · {post.author.role}
            </span>
          </div>

          <div className="prose-qw mt-10">
            <Body />
          </div>
        </div>
      </article>
      <CTA />
      <Footer />
      <style>{proseCss}</style>
    </div>
  );
}

/* ---------- Per-post bodies ---------- */
const POST_BODIES: Record<string, () => ReactNode> = {
  "why-ai-writers-fail-at-large-scale-content-operations": WhyAIWritersFail,
};

function DefaultBody() {
  return <p>Content coming soon.</p>;
}

function WhyAIWritersFail() {
  return (
    <>
      <p>
        Most AI writing tools are built for a single task: produce one article from one prompt. That's a fine demo. It is a poor description of how content actually gets published at a real company.
      </p>
      <p>
        Once you try to run 50, 200, or 2,000 articles through the same tool, the cracks appear quickly. The bottleneck isn't the model. It's everything around it — the research, the review, the queueing, the publishing, the version control, the internal linking, the audit trail. The writing is maybe 20% of the job. AI writers tend to optimise the wrong 20%.
      </p>
      <p>
        This is a field guide to where single-article AI tools fail at content operations, why it happens, and what a system designed for volume actually needs to look like.
      </p>

      <h2>1. Research collapses the moment you scale</h2>
      <p>
        A generic AI writer asked to produce an "expert article on espresso grinders" will confidently invent statistics, misattribute quotes, and pull from training data that's 18 months stale. For one article you might catch it. For 200, you won't.
      </p>
      <p>
        Real content operations need <strong>research as a separate, inspectable step</strong>. Sources fetched, evidence extracted, claims linked back to URLs. Not "the model knew this" — actual citations a human can audit. Without that layer, every article becomes a manual fact-check, and your throughput stops dead.
      </p>
      <p>
        This is the first thing we designed into QueueWrite. Research is a first-class stage in the workflow, not a hidden side-effect of the prompt. Every article ships with the sources it was built from, and every claim can be traced back.
      </p>

      <h2>2. There is no queue, so there is no operation</h2>
      <p>
        Single-article tools assume you're sitting in front of the screen, waiting for output. That model breaks the moment you have a list of 80 briefs.
      </p>
      <p>
        A content <em>operation</em> needs a queue. Jobs that run in the background. Jobs that survive a closed browser tab. Jobs that retry intelligently when an API rate-limits. Jobs that can be paused, prioritised, and inspected mid-run.
      </p>
      <p>
        Without durable background execution, you end up with a person babysitting a chatbot. That isn't operations — it's manual labour with extra steps. QueueWrite runs every job on server-side workers; you can close your laptop, walk away, and review the output in the morning.
      </p>

      <h2>3. Validation is left to the human, every single time</h2>
      <p>
        AI writers love to declare success. The output looks fluent, so it gets shipped. Then someone notices the article references a 2022 statistic in a 2026 piece, or invents a "Stanford study" that does not exist, or breaks the brand voice halfway through.
      </p>
      <p>
        Operations at scale need <strong>automated validation</strong> as part of the pipeline. Grammar checks. Hallucination flags against the research evidence. Quality scores for structure, depth and source coverage. The article shouldn't arrive in the editor's lap as a black box — it should arrive with a scorecard.
      </p>
      <p>
        That doesn't replace the editor. It tells the editor where to look first. The difference between reviewing 50 articles cold and reviewing 50 articles with a validation report attached is the difference between "this is a part-time job" and "this is a Tuesday morning."
      </p>

      <h2>4. SEO is bolted on, not designed in</h2>
      <p>
        Most AI writers treat SEO as a post-processing step: "now go optimise this." That works for one article. At scale, you end up with 200 articles that don't link to each other, repeat each other's keywords, and ignore the site they're being published to.
      </p>
      <p>
        Content operations need <strong>site awareness</strong>. The system should know what's already on your site — the sitemap, the existing hubs, the unused anchor opportunities. It should suggest internal links based on what actually exists, not invent generic ones. It should flag when you're about to publish your fourth article on the same long-tail term.
      </p>
      <p>
        Without that context, "AI-generated content" turns into the SEO problem everyone is currently trying to clean up.
      </p>

      <h2>5. Publishing is the part everyone forgets</h2>
      <p>
        Generation isn't the finish line. Publishing is. And publishing is messy: WordPress drafts, scheduled posts, CMS-specific fields, featured images, taxonomy mapping, author attribution, redirect handling.
      </p>
      <p>
        A single-article AI tool hands you a Markdown blob and wishes you luck. A content operations platform takes the article from "approved in review" all the way to "live on the site or scheduled in the calendar," and tracks what happened to each one.
      </p>
      <p>
        If your AI workflow ends at a copy-paste into the CMS, you don't have a workflow. You have a paragraph generator with a step at the end where everything slows down.
      </p>

      <h2>6. There's no audit trail, no versions, no team</h2>
      <p>
        Real operations involve more than one person. Editors, strategists, SEO leads, freelancers. They need version history, comments, the ability to see what changed between draft 2 and draft 5, and who approved what.
      </p>
      <p>
        Single-article AI tools have none of this. The conversation lives in the model's context window and dies when the tab closes. At scale, that's untenable: you lose institutional memory, you lose accountability, and you lose the ability to learn from what worked.
      </p>

      <h2>What a content operating system looks like instead</h2>
      <p>
        Once you accept that the bottleneck isn't writing, the shape of the right tool becomes obvious. It looks less like a chatbot and more like a production line:
      </p>
      <ul>
        <li><strong>Research</strong> as an explicit, inspectable stage with real sources.</li>
        <li><strong>Generation</strong> grounded in that research, not free-floating model output.</li>
        <li><strong>Validation</strong> running automatically — grammar, hallucination, structure, scoring.</li>
        <li><strong>SEO and internal linking</strong> aware of the actual site, not generic best practices.</li>
        <li><strong>A queue</strong> that runs in the background, durably, across projects.</li>
        <li><strong>Publishing</strong> integrated end-to-end, with scheduling and CMS targets.</li>
        <li><strong>Workspaces</strong> with version history, projects, and team-level visibility.</li>
      </ul>
      <p>
        That's the system QueueWrite is built around. We didn't start from "let's wrap a model." We started from "what does a content team actually do all week, and which 80% of it is undifferentiated work the platform should own?"
      </p>

      <h2>The shift: from AI writer to content operating system</h2>
      <p>
        The category is moving. The first generation of tools sold writing. The next generation sells operations: the workflow, the queue, the validation, the publishing, the trail of evidence behind every article.
      </p>
      <p>
        If you're running content at any meaningful volume, the question to ask of any tool is no longer "is the prose good?" It's "can this run my pipeline without a person babysitting it, and can I trust what comes out?"
      </p>
      <p>
        That's the bar. AI writers, by design, can't clear it. A content operating system can.
      </p>

      <hr />
      <p className="callout">
        <strong>Try QueueWrite.</strong> A workspace built around the full content workflow — research, generation, validation, SEO, publishing — running on a durable queue you don't have to watch.{" "}
        <Link to="/dashboard" className="font-medium text-[#0a0a0a] underline">Create your first project</Link>.
      </p>
    </>
  );
}

/* ---------- CTA ---------- */
function CTA() {
  return (
    <section className="px-4 pb-20">
      <div className="mx-auto max-w-3xl overflow-hidden rounded-[24px] bg-[#0a0a0a] px-8 py-12 text-center text-white">
        <h2 className="text-balance text-[28px] font-semibold leading-[1.1] tracking-[-0.02em] lg:text-[34px]">
          Stop babysitting a chatbot. Run an operation.
        </h2>
        <p className="mx-auto mt-3 max-w-lg text-[14.5px] text-white/70">
          Research, validation, queueing and publishing in one workspace.
        </p>
        <div className="mt-6 flex items-center justify-center gap-3">
          <Link
            to="/dashboard"
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

/* ---------- Nav / Footer ---------- */
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
          <Link to="/blog" className="text-black">Blog</Link>
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

const proseCss = `
.prose-qw { color: #2a2a2a; font-size: 16.5px; line-height: 1.75; }
.prose-qw p { margin: 0 0 1.25em; }
.prose-qw h2 { color: #0a0a0a; font-size: 26px; line-height: 1.2; letter-spacing: -0.02em; font-weight: 600; margin: 2.25em 0 0.7em; }
.prose-qw h3 { color: #0a0a0a; font-size: 19px; font-weight: 600; margin: 1.75em 0 0.5em; }
.prose-qw ul { margin: 0 0 1.4em; padding-left: 1.2em; }
.prose-qw li { margin: 0.35em 0; }
.prose-qw li::marker { color: #9a9a9a; }
.prose-qw strong { color: #0a0a0a; font-weight: 600; }
.prose-qw em { color: #1a1a1a; }
.prose-qw a { color: #0a0a0a; text-decoration: underline; text-underline-offset: 3px; text-decoration-color: rgba(0,0,0,0.25); }
.prose-qw a:hover { text-decoration-color: rgba(0,0,0,0.7); }
.prose-qw hr { border: 0; border-top: 1px solid rgba(0,0,0,0.08); margin: 2.5em 0; }
.prose-qw .callout { background: #fff; border: 1px solid rgba(0,0,0,0.06); border-radius: 16px; padding: 18px 20px; font-size: 14.5px; }
`;
