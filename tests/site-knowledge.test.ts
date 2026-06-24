import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { SITE_KNOWLEDGE_MAX_URLS, importSiteKnowledge, parseSitemap, extractSiteKnowledgePageFields, collectSitemapUrls, prioritizeSiteKnowledgeUrls } from "@/lib/site-knowledge";
import { extractProjectSiteProfile } from "@/lib/site-profile";
import { MemoryStorageAdapter } from "@/lib/storage/memory";
import { WorkspaceStore } from "@/lib/storage/storage";
import type { SiteKnowledgePageDocument } from "@/lib/types";

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

  it("prioritizes high-signal pages before low-value location and archive urls", async () => {
    const lowValueUrls = Array.from({ length: 80 }, (_, index) => `https://example.com/piling-contractors/location-${index + 1}`);
    const highValueUrls = [
      "https://example.com/blog/market-update",
      "https://example.com/tag/piling",
      "https://example.com/",
      "https://example.com/about-us",
      "https://example.com/contact",
      "https://example.com/services/earthworks",
      "https://example.com/solutions/basement-excavation",
      "https://example.com/industries/property-developers"
    ];
    const responses = new Map<string, string>([
      ["https://example.com/sitemap.xml", `<?xml version="1.0" encoding="UTF-8"?>
        <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
          ${[...lowValueUrls, ...highValueUrls].map((url) => `<url><loc>${url}</loc></url>`).join("\n")}
        </urlset>`],
      ["https://example.com", `<html><body><header><a href="/services/earthworks">Earthworks</a><a href="/solutions/basement-excavation">Basement Excavation</a></header></body></html>`]
    ]);

    const urls = await collectSitemapUrls(createFetchStub(responses), "https://example.com/sitemap.xml");

    assert.equal(urls.length, SITE_KNOWLEDGE_MAX_URLS);
    assert.deepEqual(urls.slice(0, 5), [
      "https://example.com/",
      "https://example.com/about-us",
      "https://example.com/contact",
      "https://example.com/services/earthworks",
      "https://example.com/solutions/basement-excavation"
    ]);
    assert.equal(urls.includes("https://example.com/tag/piling"), false);
    assert.equal(urls.includes("https://example.com/blog/market-update"), true);
  });

  it("keeps directly navigated pages ahead of ordinary service pages", () => {
    const navigationUrls = new Set(["https://example.com/projects"]);
    const prioritized = prioritizeSiteKnowledgeUrls([
      "https://example.com/services/drainage",
      "https://example.com/projects",
      "https://example.com/blog/news",
      "https://example.com/foundation-repair/putney"
    ], "https://example.com/sitemap.xml", navigationUrls);

    assert.deepEqual(prioritized.slice(0, 3), [
      "https://example.com/projects",
      "https://example.com/services/drainage",
      "https://example.com/blog/news"
    ]);
    assert.equal(prioritized.at(-1), "https://example.com/foundation-repair/putney");
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
    let profile = await store.getProjectSiteProfile("default");
    assert.equal(status?.status, "ready");
    assert.equal(status?.pagesIndexed, 2);
    assert.equal(pages.length, 2);
    assert.equal(profile?.domain, "example.com");
    assert.equal(profile?.pageCount, 2);
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
    profile = await store.getProjectSiteProfile("default");
    assert.equal(status?.pagesIndexed, 2);
    assert.equal(pages.length, 2);
    assert.equal(profile?.pageCount, 2);
    assert.equal(pages.find((page) => page.url === "https://example.com/about")?.title, "About QueueWrite Updated");
    assert.equal(pages.some((page) => page.url === "https://example.com/services"), false);
    assert.equal(pages.some((page) => page.url === "https://example.com/contact"), true);
  });

  it("derives a learned profile from imported page titles, paths, and summaries", async () => {
    const store = new WorkspaceStore(new MemoryStorageAdapter());
    const responses = new Map<string, string>([
      ["https://mainlinegroundworks.co.uk/sitemap.xml", `<?xml version="1.0" encoding="UTF-8"?>
        <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
          <url><loc>https://mainlinegroundworks.co.uk/services/earthworks</loc></url>
          <url><loc>https://mainlinegroundworks.co.uk/piling-contractors/putney</loc></url>
          <url><loc>https://mainlinegroundworks.co.uk/foundation-repair/wimbledon</loc></url>
        </urlset>`],
      ["https://mainlinegroundworks.co.uk/services/earthworks", `<html><head><title>Earthworks Contractors | Mainline</title><meta name="description" content="Groundworks and excavation services for property developers and main contractors. Get a quote today." /></head><body><h1>Earthworks Services</h1><p>Use UK English and construction terminology.</p></body></html>`],
      ["https://mainlinegroundworks.co.uk/piling-contractors/putney", `<html><head><title>Piling Contractors in Putney | Local Groundworks Company</title><meta name="description" content="Mini piling and CFA piling for house builders in Putney." /></head><body><h1>Piling Contractors in Putney</h1></body></html>`],
      ["https://mainlinegroundworks.co.uk/foundation-repair/wimbledon", `<html><head><title>Foundation Repair in Wimbledon | Trusted Local Groundworks Company</title></head><body><h1>Foundation Repair in Wimbledon</h1><p>Specialist foundation repair for commercial clients.</p></body></html>`]
    ]);

    const result = await importSiteKnowledge({
      projectId: "mainline",
      sitemapUrl: "https://mainlinegroundworks.co.uk/sitemap.xml",
      store,
      fetcher: createFetchStub(responses)
    });
    const saved = await store.getProjectSiteProfile("mainline");

    assert.equal(result.siteProfile.domain, "mainlinegroundworks.co.uk");
    assert.equal(saved?.pageCount, 3);
    assert.ok(saved?.services.includes("Earthworks"));
    assert.ok(saved?.services.some((service) => service.includes("Piling")));
    assert.ok(saved?.audiences.includes("Property Developers"));
    assert.ok(saved?.audiences.includes("Main Contractors"));
    assert.ok(saved?.locations.includes("Putney"));
    assert.ok(saved?.locations.includes("Wimbledon"));
    assert.equal(saved?.ctas[0], "Get A Quote");
    assert.ok(saved?.writingSignals.includes("UK English"));
    assert.ok(saved?.writingSignals.includes("Industry terminology detected"));
  });

  it("cleans noisy profile entities, CTA fragments, and duplicate service variants", () => {
    const pages: SiteKnowledgePageDocument[] = [
      sitePage("https://mainlinegroundworks.co.uk/groundworks", "Groundworks...", "Groundworks <!"),
      sitePage("https://mainlinegroundworks.co.uk/commercial-groundworks", "Commercial Groundworks Services", "Commercial Groundworks Contractors"),
      sitePage("https://mainlinegroundworks.co.uk/get-groundworks-fast-response", "Get Groundworks With Fast Response", "Request Commercial Groundworks Quote"),
      sitePage("https://mainlinegroundworks.co.uk/cfa-piling/chelsea", "CFA Piling Contractors in Chelsea", "CFA Piling in Chelsea"),
      sitePage("https://mainlinegroundworks.co.uk/earthworks/london-uk", "Earthworks in London UK", "Earthworks Contractors in Greater London"),
      sitePage("https://mainlinegroundworks.co.uk/excavation/greater-london", "Excavation in Greater London", "Excavation Services in London"),
      sitePage("https://mainlinegroundworks.co.uk/audiences/property-developers", "Groundworks for Developers", "Groundworks for Property Developers"),
      sitePage("https://mainlinegroundworks.co.uk/audiences/main-contractors", "Groundworks for Main Contractors", "Groundworks for Contractors")
    ];

    const profile = extractProjectSiteProfile({
      projectId: "mainline",
      sitemapUrl: "https://mainlinegroundworks.co.uk/sitemap.xml",
      pages
    });

    assert.ok(profile.services.includes("Groundworks"));
    assert.ok(profile.services.includes("Commercial Groundworks"));
    assert.ok(profile.services.includes("CFA Piling"));
    assert.ok(profile.services.includes("Earthworks"));
    assert.ok(profile.services.includes("Excavation"));
    assert.equal(profile.services.some((value) => /fast response|get|request|quote|<!|\.{2,}/i.test(value)), false);
    assert.equal(profile.products.some((value) => /fast response|get|request|quote|<!|\.{2,}/i.test(value)), false);
    assert.equal(profile.services.filter((value) => value === "Groundworks").length, 1);
    assert.ok(profile.audiences.includes("Property Developers"));
    assert.ok(profile.audiences.includes("Main Contractors"));
    assert.ok(profile.audiences.includes("Contractors"));
    assert.ok(profile.locations.includes("London"));
    assert.equal(profile.locations.includes("Greater London"), false);
    assert.equal(profile.locations.includes("London UK"), false);
    assert.equal(profile.services.length <= 10, true);
    assert.equal(profile.products.length <= 10, true);
    assert.equal(profile.locations.length <= 15, true);
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

function sitePage(url: string, title: string, h1: string, metaDescription = "Groundworks and excavation services for property developers and main contractors. Request a quote today."): SiteKnowledgePageDocument {
  return {
    id: url,
    projectId: "mainline",
    url,
    title,
    h1,
    metaDescription,
    shortSummary: metaDescription,
    importedAt: "2026-06-24T00:00:00.000Z",
    updatedAt: "2026-06-24T00:00:00.000Z",
    metadata: {}
  };
}
