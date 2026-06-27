"use client";

import { ArrowRight, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { RouteLink as Link } from "@/components/site/RouteLink";
import { appUrl } from "@/lib/server/urls";
import { cn } from "@/lib/utils";
import { BLOG_POSTS, BLOG_CATEGORIES } from "@/lib/site/blog-posts";

export default function BlogIndexPage() {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string>("All");

  const posts = useMemo(() => {
    const q = query.trim().toLowerCase();
    return BLOG_POSTS
      .filter((p) => (category === "All" ? true : p.category === category))
      .filter((p) =>
        q
          ? p.title.toLowerCase().includes(q) ||
            p.description.toLowerCase().includes(q) ||
            p.category.toLowerCase().includes(q)
          : true,
      )
      .sort((a, b) => (a.publishedAt < b.publishedAt ? 1 : -1));
  }, [query, category]);

  return (
    <div className="min-h-screen bg-[#f5f5f7] font-sans text-[#0a0a0a] antialiased [color-scheme:light]">
      <Nav />
      <section className="px-4 pt-16 pb-8 lg:pt-24">
        <div className="mx-auto max-w-4xl text-center">
          <div className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-1 text-[11.5px] font-medium tracking-tight text-[#3a3a3a] ring-1 ring-black/5">
            <span className="size-1.5 rounded-full bg-[#0a0a0a]" />
            Blog
          </div>
          <h1 className="mt-5 text-balance text-[44px] font-semibold leading-[1.02] tracking-[-0.035em] lg:text-[60px]">
            Field notes on
            <span className="text-[#9a9a9a]"> content operations.</span>
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-[16px] leading-relaxed text-[#3a3a3a]">
            Workflow design, publishing systems and the engineering behind QueueWrite. Written for people who ship content at volume.
          </p>
        </div>
      </section>

      <section className="px-4">
        <div className="mx-auto max-w-6xl">
          <div className="flex flex-col gap-4 rounded-2xl bg-white p-4 ring-1 ring-black/5 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative w-full sm:max-w-xs">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[#9a9a9a]" />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search articles"
                className="h-10 w-full rounded-full bg-[#f5f5f7] pl-9 pr-3 text-[13.5px] text-[#0a0a0a] placeholder:text-[#9a9a9a] outline-none ring-1 ring-transparent focus:ring-black/15"
              />
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              {BLOG_CATEGORIES.map((c) => (
                <button
                  key={c}
                  onClick={() => setCategory(c)}
                  className={cn(
                    "h-8 rounded-full px-3 text-[12.5px] font-medium transition",
                    category === c
                      ? "bg-[#0a0a0a] text-white"
                      : "bg-[#f5f5f7] text-[#3a3a3a] hover:bg-[#ebebef]",
                  )}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="px-4 py-10">
        <div className="mx-auto max-w-6xl">
          {posts.length === 0 ? (
            <div className="rounded-2xl bg-white p-10 text-center ring-1 ring-black/5">
              <p className="text-[14px] text-[#3a3a3a]">No posts match that filter yet.</p>
            </div>
          ) : (
            <ul className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
              {posts.map((p) => (
                <li key={p.slug} className="h-full">
                  <Link
                    to="/blog/$slug"
                    params={{ slug: p.slug }}
                    className="group flex h-full flex-col rounded-2xl bg-white p-6 ring-1 ring-black/5 transition hover:ring-black/15 sm:p-7"
                  >
                    <div className="flex-1">
                      <div className="flex items-center gap-3 text-[11.5px] text-[#6a6a6a]">
                        <span className="rounded-full bg-[#f0f0f3] px-2 py-0.5 font-medium uppercase tracking-[0.12em] text-[#3a3a3a]">
                          {p.category}
                        </span>
                        <span>{p.publishedLabel}</span>
                        <span>·</span>
                        <span>{p.readingTime}</span>
                      </div>
                      <h2 className="mt-3 text-[22px] font-semibold leading-[1.15] tracking-[-0.02em] text-[#0a0a0a] sm:text-[24px]">
                        {p.title}
                      </h2>
                      <p className="mt-2 text-[14px] leading-relaxed text-[#3a3a3a]">
                        {p.description}
                      </p>
                    </div>
                    <div className="mt-6 flex items-center gap-1 text-[13px] font-medium text-[#0a0a0a]">
                      Read
                      <ArrowRight className="size-3.5 transition group-hover:translate-x-0.5" />
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <Footer />
    </div>
  );
}

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
