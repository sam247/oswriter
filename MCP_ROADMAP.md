# Writer OS MCP Roadmap

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
