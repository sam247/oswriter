import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { importSiteKnowledge, parseSitemap, extractSiteKnowledgePageFields } from "@/lib/site-knowledge";
import { MemoryStorageAdapter } from "@/lib/storage/memory";
import { WorkspaceStore } from "@/lib/storage/storage";

describe("site knowledge", () => {
  it("parses sitemap indexes and url sets", () => {
    const indexXml = `<?xml version="1.0" encoding="UTF-8"?>
      <sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
        <sitemap><loc>https://example.com/pages.xml</loc></sitemap>
        <sitemap><loc>/blog.xml</loc></sitemap>
      </sitemapindex>`;
    const urlSetXml = `<?xml version="1.0" encoding="UTF-8"?>
      <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
        <url><loc>https://example.com/about</loc></url>
        <url><loc>/contact</loc></url>
      </urlset>`;

    assert.deepEqual(parseSitemap(indexXml, "https://example.com/sitemap.xml"), {
      pageUrls: [],
      sitemapUrls: ["https://example.com/pages.xml", "https://example.com/blog.xml"]
    });
    assert.deepEqual(parseSitemap(urlSetXml, "https://example.com/sitemap.xml"), {
      pageUrls: ["https://example.com/about", "https://example.com/contact"],
      sitemapUrls: []
    });
  });

  it("extracts lightweight metadata and summary fields from html", () => {
    const html = `
      <html>
        <head>
          <title>Boiler Repair Service</title>
          <meta name="description" content="Fast boiler repair for homes and offices." />
        </head>
        <body>
          <h1>Emergency Boiler Repair</h1>
          <p>We repair boilers across the city with same-day availability.</p>
        </body>
      </html>
    `;

    assert.deepEqual(extractSiteKnowledgePageFields(html), {
      title: "Boiler Repair Service",
      h1: "Emergency Boiler Repair",
      metaDescription: "Fast boiler repair for homes and offices.",
      shortSummary: "Fast boiler repair for homes and offices."
    });
  });

  it("stores site pages at project scope, updates existing urls, and removes stale pages on re-import", async () => {
    const store = new WorkspaceStore(new MemoryStorageAdapter());
    const responses = new Map<string, string>([
      ["https://example.com/sitemap.xml", `<?xml version="1.0" encoding="UTF-8"?>
        <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
          <url><loc>https://example.com/about</loc></url>
          <url><loc>https://example.com/services</loc></url>
        </urlset>`],
      ["https://example.com/about", `<html><head><title>About QueueWrite</title></head><body><h1>About</h1><p>About page summary.</p></body></html>`],
      ["https://example.com/services", `<html><head><title>Services</title></head><body><h1>Services</h1><p>Services page summary.</p></body></html>`]
    ]);

    await importSiteKnowledge({
      projectId: "default",
      sitemapUrl: "https://example.com/sitemap.xml",
      store,
      fetcher: createFetchStub(responses)
    });

    let pages = await store.listProjectSiteKnowledgePages("default");
    let status = await store.getProjectSiteKnowledge("default");
    assert.equal(status?.status, "ready");
    assert.equal(status?.pagesIndexed, 2);
    assert.equal(pages.length, 2);
    assert.equal(pages.find((page) => page.url === "https://example.com/about")?.title, "About QueueWrite");

    responses.set("https://example.com/sitemap.xml", `<?xml version="1.0" encoding="UTF-8"?>
      <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
        <url><loc>https://example.com/about</loc></url>
        <url><loc>https://example.com/contact</loc></url>
      </urlset>`);
    responses.set("https://example.com/about", `<html><head><title>About QueueWrite Updated</title></head><body><h1>About</h1><p>Updated about page.</p></body></html>`);
    responses.set("https://example.com/contact", `<html><head><title>Contact</title></head><body><h1>Contact</h1><p>Contact page summary.</p></body></html>`);

    await importSiteKnowledge({
      projectId: "default",
      sitemapUrl: "https://example.com/sitemap.xml",
      store,
      fetcher: createFetchStub(responses)
    });

    pages = await store.listProjectSiteKnowledgePages("default");
    status = await store.getProjectSiteKnowledge("default");
    assert.equal(status?.pagesIndexed, 2);
    assert.equal(pages.length, 2);
    assert.equal(pages.find((page) => page.url === "https://example.com/about")?.title, "About QueueWrite Updated");
    assert.equal(pages.some((page) => page.url === "https://example.com/services"), false);
    assert.equal(pages.some((page) => page.url === "https://example.com/contact"), true);
  });
});

function createFetchStub(responses: Map<string, string>): typeof fetch {
  return async (input) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : String(input);
    const body = responses.get(url);
    if (body === undefined) return new Response("Not found", { status: 404 });
    return new Response(body, { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } });
  };
}
