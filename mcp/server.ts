#!/usr/bin/env node

import { fileURLToPath } from "node:url";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import {
  createWriterOsMcpContext,
  getArticle,
  getArticleContent,
  getArticleResearch,
  getArticleScores,
  getArticleSources,
  getProject,
  getQueueStatus,
  getWorkspaceStats,
  listArticles,
  listProjects,
  listQueueJobs,
  type WriterOsMcpContext
} from "@/mcp/data";

const VERSION = "0.1.0";
const optionalProject = {
  projectId: z.string().min(1).optional().describe("Project id. Defaults to the active Writer OS project.")
};
const articleInput = {
  projectId: z.string().min(1).optional().describe("Project id. Defaults to the active Writer OS project."),
  articleId: z.string().min(1).describe("Article id. A job id is also accepted when it maps to a saved article.")
};
const readOnlyAnnotations = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false
} as const;

function authorizeMcpProcess() {
  const expected = process.env.WRITER_OS_MCP_API_KEY;
  const provided = process.env.WRITER_OS_MCP_CLIENT_KEY ?? process.env.MCP_API_KEY ?? expected;
  if (!expected) {
    throw new Error("WRITER_OS_MCP_API_KEY is required to start the Writer OS MCP server.");
  }
  if (provided !== expected) {
    throw new Error("Writer OS MCP API key mismatch.");
  }
}

function jsonResult(value: unknown): CallToolResult {
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(value)
      }
    ]
  };
}

function registerReadTool<Input extends z.ZodRawShape>(
  server: McpServer,
  context: WriterOsMcpContext,
  name: string,
  description: string,
  inputSchema: Input,
  handler: (args: Record<string, unknown>, context: WriterOsMcpContext) => Promise<unknown>
) {
  server.registerTool(
    name,
    {
      description,
      inputSchema,
      annotations: {
        ...readOnlyAnnotations,
        title: name
      }
    } as Parameters<McpServer["registerTool"]>[1],
    async (args: Record<string, unknown>): Promise<CallToolResult> => {
      authorizeMcpProcess();
      return jsonResult(await handler(args, context));
    }
  );
}

export function createWriterOsMcpServer() {
  const server = new McpServer({
    name: "writer-os-mcp",
    version: VERSION
  });
  const context = createWriterOsMcpContext();

  registerReadTool(server, context, "list_projects", "List Writer OS projects.", {}, async (_args, context) => listProjects(context));
  registerReadTool(server, context, "get_project", "Get project metadata, settings summary, and counts.", optionalProject, async (args, context) => getProject(context, optionalString(args.projectId)));
  registerReadTool(server, context, "list_articles", "List saved articles for a project.", optionalProject, async (args, context) => listArticles(context, optionalString(args.projectId)));
  registerReadTool(server, context, "get_article", "Get article metadata, validation, timings, and scores.", articleInput, async (args, context) => getArticle(context, requiredString(args.articleId, "articleId"), optionalString(args.projectId)));
  registerReadTool(server, context, "get_article_content", "Get article markdown content.", articleInput, async (args, context) => getArticleContent(context, requiredString(args.articleId, "articleId"), optionalString(args.projectId)));
  registerReadTool(server, context, "get_article_research", "Get the persisted research pack for an article.", articleInput, async (args, context) => getArticleResearch(context, requiredString(args.articleId, "articleId"), optionalString(args.projectId)));
  registerReadTool(server, context, "get_article_sources", "Get accepted and rejected research sources for an article.", articleInput, async (args, context) => getArticleSources(context, requiredString(args.articleId, "articleId"), optionalString(args.projectId)));
  registerReadTool(server, context, "get_article_scores", "Get computed quality, research, and evidence scores for an article.", articleInput, async (args, context) => getArticleScores(context, requiredString(args.articleId, "articleId"), optionalString(args.projectId)));
  registerReadTool(server, context, "list_queue_jobs", "List queue jobs for a project.", optionalProject, async (args, context) => listQueueJobs(context, optionalString(args.projectId)));
  registerReadTool(server, context, "get_queue_status", "Inspect queue mode, current job, progress, and upcoming queued jobs.", optionalProject, async (args, context) => getQueueStatus(context, optionalString(args.projectId)));
  registerReadTool(server, context, "get_workspace_stats", "Get workspace-level project, article, queue, word, and source counts.", {}, async (_args, context) => getWorkspaceStats(context));

  return server;
}

function optionalString(value: unknown) {
  return typeof value === "string" ? value : undefined;
}

function requiredString(value: unknown, field: string) {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${field} is required.`);
  return value;
}

async function main() {
  authorizeMcpProcess();
  const server = createWriterOsMcpServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
