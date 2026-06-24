# Roadmap

## Completed

### Navigation Polish Recovery

- Restored the `52cbe6d` menu/header UI state in `writer-app.tsx` after later changes replaced the approved design.
- Reintroduced `Sign Out` in the global menu as a separate danger action below a muted divider.
- Restored the project dropdown refinement that removes the `Current` row label and keeps divider contrast quieter for better hierarchy.
- Removed the grammar and spelling integration after real-content evaluation showed it added more complexity than product value.
- Restored the editor to a clean content-focused layout while keeping the right-hand inspector available for future content, SEO, and publishing validation work.

### WordPress Publishing Integration (Phase 1)

- Added project-level WordPress connections with a dedicated Publishing section in Project Settings.
- Added connection testing against `/wp-json/wp/v2/users/me`.
- Added encrypted storage for WordPress application passwords.
- Restored publishing type contracts and article read normalization so legacy publishing state still resolves correctly across queue, summary, and publishing helpers.
- Added Neon schema self-bootstrap for WordPress connection storage so deployed environments can create the connector table on first use.
- Moved WordPress connector setup reads inside route error handling so failed setup returns a surfaced error instead of a generic connector failure.
- Added article-level publishing actions for `Publish Draft` and `Publish Now`.
- Added persisted WordPress publish metadata on articles:
  - Published status
  - WordPress URL
  - Published date
  - WordPress post ID
- Kept publishing scoped to:
  - project settings
  - article publishing actions
  - publish metadata

### Site Knowledge Foundation (V1)

- Added a new Site Knowledge subsection inside Project Settings > Knowledge Base.
- Kept the existing manual Knowledge Base fields unchanged:
  - Brand Name
  - Website
  - About The Business
  - Services
- Added sitemap import for any site with a sitemap, including WordPress, Shopify, Next.js, Webflow, and generic websites.
- Added a zero-cost import pipeline that:
  - fetches the sitemap directly
  - supports sitemap indexes and standard URL sets
  - crawls up to 500 URLs
  - extracts page URL, title, H1, meta description, and a lightweight short summary
- Added project-scoped Site Knowledge storage with:
  - import status
  - sitemap URL
  - last imported timestamp
  - indexed page count
  - per-page records stored separately from the project document
- Added re-import support with URL-level upserts and stale page cleanup so records do not duplicate across imports.
- Added a simple View Pages modal with client-side search and columns for URL, Title, and Last Imported.
- Added dedicated API routes for:
  - site knowledge status
  - streamed imports with progress updates
  - page listing
- Added Neon schema support and tests for the Site Knowledge foundation without introducing embeddings, clustering, internal linking, or recommendation logic.

### Website Intelligence Business-Type Branching

- Added business type detection to the Website Intelligence profile extractor so imported sites can be classified as `service`, `ecommerce`, or `mixed`.
- Kept the existing service-business path intact for service, location, audience, CTA, and writing-signal extraction.
- Added an ecommerce extraction path that learns:
  - primary brands
  - primary categories
  - product types
  - ecommerce audience signals
  - retail CTAs
- Stored ecommerce facets and business type in site profile metadata so the architectural change stays inside the profile layer without requiring a schema migration.
- Updated the Project Settings Website Intelligence card to show business type plus ecommerce-specific fields when the site is classified as retail.
- Added regression coverage to preserve Mainline-style service extraction while validating Anna Davies-style ecommerce extraction.

### Website Intelligence Crawl Strategy V2

- Changed the crawl queue builder so Website Intelligence fetches the homepage first and uses homepage navigation as a primary crawl signal instead of relying on raw sitemap order.
- Added navigation extraction for:
  - header navigation
  - menu and mega-menu blocks
  - primary nav blocks
  - footer navigation
- Changed crawl priority to:
  - homepage
  - navigation targets
  - category and service pages
  - brand pages
  - collection pages
  - representative product pages
  - remaining sitemap URLs
- Added representative product sampling so the remaining product budget is spread across the catalogue instead of defaulting to the first product URLs in the sitemap.
- Added regression coverage to prevent sitemap-first crawling from crowding out higher-signal navigation, category, brand, and collection pages.

