"use client";

import { ChevronDown, ExternalLink, Loader2, Search, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { createEmptyProjectSiteKnowledge } from "@/lib/site-knowledge-state";
import type { ProjectSiteKnowledgeDocument, ProjectSiteProfileDocument, SiteKnowledgePageDocument } from "@/lib/types";

interface KnowledgeBaseSettingsProps {
  projectId: string;
  disabledReason?: string | null;
}

export function KnowledgeBaseSettings({ projectId, disabledReason }: KnowledgeBaseSettingsProps) {
  const [siteKnowledge, setSiteKnowledge] = useState<ProjectSiteKnowledgeDocument | null>(null);
  const [siteProfile, setSiteProfile] = useState<ProjectSiteProfileDocument | null>(null);
  const [sitemapUrl, setSitemapUrl] = useState("");
  const [siteLoading, setSiteLoading] = useState(true);
  const [siteBusy, setSiteBusy] = useState(false);
  const [siteError, setSiteError] = useState<string | null>(null);
  const [pagesOpen, setPagesOpen] = useState(false);
  const [pages, setPages] = useState<SiteKnowledgePageDocument[]>([]);
  const [pagesLoading, setPagesLoading] = useState(false);
  const [pagesLoaded, setPagesLoaded] = useState(false);
  const [pageQuery, setPageQuery] = useState("");

  useEffect(() => {
    void refreshSiteKnowledge(projectId, setSiteKnowledge, setSiteProfile, setSitemapUrl, setSiteLoading, setSiteError);
  }, [projectId]);

  const siteSummary = siteKnowledge ?? createEmptyProjectSiteKnowledge(projectId);
  const filteredPages = useMemo(() => {
    const needle = pageQuery.trim().toLowerCase();
    if (!needle) return pages;
    return pages.filter((page) => page.url.toLowerCase().includes(needle) || page.title.toLowerCase().includes(needle));
  }, [pageQuery, pages]);

  async function openPages() {
    setPagesOpen(true);
    if (!pagesLoaded) await loadPages(projectId, setPages, setPagesLoading, setSiteError, setPagesLoaded);
  }

  async function importSite() {
    if (!sitemapUrl.trim()) {
      setSiteError("Enter a sitemap URL before importing.");
      return;
    }
    setSiteBusy(true);
    setSiteError(null);
    setSiteKnowledge((current) => ({
      ...(current ?? createEmptyProjectSiteKnowledge(projectId)),
      projectId,
      sitemapUrl: sitemapUrl.trim(),
      status: "importing",
      startedAt: new Date().toISOString(),
      completedAt: null,
      currentUrl: null,
      lastError: null,
      processedPages: 0,
      updatedAt: new Date().toISOString()
    }));

    try {
      const res = await fetch("/api/project/site-knowledge/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, sitemapUrl })
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({})) as { error?: string };
        setSiteError(data.error ?? "Site import failed.");
        setSiteBusy(false);
        await refreshSiteKnowledge(projectId, setSiteKnowledge, setSiteProfile, setSitemapUrl, setSiteLoading, setSiteError);
        return;
      }
      if (!res.body) throw new Error("Import stream unavailable.");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let completed = false;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        ({ buffer, completed } = consumeImportBuffer(buffer, {
          onProgress(next) {
            if (next.siteKnowledge) {
              setSiteKnowledge(next.siteKnowledge);
              if (typeof next.siteKnowledge.sitemapUrl === "string") setSitemapUrl(next.siteKnowledge.sitemapUrl);
            }
            if (next.siteProfile) setSiteProfile(next.siteProfile);
          },
          onError(message) {
            setSiteError(message);
          },
          onComplete(next) {
            completed = true;
            if (next.siteKnowledge) {
              setSiteKnowledge(next.siteKnowledge);
              setSitemapUrl(next.siteKnowledge.sitemapUrl);
            }
            if (next.siteProfile) setSiteProfile(next.siteProfile);
          }
        }));
      }

      buffer += decoder.decode();
      ({ completed } = consumeImportBuffer(buffer, {
        onProgress(next) {
          if (next.siteKnowledge) {
            setSiteKnowledge(next.siteKnowledge);
            if (typeof next.siteKnowledge.sitemapUrl === "string") setSitemapUrl(next.siteKnowledge.sitemapUrl);
          }
          if (next.siteProfile) setSiteProfile(next.siteProfile);
        },
        onError(message) {
          setSiteError(message);
        },
        onComplete(next) {
          completed = true;
          if (next.siteKnowledge) {
            setSiteKnowledge(next.siteKnowledge);
            setSitemapUrl(next.siteKnowledge.sitemapUrl);
          }
          if (next.siteProfile) setSiteProfile(next.siteProfile);
        }
      }));

      await refreshSiteKnowledge(projectId, setSiteKnowledge, setSiteProfile, setSitemapUrl, setSiteLoading, setSiteError);
      setPagesLoaded(false);
      if (pagesOpen || completed) await loadPages(projectId, setPages, setPagesLoading, setSiteError, setPagesLoaded);
    } catch (error) {
      setSiteError(error instanceof Error ? error.message : "Site import failed.");
      await refreshSiteKnowledge(projectId, setSiteKnowledge, setSiteProfile, setSitemapUrl, setSiteLoading, setSiteError);
    } finally {
      setSiteBusy(false);
    }
  }

  return (
    <>
      <details className="group w-full rounded-md border border-line bg-surface-1">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3.5 [&::-webkit-details-marker]:hidden">
          <div className="min-w-0">
            <div className="text-[13px] font-semibold text-ink">Website Intelligence</div>
            <div className="mono mt-0.5 text-[10px] text-ink-subtle">{siteProfile ? `${siteProfile.pageCount} knowledge pages analysed` : "Import a sitemap to learn this business"}</div>
          </div>
          <ChevronDown className="size-4 shrink-0 text-ink-subtle transition-transform group-open:rotate-180" aria-hidden="true" />
        </summary>

        <div className="border-t border-line px-4 pb-4 pt-3">
          <p className="text-[11.5px] leading-relaxed text-ink-muted">Import a sitemap so QueueWrite can learn services, categories, audiences, locations, CTAs, and writing signals directly from the website.</p>

          <div className="mt-4 rounded-md border border-line bg-surface-2 p-3">
            <div className="text-[13px] font-semibold text-ink">Website Intelligence</div>
            <p className="mt-1 text-[11.5px] leading-relaxed text-ink-muted">This profile becomes the foundation for generation, SEO suggestions, internal links, entity detection, topical authority, and CTA recommendations.</p>

            <label className="mt-3 block text-[12px] text-ink-muted">
              <span>Sitemap URL</span>
              <input
                value={sitemapUrl}
                onChange={(event) => setSitemapUrl(event.currentTarget.value)}
                placeholder="https://example.com/sitemap.xml"
                className="mt-1 h-9 w-full rounded border border-line bg-background px-2.5 text-[13px] text-ink outline-none placeholder:text-ink-subtle focus:border-ink"
              />
            </label>
            <div className="mt-1 text-[10.5px] text-ink-subtle">Example: `https://example.com/sitemap.xml`</div>

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={siteBusy || siteLoading || Boolean(disabledReason)}
                title={disabledReason ?? "Import site pages from this sitemap"}
                onClick={() => void importSite()}
                className="inline-flex h-8 items-center gap-1 rounded-md bg-ink px-3 text-[11.5px] font-medium text-white disabled:cursor-not-allowed disabled:opacity-40"
              >
                {siteBusy ? <Loader2 className="size-3.5 animate-spin" /> : null}
                {siteBusy ? "Importing..." : "Import Site"}
              </button>
              <button
                type="button"
                disabled={siteBusy || (siteSummary.pagesIndexed === 0 && pages.length === 0)}
                onClick={() => void openPages()}
                className="h-8 rounded-md border border-line bg-background px-3 text-[11.5px] font-medium text-ink disabled:cursor-not-allowed disabled:opacity-40"
              >
                View Pages
              </button>
            </div>

            <div className="mt-3 rounded-md border border-line bg-background px-3 py-2.5">
              <div className="mono text-[10px] uppercase tracking-[0.16em] text-ink-subtle">Status</div>
              {siteLoading ? (
                <div className="mt-2 text-[12px] text-ink-muted">Loading...</div>
              ) : siteSummary.status === "not_configured" && !siteSummary.lastImportedAt ? (
                <div className="mt-2 text-[12px] text-ink">Not Configured</div>
              ) : (
                <div className="mt-2 space-y-1 text-[12px] text-ink-muted">
                  <div className="flex items-center justify-between gap-4">
                    <span>{siteSummary.status === "importing" ? "Import Progress" : "Last Imported"}</span>
                    <span className="text-right text-ink">{siteSummary.status === "importing" ? `${siteSummary.processedPages}/${Math.max(siteSummary.totalDiscoveredUrls, siteSummary.processedPages || 0, 1)}` : formatDateTime(siteSummary.lastImportedAt)}</span>
                  </div>
                  <div className="flex items-center justify-between gap-4">
                    <span>Knowledge Pages Analysed</span>
                    <span className="text-right text-ink">{siteSummary.pagesIndexed}</span>
                  </div>
                  {siteSummary.status === "importing" && siteSummary.currentUrl && (
                    <div className="border-t border-line pt-2 text-[11px] text-ink-subtle">{siteSummary.currentUrl}</div>
                  )}
                </div>
              )}
            </div>

            {siteError && <div className="mt-3 text-[11px] text-warn">{siteError}</div>}
            {siteProfile && siteSummary.status === "ready" && (
              <WebsiteIntelligenceCard profile={siteProfile} importedAt={siteSummary.lastImportedAt} />
            )}
          </div>

          {disabledReason && <div className="mt-3 text-[11px] text-warn">{disabledReason}</div>}
        </div>
      </details>

      {pagesOpen && (
        <SiteKnowledgePagesModal
          pages={filteredPages}
          totalPages={pages.length}
          query={pageQuery}
          loading={pagesLoading}
          onClose={() => setPagesOpen(false)}
          onQueryChange={setPageQuery}
        />
      )}
    </>
  );
}

