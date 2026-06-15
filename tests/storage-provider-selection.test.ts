import assert from "node:assert/strict";
import { test } from "node:test";
import { BlobStorageProvider } from "@/lib/storage/blob";
import { NeonStorageProvider } from "@/lib/storage/neon";
import { createStorageProvider } from "@/lib/storage/server";

test("blob remains the safe default storage backend", () => {
  const previous = process.env.STORAGE_BACKEND;
  delete process.env.STORAGE_BACKEND;
  try {
    assert.ok(createStorageProvider() instanceof BlobStorageProvider);
  } finally {
    if (previous === undefined) delete process.env.STORAGE_BACKEND;
    else process.env.STORAGE_BACKEND = previous;
  }
});

test("neon backend is opt-in through STORAGE_BACKEND", () => {
  const previous = process.env.STORAGE_BACKEND;
  process.env.STORAGE_BACKEND = "neon";
  try {
    assert.ok(createStorageProvider() instanceof NeonStorageProvider);
  } finally {
    if (previous === undefined) delete process.env.STORAGE_BACKEND;
    else process.env.STORAGE_BACKEND = previous;
  }
});

