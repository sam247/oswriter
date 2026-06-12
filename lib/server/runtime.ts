import { OpenAIModelAdapter } from "@/lib/models/openai";
import { QueueRunner } from "@/lib/queue/runner";
import { ExaSearchAdapter } from "@/lib/research/exa";
import { createWorkspaceStore } from "@/lib/storage/server";

export function createRuntime() {
  const store = createWorkspaceStore();
  return {
    store,
    runner: new QueueRunner(store, new ExaSearchAdapter(), new OpenAIModelAdapter())
  };
}
