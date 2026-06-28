import type { SourceDiscoveryProvider } from "@/lib/research/providers/types";

/**
 * SerpAPI adapter stub. Architecture is provisioned; live integration is not yet implemented.
 * When implemented, this adapter will route search queries through the user's SerpAPI account
 * using their own credits. QueueWrite planning, semantic analysis, and generation remain unchanged.
 */
export class SerpApiSearchAdapter implements SourceDiscoveryProvider {
  readonly providerId = "byok" as const;

  constructor(
    private readonly _apiKey: string
  ) {}

  async search(
    _query: string,
    _options: { numResults: number; includeDomains?: string[]; excludeDomains?: string[] }
  ): Promise<never> {
    throw new Error("SerpAPI integration is not yet available. Please use Auto research mode.");
  }
}

export function createSerpApiResearchProvider(_apiKey: string): never {
  throw new Error("SerpAPI integration is not yet available. Please use Auto research mode.");
}