### Website Intelligence Crawl Strategy V2.1

- Refined navigation extraction so Website Intelligence now captures and orders:
  - footer navigation
  - header navigation
  - utility navigation
  - primary and mega-menu navigation
- Changed crawl priority to optimise for business understanding:
  - homepage
  - footer navigation targets
  - header navigation targets
  - utility navigation targets
  - remaining primary navigation targets
  - about and story pages
  - brand pages
  - category and collection pages
  - service and location pages
  - representative product pages
  - remaining sitemap URLs
- Promoted high-signal business pages such as `about`, `our-story`, `brands`, and `store-information` ahead of generic catalogue coverage.
- Tightened regression coverage so the crawler now prefers business-identity pages over blog pages and low-value product-heavy sitemap ordering.

### Website Intelligence Entity Classification V2

- Added explicit ecommerce entity typing so retail terms are classified as `brand`, `category`, or `product_type` before being added to the profile.
- Prevented cross-bucket leakage by resolving ecommerce entities with suppression rules so the same term cannot appear in multiple ecommerce buckets.
- Improved retail taxonomy handling so terms like `Mens Activewear`, `Mens Nightwear`, and `Mens Underwear` map to `Clothing` category signals rather than being misclassified as brands.
- Refined category patterns to prefer broad business categories (e.g. `Clothing`, `Footwear`, `Accessories`, `Gifts`, `Homeware`, `Beauty`, `Fragrance`) while keeping specific items like `Boots` and `Trainers` in product types.
- Added a Website Intelligence debug panel to show detected brands, categories, product types (with confidence) plus rejected terms for easier tuning.

### Explicit Business Type Selection

- Added `Business Type` to Website Intelligence with options for `Auto Detect`, `Ecommerce`, `Service Business`, `Local Service`, `Agency`, `SaaS`, and `Charity`.
- Stored the selected business type on `project.profile` so it is available across the application architecture, including Website Intelligence, planning, and future recommendation systems.
- Updated Website Intelligence import and lazy rebuild paths to use the selected project business type as the primary strategy source, only falling back to auto detection when the setting is `Auto Detect`.
- Updated the Website Intelligence UI to show the strategy used for the current analysis, including `Auto Detect (DetectedType)` when automatic routing is active.
- Made sitemap discovery more resilient by skipping rate-limited nested sitemap files (`429`) instead of failing the entire Website Intelligence import when the root sitemap is still accessible.

### Website Entity Recommendations

- Added a planning-stage website entity recommendation layer that ranks website-owned brands, categories, product types, services, audiences, and CTA against the article title before generation begins.
- Injected those recommended entities into both planning context and generation prompts so article drafting now prefers website-owned examples before external brands, retailers, or generic examples.
- Added an explicit generation rule that external entities should only be used when no relevant website-owned entity exists or the research specifically requires them.
- Added regression coverage proving retail website entities are preferred during planning and prompting for title-specific ecommerce content.
- Increased natural brand utilisation guidance so relevant website-owned brands are woven into practical examples and recommendations rather than left implicit.
- Added a non-promotional brand usage target of `2-5` contextual brand mentions per article when the title naturally supports them.
- Added regressions for coastal clothing, gifting, and accessories titles to ensure relevant website-owned brands are surfaced in generation context.

## Deferred

### WordPress Publishing (Phase 2)

- Schedule post
- Categories
- Tags
- Featured image

### WordPress Publishing (Phase 3)

- Internal link suggestions
- Existing content import
- Site inventory

### Site Knowledge (Future Layers)

- Internal link suggestions
- Related content
- Content gap analysis
- Topic clustering
- SEO recommendations
- Embeddings and semantic search
- Vector storage

## Guardrails

- Do not expand this feature into a full CMS integration.
- Keep research, provider logic, telemetry, benchmarking, billing, auth, and article generation flow unchanged.
- Keep Site Knowledge as a foundation layer only until follow-on recommendation features are explicitly scoped.
