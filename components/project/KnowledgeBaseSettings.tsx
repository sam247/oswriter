"use client";

import { CheckCircle2, ChevronDown, ExternalLink, Loader2, Search, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { BUSINESS_TYPE_OPTIONS, type BusinessTypeKey } from "@/lib/project/profile";
import { siteProfileBusinessType, siteProfileEcommerceFacets } from "@/lib/site-profile";
import { createEmptyProjectSiteKnowledge } from "@/lib/site-knowledge-state";
import type { ProjectSiteKnowledgeDocument, ProjectSiteProfileDocument, SiteKnowledgePageDocument } from "@/lib/types";

interface KnowledgeBaseSettingsProps {
  projectId: string;
  businessTypeKey: string;
  businessTypeLabel: string;
  onSaveBusinessType: (businessTypeKey: BusinessTypeKey) => Promise<boolean>;
  disabledReason?: string | null;
}

export function KnowledgeBaseSettings({ projectId, businessTypeKey, businessTypeLabel, onSaveBusinessType, disabledReason }: KnowledgeBaseSettingsProps) {
  const [siteKnowledge, setSiteKnowledge] = useState<ProjectSiteKnowledgeDocument | null>(null);
  const [siteProfile, setSiteProfile] = useState<ProjectSiteProfileDocument | null>(null);
  const [sitemapUrl, setSitemapUrl] = useState("");
  const [siteLoading, setSiteLoading] = useState(true);
  const [siteBusy, setSiteBusy] = useState(false);
  const [forgetting, setForgetting] = useState(false);
  const [forgetOpen, setForgetOpen] = useState(false);
  const [siteError, setSiteError] = useState<string | null>(null);
  const [pagesOpen, setPagesOpen] = useState(false);
  const [pages, setPages] = useState<SiteKnowledgePageDocument[]>([]);
  const [pagesLoading, setPagesLoading] = useState(false);
  const [pagesLoaded, setPagesLoaded] = useState(false);
  const [pageQuery, setPageQuery] = useState("");
  const [selectedBusinessType, setSelectedBusinessType] = useState(businessTypeKey);
  const [businessTypeBusy, setBusinessTypeBusy] = useState(false);

  useEffect(() => {
    setSelectedBusinessType(businessTypeKey);
  }, [businessTypeKey]);

  useEffect(() => {
    void refreshSiteKnowledge(projectId, setSiteKnowledge, setSiteProfile, setSitemapUrl, setSiteLoading, setSiteError);
  }, [projectId]);

  const siteSummary = siteKnowledge ?? createEmptyProjectSiteKnowledge(projectId);
  const hasSiteKnowledge = Boolean(siteProfile || siteSummary.pagesIndexed > 0 || siteSummary.lastImportedAt);
  const discoveryModeActive = siteKnowledgeUsesDiscoveryMode(siteSummary);
  const displayedSiteError = siteError ?? siteSummary.lastError ?? null;
  const websiteInsights = useMemo(() => buildWebsiteUnderstandingInsights(siteProfile, pages), [pages, siteProfile]);

  useEffect(() => {
    if (siteSummary.status !== "ready" || pagesLoaded || pagesLoading) return;
    void loadPages(projectId, setPages, setPagesLoading, setSiteError, setPagesLoaded);
  }, [pagesLoaded, pagesLoading, projectId, siteSummary.status]);

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

  async function updateBusinessType(nextBusinessTypeKey: string) {
    setSelectedBusinessType(nextBusinessTypeKey);
    setBusinessTypeBusy(true);
    const ok = await onSaveBusinessType(nextBusinessTypeKey as BusinessTypeKey);
    if (!ok) setSelectedBusinessType(businessTypeKey);
    setBusinessTypeBusy(false);
  }

  async function forgetSite() {
    setForgetting(true);
    setSiteError(null);
    try {
      const res = await fetch(`/api/project/site-knowledge?projectId=${encodeURIComponent(projectId)}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({})) as { siteKnowledge?: ProjectSiteKnowledgeDocument; error?: string };
      if (!res.ok) {
        setSiteError(data.error ?? "Could not forget website intelligence.");
        return;
      }
      setSiteKnowledge(data.siteKnowledge ?? createEmptyProjectSiteKnowledge(projectId));
      setSiteProfile(null);
      setSitemapUrl("");
      setPages([]);
      setPagesLoaded(false);
      setPageQuery("");
      setPagesOpen(false);
      setForgetOpen(false);
    } catch (error) {
      setSiteError(error instanceof Error ? error.message : "Could not forget website intelligence.");
    } finally {
      setForgetting(false);
    }
  }

  return (
    <>
      <details className="group w-full rounded-md border border-line bg-surface-1">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3.5 [&::-webkit-details-marker]:hidden">
          <div className="min-w-0">
            <div className="text-[13px] font-semibold text-ink">Website Intelligence</div>
            <div className="mono mt-0.5 text-[10px] text-ink-subtle">
              {siteProfile ? "Website understood" : "Import a sitemap to learn this business"}
            </div>
          </div>
          <ChevronDown className="size-4 shrink-0 text-ink-subtle transition-transform group-open:rotate-180" aria-hidden="true" />
        </summary>

        <div className="border-t border-line px-4 pb-4 pt-3">
          {siteProfile && siteSummary.status === "ready" ? (
            <>
              {/* Primary: what QueueWrite has understood */}
              <WebsiteUnderstandingCard profile={siteProfile} insights={websiteInsights} />

              {/* Secondary: import metadata */}
              {!siteLoading && siteSummary.lastImportedAt && (
                <div className="mt-3 space-y-1 rounded-md border border-line bg-surface-2 px-3 py-2.5 text-[12px] text-ink-muted">
                  <div className="flex items-center justify-between gap-4">
                    <span>Last analysed</span>
                    <span className="text-right text-ink">{formatDateTime(siteSummary.lastImportedAt)}</span>
                  </div>
                  <div className="flex items-center justify-between gap-4">
                    <span>Pages analysed</span>
                    <span className="text-right text-ink">{siteSummary.pagesIndexed}</span>
                  </div>
                  {siteSummary.startedAt && siteSummary.completedAt && (
                    <div className="flex items-center justify-between gap-4">
                      <span>Import duration</span>
                      <span className="text-right text-ink">{formatDuration(siteSummary.startedAt, siteSummary.completedAt)}</span>
                    </div>
                  )}
                </div>
              )}

              {/* Import controls — de-emphasised when already understood */}
              <div className="mt-3 rounded-md border border-line bg-surface-2 p-3">
                <div className="mono mb-2 text-[10px] uppercase tracking-[0.14em] text-ink-subtle">Reanalyse or manage</div>
                <label className="block text-[12px] text-ink-muted">
                  <span>Website Type</span>
                  <select
                    value={selectedBusinessType}
                    disabled={businessTypeBusy || siteBusy || forgetting || Boolean(disabledReason)}
                    title={disabledReason ?? "Website Intelligence business type"}
                    onChange={(event) => void updateBusinessType(event.currentTarget.value)}
                    className="mt-1 h-9 w-full rounded border border-line bg-background px-2.5 text-[13px] text-ink outline-none focus:border-ink disabled:opacity-50"
                  >
                    {BUSINESS_TYPE_OPTIONS.map((option) => <option key={option.key} value={option.key}>{option.label}</option>)}
                  </select>
                </label>
                <label className="mt-2 block text-[12px] text-ink-muted">
                  <span>Sitemap URL</span>
                  <input
                    value={sitemapUrl}
                    onChange={(event) => setSitemapUrl(event.currentTarget.value)}
                    placeholder="https://example.com/sitemap.xml"
                    className="mt-1 h-9 w-full rounded border border-line bg-background px-2.5 text-[13px] text-ink outline-none placeholder:text-ink-subtle focus:border-ink"
                  />
                </label>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    disabled={siteBusy || siteLoading || forgetting || Boolean(disabledReason)}
                    title={disabledReason ?? "Reanalyse priority pages from this sitemap"}
                    onClick={() => void importSite()}
                    className="inline-flex h-8 items-center gap-1 rounded-md bg-ink px-3 text-[11.5px] font-medium text-white disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {siteBusy ? <Loader2 className="size-3.5 animate-spin" /> : null}
                    {siteBusy ? "Importing…" : "Reanalyse Site"}
                  </button>
                  <button
                    type="button"
                    disabled={siteBusy || forgetting || pages.length === 0}
                    onClick={() => void openPages()}
                    className="h-8 rounded-md border border-line bg-background px-3 text-[11.5px] font-medium text-ink disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    View Pages
                  </button>
                  <button
                    type="button"
                    disabled={siteBusy || forgetting || Boolean(disabledReason)}
                    title={disabledReason ?? "Forget imported website intelligence"}
                    onClick={() => setForgetOpen(true)}
                    className="inline-flex h-8 items-center gap-1 rounded-md border border-danger/40 bg-danger/10 px-3 text-[11.5px] font-medium text-danger disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {forgetting ? <Loader2 className="size-3.5 animate-spin" /> : null}
                    Forget Site
                  </button>
                </div>
                {displayedSiteError && <div className="mt-2 text-[11px] text-warn">{displayedSiteError}</div>}
              </div>
            </>
          ) : (
            <>
              {/* No profile yet — show full import form */}
              <p className="text-[11.5px] leading-relaxed text-ink-muted">Import a sitemap so QueueWrite can learn services, brands, categories, audiences, locations, CTAs, and writing signals directly from the website.</p>

              <div className="mt-4 rounded-md border border-line bg-surface-2 p-3">
                <p className="text-[11.5px] leading-relaxed text-ink-muted">This profile becomes the foundation for generation, SEO suggestions, internal links, entity detection, topical authority, and CTA recommendations. If sitemap access is unavailable, QueueWrite falls back to website discovery mode.</p>

                <label className="mt-3 block text-[12px] text-ink-muted">
                  <span>Website Type</span>
                  <select
                    value={selectedBusinessType}
                    disabled={businessTypeBusy || siteBusy || forgetting || Boolean(disabledReason)}
                    title={disabledReason ?? "Website Intelligence business type"}
                    onChange={(event) => void updateBusinessType(event.currentTarget.value)}
                    className="mt-1 h-9 w-full rounded border border-line bg-background px-2.5 text-[13px] text-ink outline-none focus:border-ink disabled:opacity-50"
                  >
                    {BUSINESS_TYPE_OPTIONS.map((option) => <option key={option.key} value={option.key}>{option.label}</option>)}
                  </select>
                </label>
                <div className="mt-1 text-[10.5px] text-ink-subtle">Current strategy: {businessTypeLabel}</div>

                <label className="mt-3 block text-[12px] text-ink-muted">
                  <span>Sitemap URL</span>
                  <input
                    value={sitemapUrl}
                    onChange={(event) => setSitemapUrl(event.currentTarget.value)}
                    placeholder="https://example.com/sitemap.xml"
                    className="mt-1 h-9 w-full rounded border border-line bg-background px-2.5 text-[13px] text-ink outline-none placeholder:text-ink-subtle focus:border-ink"
                  />
                </label>
                <div className="mt-1 text-[10.5px] text-ink-subtle">Example: `https://example.com/sitemap.xml` or `https://example.com`</div>

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    disabled={siteBusy || siteLoading || forgetting || Boolean(disabledReason)}
                    title={disabledReason ?? "Import site pages from this sitemap"}
                    onClick={() => void importSite()}
                    className="inline-flex h-8 items-center gap-1 rounded-md bg-ink px-3 text-[11.5px] font-medium text-white disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {siteBusy ? <Loader2 className="size-3.5 animate-spin" /> : null}
                    {siteBusy ? "Importing…" : "Import Site"}
                  </button>
                  <button
                    type="button"
                    disabled={siteBusy || forgetting || (siteSummary.pagesIndexed === 0 && pages.length === 0)}
                    onClick={() => void openPages()}
                    className="h-8 rounded-md border border-line bg-background px-3 text-[11.5px] font-medium text-ink disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    View Pages
                  </button>
                </div>

                {siteSummary.status === "importing" && (
                  <div className="mt-3 rounded-md border border-line bg-background px-3 py-2.5">
                    <div className="mono text-[10px] uppercase tracking-[0.16em] text-ink-subtle">Importing</div>
                    <div className="mt-2 space-y-1 text-[12px] text-ink-muted">
                      <div className="flex items-center justify-between gap-4">
                        <span>Progress</span>
                        <span className="text-right text-ink">{siteSummary.processedPages}/{Math.max(siteSummary.totalDiscoveredUrls, siteSummary.processedPages || 0, 1)}</span>
                      </div>
                      {siteSummary.currentUrl && (
                        <div className="border-t border-line pt-2 text-[11px] text-ink-subtle">{siteSummary.currentUrl}</div>
                      )}
                    </div>
                  </div>
                )}

                {!siteLoading && siteSummary.lastImportedAt && siteSummary.status !== "importing" && (
                  <div className="mt-3 space-y-1 rounded-md border border-line bg-background px-3 py-2.5 text-[12px] text-ink-muted">
                    <div className="flex items-center justify-between gap-4">
                      <span>Last analysed</span>
                      <span className="text-right text-ink">{formatDateTime(siteSummary.lastImportedAt)}</span>
                    </div>
                    <div className="flex items-center justify-between gap-4">
                      <span>Pages analysed</span>
                      <span className="text-right text-ink">{siteSummary.pagesIndexed}</span>
                    </div>
                    {siteSummary.startedAt && siteSummary.completedAt && (
                      <div className="flex items-center justify-between gap-4">
                        <span>Import duration</span>
                        <span className="text-right text-ink">{formatDuration(siteSummary.startedAt, siteSummary.completedAt)}</span>
                      </div>
                    )}
                  </div>
                )}

                {discoveryModeActive && <div className="mt-3 text-[11px] text-ink">Website Intelligence completed using website discovery mode.</div>}
                {displayedSiteError && <div className="mt-3 text-[11px] text-warn">{displayedSiteError}</div>}
              </div>
            </>
          )}

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
      {forgetOpen && (
        <ForgetSiteDialog
          busy={forgetting}
          onCancel={() => setForgetOpen(false)}
          onConfirm={() => void forgetSite()}
        />
      )}
    </>
  );
}

function ForgetSiteDialog({ busy, onCancel, onConfirm }: { busy: boolean; onCancel: () => void; onConfirm: () => void }) {
  return (
    <div className="fixed inset-0 z-50 bg-black/20 px-4 pt-[20vh] backdrop-blur-sm" onMouseDown={busy ? undefined : onCancel}>
      <div className="mx-auto w-full max-w-md rounded-lg border border-line bg-surface-1 p-4 shadow-2xl" onMouseDown={(event) => event.stopPropagation()}>
        <div className="text-[15px] font-semibold text-ink">Forget Website Intelligence?</div>
        <div className="mt-3 text-[12px] leading-relaxed text-ink-muted">
          <p>This will remove:</p>
          <ul className="mt-2 space-y-1">
            <li>- Imported pages</li>
            <li>- Learned services</li>
            <li>- Learned audiences</li>
            <li>- Learned locations</li>
            <li>- Learned categories</li>
            <li>- Generated profile data</li>
          </ul>
          <p className="mt-3 font-medium text-ink">This action cannot be undone.</p>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={onCancel}
            className="h-8 rounded-md border border-line bg-background px-3 text-[12px] font-medium text-ink disabled:opacity-40"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onConfirm}
            className="inline-flex h-8 items-center gap-1 rounded-md bg-danger px-3 text-[12px] font-medium text-white disabled:opacity-40"
          >
            {busy ? <Loader2 className="size-3.5 animate-spin" /> : null}
            Forget Site
          </button>
        </div>
      </div>
    </div>
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

function WebsiteUnderstandingCard({
  profile,
  insights
}: {
  profile: ProjectSiteProfileDocument;
  insights: string[];
}) {
  const businessType = siteProfileBusinessType(profile);
  const ecommerce = siteProfileEcommerceFacets(profile);
  const analysedCount = Math.max(profile.pageCount, 0);
  const visibleInsights = insights.slice(0, 6);

  return (
    <div className="mt-3 rounded-md border border-line bg-background px-3 py-3">
      <div className="flex items-center gap-2 text-[13px] font-semibold text-ink">
        <CheckCircle2 className="size-4 shrink-0 text-success" />
        <span>{analysedCount.toLocaleString()} {analysedCount === 1 ? "page" : "pages"} analysed</span>
      </div>
      <div className="mt-3 text-[12.5px] font-semibold text-ink">Website understood</div>
      <div className="mt-1 text-[11.5px] leading-relaxed text-ink-muted">QueueWrite identified:</div>
      <ul className="mt-3 grid gap-1.5 text-[12px] leading-relaxed text-ink sm:grid-cols-2">
        {businessUnderstandingSignals(profile).map((signal) => (
          <li key={signal} className="flex gap-2">
            <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-success" aria-hidden="true" />
            <span>{signal}</span>
          </li>
        ))}
      </ul>
      <div className="mt-3 text-[11.5px] leading-relaxed text-ink-muted">Concise summary:</div>
      <ul className="mt-3 space-y-2 text-[12px] leading-relaxed text-ink">
        {visibleInsights.map((insight) => (
          <li key={insight} className="flex gap-2">
            <span className="mt-[6px] size-1.5 shrink-0 rounded-full bg-success" aria-hidden="true" />
            <span>{insight}</span>
          </li>
        ))}
      </ul>
      {visibleInsights.length < 3 ? (
        <div className="mt-3 text-[11px] text-ink-muted">
          QueueWrite will surface more specific understanding as additional high-confidence signals appear in the imported pages.
        </div>
      ) : null}
      {(businessType === "ecommerce" || businessType === "mixed") && (ecommerce.brands.length > 0 || ecommerce.categories.length > 0 || ecommerce.productTypes.length > 0) ? (
        <div className="mt-4 rounded-md border border-line bg-surface-1 px-3 py-2.5 text-[11px] text-ink-muted">
          {[
            ecommerce.brands.length ? `Brands: ${ecommerce.brands.slice(0, 3).join(", ")}` : "",
            ecommerce.categories.length ? `Categories: ${ecommerce.categories.slice(0, 3).join(", ")}` : "",
            ecommerce.productTypes.length ? `Product types: ${ecommerce.productTypes.slice(0, 3).join(", ")}` : ""
          ].filter(Boolean).join(" · ")}
        </div>
      ) : null}
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

function siteKnowledgeUsesDiscoveryMode(siteKnowledge: ProjectSiteKnowledgeDocument | null) {
  return Boolean(siteKnowledge?.metadata?.discoveryMode || siteKnowledge?.metadata?.crawlMode === "discovery");
}

function formatDuration(startedAt?: string | null, completedAt?: string | null) {
  if (!startedAt || !completedAt) return "Not available";
  const start = new Date(startedAt).getTime();
  const end = new Date(completedAt).getTime();
  if (Number.isNaN(start) || Number.isNaN(end) || end <= start) return "Not available";
  const seconds = Math.max(1, Math.round((end - start) / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  if (!remainingSeconds) return `${minutes}m`;
  return `${minutes}m ${remainingSeconds}s`;
}

function businessUnderstandingSignals(profile: ProjectSiteProfileDocument) {
  const graph = profile.businessIntelligence;
  const signals = [
    "Editorial positioning",
    profile.services.length || profile.products.length ? "Core services" : "",
    graph?.authority.length ? "Authority signals" : "",
    graph?.trust.length ? "Certifications and trust evidence" : "",
    profile.audiences.length ? "Audience" : "",
    profile.writingSignals.length || profile.ctas.length ? "Brand tone" : "",
    graph?.assets.length ? "Internal assets" : "",
    graph?.internalLinks.length ? "Internal linking opportunities" : ""
  ].filter(Boolean);
  return signals.length ? signals.slice(0, 8) : ["Editorial positioning", "Audience", "Brand tone"];
}

function buildWebsiteUnderstandingInsights(profile: ProjectSiteProfileDocument | null, pages: SiteKnowledgePageDocument[]) {
  if (!profile) return [];

  const businessType = siteProfileBusinessType(profile);
  const ecommerce = siteProfileEcommerceFacets(profile);
  const insights: string[] = [];
  const pushInsight = (value: string | null | undefined) => {
    if (!value || insights.includes(value)) return;
    insights.push(value);
  };

  const services = topConfidenceLabels(profile, "services", profile.services, 3);
  const products = topConfidenceLabels(profile, "products", profile.products, 3);
  const audiences = topConfidenceLabels(profile, "audiences", profile.audiences, 3);
  const locations = topConfidenceLabels(profile, "locations", profile.locations, 3);
  const categories = ecommerce.categories.slice(0, 3);
  const brands = ecommerce.brands.slice(0, 3);
  const productTypes = ecommerce.productTypes.slice(0, 3);

  if ((businessType === "service" || businessType === "unknown") && services.length) {
    pushInsight(`Your business focuses on ${listToEnglish(services.slice(0, 2))}.`);
  } else if (businessType === "mixed" && services.length && (categories.length || productTypes.length)) {
    pushInsight(`Your positioning combines ${listToEnglish(services.slice(0, 2))} with ${listToEnglish((categories.length ? categories : productTypes).slice(0, 2))}.`);
  } else if ((businessType === "ecommerce" || businessType === "mixed") && (categories.length || productTypes.length || brands.length)) {
    const commerceFocus = categories.length ? categories : productTypes.length ? productTypes : brands;
    pushInsight(`Your website is centred on ${listToEnglish(commerceFocus.slice(0, 2))}.`);
  } else if (products.length) {
    pushInsight(`Your website consistently highlights ${listToEnglish(products.slice(0, 2))}.`);
  }

  if (audiences.length) {
    pushInsight(`You are speaking primarily to ${listToEnglish(audiences.slice(0, 2))}.`);
  }

  if (profile.ctas[0]) {
    pushInsight(`Your preferred call-to-action is "${profile.ctas[0]}".`);
  }

  pushInsight(writingInsight(profile.writingSignals));

  for (const theme of recurringThemeInsights(pages)) {
    pushInsight(theme);
    if (insights.length >= 6) break;
  }

  if (locations.length && insights.length < 6) {
    pushInsight(`Location signals suggest a focus on ${listToEnglish(locations.slice(0, 2))}.`);
  }

  if (brands.length && insights.length < 6 && !insights.some((insight) => insight.includes("brands such as"))) {
    pushInsight(`The site reinforces trust through brands such as ${listToEnglish(brands.slice(0, 2))}.`);
  }

  return insights.slice(0, Math.min(6, Math.max(3, insights.length)));
}

function topConfidenceLabels(
  profile: ProjectSiteProfileDocument,
  key: "services" | "products" | "audiences" | "locations",
  fallback: string[],
  limit: number
) {
  const confidence = confidenceEntries(profile, key)
    .filter((entry) => entry.score >= confidenceFloor(key))
    .map((entry) => entry.label);
  return uniqueValues((confidence.length ? confidence : fallback).slice(0, limit));
}

function confidenceEntries(
  profile: ProjectSiteProfileDocument,
  key: "services" | "products" | "audiences" | "locations"
) {
  const metadata = isRecord(profile.metadata) ? profile.metadata : {};
  const confidence = isRecord(metadata.confidence) ? metadata.confidence : {};
  const values = confidence[key];
  if (!Array.isArray(values)) return [];
  return values
    .filter((item): item is { label: string; score: number } => isRecord(item) && typeof item.label === "string" && typeof item.score === "number")
    .sort((left, right) => right.score - left.score);
}

function confidenceFloor(key: "services" | "products" | "audiences" | "locations") {
  if (key === "services" || key === "products") return 8;
  if (key === "audiences") return 4;
  return 5;
}

function writingInsight(signals: string[]) {
  const hasUkEnglish = signals.includes("UK English");
  const hasIndustryTerms = signals.includes("Industry terminology detected");
  if (hasUkEnglish && hasIndustryTerms) return "Content should use UK English and precise industry terminology.";
  if (hasIndustryTerms) return "Content should use precise industry terminology rather than generic marketing language.";
  if (hasUkEnglish) return "Content should follow UK English conventions.";
  return null;
}

function recurringThemeInsights(pages: SiteKnowledgePageDocument[]) {
  if (!pages.length) return [];
  const combined = pages
    .map((page) => `${page.title} ${page.h1} ${page.metaDescription} ${page.shortSummary}`.toLowerCase())
    .join(" ");

  const themes = [
    {
      sentence: "Review gates and acceptance standards are recurring themes.",
      score: themeScore(combined, /\breview(?:ed|ing)?\b/g) + themeScore(combined, /\bacceptance standards?\b/g) + themeScore(combined, /\bapproval workflows?\b/g)
    },
    {
      sentence: "Editorial quality and evidence-backed output are recurring themes.",
      score: themeScore(combined, /\beditorial quality\b/g) + themeScore(combined, /\bquality\b/g) + themeScore(combined, /\bevidence(?:-backed)?\b/g) + themeScore(combined, /\bvalidation\b/g)
    },
    {
      sentence: "Your positioning centres on systematic content operations.",
      score: themeScore(combined, /\bcontent operations?\b/g) + themeScore(combined, /\bworkflow(?:s)?\b/g) + themeScore(combined, /\bpipeline(?:s)?\b/g) + themeScore(combined, /\bqueue\b/g)
    },
    {
      sentence: "The site frames the offer as engineering-led rather than generic AI output.",
      score: themeScore(combined, /\bengineering\b/g) + themeScore(combined, /\bengineered\b/g) + themeScore(combined, /\btechnical\b/g) + themeScore(combined, /\bgeneric ai\b/g)
    },
    {
      sentence: "Search visibility and website structure are recurring priorities.",
      score: themeScore(combined, /\bseo\b/g) + themeScore(combined, /\bsearch\b/g) + themeScore(combined, /\binternal links?\b/g) + themeScore(combined, /\bsitemap\b/g)
    },
    {
      sentence: "Specialist expertise and credibility are being used as trust signals.",
      score: themeScore(combined, /\bexpertise\b/g) + themeScore(combined, /\bspecialists?\b/g) + themeScore(combined, /\btrusted\b/g) + themeScore(combined, /\bcredibility\b/g)
    }
  ];

  return themes
    .filter((theme) => theme.score >= 2)
    .sort((left, right) => right.score - left.score)
    .map((theme) => theme.sentence)
    .slice(0, 2);
}

function themeScore(text: string, pattern: RegExp) {
  return text.match(pattern)?.length ?? 0;
}

function listToEnglish(values: string[]) {
  const visible = uniqueValues(values);
  if (!visible.length) return "";
  if (visible.length === 1) return visible[0] ?? "";
  if (visible.length === 2) return `${visible[0]} and ${visible[1]}`;
  return `${visible.slice(0, -1).join(", ")}, and ${visible.at(-1)}`;
}

function uniqueValues(values: string[]) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
