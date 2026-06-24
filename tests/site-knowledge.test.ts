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
    const productUrls = Array.from({ length: 70 }, (_, index) => `https://example.com/products/alex-clark-product-${index + 1}`);
    const highValueUrls = [
      "https://example.com/blog/market-update",
      "https://example.com/tag/piling",
      "https://example.com/",
      "https://example.com/about-us",
      "https://example.com/our-story",
      "https://example.com/contact",
      "https://example.com/store-information",
      "https://example.com/services/earthworks",
      "https://example.com/solutions/basement-excavation",
      "https://example.com/industries/property-developers",
      "https://example.com/brands/inis",
      "https://example.com/collections/gifts"
    ];
    const responses = new Map<string, string>([
      ["https://example.com/sitemap.xml", `<?xml version="1.0" encoding="UTF-8"?>
        <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
          ${[...productUrls, ...lowValueUrls, ...highValueUrls].map((url) => `<url><loc>${url}</loc></url>`).join("\n")}
        </urlset>`],
      ["https://example.com/", `<html><body><header><a href="/services/earthworks">Earthworks</a><a href="/solutions/basement-excavation">Basement Excavation</a></header><div class="utility-nav"><a href="/store-information">Store Information</a></div><nav><a href="/collections/gifts">Gifts</a></nav><footer><a href="/contact">Contact</a></footer></body></html>`]
    ]);

    const urls = await collectSitemapUrls(createFetchStub(responses), "https://example.com/sitemap.xml");

    assert.equal(urls.length, SITE_KNOWLEDGE_MAX_URLS);
    assert.deepEqual(urls.slice(0, 9), [
      "https://example.com/",
      "https://example.com/contact",
      "https://example.com/services/earthworks",
      "https://example.com/solutions/basement-excavation",
      "https://example.com/store-information",
      "https://example.com/collections/gifts",
      "https://example.com/about-us",
      "https://example.com/our-story",
      "https://example.com/brands/inis"
    ]);
    assert.equal(urls.includes("https://example.com/tag/piling"), false);
    assert.equal(urls.includes("https://example.com/blog/market-update"), false);
    assert.equal(urls.includes("https://example.com/products/alex-clark-product-1"), false);
    assert.equal(urls.some((url) => url.includes("/products/alex-clark-product-")), false);
  });

  it("builds the crawl queue from footer, header, and utility navigation before sitemap order", async () => {
    const responses = new Map<string, string>([
      ["https://shop.example.com/sitemap.xml", `<?xml version="1.0" encoding="UTF-8"?>
        <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
          ${[
            ...Array.from({ length: 40 }, (_, index) => `https://shop.example.com/products/alex-clark-${index + 1}`),
            "https://shop.example.com/brands/jellycat",
            "https://shop.example.com/about-us",
            "https://shop.example.com/collections/fragrance",
            "https://shop.example.com/services/gift-wrapping",
            "https://shop.example.com/store-information"
          ].map((url) => `<url><loc>${url}</loc></url>`).join("\n")}
        </urlset>`],
      ["https://shop.example.com/", `
        <html>
          <body>
            <footer>
              <a href="/about-us">About Us</a>
            </footer>
            <header>
              <a href="/brands/jellycat">Jellycat</a>
              <a href="/collections/fragrance">Fragrance</a>
            </header>
            <div class="utility-nav">
              <a href="/store-information">Store Information</a>
            </div>
            <nav><a href="/services/gift-wrapping">Gift Wrapping</a></nav>
          </body>
        </html>
      `]
    ]);

    const urls = await collectSitemapUrls(createFetchStub(responses), "https://shop.example.com/sitemap.xml", 10);

    assert.deepEqual(urls.slice(0, 6), [
      "https://shop.example.com/",
      "https://shop.example.com/about-us",
      "https://shop.example.com/brands/jellycat",
      "https://shop.example.com/collections/fragrance",
      "https://shop.example.com/store-information",
      "https://shop.example.com/services/gift-wrapping",
    ]);
    assert.equal(urls[6]?.startsWith("https://shop.example.com/products/"), true);
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
      "https://example.com/foundation-repair/putney"
    ]);
    assert.equal(prioritized.at(-1), "https://example.com/blog/news");
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

  it("detects ecommerce sites and extracts brands, categories, audiences, and retail CTAs", () => {
    const profile = extractProjectSiteProfile({
      projectId: "anna-davies",
      sitemapUrl: "https://annadavies.co.uk/sitemap.xml",
      pages: [
        sitePage("https://annadavies.co.uk/collections/jellycat", "Jellycat | Anna Davies", "Jellycat", "Browse collection of Jellycat gifts and soft toys for lifestyle shoppers."),
        sitePage("https://annadavies.co.uk/collections/inis", "Inis Fragrance | Anna Davies", "Inis Fragrance", "Shop now for Inis fragrance gifts and diffusers."),
        sitePage("https://annadavies.co.uk/collections/seasalt", "Seasalt Clothing | Anna Davies", "Seasalt Clothing", "Browse collection of Seasalt womenswear and clothing."),
        sitePage("https://annadavies.co.uk/collections/accessories", "Accessories | Anna Davies", "Accessories", "View range of handbags, scarves, and accessories for women."),
        sitePage("https://annadavies.co.uk/collections/gifts", "Gift Ideas | Anna Davies", "Gifts", "Gift ideas for gift buyers and lifestyle shoppers."),
        sitePage("https://annadavies.co.uk/products/hoff-trainers", "Hoff Trainers | Anna Davies", "Hoff Trainers", "Shop now for Hoff trainers and footwear.")
      ]
    });

    const metadata = profile.metadata as Record<string, unknown>;
    const ecommerce = (metadata.ecommerce ?? {}) as Record<string, unknown>;
    const brands = Array.isArray(ecommerce.brands) ? ecommerce.brands : [];
    const categories = Array.isArray(ecommerce.categories) ? ecommerce.categories : [];
    const productTypes = Array.isArray(ecommerce.productTypes) ? ecommerce.productTypes : [];

    assert.equal(metadata.businessType, "ecommerce");
    assert.ok(brands.includes("Jellycat"));
    assert.ok(brands.includes("Inis"));
    assert.ok(brands.includes("Seasalt"));
    assert.equal(brands.includes("Anna Davies"), false);
    assert.ok(categories.includes("Fragrance"));
    assert.ok(categories.includes("Clothing"));
    assert.ok(categories.includes("Gifts"));
    assert.ok(categories.includes("Accessories"));
    assert.ok(categories.includes("Footwear"));
    assert.ok(productTypes.includes("Trainers"));
    assert.ok(profile.products.includes("Jellycat"));
    assert.ok(profile.products.includes("Fragrance"));
    assert.ok(profile.audiences.includes("Gift Buyers"));
    assert.ok(profile.audiences.includes("Women"));
    assert.ok(profile.audiences.includes("Lifestyle Shoppers"));
    assert.ok(profile.ctas.some((cta) => ["Shop Now", "Browse Collection", "View Range"].includes(cta)));
    assert.equal(profile.services.length, 0);
    assert.ok(profile.writingSignals.includes("UK English"));
  });

  it("forgets imported site knowledge, pages, and generated profile data", async () => {
    const store = new WorkspaceStore(new MemoryStorageAdapter());
    const responses = new Map<string, string>([
      ["https://example.com/sitemap.xml", `<?xml version="1.0" encoding="UTF-8"?>
        <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
          <url><loc>https://example.com/services/groundworks</loc></url>
        </urlset>`],
      ["https://example.com", `<html><body><nav><a href="/services/groundworks">Groundworks</a></nav></body></html>`],
      ["https://example.com/services/groundworks", `<html><head><title>Groundworks Services</title></head><body><h1>Groundworks</h1><p>Groundworks for property developers.</p></body></html>`]
    ]);

    await importSiteKnowledge({
      projectId: "default",
      sitemapUrl: "https://example.com/sitemap.xml",
      store,
      fetcher: createFetchStub(responses)
    });

    assert.equal((await store.listProjectSiteKnowledgePages("default")).length, 1);
    assert.ok(await store.getProjectSiteKnowledge("default"));
    assert.ok(await store.getProjectSiteProfile("default"));

    await store.deleteProjectSiteKnowledge("default");

    assert.equal((await store.listProjectSiteKnowledgePages("default")).length, 0);
    assert.equal(await store.getProjectSiteKnowledge("default"), null);
    assert.equal(await store.getProjectSiteProfile("default"), null);
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
    assert.equal(profile.locations.some((value) => profile.services.includes(value)), false);
    assert.equal(profile.locations.some((value) => /groundworks|drainage|excavation|piling|underpinning|foundation|concrete/i.test(value)), false);
    assert.equal(profile.products.includes("Commercial Groundworks") && profile.products.includes("Groundworks"), false);
    assert.equal(profile.services.length <= 10, true);
    assert.equal(profile.products.length <= 10, true);
    assert.equal(profile.locations.length <= 15, true);
  });

  it("keeps Mainline-style services and locations in the correct buckets", () => {
    const pages: SiteKnowledgePageDocument[] = [
      sitePage("https://mainlinegroundworks.co.uk/groundworks/london", "Groundworks Contractors in London", "Groundworks in London"),
      sitePage("https://mainlinegroundworks.co.uk/commercial-groundworks/chelsea", "Commercial Groundworks in Chelsea", "Commercial Groundworks Chelsea"),
      sitePage("https://mainlinegroundworks.co.uk/earthworks/putney", "Earthworks Contractors in Putney", "Earthworks in Putney"),
      sitePage("https://mainlinegroundworks.co.uk/excavation/hammersmith", "Excavation Services in Hammersmith", "Excavation Hammersmith"),
      sitePage("https://mainlinegroundworks.co.uk/piling/fulham", "Piling Contractors in Fulham", "Piling in Fulham"),
      sitePage("https://mainlinegroundworks.co.uk/cfa-piling/kensington", "CFA Piling Contractors in Kensington", "CFA Piling Kensington"),
      sitePage("https://mainlinegroundworks.co.uk/underpinning/chiswick", "Underpinning Contractors in Chiswick", "Underpinning in Chiswick"),
      sitePage("https://mainlinegroundworks.co.uk/commercial-drainage/kingston", "Commercial Drainage in Kingston", "Commercial Drainage Kingston"),
      sitePage("https://mainlinegroundworks.co.uk/foundations/putney", "Foundations in Putney", "Foundation Contractors Putney"),
      sitePage("https://mainlinegroundworks.co.uk/blog/groundworks-category", "Groundworks Category Page", "Groundworks Blog")
    ];

    const profile = extractProjectSiteProfile({
      projectId: "mainline",
      sitemapUrl: "https://mainlinegroundworks.co.uk/sitemap.xml",
      pages
    });

    for (const service of ["Groundworks", "Earthworks", "Excavation", "Piling", "CFA Piling", "Underpinning", "Commercial Drainage", "Foundations"]) {
      assert.ok(profile.services.includes(service), `${service} should be a learned service`);
    }
    for (const location of ["London", "Putney", "Chelsea", "Hammersmith", "Fulham", "Kensington", "Chiswick", "Kingston"]) {
      assert.ok(profile.locations.includes(location), `${location} should be a learned location`);
    }
    assert.equal(profile.locations.some((value) => /groundworks|earthworks|excavation|piling|underpinning|drainage|foundation|concrete/i.test(value)), false);
    assert.equal(profile.services.some((value) => /contact|quote|response|call|home|blog|page|author|category|tag/i.test(value)), false);
    assert.equal(profile.products.includes("Commercial Groundworks") && profile.products.includes("Groundworks"), false);
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
