import { createHash } from "node:crypto";
import { nowIso } from "@/lib/defaults";
import type { BusinessTypeKey } from "@/lib/project/profile";
import { createEmptyProjectSiteKnowledge } from "@/lib/site-knowledge-state";
import { extractProjectSiteProfile } from "@/lib/site-profile";
import type { WorkspaceStore } from "@/lib/storage/storage";
import type { ProjectSiteKnowledgeDocument, ProjectSiteProfileDocument, SiteKnowledgePageDocument } from "@/lib/types";

export const SITE_KNOWLEDGE_MAX_URLS = 50;
const SITE_KNOWLEDGE_MAX_CANDIDATE_URLS = 500;
const SERVICE_PAGE_TERMS = [
  "service",
  "services",
  "solution",
  "solutions",
  "category",
  "categories",
  "product",
  "products",
  "groundworks",
  "earthworks",
  "excavation",
  "piling",
  "underpinning",
  "foundation",
  "drainage",
  "demolition",
  "utilities",
  "basement",
  "concrete"
];
const ABOUT_PAGE_TERMS = ["about", "about-us", "our-story", "story", "who-we-are", "company", "our-brand"];
const BRAND_PAGE_TERMS = ["brand", "brands", "designer", "designers", "makers", "label", "labels"];
const COLLECTION_PAGE_TERMS = ["collection", "collections", "range", "ranges", "shop"];
const PRODUCT_PAGE_TERMS = ["product", "products", "item", "items"];
const UTILITY_NAV_TERMS = ["utility", "topbar", "top-bar", "topnav", "top-nav", "meta-nav", "quick-links", "account", "help", "support", "store-info", "store-information"];

interface SiteKnowledgeNavigationTargets {
  footer: string[];
  header: string[];
  utility: string[];
  primary: string[];
}

interface ImportSiteKnowledgeOptions {
  projectId: string;
  sitemapUrl: string;
  configuredBusinessType?: BusinessTypeKey;
  store: WorkspaceStore;
  fetcher?: typeof fetch;
  onProgress?: (siteKnowledge: ProjectSiteKnowledgeDocument) => void | Promise<void>;
}

interface ImportSiteKnowledgeResult {
  siteKnowledge: ProjectSiteKnowledgeDocument;
  siteProfile: ProjectSiteProfileDocument;
  pages: SiteKnowledgePageDocument[];
}

interface SitemapParseResult {
  pageUrls: string[];
  sitemapUrls: string[];
}

interface ExtractedPageFields {
  title: string;
  h1: string;
  metaDescription: string;
  shortSummary: string;
}

class SiteKnowledgeFetchError extends Error {
  url: string;
  status: number;

  constructor(url: string, status: number) {
    super(`Failed to fetch ${url}: ${status}`);
    this.name = "SiteKnowledgeFetchError";
    this.url = url;
    this.status = status;
  }
}

