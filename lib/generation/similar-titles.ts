import type { ModelAdapter, SimilarTitleGenerationInput } from "@/lib/types";

export async function generateSimilarArticleTitles(
  input: SimilarTitleGenerationInput,
  model: Pick<ModelAdapter, "generateSimilarTitles">
) {
  if (!model.generateSimilarTitles) throw new Error("Similar title generation is unavailable.");
  const requestedCount = Math.max(5, Math.min(10, input.count ?? 10));
  const blocked = new Set([input.title, ...input.existingTitles].map(normalizeTitle));
  const generated = await model.generateSimilarTitles({ ...input, count: requestedCount });
  const unique: string[] = [];
  for (const candidate of generated) {
    const title = cleanTitle(candidate);
    const key = normalizeTitle(title);
    if (!title || blocked.has(key)) continue;
    blocked.add(key);
    unique.push(title);
    if (unique.length === requestedCount) break;
  }
  if (unique.length < 5) throw new Error("Could not generate enough unique related titles. Try again.");
  return unique;
}

function cleanTitle(value: unknown) {
  if (typeof value !== "string") return "";
  return value.replace(/^[-*\d.)\s]+/, "").replace(/\s+/g, " ").trim().slice(0, 180);
}

function normalizeTitle(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}
