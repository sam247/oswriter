# Writer OS MCP Roadmap

## Recent Workbook Progress

Current workbook-only analytics progress for the QueueWrite telemetry sheet:

- Renamed Phase 1 helper tabs to `Provider Summary`, `Provider Base`, `Provider Decisions`, `Commercial Viability`, and `Neon Provider Snapshot`
- Validated founder-facing Phase 1 outputs against the live workbook data
- Fixed workbook reconciliation so the lightweight validation block now matches Neon counts for article rows, attributed providers, benchmark runs, and unattributed rows
- Corrected missing-cost handling so unattributed legacy rows stay blank instead of being coerced to `0`
- Corrected lifecycle and commercial output cells so the dashboard now shows the intended current-state recommendations and cost-at-scale figures
- Audited provider-comparison metrics and corrected Tavily benchmark averages by sourcing attributed provider rows from `Provider Telemetry` instead of mixed article-level score columns
- Audited the attribution path from `Provider Telemetry` through the decision layer and corrected `Provider Base` so valid Production benchmark rows now flow into `Provider Summary`, `Provider Decisions`, and the founder dashboard

## Phase 1: Read-Only Inspection

Status: v1 skeleton.

Expose Writer OS data safely to external MCP-compatible agents:

- `list_projects`
- `get_project`
- `list_articles`
- `get_article`
- `get_article_content`
- `get_article_research`
- `get_article_sources`
- `get_article_scores`
- `list_queue_jobs`
- `get_queue_status`
- `get_workspace_stats`

Constraints:

- No mutations
- No generation
- No publishing
- No deletion
- Simple environment API key model
- Neon-backed data access through existing storage and scoring services

## Phase 2: `generate_article`

Future phase only.

Potentially allow approved MCP clients to request article generation through the existing queue and ownership model.

Required before build:

- Stronger auth and permission scopes
- Queue safety review
- Idempotency keys
- Clear status/result contract
- Audit logging

## Phase 3: `update_article`

Future phase only.

Potentially allow external agents to update article title or markdown.

Required before build:

- Versioning requirements
- Conflict detection
- Draft/review states
- User attribution
- Rollback flow

## Phase 4: `publish_article`

Future phase only.

Potentially expose a publishing operation after Writer OS has a stable publishing abstraction.

Required before build:

- Explicit publishing destinations
- Preview and confirmation model
- Platform credential handling
- Failure recovery
- Publication audit trail

## Phase 5: External Platform Connectors

Future phase only.

Potential connectors may include CMS, docs, ecommerce, and content operations platforms.

Required before build:

- Connector abstraction
- Per-workspace credential storage
- Connector-specific permissions
- Rate limit handling
- Observability and support workflows

## Non-Goals For v1

- WordPress integration
- Automated publishing
- Article mutation
- Queue mutation
- Billing or OAuth
- Prompt/model controls
