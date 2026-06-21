import { SearchBackedResearchProvider } from "@/lib/research/providers/search-backed";
import { TavilySearchAdapter } from "@/lib/research/providers/tavily";
import type { ByokResearchProviderId } from "@/lib/types";

export const BYOK_RESEARCH_PROVIDERS: ReadonlyArray<{ id: ByokResearchProviderId; label: string }> = [
  { id: "tavily", label: "Tavily" }
];

export function createByokResearchProvider(apiKey: string, provider: ByokResearchProviderId = "tavily") {
  if (provider !== "tavily") throw new Error(`BYOK research provider is not supported: ${provider}`);
  return new SearchBackedResearchProvider("byok", "BYOK Experimental (Tavily)", new TavilySearchAdapter(apiKey));
}