function SiteKnowledgePagesModal({
  pages,
  totalPages,
  query,
  loading,
  onClose,
  onQueryChange
}: {
  pages: SiteKnowledgePageDocument[];
  totalPages: number;
  query: string;
  loading: boolean;
  onClose: () => void;
  onQueryChange: (value: string) => void;
}) {
  return (
    <div className="fixed inset-0 z-50 bg-black/20 px-4 pt-[10vh] backdrop-blur-sm" onMouseDown={onClose}>
      <div className="mx-auto flex max-h-[72vh] w-full max-w-4xl flex-col overflow-hidden rounded-lg border border-line bg-surface-1 shadow-2xl" onMouseDown={(event) => event.stopPropagation()}>
        <div className="hairline-b flex items-center justify-between gap-3 px-4 py-3">
          <div>
            <div className="text-[14px] font-semibold text-ink">Site Pages</div>
            <div className="text-[11px] text-ink-muted">{pages.length} of {totalPages} pages shown</div>
          </div>
          <button onClick={onClose} className="inline-flex h-8 w-8 items-center justify-center rounded-md text-ink-muted hover:bg-surface-3 hover:text-ink" aria-label="Close site pages">
            <X className="size-4" />
          </button>
        </div>

        <div className="hairline-b flex items-center gap-2 px-4 py-3">
          <Search className="size-4 text-ink-subtle" />
          <input
            value={query}
            onChange={(event) => onQueryChange(event.currentTarget.value)}
            placeholder="Search pages by URL or title"
            className="h-9 min-w-0 flex-1 rounded border border-line bg-background px-3 text-[13px] text-ink outline-none placeholder:text-ink-subtle focus:border-ink"
          />
        </div>

        <div className="min-h-0 flex-1 overflow-auto">
          {loading ? (
            <div className="flex h-48 items-center justify-center gap-2 text-[12px] text-ink-muted">
              <Loader2 className="size-4 animate-spin" />
              Loading pages...
            </div>
          ) : pages.length ? (
            <table className="min-w-full divide-y divide-line text-left">
              <thead className="bg-surface-2">
                <tr className="text-[11px] uppercase tracking-[0.12em] text-ink-subtle">
                  <th className="px-4 py-2.5 font-medium">URL</th>
                  <th className="px-4 py-2.5 font-medium">Title</th>
                  <th className="px-4 py-2.5 font-medium">Last Imported</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line/70">
                {pages.map((page) => (
                  <tr key={page.id} className="align-top text-[12px] text-ink-muted">
                    <td className="px-4 py-3">
                      <a href={page.url} target="_blank" rel="noreferrer" className="inline-flex items-start gap-1 text-ink hover:underline">
                        <span className="break-all">{page.url}</span>
                        <ExternalLink className="mt-0.5 size-3 shrink-0" />
                      </a>
                    </td>
                    <td className="px-4 py-3 text-ink">{page.title || "Untitled page"}</td>
                    <td className="px-4 py-3">{formatDateTime(page.importedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="flex h-48 items-center justify-center text-[12px] text-ink-muted">No imported pages match this search.</div>
          )}
        </div>
      </div>
    </div>
  );
}

function WebsiteIntelligenceCard({ profile, importedAt }: { profile: ProjectSiteProfileDocument; importedAt?: string | null }) {
  return (
    <div className="mt-3 rounded-md border border-line bg-background px-3 py-3">
      <div className="text-[12.5px] font-semibold text-ink">QueueWrite analysed {profile.pageCount} priority pages and learned the following about your business.</div>
      <div className="mt-3 grid gap-3 text-[11.5px] sm:grid-cols-2">
        <ProfileLine label="Website" value={profile.domain || "-"} />
        <ProfileLine label="Knowledge Pages Analysed" value={profile.pageCount || "-"} />
        <ProfileLine label="Last Synced" value={formatDate(importedAt ?? profile.generatedAt)} />
        <ProfileLine label="Suggested CTA" value={profile.ctas[0] ?? "-"} />
      </div>
      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <ProfileList title="Learned Services" values={profile.services} limit={10} />
        <ProfileList title="Learned Products / Categories" values={profile.products} limit={10} />
        <ProfileList title="Learned Audiences" values={profile.audiences} limit={8} />
        <ProfileList title="Learned Locations" values={profile.locations} limit={15} />
        <ProfileList title="Writing Preferences" values={profile.writingSignals} />
      </div>
    </div>
  );
}

function ProfileLine({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-line/60 pb-1">
      <span className="text-ink-subtle">{label}</span>
      <span className="text-right font-medium text-ink">{value}</span>
    </div>
  );
}

function ProfileList({ title, values, limit = 8 }: { title: string; values: string[]; limit?: number }) {
  const visible = values.slice(0, limit);
  return (
    <div>
      <div className="mono text-[9.5px] uppercase tracking-[0.14em] text-ink-subtle">{title}</div>
      {visible.length ? (
        <ul className="mt-1 space-y-0.5 text-[11.5px] text-ink-muted">
          {visible.map((value) => <li key={value}>- {value}</li>)}
        </ul>
      ) : (
        <div className="mt-1 text-[11.5px] text-ink-subtle">Not enough signal yet.</div>
      )}
    </div>
  );
}

async function refreshSiteKnowledge(
  projectId: string,
  setSiteKnowledge: (value: ProjectSiteKnowledgeDocument | null) => void,
  setSiteProfile: (value: ProjectSiteProfileDocument | null) => void,
  setSitemapUrl: (value: string) => void,
  setSiteLoading: (value: boolean) => void,
  setSiteError: (value: string | null) => void
) {
  setSiteLoading(true);
  try {
    const res = await fetch(`/api/project/site-knowledge?projectId=${encodeURIComponent(projectId)}`, { cache: "no-store" });
    const data = await res.json().catch(() => ({})) as { siteKnowledge?: ProjectSiteKnowledgeDocument; siteProfile?: ProjectSiteProfileDocument | null; error?: string };
    if (!res.ok) {
      setSiteError(data.error ?? "Could not load site knowledge.");
      setSiteKnowledge(createEmptyProjectSiteKnowledge(projectId));
      return;
    }
    const next = data.siteKnowledge ?? createEmptyProjectSiteKnowledge(projectId);
    setSiteKnowledge(next);
    setSiteProfile(data.siteProfile ?? null);
    setSitemapUrl(next.sitemapUrl ?? "");
    setSiteError(null);
  } finally {
    setSiteLoading(false);
  }
}

async function loadPages(
  projectId: string,
  setPages: (pages: SiteKnowledgePageDocument[]) => void,
  setPagesLoading: (value: boolean) => void,
  setSiteError: (value: string | null) => void,
  setPagesLoaded: (value: boolean) => void
) {
  setPagesLoading(true);
  try {
    const res = await fetch(`/api/project/site-knowledge/pages?projectId=${encodeURIComponent(projectId)}`, { cache: "no-store" });
    const data = await res.json().catch(() => ({})) as { pages?: SiteKnowledgePageDocument[]; error?: string };
    if (!res.ok) {
      setSiteError(data.error ?? "Could not load site pages.");
      return;
    }
    setPages(data.pages ?? []);
    setPagesLoaded(true);
  } finally {
    setPagesLoading(false);
  }
}

function consumeImportBuffer(
  input: string,
  handlers: {
    onProgress: (event: { siteKnowledge?: ProjectSiteKnowledgeDocument; siteProfile?: ProjectSiteProfileDocument }) => void;
    onError: (message: string) => void;
    onComplete: (event: { siteKnowledge?: ProjectSiteKnowledgeDocument; siteProfile?: ProjectSiteProfileDocument }) => void;
  }
) {
  let buffer = input;
  let completed = false;

  while (true) {
    const separator = buffer.indexOf("\n");
    if (separator < 0) break;
    const line = buffer.slice(0, separator).trim();
    buffer = buffer.slice(separator + 1);
    if (!line) continue;
    const event = parseImportEvent(line);
    if (!event) continue;
    if (event.type === "progress") handlers.onProgress(event);
    if (event.type === "complete") {
      handlers.onComplete(event);
      completed = true;
    }
    if (event.type === "error") handlers.onError(event.error ?? "Site import failed.");
  }

  return { buffer, completed };
}

function parseImportEvent(line: string) {
  try {
    return JSON.parse(line) as { type?: string; error?: string; siteKnowledge?: ProjectSiteKnowledgeDocument; siteProfile?: ProjectSiteProfileDocument };
  } catch {
    return null;
  }
}

function formatDateTime(value?: string | null) {
  if (!value) return "Not Configured";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not Configured";
  return date.toLocaleString();
}

function formatDate(value?: string | null) {
  if (!value) return "Not Configured";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not Configured";
  return date.toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" });
}
