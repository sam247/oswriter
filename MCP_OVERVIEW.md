# Writer OS MCP v1

Writer OS MCP v1 exposes read-only Writer OS data to MCP-compatible clients such as Cursor, Claude Code, Trae, Codex, and future agent tools.

This is not a publishing integration, automation layer, WordPress connector, or article generation surface. It is a small inspection layer over existing Writer OS data.

## Scope

The v1 server exposes:

- Projects
- Articles
- Article markdown content
- Research packs
- Research sources
- Article scores
- Queue jobs
- Queue status
- Workspace stats

All tools are read-only. The server performs no writes, no generation, no deletion, no publishing, and no queue mutation.

## Runtime

The MCP server runs over stdio using the official Model Context Protocol TypeScript SDK.

```bash
npm run --silent mcp
```

The server reads Writer OS data through the existing `WorkspaceStore` and `NeonStorageProvider`. It does not duplicate article scoring, storage, or research logic.

## Environment

Required:

```bash
DATABASE_URL="postgres://..."
WRITER_OS_MCP_API_KEY="your-local-or-server-key"
```

Recommended:

```bash
STORAGE_BACKEND="neon"
WRITER_OS_MCP_CLIENT_KEY="your-local-or-server-key"
```

For local stdio clients, configure the same key in the MCP server environment. If `WRITER_OS_MCP_CLIENT_KEY` is omitted, the process key is used as the local client key. This is intentionally simple for v1 and should be replaced with a stronger remote auth model before hosted MCP access.

## Client Configuration Example

```json
{
  "mcpServers": {
    "writer-os": {
      "command": "npm",
      "args": ["run", "--silent", "mcp"],
      "cwd": "/absolute/path/to/macwriter",
      "env": {
        "DATABASE_URL": "postgres://...",
        "WRITER_OS_MCP_API_KEY": "your-key",
        "WRITER_OS_MCP_CLIENT_KEY": "your-key"
      }
    }
  }
}
```

## Tools

### `list_projects`

Returns project ids, names, slugs, organisation ids, and timestamps.

### `get_project`

Returns project metadata, settings summary, and counts. Accepts optional `projectId`; defaults to the active project.

### `list_articles`

Lists saved articles for a project. Accepts optional `projectId`.

### `get_article`

Returns article metadata, validation, timings, review reasons, and scores.

Input:

```json
{ "projectId": "optional-project-id", "articleId": "article-id" }
```

### `get_article_content`

Returns article title and markdown content.

### `get_article_research`

Returns the persisted research pack summary for an article.

### `get_article_sources`

Returns accepted and rejected sources for an article.

### `get_article_scores`

Returns computed quality, research, and evidence scores using existing Writer OS scoring logic.

### `list_queue_jobs`

Lists queue jobs for a project. Accepts optional `projectId`.

### `get_queue_status`

Returns queue mode, owner/request metadata, current job, progress, and upcoming queued jobs.

### `get_workspace_stats`

Returns workspace totals and per-project counts.

## Response Format

Tool responses are JSON strings in MCP text content blocks. No markdown narratives are returned from tools.

## Safety Rules

- No write tools in v1.
- No generation tools in v1.
- No publishing tools in v1.
- No deletion tools in v1.
- No queue mutation tools in v1.
- Keep stdout reserved for MCP protocol traffic.