export async function importSiteKnowledge({
  projectId,
  sitemapUrl,
  configuredBusinessType = "auto_detect",
  store,
  fetcher = fetch,
  onProgress
}: ImportSiteKnowledgeOptions): Promise<ImportSiteKnowledgeResult> {
  const existing = await store.getProjectSiteKnowledge(projectId);
  const now = nowIso();
  const normalizedSitemapUrl = normalizeSiteKnowledgeUrl(sitemapUrl);
  const baseStatus: ProjectSiteKnowledgeDocument = {
    ...(existing ?? createEmptyProjectSiteKnowledge(projectId, normalizedSitemapUrl)),
    projectId,
    sitemapUrl: normalizedSitemapUrl,
    status: "importing",
    pagesIndexed: existing?.pagesIndexed ?? 0,
    processedPages: 0,
    totalDiscoveredUrls: 0,
    startedAt: now,
    completedAt: null,
    currentUrl: null,
    lastError: null,
    updatedAt: now
  };
  await persistSiteKnowledgeStatus(store, baseStatus, onProgress);

  try {
    const urls = await collectSitemapUrls(fetcher, normalizedSitemapUrl, SITE_KNOWLEDGE_MAX_URLS);
    const pages: SiteKnowledgePageDocument[] = [];
    const failedUrls: string[] = [];
    let progress = {
      ...baseStatus,
      totalDiscoveredUrls: urls.length,
      updatedAt: nowIso()
    };
    await persistSiteKnowledgeStatus(store, progress, onProgress);

    for (const [index, url] of urls.entries()) {
      const importedAt = nowIso();
      progress = {
        ...progress,
        currentUrl: url,
        processedPages: index,
        updatedAt: importedAt
      };
      await persistSiteKnowledgeStatus(store, progress, onProgress);

      try {
        const html = await fetchSiteText(fetcher, url, "text/html,application/xhtml+xml");
        const extracted = extractSiteKnowledgePageFields(html);
        const page: SiteKnowledgePageDocument = {
          id: siteKnowledgePageId(url),
          projectId,
          url,
          title: extracted.title,
          h1: extracted.h1,
          metaDescription: extracted.metaDescription,
          shortSummary: extracted.shortSummary,
          importedAt,
          updatedAt: importedAt,
          metadata: {}
        };
        pages.push(page);
        await store.saveProjectSiteKnowledgePage(page);
      } catch {
        failedUrls.push(url);
      }

      progress = {
        ...progress,
        processedPages: index + 1,
        pagesIndexed: pages.length,
        metadata: failedUrls.length ? { failedCount: failedUrls.length } : {},
        updatedAt: nowIso()
      };
      await persistSiteKnowledgeStatus(store, progress, onProgress);
    }

    const existingPages = await store.listProjectSiteKnowledgePages(projectId);
    const importedIds = new Set(pages.map((page) => page.id));
    const stalePages = existingPages.filter((page) => !importedIds.has(page.id));
    await Promise.all(stalePages.map((page) => store.deleteProjectSiteKnowledgePage(page.id, projectId)));

    const completedAt = nowIso();
    const siteKnowledge: ProjectSiteKnowledgeDocument = {
      ...progress,
      status: "ready",
      pagesIndexed: pages.length,
      processedPages: urls.length,
      totalDiscoveredUrls: urls.length,
      completedAt,
      lastImportedAt: completedAt,
      currentUrl: null,
      lastError: null,
      metadata: {
        failedCount: failedUrls.length,
        staleDeletedCount: stalePages.length
      },
      updatedAt: completedAt
    };
    const siteProfile = extractProjectSiteProfile({
      projectId,
      organisationId: siteKnowledge.organisationId,
      sitemapUrl: normalizedSitemapUrl,
      pages,
      configuredBusinessType
    });
    await store.saveProjectSiteProfile(siteProfile);
    await persistSiteKnowledgeStatus(store, siteKnowledge, onProgress);
    return { siteKnowledge, siteProfile, pages };
  } catch (error) {
    const failedAt = nowIso();
    const failedStatus: ProjectSiteKnowledgeDocument = {
      ...baseStatus,
      status: "failed",
      completedAt: failedAt,
      currentUrl: null,
      lastError: error instanceof Error ? error.message : "Site import failed.",
      updatedAt: failedAt
    };
    await persistSiteKnowledgeStatus(store, failedStatus, onProgress);
    throw error;
  }
}

export async function collectSitemapUrls(fetcher: typeof fetch, sitemapUrl: string, limit = SITE_KNOWLEDGE_MAX_URLS) {
  const homepage = homepageUrlFromSitemap(sitemapUrl);
  const navigationTargets = await collectHomepageNavigationUrls(fetcher, sitemapUrl);
  const navigationUrls = navigationTargetSet(navigationTargets);
  const rootSitemapUrl = normalizeSiteKnowledgeUrl(sitemapUrl);
  const pending = [rootSitemapUrl];
  const visited = new Set<string>();
  const urls = new Set<string>();
  const candidateLimit = Math.max(limit, SITE_KNOWLEDGE_MAX_CANDIDATE_URLS);

  while (pending.length && urls.size < candidateLimit) {
    const current = pending.shift();
    if (!current || visited.has(current)) continue;
    visited.add(current);
    let xml: string;
    try {
      xml = await fetchSiteText(fetcher, current, "application/xml,text/xml,text/plain");
    } catch (error) {
      if (error instanceof SiteKnowledgeFetchError && error.status === 429 && current !== rootSitemapUrl) continue;
      throw error;
    }
    const parsed = parseSitemap(xml, current);
    for (const nested of parsed.sitemapUrls) {
      if (!visited.has(nested) && pending.length + urls.size < candidateLimit * 4) pending.push(nested);
    }
    for (const url of parsed.pageUrls) {
      urls.add(url);
      if (urls.size >= candidateLimit) break;
    }
  }

  return buildSiteKnowledgeCrawlQueue([...urls], sitemapUrl, homepage, navigationTargets, limit);
}

