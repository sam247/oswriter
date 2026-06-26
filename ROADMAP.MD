# Roadmap

## Completed

### Editor Toolbar Polish

- Reordered the article editor primary actions to `Export`, `Copy All`, and `Publish`.
- Renamed the article copy control to `Copy All` so the action is clearer at a glance.
- Restyled the rich-text formatting tools to better match the surrounding app chrome with calmer borders, background treatment, and more breathing room between controls.

### Vercel Deploy Build Fix

- Fixed a type mismatch in operational telemetry mapping (`number | null` -> `number | undefined`) that was breaking `next build` on Vercel.
- Fixed a Neon usage snapshot typing edge-case where `period_plan` could be `undefined` and needed normalisation to `null` before plan parsing.

### SEO Assistant Panel Refinement

- Reframed the right-hand SEO tab from a stack of separate tools into a calmer optimisation checklist with one consistent interaction model.
- Kept the `Article Score` card at the top while clarifying available upside with:
  - `Current` and `Potential` score states
  - a remaining-improvements count
  - an estimated completion time
  - preserved red-circle to green-tick progress tracking for the active checklist
- Replaced duplicated `Preview` / `Apply` controls on recommendation cards with inline expansion so each optimisation now flows as:
  - issue detected
  - expand in place
  - review current and suggested text
  - accept or cancel
- Regrouped recommendations into clearer working sections:
  - `Critical` for required pre-publish fixes
  - `Recommended` for quality improvements
  - `Optional` for lower-impact project/context enhancements
- Renamed the bulk action to `Optimise Article` and scoped the inline bulk review to deterministic safe fixes only.
- Simplified internal linking review so users can:
  - open suggestions directly from the card
  - keep or remove individual links before insertion
  - insert only the selected links instead of auto-applying everything
- Added focused regression coverage proving reviewed internal-link subsets insert only the retained links.

### Neon Cost Visibility Telemetry

- Assessed the available Neon integration surface and confirmed:
  - Neon MCP is available in this workspace for project discovery and docs lookup
  - the MCP toolset exposes project metadata such as `active_time`, `cpu_used_sec`, and `synthetic_storage_size`
  - invoice-aligned daily usage history and cost estimation still need the Neon consumption API rather than the current MCP tools alone
- Added production-safe infrastructure telemetry with two additive layers:
  - `neon_usage_snapshots` for daily Neon usage and estimated cost
  - `operational_telemetry` for business operations such as article generation, research, batch queue runs, and Website Intelligence imports
- Added low-overhead operational instrumentation at business boundaries instead of low-level database events:
  - batch queue creation
  - research completion and research failure
  - article generation completion
  - Website Intelligence import completion and failure
- Extended the existing Google Sheets telemetry workflow with new founder-facing tabs:
  - `Neon Usage`
  - `Operational Telemetry`
  - `Operation Cost Attribution`
- Added a daily Neon usage collector that stores:
  - compute usage
  - storage usage
  - transfer usage
  - extra branch usage
  - estimated daily Neon cost
- Added derived cost attribution so daily Neon cost is apportioned across eligible business operations, enabling practical answers for:
  - cost per Website Intelligence import
  - cost per article
  - observed cost for a queue run grouped by `batchRunId`
- Added focused regression coverage for the new migration and the Sheets export / attribution flow.

### Durable Queue Ownership

- Refined queue ownership so the browser launches work but the persisted job state now records a worker-recoverable handoff after each durably completed stage.
- Kept the existing queue, worker, and lease architecture intact while reducing reliance on stale recovery as the normal browser-close continuation path.
- Added persisted execution metadata on queue jobs for:
  - execution owner
  - request finished state
  - recoverable handoff state
  - last durable stage
  - worker takeover timestamps and counts
  - blocked continuation and stale recovery diagnostics
- Reduced default stale recovery from `15m` to `3m` so genuine abandoned work recovers faster while still remaining an emergency path rather than the standard handoff flow.
- Exposed lightweight worker health in the queue pane using the existing worker status endpoint with `Ready`, `Busy`, `Offline`, `Recovering`, and `Blocked` states.
- Added reliability coverage for:
  - durable manual-to-worker handoff
  - blocked worker continuation during an active manual request
  - stale recovery metadata
  - worker health snapshot classification
- Updated `README.md` to document `CRON_SECRET`, the worker drain endpoint, scheduled cron execution, and the fact that browser polling is observational only.

### Queue Responsiveness UX (Phases 1-3)

