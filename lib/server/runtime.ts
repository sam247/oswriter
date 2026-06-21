import { OpenAIModelAdapter } from "@/lib/models/openai";
import { QueueRunner } from "@/lib/queue/runner";
import { WorkspaceResearchProvider } from "@/lib/research/providers/registry";
import { createWorkspaceStore } from "@/lib/storage/server";
import type { ArticleGenerationInput, EditorInput, ModelAdapter, SimilarTitleGenerationInput, ValidationInput } from "@/lib/types";

export function createRuntime() {
  const store = createWorkspaceStore();
  const model = new LazyModelAdapter();
  return {
    store,
    model,
    runner: new QueueRunner(store, new WorkspaceResearchProvider(store), model)
  };
}

class LazyModelAdapter implements ModelAdapter {
  private adapter: OpenAIModelAdapter | null = null;

  generateArticle(input: ArticleGenerationInput) {
    return this.instance.generateArticle(input);
  }

  editArticle(input: EditorInput) {
    return this.instance.editArticle(input);
  }

  validateArticle(input: ValidationInput) {
    return this.instance.validateArticle(input);
  }

  generateSimilarTitles(input: SimilarTitleGenerationInput) {
    return this.instance.generateSimilarTitles(input);
  }

  private get instance() {
    this.adapter ??= new OpenAIModelAdapter();
    return this.adapter;
  }
}