export function prioritizeSiteKnowledgeUrls(urls: string[], sitemapUrl: string, navigationUrls: Set<string> = new Set()) {
  const seen = new Set<string>();
  return urls
    .map((url, index) => ({ url: normalizeUrlForPriority(url), index }))
    .filter((item): item is { url: string; index: number } => {
      if (!item.url || seen.has(item.url)) return false;
      seen.add(item.url);
      return sameOrigin(item.url, sitemapUrl);
    })
    .map((item) => ({ ...item, priority: scoreSiteKnowledgeUrl(item.url, navigationUrls) }))
    .sort((left, right) => right.priority - left.priority || left.index - right.index)
    .map((item) => item.url);
}

function buildSiteKnowledgeCrawlQueue(
  urls: string[],
  sitemapUrl: string,
  homepageUrl: string,
  navigationTargets: SiteKnowledgeNavigationTargets,
  limit: number
) {
  const homepage = normalizeUrlForPriority(homepageUrl);
  const navigationUrls = navigationTargetSet(navigationTargets);
  const forcedNavigationTargets = orderedNavigationTargets(navigationTargets, sitemapUrl);
  const prioritized = prioritizeSiteKnowledgeUrls(urls, sitemapUrl, navigationUrls);
  const buckets = {
    about: [] as string[],
    brands: [] as string[],
    categories: [] as string[],
    services: [] as string[],
    products: [] as string[],
    remaining: [] as string[]
  };
  const seen = new Set<string>();

  if (homepage && sameOrigin(homepage, sitemapUrl)) seen.add(homepage);

  for (const url of forcedNavigationTargets) {
    if (homepage && url === homepage) continue;
    if (seen.has(url)) continue;
    seen.add(url);
  }

  for (const url of prioritized) {
    if (seen.has(url)) continue;
    const bucket = classifySiteKnowledgeUrl(url, navigationUrls);
    buckets[bucket].push(url);
    seen.add(url);
  }

  const queue: string[] = [];
  if (homepage) queue.push(homepage);
  pushAll(queue, forcedNavigationTargets.slice(0, limitRemaining(limit, queue)));
  pushAll(queue, buckets.about.slice(0, limitRemaining(limit, queue)));
  pushAll(queue, buckets.brands.slice(0, limitRemaining(limit, queue)));
  pushAll(queue, buckets.categories.slice(0, limitRemaining(limit, queue)));
  pushAll(queue, buckets.services.slice(0, limitRemaining(limit, queue)));
  pushAll(queue, sampleRepresentativeUrls(buckets.products, limitRemaining(limit, queue)));
  pushAll(queue, buckets.remaining.slice(0, limitRemaining(limit, queue)));
  return queue.slice(0, limit);
}

export function parseSitemap(xml: string, baseUrl?: string): SitemapParseResult {
  const locValues = extractLocValues(xml, baseUrl);
  const sitemapUrls = xml.includes("<sitemapindex")
    ? locValues
    : [];
  const pageUrls = xml.includes("<urlset")
    ? locValues
    : (!sitemapUrls.length && !xml.includes("<urlset") && !xml.includes("<sitemapindex")
      ? parsePlainTextSitemap(xml, baseUrl)
      : []);
  return {
    pageUrls: uniqueUrls(pageUrls),
    sitemapUrls: uniqueUrls(sitemapUrls)
  };
}

export function extractSiteKnowledgePageFields(html: string): ExtractedPageFields {
  const title = cleanText(matchTag(html, "title"));
  const h1 = cleanText(matchTag(html, "h1"));
  const metaDescription = cleanText(matchMetaContent(html, "description"));
  const text = textFromHtml(html);
  const shortSummary = buildShortSummary(text, metaDescription, title, h1);
  return {
    title,
    h1,
    metaDescription,
    shortSummary
  };
}

