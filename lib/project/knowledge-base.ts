import type { ProjectKnowledgeBase } from "@/lib/types";

export const EMPTY_PROJECT_KNOWLEDGE_BASE: ProjectKnowledgeBase = {
  brandName: "",
  website: "",
  aboutBusiness: "",
  services: "",
  products: "",
  targetCustomer: "",
  writingRules: "",
  preferredCTA: ""
};

export function normalizeProjectKnowledgeBase(input?: Partial<ProjectKnowledgeBase> | null): ProjectKnowledgeBase {
  return {
    brandName: clean(input?.brandName),
    website: clean(input?.website),
    aboutBusiness: clean(input?.aboutBusiness),
    services: clean(input?.services),
    products: clean(input?.products),
    targetCustomer: clean(input?.targetCustomer),
    writingRules: clean(input?.writingRules),
    preferredCTA: clean(input?.preferredCTA)
  };
}

export function projectKnowledgeContextLines(input?: Partial<ProjectKnowledgeBase> | null) {
  const knowledgeBase = normalizeProjectKnowledgeBase(input);
  return [
    ["Brand Name", knowledgeBase.brandName],
    ["Website", knowledgeBase.website],
    ["About The Business", knowledgeBase.aboutBusiness],
    ["Services", knowledgeBase.services],
    ["Products", knowledgeBase.products],
    ["Target Customer", knowledgeBase.targetCustomer],
    ["Writing Rules", knowledgeBase.writingRules],
    ["Preferred CTA", knowledgeBase.preferredCTA]
  ].filter((entry): entry is [string, string] => Boolean(entry[1])).map(([label, value]) => `${label}: ${value}`);
}

export function knowledgeBasePlanningPriorities(input?: Partial<ProjectKnowledgeBase> | null) {
  const knowledgeBase = normalizeProjectKnowledgeBase(input);
  return [
    knowledgeBase.brandName ? `align relevant references with ${knowledgeBase.brandName}` : "",
    knowledgeBase.services || knowledgeBase.products ? "connect relevant sections to the supplied services and products" : "",
    knowledgeBase.targetCustomer ? `write for ${knowledgeBase.targetCustomer}` : "",
    knowledgeBase.writingRules ? "follow the project writing rules" : "",
    knowledgeBase.preferredCTA ? "use the preferred CTA when a call to action is appropriate" : ""
  ].filter(Boolean);
}

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}
