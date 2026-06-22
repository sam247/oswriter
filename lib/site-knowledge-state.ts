import { nowIso } from "@/lib/defaults";
import type { ProjectSiteKnowledgeDocument } from "@/lib/types";

export function createEmptyProjectSiteKnowledge(projectId: string, sitemapUrl = ""): ProjectSiteKnowledgeDocument {
  const now = nowIso();
  return {
    projectId,
    sitemapUrl,
    status: "not_configured",
    pagesIndexed: 0,
    processedPages: 0,
    totalDiscoveredUrls: 0,
    startedAt: null,
    completedAt: null,
    lastImportedAt: null,
    currentUrl: null,
    lastError: null,
    metadata: {},
    createdAt: now,
    updatedAt: now
  };
}