export function normalizeSiteKnowledgeUrl(value: string) {
  const url = new URL(value.trim());
  if (!/^https?:$/.test(url.protocol)) throw new Error("Only HTTP and HTTPS sitemap URLs are supported.");
  url.hash = "";
  return url.toString();
}

export function siteKnowledgePageId(url: string) {
  return `site_${createHash("sha256").update(normalizeSiteKnowledgeUrl(url).toLowerCase()).digest("hex").slice(0, 32)}`;
}

async function persistSiteKnowledgeStatus(
  store: WorkspaceStore,
  siteKnowledge: ProjectSiteKnowledgeDocument,
  onProgress?: (siteKnowledge: ProjectSiteKnowledgeDocument) => void | Promise<void>
) {
  await store.saveProjectSiteKnowledge(siteKnowledge);
  if (onProgress) await onProgress(siteKnowledge);
}

async function fetchSiteText(fetcher: typeof fetch, url: string, accept: string) {
  const response = await fetcher(url, {
    headers: {
      Accept: accept,
      "User-Agent": "QueueWrite Site Knowledge/1.0"
    },
    cache: "no-store",
    redirect: "follow"
  });
  if (!response.ok) throw new SiteKnowledgeFetchError(url, response.status);
  return response.text();
}

function extractLocValues(xml: string, baseUrl?: string) {
  return [...xml.matchAll(/<loc>([\s\S]*?)<\/loc>/gi)]
    .map((match) => cleanText(decodeEntities(match[1])))
    .filter(Boolean)
    .map((value) => normalizeRelativeUrl(value, baseUrl))
    .filter((value): value is string => Boolean(value));
}

