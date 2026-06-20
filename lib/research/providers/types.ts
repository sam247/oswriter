import type { ContentProfile } from "@/lib/content-profiles";
import type { ProjectProfileSnapshot, ResearchPack, ResearchProviderId, SearchAdapter, SearchResponse } from "@/lib/types";

export interface ResearchProviderInput {
  title: string;
  articleId: string;
  profileSnapshot?: ProjectProfileSnapshot | null;
  contentProfile?: ContentProfile;
}

export interface SourceDiscoveryProvider extends SearchAdapter {
  readonly providerId: ResearchProviderId;
}

export interface SourceCrawlerProvider {
  crawl(url: string, context: { query: string }): Promise<{ markdown: string; links?: string[] }>;
}

export interface EvidenceExtractionProvider {
  extract(input: SearchResponse): Promise<SearchResponse> | SearchResponse;
}

export interface ResearchProvider {
  readonly id: ResearchProviderId;
  readonly label: string;
  research(input: ResearchProviderInput): Promise<ResearchPack>;
}
