import assert from "node:assert/strict";
import { test } from "node:test";
import { createRuntime } from "@/lib/server/runtime";

test("createRuntime does not require provider credentials until queue processing uses them", () => {
  const previousAiKey = process.env.AI_API_KEY;
  const previousExaKey = process.env.EXA_API_KEY;
  delete process.env.AI_API_KEY;
  delete process.env.EXA_API_KEY;
  try {
    const runtime = createRuntime();
    assert.ok(runtime.store);
    assert.ok(runtime.runner);
  } finally {
    restoreEnv("AI_API_KEY", previousAiKey);
    restoreEnv("EXA_API_KEY", previousExaKey);
  }
});

function restoreEnv(key: string, value: string | undefined) {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}