function parsePlainTextSitemap(text: string, baseUrl?: string) {
  return text
    .split(/\r?\n/)
    .map((line) => cleanText(line))
    .filter((line) => /^https?:\/\//i.test(line) || /^\//.test(line))
    .map((line) => normalizeRelativeUrl(line, baseUrl))
    .filter((value): value is string => Boolean(value));
}

function normalizeRelativeUrl(value: string, baseUrl?: string) {
  try {
    return normalizeSiteKnowledgeUrl(baseUrl ? new URL(value, baseUrl).toString() : value);
  } catch {
    return null;
  }
}

async function collectHomepageNavigationUrls(fetcher: typeof fetch, sitemapUrl: string) {
  try {
    const origin = homepageUrlFromSitemap(sitemapUrl);
    const html = await fetchSiteText(fetcher, origin, "text/html,application/xhtml+xml");
    return extractNavigationUrls(html, origin);
  } catch {
    return { footer: [], header: [], utility: [], primary: [] };
  }
}

function extractNavigationUrls(html: string, baseUrl: string) {
  const footerBlocks = [
    ...html.matchAll(/<footer\b[\s\S]*?<\/footer>/gi),
    ...html.matchAll(/<(?:div|section|aside|ul)\b[^>]*(?:class|id)\s*=\s*("([^"]*footer[^"]*)"|'([^']*footer[^']*)')[^>]*>[\s\S]{0,20000}?<\/(?:div|section|aside|ul)>/gi)
  ].map((match) => match[0]);
  const headerBlocks = [...html.matchAll(/<header\b[\s\S]*?<\/header>/gi)].map((match) => match[0]);
  const utilityBlocks = [...html.matchAll(new RegExp(`<(?:(?:nav|div|section|aside|ul))\\b[^>]*(?:class|id)\\s*=\\s*(\"([^\"]*(?:${UTILITY_NAV_TERMS.join("|")})[^\"]*)\"|'([^']*(?:${UTILITY_NAV_TERMS.join("|")})[^']*)')[^>]*>[\\s\\S]{0,20000}?<\\/(?:(?:nav|div|section|aside|ul))>`, "gi"))].map((match) => match[0]);
  const primaryBlocks = [
    ...html.matchAll(/<(?:div|section|aside|ul)\b[^>]*(?:class|id)\s*=\s*("([^"]*(?:mega|menu|nav)[^"]*)"|'([^']*(?:mega|menu|nav)[^']*)')[^>]*>[\s\S]{0,20000}?<\/(?:div|section|aside|ul)>/gi),
    ...html.matchAll(/<nav\b[\s\S]*?<\/nav>/gi)
  ].map((match) => match[0]);
  const fallbackSource = html.slice(0, 20000);

  return {
    footer: extractNavigationLinks(footerBlocks, baseUrl),
    header: extractNavigationLinks(headerBlocks, baseUrl),
    utility: extractNavigationLinks(utilityBlocks, baseUrl),
    primary: extractNavigationLinks(primaryBlocks.length ? primaryBlocks : [fallbackSource], baseUrl)
  };
}

function scoreSiteKnowledgeUrl(url: string, navigationUrls: Set<string>) {
  const tier = siteKnowledgeUrlTier(url, navigationUrls);
  const parts = pathParts(url);
  const depthBonus = Math.max(0, 5 - parts.length) * 10;
  const serviceDiversityBonus = SERVICE_PAGE_TERMS.some((term) => normalizedPath(url).includes(term)) ? 25 : 0;
  const hubBonus = parts.length <= 2 ? 20 : 0;
  return (7 - tier) * 10000 + depthBonus + serviceDiversityBonus + hubBonus;
}

function siteKnowledgeUrlTier(url: string, navigationUrls: Set<string>) {
  const path = normalizedPath(url);
  const parts = pathParts(url);
  const leaf = parts[parts.length - 1] ?? "";
  const normalizedUrl = normalizeUrlForPriority(url);

  if (isHomepagePath(path)) return 1;
  if (normalizedUrl && navigationUrls.has(normalizedUrl)) return 2;
  if (looksLikeAboutPage(parts)) return 3;
  if (looksLikeBrandPage(parts)) return 4;
  if (looksLikeCategoryOrCollectionPage(parts)) return 5;
  if (looksLikeServicePage(parts)) return 5;
  if (isLowValueUrl(path)) return 6;
  if (isDeepLocationVariant(parts)) return 6;
  if (/\b(?:blog|news|insights|guides|articles|resources)\b/.test(path)) return 6;
  if (/\b(?:industries|industry|sectors|audiences|customers|clients|areas|locations|service-areas)\b/.test(path)) return 4;
  if (looksLikeLocationHub(parts)) return 4;
  if (/\b(?:services|service|solutions|solution|categories|category|products|product)\b/.test(path)) return 5;
  if (SERVICE_PAGE_TERMS.some((term) => path.includes(term))) return 5;
  if (leaf && parts.length <= 2) return 3;
  return 5;
}

function isLowValueUrl(path: string) {
  return /\/(?:tag|tags|author|authors|archive|archives|search|feed|page|wp-json)\b/.test(path)
    || /[?&](?:s|search|filter|replytocom|utm_)=/i.test(path);
}

function isDeepLocationVariant(parts: string[]) {
  if (parts.length < 2) return false;
  const last = parts[parts.length - 1] ?? "";
  const hasService = parts.slice(0, -1).some((part) => SERVICE_PAGE_TERMS.some((term) => part.includes(term)));
  return hasService && looksLikeLocationSlug(last);
}

function looksLikeLocationHub(parts: string[]) {
  if (parts.length !== 1) return false;
  const part = parts[0] ?? "";
  return /^(?:areas?|locations?|service-areas?)$/.test(part);
}

function looksLikeLocationSlug(value: string) {
  if (!value || SERVICE_PAGE_TERMS.some((term) => value.includes(term))) return false;
  if (/^(?:services?|solutions?|products?|categories?|about|contact|blog|news|guide|guides)$/.test(value)) return false;
  return /^[a-z0-9]+(?:-[a-z0-9]+){0,3}$/.test(value);
}

function classifySiteKnowledgeUrl(url: string, navigationUrls: Set<string>) {
  const normalizedUrl = normalizeUrlForPriority(url);
  if (normalizedUrl && navigationUrls.has(normalizedUrl)) return "remaining" as const;
  const parts = pathParts(url);
  if (looksLikeAboutPage(parts)) return "about" as const;
  if (looksLikeBrandPage(parts)) return "brands" as const;
  if (looksLikeCategoryOrCollectionPage(parts)) return "categories" as const;
  if (looksLikeServicePage(parts)) return "services" as const;
  if (looksLikeProductPage(parts)) return "products" as const;
  return "remaining" as const;
}

function looksLikeAboutPage(parts: string[]) {
  const path = parts.join("/");
  return ABOUT_PAGE_TERMS.some((term) => path.includes(term))
    || /\b(?:store-info|store-information|our-stores|visit-us)\b/.test(path);
}

function looksLikeCategoryOrCollectionPage(parts: string[]) {
  const path = parts.join("/");
  if (!parts.length) return true;
  if (looksLikeAboutPage(parts) || looksLikeBrandPage(parts) || looksLikeProductPage(parts)) return false;
  if (looksLikeCollectionPage(parts)) return true;
  return /\b(?:categories|category|shop-by-brand|shop)\b/.test(path);
}

function looksLikeServicePage(parts: string[]) {
  const path = parts.join("/");
  if (!parts.length) return false;
  if (looksLikeAboutPage(parts) || looksLikeBrandPage(parts) || looksLikeCollectionPage(parts) || looksLikeProductPage(parts)) return false;
  if (/\b(?:industries|industry|sectors|audiences|customers|clients|areas|locations|service-areas)\b/.test(path)) return true;
  if (/\b(?:services|service|solutions|solution)\b/.test(path)) return true;
  if (SERVICE_PAGE_TERMS.some((term) => path.includes(term))) return true;
  return false;
}

function looksLikeBrandPage(parts: string[]) {
  return parts.some((part) => BRAND_PAGE_TERMS.includes(part));
}

function looksLikeCollectionPage(parts: string[]) {
  return parts.some((part) => COLLECTION_PAGE_TERMS.includes(part));
}

function looksLikeProductPage(parts: string[]) {
  if (parts.some((part) => PRODUCT_PAGE_TERMS.includes(part))) return true;
  if (parts.length < 2) return false;
  const [first] = parts;
  return ["shop", "store"].includes(first ?? "") && parts.length >= 2;
}

function sameOrigin(left: string, right: string) {
  try {
    return new URL(left).origin === new URL(right).origin;
  } catch {
    return false;
  }
}

function normalizeUrlForPriority(value: string | null) {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (!/^https?:$/.test(url.protocol)) return null;
    url.hash = "";
    [...url.searchParams.keys()].forEach((key) => {
      if (/^(?:utm_|fbclid|gclid|mc_)/i.test(key) || ["replytocom"].includes(key.toLowerCase())) url.searchParams.delete(key);
    });
    if (url.pathname !== "/") url.pathname = url.pathname.replace(/\/+$/, "");
    return url.toString();
  } catch {
    return null;
  }
}

