import { OpenAIModelAdapter } from "@/lib/models/openai";
import { QueueRunner } from "@/lib/queue/runner";
import { ExaSearchAdapter } from "@/lib/research/exa";
import { createWorkspaceStore } from "@/lib/storage/server";
import type { ArticleGenerationInput, EditorInput, ModelAdapter, SearchAdapter, SimilarTitleGenerationInput, ValidationInput } from "@/lib/types";

export function createRuntime() {
  const store = createWorkspaceStore();
  const model = new LazyModelAdapter();
  return {
    store,
    model,
    runner: new QueueRunner(store, new LazySearchAdapter(), model)
  };
}

class LazySearchAdapter implements SearchAdapter {
  private adapter: ExaSearchAdapter | null = null;

  search(query: string, options: Parameters<SearchAdapter["search"]>[1]) {
    return this.instance.search(query, options);
  }

  private get instance() {
    this.adapter ??= new ExaSearchAdapter();
    return this.adapter;
  }
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
