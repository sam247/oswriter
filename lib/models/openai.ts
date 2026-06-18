import OpenAI from "openai";
import type { ArticleGenerationInput, EditorInput, ModelAdapter, ModelGenerationResult, SimilarTitleGenerationInput, ValidationInput, ValidationResult } from "@/lib/types";
import { buildArticleGenerationPlan } from "@/lib/generation/plan";
import { profileContextLines } from "@/lib/project/profile";
import { cleanJsonText } from "@/lib/text";
import { estimateGenerationCost } from "@/lib/telemetry/costs";
import { pricingForModel } from "@/lib/telemetry/pricing";
import { heuristicValidation } from "@/lib/validation/heuristics";

export class OpenAIModelAdapter implements ModelAdapter {
  private readonly client = new OpenAI({
    apiKey: process.env.AI_API_KEY,
    baseURL: normaliseBaseUrl(process.env.AI_BASE_URL),
    timeout: 50_000,
    maxRetries: 1
  });

  async generateArticle(input: ArticleGenerationInput): Promise<ModelGenerationResult> {
    this.ensureKey();
    const model = process.env.AI_GENERATION_MODEL ?? "deepseek-v4-flash";
    const plan = input.plan ?? buildArticleGenerationPlan(input.controls, input.profileSnapshot);
    const response = await this.client.chat.completions.create({
      model,
      messages: promptToMessages(
        "You write useful, technically careful Markdown articles from research notes.",
        buildGenerationPrompt({ ...input, plan })
      ),
      temperature: 0.4,
      max_tokens: plan.maxOutputTokens
    });
    const text = response.choices[0]?.message.content?.trim();
    if (!text) throw new Error("OpenAI generation unavailable: empty response.");
    const markdown = normaliseMarkdown(text, input.title);
    const inputTokens = response.usage?.prompt_tokens ?? 0;
    const outputTokens = response.usage?.completion_tokens ?? 0;
    const resolvedModel = response.model ?? model;
    const cost = estimateGenerationCost(inputTokens, outputTokens, resolvedModel, "openai-compatible");
    return {
      markdown,
      provider: pricingForModel(resolvedModel).provider,
      model: resolvedModel,
      inputTokens,
      outputTokens,
      totalTokens: response.usage?.total_tokens ?? inputTokens + outputTokens,
      finishReason: response.choices[0]?.finish_reason ?? null,
      estimatedAiCostUsd: cost.costUsd,
      generationCostPricingSource: cost.pricingSource
    };
  }

  async editArticle(input: EditorInput): Promise<string> {
    this.ensureKey();
    const response = await this.client.chat.completions.create({
      model: process.env.AI_EDITOR_MODEL ?? process.env.AI_GENERATION_MODEL ?? "deepseek-v4-flash",
      messages: promptToMessages(
        "You are a conservative article editor. Preserve meaning and return Markdown only.",
        buildEditorPrompt(input)
      ),
      temperature: 0.25,
      max_tokens: 3200
    });
    const text = response.choices[0]?.message.content?.trim();
    if (!text) throw new Error("OpenAI editor unavailable: empty response.");
    return normaliseMarkdown(text, input.title);
  }

  async validateArticle(input: ValidationInput): Promise<ValidationResult> {
    this.ensureKey();
    try {
      const response = await this.client.chat.completions.create({
        model: process.env.AI_VALIDATION_MODEL ?? process.env.AI_GENERATION_MODEL ?? "deepseek-v4-flash",
        messages: promptToMessages(
          "You validate articles and return strict JSON only.",
          buildValidationPrompt(input)
        ),
        temperature: 0.1,
        max_tokens: 1400,
        response_format: { type: "json_object" }
      });
      const text = response.choices[0]?.message.content?.trim();
      if (!text) return heuristicValidation(input);
      const parsed = JSON.parse(cleanJsonText(text)) as ValidationResult;
      return {
        pass: Boolean(parsed.pass),
        warnings: Array.isArray(parsed.warnings) ? parsed.warnings : [],
        needsReviewReasons: Array.isArray(parsed.needsReviewReasons) ? parsed.needsReviewReasons : [],
        qualityScore: clamp(parsed.qualityScore ?? 60),
        sectionScores: parsed.sectionScores ?? {},
        profileRelevanceScore: parsed.profileRelevanceScore ?? heuristicValidation(input).profileRelevanceScore ?? null,
        faqScore: clamp(parsed.faqScore ?? 60),
        seoScore: clamp(parsed.seoScore ?? 60)
      };
    } catch {
      return heuristicValidation(input);
    }
  }

  async generateSimilarTitles(input: SimilarTitleGenerationInput) {
    this.ensureKey();
    const count = Math.max(5, Math.min(10, input.count ?? 10));
    const response = await this.client.chat.completions.create({
      model: process.env.AI_GENERATION_MODEL ?? "deepseek-v4-flash",
      messages: promptToMessages(
        "You plan closely related, non-duplicative article titles and return strict JSON only.",
        buildSimilarTitlesPrompt(input, count)
      ),
      temperature: 0.7,
      max_tokens: 900,
      response_format: { type: "json_object" }
    });
    const text = response.choices[0]?.message.content?.trim();
    if (!text) throw new Error("Similar title generation returned no ideas.");
    const parsed = JSON.parse(cleanJsonText(text)) as { titles?: unknown };
    return Array.isArray(parsed.titles) ? parsed.titles.filter((title): title is string => typeof title === "string") : [];
  }