function normalizedPath(url: string) {
  try {
    return new URL(url).pathname.toLowerCase();
  } catch {
    return "";
  }
}

function pathParts(url: string) {
  try {
    return new URL(url).pathname.split("/").filter(Boolean).map((part) => decodeURIComponent(part).toLowerCase());
  } catch {
    return [];
  }
}

function isHomepagePath(path: string) {
  return path === "" || path === "/";
}

function matchTag(html: string, tag: string) {
  const match = html.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i"));
  return match?.[1] ?? "";
}

function matchMetaContent(html: string, name: string) {
  const matches = [...html.matchAll(/<meta\b[^>]*>/gi)];
  for (const match of matches) {
    const tag = match[0];
    const metaName = attributeValue(tag, "name") ?? attributeValue(tag, "property");
    if (!metaName || metaName.toLowerCase() !== name.toLowerCase()) continue;
    return attributeValue(tag, "content") ?? "";
  }
  return "";
}

function attributeValue(tag: string, attribute: string) {
  const quoted = tag.match(new RegExp(`${attribute}\\s*=\\s*("([^"]*)"|'([^']*)')`, "i"));
  if (quoted) return quoted[2] ?? quoted[3] ?? "";
  const bare = tag.match(new RegExp(`${attribute}\\s*=\\s*([^\\s>]+)`, "i"));
  return bare?.[1] ?? "";
}

