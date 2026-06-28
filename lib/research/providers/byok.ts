import { SearchBackedResearchProvider } from "@/lib/research/providers/search-backed";
import type { CustomResearchProvider } from "@/lib/types";

export const CUSTOM_RESEARCH_PROVIDERS: ReadonlyArray<{
  id: CustomResearchProvider;
  label: string;
  description: string;
  comingSoon?: boolean;
}> = [
  {
    id: "serpapi",
    label: "SerpAPI",
    description: "Uses your own SerpAPI account for Google search retrieval. QueueWrite still performs planning, semantic analysis, validation and article generation exactly as normal. Only the search source changes."
  },
  {
    id: "dataforseo",
    label: "DataForSEO",
    description: "Use your DataForSEO credits for search data retrieval.",
    comingSoon: true
  },
  {
    id: "firecrawl",
    label: "Firecrawl",
    description: "Use your Firecrawl account for deep web crawling and content extraction.",
    comingSoon: true
  }
];

export function createCustomResearchProvider(provider: CustomResearchProvider, apiKey: string) {
  if (provider === "serpapi") {
    // SerpAPI adapter is provisioned but not yet implemented.
    // The registry throws before execution is attempted.
    const { SerpApiSearchAdapter } = require("@/lib/research/providers/serpapi") as typeof import("@/lib/research/providers/serpapi");
    return new SearchBackedResearchProvider("byok", "SerpAPI", new SerpApiSearchAdapter(apiKey));
  }
  throw new Error(`Custom research provider is not yet available: ${provider}`);
}
