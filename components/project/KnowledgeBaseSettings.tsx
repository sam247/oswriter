"use client";

import { ChevronDown, ExternalLink, Loader2, Search, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { normalizeProjectKnowledgeBase } from "@/lib/project/knowledge-base";
import { createEmptyProjectSiteKnowledge } from "@/lib/site-knowledge-state";
import type { ProjectKnowledgeBase, ProjectSiteKnowledgeDocument, SiteKnowledgePageDocument } from "@/lib/types";

interface KnowledgeBaseSettingsProps {
  projectId: string;
  knowledgeBase?: ProjectKnowledgeBase;
  disabledReason?: string | null;
  onSave: (knowledgeBase: ProjectKnowledgeBase) => void;
}

const TEXT_AREAS: Array<{ key: keyof ProjectKnowledgeBase; label: string; placeholder: string }> = [
  { key: "aboutBusiness", label: "About The Business", placeholder: "What the business does, how it operates, and what makes it distinct." },
  { key: "services", label: "Services", placeholder: "One service per line or a short service summary." },
  { key: "products", label: "Products", placeholder: "Products or product categories relevant to future articles." },
  { key: "targetCustomer", label: "Target Customer", placeholder: "Who the business serves and what matters to them." },
  { key: "writingRules", label: "Writing Rules", placeholder: "For example: Use UK English. Avoid medical claims." },
  { key: "preferredCTA", label: "Preferred CTA", placeholder: "For example: Book a screening appointment." }
];

export function KnowledgeBaseSettings({ projectId, knowledgeBase, disabledReason, onSave }: KnowledgeBaseSettingsProps) {
  const normalized = useMemo(() => normalizeProjectKnowledgeBase(knowledgeBase), [knowledgeBase]);
  const [draft, setDraft] = useState(normalized);
  const [siteKnowledge, setSiteKnowledge] = useState<ProjectSiteKnowledgeDocument | null>(null);
  const [sitemapUrl, setSitemapUrl] = useState("");
  const [siteLoading, setSiteLoading] = useState(true);
  const [siteBusy, setSiteBusy] = useState(false);
  const [siteError, setSiteError] = useState<string | null>(null);
  const [pagesOpen, setPagesOpen] = useState(false);
  const [pages, setPages] = useState<SiteKnowledgePageDocument[]>([]);
  const [pagesLoading, setPagesLoading] = useState(false);
  const [pagesLoaded, setPagesLoaded] = useState(false);
  const [pageQuery, setPageQuery] = useState("");

  useEffect(() => setDraft(normalized), [normalized]);
  useEffect(() => {
    void refreshSiteKnowledge(projectId, setSiteKnowledge, setSitemapUrl, setSiteLoading, setSiteError);
  }, [projectId]);

  const dirty = JSON.stringify(draft) !== JSON.stringify(normalized);
  const configured = Object.values(normalized).some(Boolean);
  const siteSummary = siteKnowledge ?? createEmptyProjectSiteKnowledge(projectId);
  const filteredPages = useMemo(() => {
    const needle = pageQuery.trim().toLowerCase();
    if (!needle) return pages;
    return pages.filter((page) => page.url.toLowerCase().includes(needle) || page.title.toLowerCase().includes(needle));
  }, [pageQuery, pages]);

  function update(key: keyof ProjectKnowledgeBase, value: string) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

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
        await refreshSiteKnowledge(projectId, setSiteKnowledge, setSitemapUrl, setSiteLoading, setSiteError);
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
        }
      }));

      await refreshSiteKnowledge(projectId, setSiteKnowledge, setSitemapUrl, setSiteLoading, setSiteError);
      setPagesLoaded(false);
      if (pagesOpen || completed) await loadPages(projectId, setPages, setPagesLoading, setSiteError, setPagesLoaded);
    } catch (error) {
      setSiteError(error instanceof Error ? error.message : "Site import failed.");
      await refreshSiteKnowledge(projectId, setSiteKnowledge, setSitemapUrl, setSiteLoading, setSiteError);
    } finally {
      setSiteBusy(false);
    }
  }

  return (
    <>
      <details className="group mt-4 rounded-md border border-line bg-surface-1">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3.5 [&::-webkit-details-marker]:hidden">
          <div className="min-w-0">
            <div className="text-[13px] font-semibold text-ink">Knowledge Base <span className="font-normal text-ink-subtle">(Optional)</span></div>
            <div className="mono mt-0.5 text-[10px] text-ink-subtle">{configured ? "Configured" : "Not configured"}</div>
          </div>
          <ChevronDown className="size-4 shrink-0 text-ink-subtle transition-transform group-open:rotate-180" aria-hidden="true" />
        </summary>

        <div className="border-t border-line px-4 pb-4 pt-3">
          <p className="text-[11.5px] leading-relaxed text-ink-muted">Provide additional information about your business, services and audience to improve article planning and generation.</p>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <KnowledgeInput label="Brand Name" value={draft.brandName} placeholder="Business or brand name" onChange={(value) => update("brandName", value)} />
            <KnowledgeInput label="Website" value={draft.website} placeholder="https://example.com" onChange={(value) => update("website", value)} />
          </div>

          <div className="mt-3 space-y-3">
            {TEXT_AREAS.map((field) => (
              <label key={field.key} className="block text-[12px] text-ink-muted">
                <span>{field.label}</span>
                <textarea
                  value={draft[field.key]}
                  onChange={(event) => update(field.key, event.currentTarget.value)}
                  placeholder={field.placeholder}
                  rows={field.key === "aboutBusiness" || field.key === "writingRules" ? 4 : 3}
                  className="mt-1 w-full resize-y rounded border border-line bg-background px-2.5 py-2 text-[13px] leading-relaxed text-ink outline-none placeholder:text-ink-subtle focus:border-ink"
                />
              </label>
            ))}
          </div>

          <div className="mt-4 rounded-md border border-line bg-surface-2 p-3">
            <div className="text-[13px] font-semibold text-ink">Site Knowledge</div>
            <p className="mt-1 text-[11.5px] leading-relaxed text-ink-muted">Import pages from your website to improve future SEO and internal linking recommendations.</p>

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
                    <span>Pages Indexed</span>
                    <span className="text-right text-ink">{siteSummary.pagesIndexed}</span>
                  </div>
                  {siteSummary.status === "importing" && siteSummary.currentUrl && (
                    <div className="border-t border-line pt-2 text-[11px] text-ink-subtle">{siteSummary.currentUrl}</div>
                  )}
                </div>
              )}
            </div>

            {siteError && <div className="mt-3 text-[11px] text-warn">{siteError}</div>}
          </div>

          {disabledReason && <div className="mt-3 text-[11px] text-warn">{disabledReason}</div>}
          <div className="mt-4 flex justify-end">
            <button
              type="button"
              disabled={!dirty || Boolean(disabledReason)}
              title={disabledReason ?? "Save project knowledge base"}
              onClick={() => onSave(normalizeProjectKnowledgeBase(draft))}
              className="h-8 rounded-md bg-ink px-3 text-[11.5px] font-medium text-white disabled:cursor-not-allowed disabled:opacity-40"
            >
              Save Knowledge Base
            </button>
          </div>
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