function textFromHtml(html: string) {
  return cleanText(
    decodeEntities(
      html
        .replace(/<script[\s\S]*?<\/script>/gi, " ")
        .replace(/<style[\s\S]*?<\/style>/gi, " ")
        .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
        .replace(/<svg[\s\S]*?<\/svg>/gi, " ")
        .replace(/<head[\s\S]*?<\/head>/gi, " ")
        .replace(/<br\s*\/?>/gi, " ")
        .replace(/<\/p>/gi, " ")
        .replace(/<[^>]+>/g, " ")
    )
  );
}

function buildShortSummary(text: string, metaDescription: string, title: string, h1: string) {
  if (metaDescription) return truncate(metaDescription, 220);
  if (text) {
    const sentence = text.match(/(.+?[.!?])(\s|$)/)?.[1] ?? text;
    return truncate(sentence, 220);
  }
  return truncate(title || h1 || "Imported page", 220);
}

function decodeEntities(value: string) {
  return value
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, "\"")
    .replace(/&#39;/gi, "'")
    .replace(/&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCharCode(parseInt(code, 16)));
}

function cleanText(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function truncate(value: string, limit: number) {
  if (value.length <= limit) return value;
  return `${value.slice(0, Math.max(0, limit - 3)).trimEnd()}...`;
}

function uniqueUrls(values: string[]) {
  return [...new Set(values)];
}

function homepageUrlFromSitemap(sitemapUrl: string) {
  return new URL("/", sitemapUrl).toString();
}

function uniqueSameOriginUrls(values: string[], sitemapUrl: string) {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const normalized = normalizeUrlForPriority(value);
    if (!normalized || seen.has(normalized) || !sameOrigin(normalized, sitemapUrl)) continue;
    seen.add(normalized);
    result.push(normalized);
  }
  return result;
}

function orderedNavigationTargets(targets: SiteKnowledgeNavigationTargets, sitemapUrl: string) {
  return uniqueSameOriginUrls([
    ...targets.footer,
    ...targets.header,
    ...targets.utility,
    ...targets.primary
  ], sitemapUrl);
}

function navigationTargetSet(targets: SiteKnowledgeNavigationTargets) {
  return new Set([
    ...targets.footer,
    ...targets.header,
    ...targets.utility,
    ...targets.primary
  ]);
}

function extractNavigationLinks(blocks: string[], baseUrl: string) {
  return uniqueSameOriginUrls(blocks
    .flatMap((block) => [...block.matchAll(/<a\b[^>]*\bhref\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/gi)])
    .map((match) => match[2] ?? match[3] ?? match[4] ?? "")
    .map((href) => normalizeRelativeUrl(decodeEntities(href), baseUrl))
    .filter((url): url is string => Boolean(url))
    .map(normalizeUrlForPriority)
    .filter((url): url is string => Boolean(url))
    .filter((url) => sameOrigin(url, baseUrl))
    .filter((url) => !isLowValueUrl(normalizedPath(url))), baseUrl);
}

function pushLimited(target: string[], values: string[], count: number) {
  if (count <= 0) return;
  target.push(...values.slice(0, count));
}

function pushAll(target: string[], values: string[]) {
  target.push(...values);
}

function limitRemaining(limit: number, values: string[]) {
  return Math.max(0, limit - values.length);
}

function sampleRepresentativeUrls(urls: string[], limit: number) {
  if (limit <= 0) return [];
  if (urls.length <= limit) return urls.slice(0, limit);
  const sampled: string[] = [];
  const seen = new Set<number>();
  for (let step = 0; step < limit; step += 1) {
    const index = Math.min(urls.length - 1, Math.floor(((step + 0.5) * urls.length) / limit));
    if (seen.has(index)) continue;
    seen.add(index);
    sampled.push(urls[index]);
  }
  if (sampled.length >= limit) return sampled.slice(0, limit);
  for (let index = 0; index < urls.length && sampled.length < limit; index += 1) {
    if (seen.has(index)) continue;
    sampled.push(urls[index]);
  }
  return sampled.slice(0, limit);
}