  private ensureKey() {
    if (!process.env.AI_API_KEY) throw new Error("AI API unavailable: AI_API_KEY is not set.");
  }
}

function promptToMessages(system: string, user: string) {
  return [
    { role: "system" as const, content: system },
    { role: "user" as const, content: user }
  ];
}

function normaliseBaseUrl(value: string | undefined) {
  if (!value) return undefined;
  return value
    .trim()
    .replace(/\/+$/, "")
    .replace(/\/chat\/completions$/i, "")
    .replace(/\/v1$/i, "");
}

function buildGenerationPrompt({ title, research, controls, profileSnapshot, plan = buildArticleGenerationPlan(controls, profileSnapshot) }: ArticleGenerationInput) {
  const projectContext = profileContextLines(profileSnapshot);
  return `Write a practical Markdown article.

Non-negotiable:
- Write the article even if research is weak.
- Do not mention the research process.
- Do not use source-language like "according to the source".
- Do not invent precise technical claims not supported by the notes.
- FAQs must be natural questions with short direct answers.
- Write a complete article. Do not stop mid-sentence.

Title: ${title}
${projectContext.length ? `\nProject context:\n${projectContext.map((line) => `- ${line}`).join("\n")}` : ""}
Style profile: ${controls.styleProfile}
Tone: ${controls.targetTone}
Target length: about ${plan.targetWords} words (${plan.minimumWords}-${plan.maximumWords} acceptable)
Structure target: about ${plan.h2SectionCount} main H2 sections, roughly ${plan.wordsPerSection} words per main section, then a short conclusion and FAQ when enabled.
Planning emphasis: ${plan.planningPriorities.length ? plan.planningPriorities.join(", ") : "match the reader's practical needs"}.
Include TL;DR: ${controls.includeTldr ? "yes" : "no"}
Include FAQ: ${controls.includeFaq ? "yes" : "no"}

Research confidence: ${research.confidence}/100
Useful facts:
${research.usefulFacts.map((fact) => `- ${fact}`).join("\n")}

Source notes:
${research.sources.map((source) => `- ${source.title} (${source.domain}): ${source.summary ?? source.highlights.join(" ")}`).join("\n")}

Return only Markdown.`;
}

function buildEditorPrompt({ title, markdown, research }: EditorInput) {
  return `Improve this Markdown article without changing technical meaning or adding unsupported facts.

Allowed:
- remove repetition
- tighten introduction
- improve flow and FAQs
- remove research leakage and source-language
- improve readability

Not allowed:
- invent citations
- add unsupported facts
- rewrite the whole article unnecessarily

Title: ${title}
Research facts:
${research.usefulFacts.map((fact) => `- ${fact}`).join("\n")}

Article:
${markdown}

Return only the improved Markdown.`;
}

function buildValidationPrompt({ title, markdown, research, profileSnapshot }: ValidationInput) {
  const projectContext = profileContextLines(profileSnapshot);
  return `Validate this article. Validation is advisory and must never block saving.

Return strict JSON with:
{
  "pass": boolean,
  "warnings": string[],
  "needsReviewReasons": string[],
  "qualityScore": number,
  "sectionScores": { "research": number, "intent": number, "headings": number, "readability": number },
  "profileRelevanceScore": number,
  "faqScore": number,
  "seoScore": number
}

Check research quality, intent match, heading quality, FAQ quality, duplicate sections, duplicate FAQs, source leakage, research-process language, repetition, readability, completeness, and SEO basics.
Use project context to judge relevance and expected complexity without contaminating the core quality score.

Title: ${title}
${projectContext.length ? `\nProject context:\n${projectContext.map((line) => `- ${line}`).join("\n")}` : ""}
Research confidence: ${research.confidence}
Article:
${markdown}`;
}

function buildSimilarTitlesPrompt(input: SimilarTitleGenerationInput, count: number) {
  const context = profileContextLines(input.profileSnapshot);
  return `Generate ${count} closely related article titles based on the source article.

Requirements:
- Match the project region, industry and audience.
- Stay close to the source topic while covering distinct useful angles.
- Do not repeat or lightly rephrase any blocked title.
- Return JSON only in this shape: {"titles":["Title one","Title two"]}.

Source title: ${input.title}
${context.join("\n")}

Blocked titles:
${input.existingTitles.map((title) => `- ${title}`).join("\n")}

Source article excerpt:
${input.markdown.slice(0, 12000)}`;
}

function normaliseMarkdown(markdown: string, title: string) {
  const stripped = markdown.replace(/^```(?:markdown)?/i, "").replace(/```$/i, "").trim();
  return stripped.startsWith("# ") ? stripped : `# ${title}\n\n${stripped}`;
}

function clamp(n: number) {
  return Math.max(0, Math.min(100, Math.round(n)));
}