- Audited the primary sluggish flows around `Upload (titles to queue)` and `Generate` and tightened the app around those interaction bottlenecks rather than expanding the broader activity system.
- Added immediate action feedback for queue creation and queue start so users now see pending, success, and error states directly in the `Add titles` and `Generate` controls.
- Improved queue polling responsiveness during queue start and active processing so the sidebar reflects live state sooner after user actions.
- Corrected the first pass after review:
  - removed the extra queue-history/dashboard surface that duplicated metrics and recent completions
  - kept the queue banner focused on state plus next action instead of status recap
  - changed `Add titles` to optimistic local queue insertion with server reconciliation and rollback on failure
  - trimmed the bulk queue API response so the client confirms jobs and queue control without waiting on a full-state payload
- Kept the implementation intentionally scoped to Phases 1-3 only, deferring deeper worker/progress infrastructure until the first-pass UX improvements are evaluated.

### Workspace IA Overhaul

- Reframed the product layout around a clearer mental model:
  - left rail = queue operations and incoming work
  - centre = article library and content workspace
  - right rail = project context and supporting metrics
- Removed the left `Queue / Articles` split so generated content no longer duplicates in the queue manager.
- Reworked the centre default view from a publishing-first dashboard/table into a calmer article library with document-style rows, review filtering, and publishing controls pushed lower in the hierarchy.
- Collapsed `Needs attention` completely when no review or failure work exists.
- Simplified primary article list actions down to the core workflow and removed regenerate/similar-generation controls from the main library surface.
- Trimmed duplicated summary surfaces by removing the extra left export control, dropping the queue estimate widget from the queue rail, and simplifying the right-side project overview away from repeated article count cards.
- Flattened the centre workspace further so the project header now flows straight into a single control bar and then directly into the content list, with less section framing and fewer nested card treatments.
- Grouped `Generate`, `Export`, `Filter`, `Sort`, and `Bulk Actions` into one workspace control strip near the project title to make the article list feel like the page rather than a dashboard subsection.
- Refined the hierarchy again as a polish pass:
  - moved `Generate` back into the left workflow rail beside queue controls
  - reintroduced a lightweight list-view column rhythm so sort and status have clearer visual meaning
  - grouped centre actions by importance instead of giving every control equal weight
  - made article rows feel more selectable and more like a document list than stacked cards
  - removed the standalone centre `Project Settings` button so the content header stays calmer
- Consolidated the centre into a single responsive toolbar:
  - bulk actions now appear only when article rows are selected
  - row selection is integrated into the list itself rather than living as persistent toolbar chrome
  - row data aligns directly beneath the list headers with cleaner Finder/Linear-style rhythm
  - queue actions such as `Generate`, `Pause`, and `Resume` sit back in the left workflow rail
  - article row actions stay hidden until hover so the content list remains visually primary
- Refined the centre again as a calmer content database:
  - restored explicit `Sources`, `Quality`, `Research`, and `Evidence` columns so the workspace reads like a real table
  - changed selection into a true mode switch where the normal toolbar is replaced by `selected`, `Select all`, `Actions`, and `Cancel`
  - reduced duplicated publish controls by routing selection actions through a single dropdown
  - kept the command bar to one horizontal row with more whitespace and less competing chrome
  - tightened table alignment, status badge weight, and hover states so the centre panel feels more like a premium document manager than a dashboard
- Simplified the interaction model again to preserve continuity:
  - kept the header command bar visually stable whether zero, one, or many rows are selected
  - removed the temporary selection toolbar pattern and replaced it with a persistent `Actions` control plus an `Apply` button that simply enables when selection exists
  - moved bulk selection fully into the table with a header checkbox for visible rows, removing the extra toolbar `Select all` control
  - preserved the desktop-app mental model by enabling capability progressively instead of rebuilding the interface around selection
- Refined the command hierarchy without redesigning the workspace:
  - separated the command bar into viewing controls on the left and document actions on the right
  - moved `Export` out of the permanent toolbar and into the `Actions` dropdown so rarely used actions no longer occupy constant space
  - right-aligned `Actions` and `Apply` so the workflow reads left-to-right as view first, action second
  - kept row selection on the left after evaluation because the header checkbox pattern remains the clearest desktop-style bulk-selection affordance
- Tightened the project header:
  - moved project settings into the title row as a compact inline gear action
  - collapsed project metadata into one calmer line with article count, region, audience, and target words only
  - removed the extra workspace phrasing, industry label, and profile version from the main header
- Adjusted table selection placement for readability review:
  - moved bulk-selection checkboxes from the far left into the right-side control lane
  - let article titles align flush left so the list reads more like a document manager
  - kept the rest of the table structure unchanged so the visual comparison stays focused on readability