function KnowledgeInput({ label, value, placeholder, onChange }: { label: string; value: string; placeholder: string; onChange: (value: string) => void }) {
  return (
    <label className="block text-[12px] text-ink-muted">
      <span>{label}</span>
      <input
        value={value}
        onChange={(event) => onChange(event.currentTarget.value)}
        placeholder={placeholder}
        className="mt-1 h-9 w-full rounded border border-line bg-background px-2.5 text-[13px] text-ink outline-none placeholder:text-ink-subtle focus:border-ink"
      />
    </label>
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

async function refreshSiteKnowledge(
  projectId: string,
  setSiteKnowledge: (value: ProjectSiteKnowledgeDocument | null) => void,
  setSitemapUrl: (value: string) => void,
  setSiteLoading: (value: boolean) => void,
  setSiteError: (value: string | null) => void
) {
  setSiteLoading(true);
  try {
    const res = await fetch(`/api/project/site-knowledge?projectId=${encodeURIComponent(projectId)}`, { cache: "no-store" });
    const data = await res.json().catch(() => ({})) as { siteKnowledge?: ProjectSiteKnowledgeDocument; error?: string };
    if (!res.ok) {
      setSiteError(data.error ?? "Could not load site knowledge.");
      setSiteKnowledge(createEmptyProjectSiteKnowledge(projectId));
      return;
    }
    const next = data.siteKnowledge ?? createEmptyProjectSiteKnowledge(projectId);
    setSiteKnowledge(next);
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
    onProgress: (event: { siteKnowledge?: ProjectSiteKnowledgeDocument }) => void;
    onError: (message: string) => void;
    onComplete: (event: { siteKnowledge?: ProjectSiteKnowledgeDocument }) => void;
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
    return JSON.parse(line) as { type?: string; error?: string; siteKnowledge?: ProjectSiteKnowledgeDocument };
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
