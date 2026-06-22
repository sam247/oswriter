import assert from "node:assert/strict";
import { test } from "node:test";
import { createPipeline } from "@/lib/defaults";
import { publishArticleToWordPress, testWordPressConnection } from "@/lib/publishing/wordpress";
import { decryptSecret, encryptSecret } from "@/lib/security/secrets";
import type { ArticleDocument, ProjectWordPressConnectionSecret } from "@/lib/types";

test("application passwords are encrypted and decrypted for WordPress publishing", () => {
  const previous = process.env.OSW_SECRETS_KEY;
  process.env.OSW_SECRETS_KEY = "wordpress-test-secret";
  try {
    const encrypted = encryptSecret("app-password-123");
    assert.notEqual(encrypted, "app-password-123");
    assert.equal(decryptSecret(encrypted), "app-password-123");
  } finally {
    restoreEnv("OSW_SECRETS_KEY", previous);
  }
});

test("WordPress connection test normalizes URLs and authenticates against users/me", async () => {
  const previousFetch = globalThis.fetch;
  try {
    globalThis.fetch = async (input: string | URL | Request, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      assert.equal(url, "https://example.com/wp-json/wp/v2/users/me");
      assert.equal(init?.headers && headerValue(init.headers, "Authorization")?.startsWith("Basic "), true);
      return new Response(JSON.stringify({ id: 42, name: "Publisher" }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    };

    const result = await testWordPressConnection({
      siteUrl: "example.com/",
      username: "editor",
      applicationPassword: "abc 123"
    });

    assert.equal(result.siteUrl, "https://example.com");
    assert.equal(result.username, "editor");
    assert.equal(result.user.id, 42);
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("WordPress publish posts title, rendered content, excerpt, and status", async () => {
  const previousFetch = globalThis.fetch;
  const previousSecret = process.env.OSW_SECRETS_KEY;
  process.env.OSW_SECRETS_KEY = "wordpress-test-secret";
  try {
    const article = sampleArticle();
    const connection: ProjectWordPressConnectionSecret = {
      projectId: article.projectId,
      siteUrl: "https://example.com",
      username: "editor",
      encryptedApplicationPassword: encryptSecret("app-password-123"),
      connectionStatus: "connected",
      defaultPostStatus: "draft",
      defaultCategory: null,
      createdAt: article.createdAt,
      updatedAt: article.updatedAt
    };

    globalThis.fetch = async (input: string | URL | Request, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      assert.equal(url, "https://example.com/wp-json/wp/v2/posts");
      assert.equal(init?.method, "POST");
      assert.equal(headerValue(init?.headers, "Authorization")?.startsWith("Basic "), true);
      const payload = JSON.parse(String(init?.body)) as Record<string, string>;
      assert.equal(payload.title, article.title);
      assert.equal(payload.status, "publish");
      assert.match(payload.content, /<h1>Heading<\/h1>/);
      assert.match(payload.excerpt, /Useful summary/);
      return new Response(JSON.stringify({
        id: 987,
        link: "https://example.com/hello-world",
        status: "publish",
        date_gmt: "2026-06-21T12:00:00Z"
      }), {
        status: 201,
        headers: { "Content-Type": "application/json" }
      });
    };

    const published = await publishArticleToWordPress(connection, article, "publish");
    assert.equal(published.postId, 987);
    assert.equal(published.url, "https://example.com/hello-world");
    assert.equal(published.status, "publish");
    assert.equal(published.publishedAt, "2026-06-21T12:00:00Z");
  } finally {
    globalThis.fetch = previousFetch;
    restoreEnv("OSW_SECRETS_KEY", previousSecret);
  }
});

function headerValue(headers: HeadersInit | undefined, key: string) {
  if (!headers) return undefined;
  if (headers instanceof Headers) return headers.get(key) ?? undefined;
  if (Array.isArray(headers)) return headers.find(([name]) => name.toLowerCase() === key.toLowerCase())?.[1];
  return Object.entries(headers).find(([name]) => name.toLowerCase() === key.toLowerCase())?.[1];
}

function sampleArticle(): ArticleDocument {
  const now = "2026-06-21T10:00:00Z";
  return {
    id: "article_wordpress_publish",
    projectId: "project_wordpress_publish",
    jobId: "job_wordpress_publish",
    title: "Hello World",
    status: "generated",
    markdown: "# Heading\n\nParagraph body.",
    createdAt: now,
    updatedAt: now,
    wordCount: 3,
    qualityScore: 92,
    researchSummary: "Useful summary for excerpt generation.",
    validation: {
      pass: true,
      qualityScore: 92,
      sectionScores: {
        clarity: 90,
        accuracy: 91
      },
      seoScore: 89,
      profileRelevanceScore: 88,
      faqScore: 0,
      warnings: [],
      needsReviewReasons: []
    },
    pipeline: createPipeline(),
    sources: [],
    needsReviewReasons: []
  };
}

function restoreEnv(key: string, value: string | undefined) {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}