- Completed the follow-up table calm-down pass:
  - removed the redundant `Needs review` spotlight above the table because row statuses already carry that signal
  - removed the hover pin/delete row controls now that those actions live in the shared `Actions` menu
  - collapsed the far-right edge into a single roomier selection column so the article data has more breathing room
- Rebalanced queue start controls after live review:
  - restored the split `Generate` control to the global app header at the far right after checking the earlier approved header pattern
  - restored `Stop after current` and `Emergency stop` beside `Generate` in that same header area while generation is active
  - removed the mistaken duplicate generate/start placement from the project workspace header and kept the left rail free of repeated start controls
- Refined the article editor without changing its structure:
  - replaced breadcrumb-style article navigation with a clearer back-to-project affordance so opening an article feels more like opening a document
  - converted the article template/type display from a dropdown into lightweight inline metadata
  - reorganised article properties into calmer document metadata rows for template, scores, sources, word count, and reading time
  - reduced toolbar and mode-switch visual weight so controls feel secondary to the document
  - tightened the persistent save indicator to a quieter `Saving...` → `✓ Saved` → `Saved` sequence
  - restored the top app header breadcrumb to `QueueWrite > Project > Article` and truncated article titles there to keep the chrome clean
  - removed the extra `GENERATED` line and `Template •` prefix from the in-document article header so the title and core metadata read more cleanly
  - merged content profile and score metadata onto the same first row so `Industry Explainer • Quality … • Research … • Evidence …` reads as one line

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

### Website Intelligence Relationship Ranking

- Tightened ecommerce brand extraction so retail taxonomy labels such as `Wellies`, `Belts`, `Eye Masks`, `Tops`, `Trousers & Shorts`, and `Slippers` are reclassified into category or product-type buckets instead of leaking into brands.
- Added brand-to-category relationship extraction during Website Intelligence analysis so retained brands carry related retail topics such as `Fragrance`, `Gift Sets`, `Accessories`, `Clothing`, and `Footwear`.
- Stored those relationship signals in the Website Intelligence profile and used them in title-aware recommendation ranking so topic-matched brands are boosted ahead of generic site brands.
- Added persisted Website Intelligence debug data for brands showing associated categories, confidence, and supporting pages to make future relationship tuning inspectable from the UI.
- Added regressions proving Anna Davies-style ecommerce extraction retains real brands like `Inis` and `Elizabeth Scarlett`, suppresses taxonomy leakage, and prioritises fragrance-related brands for fragrance gift articles.

### Website Intelligence Discovery Resilience

- Changed Website Intelligence sitemap discovery to try sources in order:
  - user-supplied URL
  - `/sitemap.xml`
  - `/sitemap_index.xml`
  - `robots.txt` sitemap declarations
- Added homepage-only fallback discovery mode so Website Intelligence still builds a useful crawl queue when sitemap access is unavailable, blocked, rate-limited, or absent.
- Added homepage link extraction for:
  - footer navigation
  - header, utility, and primary navigation
  - CTA-style links
  - about, contact, pricing, feature/service, category, and blog targets
- Changed fallback queue priority to focus on business understanding:
  - homepage
  - footer links
  - header links
  - about pages
  - contact pages
  - pricing pages
  - feature and service pages
  - category pages
  - blog pages
- Stored crawl-mode metadata on Website Intelligence imports so the UI can distinguish sitemap imports from website discovery mode without a schema migration.
- Updated the Website Intelligence UI to show `Website Intelligence completed using website discovery mode.` instead of treating sitemap failure as an import-ending error.
- Added a search-backed discovery fallback for crawler-blocked sites so Website Intelligence can still assemble profile pages from indexed search results when homepage, sitemap, and `robots.txt` requests are challenge-blocked.
- Deduplicated homepage navigation targets so real-world sites that link `Home` in the header or footer do not crowd the crawl queue with duplicate homepage entries.
- Hardened Website Intelligence profile extraction for `search_discovery` pages by:
  - inferring offering names from feature/service URL sections and snippet titles such as `Workflow Automation Software`
  - broadening generic audience detection for B2B, SaaS, and team-based sites
  - normalising demo/trial CTAs so discovery-mode imports do not fall back to `Get A Quote` when pages clearly indicate `Book A Demo` or similar
  - making fallback CTA selection strategy-aware so SaaS sites default to a demo-style CTA instead of `Get A Quote`
- Added regressions covering:
  - fallback discovery after `429` sitemap failures
  - robots.txt-declared sitemap recovery before homepage fallback
  - search-backed recovery for crawler-blocked sites such as Vercel challenge pages
  - search-discovery profile extraction for services, audiences, and CTAs

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
