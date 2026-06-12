import OpenAI from "openai";
import type { ArticleGenerationInput, EditorInput, ModelAdapter, ValidationInput, ValidationResult } from "@/lib/types";
import { cleanJsonText } from "@/lib/text";
import { heuristicValidation } from "@/lib/validation/heuristics";

export class OpenAIModelAdapter implements ModelAdapter {
  private readonly client = new OpenAI({
    apiKey: process.env.AI_API_KEY,
    baseURL: normaliseBaseUrl(process.env.AI_BASE_URL)
  });

  async generateArticle(input: ArticleGenerationInput): Promise<string> {
    this.ensureKey();
    const response = await this.client.chat.completions.create({
      model: process.env.AI_GENERATION_MODEL ?? "deepseek-v4-flash",
      messages: promptToMessages(
        "You write useful, technically careful Markdown articles from research notes.",
        buildGenerationPrompt(input)
      ),
      temperature: 0.4,
      max_tokens: 5000
    });
    const text = response.choices[0]?.message.content?.trim();
    if (!text) throw new Error("OpenAI generation unavailable: empty response.");
    return normaliseMarkdown(text, input.title);
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
      max_tokens: 5000
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
        faqScore: clamp(parsed.faqScore ?? 60),
        seoScore: clamp(parsed.seoScore ?? 60)
      };
    } catch {
      return heuristicValidation(input);
    }
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

function buildGenerationPrompt({ title, research, controls }: ArticleGenerationInput) {
  return `Write a practical Markdown article.

Non-negotiable:
- Write the article even if research is weak.
- Do not mention the research process.
- Do not use source-language like "according to the source".
- Do not invent precise technical claims not supported by the notes.
- FAQs must be natural questions with short direct answers.

Title: ${title}
Style profile: ${controls.styleProfile}
Tone: ${controls.targetTone}
Target length: about ${controls.lengthTargetWords} words
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

function buildValidationPrompt({ title, markdown, research }: ValidationInput) {
  return `Validate this article. Validation is advisory and must never block saving.

Return strict JSON with:
{
  "pass": boolean,
  "warnings": string[],
  "needsReviewReasons": string[],
  "qualityScore": number,
  "sectionScores": { "research": number, "intent": number, "headings": number, "readability": number },
  "faqScore": number,
  "seoScore": number
}

Check research quality, intent match, heading quality, FAQ quality, duplicate sections, duplicate FAQs, source leakage, research-process language, repetition, readability, completeness, and SEO basics.

Title: ${title}
Research confidence: ${research.confidence}
Article:
${markdown}`;
}

function normaliseMarkdown(markdown: string, title: string) {
  const stripped = markdown.replace(/^```(?:markdown)?/i, "").replace(/```$/i, "").trim();
  return stripped.startsWith("# ") ? stripped : `# ${title}\n\n${stripped}`;
}

function clamp(n: number) {
  return Math.max(0, Math.min(100, Math.round(n)));
}
