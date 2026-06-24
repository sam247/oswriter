import { createHash } from "node:crypto";
import { neon } from "@neondatabase/serverless";
import { createDefaultProject, createDefaultQueueControl, createDefaultSettings, createDefaultWorkspacePreferences, DEFAULT_PROJECT_ID } from "@/lib/defaults";
import { applyPublishingDefaults } from "@/lib/publishing/status";
import { normalizeProjectProfile, profileKeyFor } from "@/lib/project/profile";
import { calculateTelemetryQuality } from "@/lib/telemetry/quality";
import { errorMessage, logStorageError } from "@/lib/storage/logging";
import { activeProjectPath, articleMarkdownPath, articlePath, articlesPrefix, debugPath, generationTelemetryPath, jobPath, jobsPrefix, queueControlPath, researchPath, settingsPath, siteKnowledgePagePath, siteKnowledgePagesPrefix, siteKnowledgePath, siteProfilePath, telemetryExportStatusPath, telemetryExportStatusPrefix, workerLeasePath, workspacePath, workspacePreferencesPath } from "@/lib/storage/paths";
import type { StorageProvider } from "@/lib/storage/storage";
import type { WorkerObservationTimings } from "@/lib/storage/storage";
import type { ArticleDocument, ArticleSummary, DebugDocument, DocumentVersion, GenerationTelemetryDocument, GlobalSearchResponse, GlobalSearchResult, GlobalSearchResultType, OrganisationDocument, ProjectDocument, ProjectSiteKnowledgeDocument, ProjectSiteProfileDocument, ProjectWordPressConnectionSecret, QueueControlDocument, QueueJob, QueueStatus, ResearchFinding, ResearchPack, ResearchRun, ResearchSource, SettingsDocument, SiteKnowledgePageDocument, SourceCitation, TelemetryExportStatusDocument, WorkerLeaseDocument, WorkspacePreferencesDocument } from "@/lib/types";
import { toArticleSummary } from "@/lib/articles/summary";
import type { ProjectAnalyticsSummary } from "@/lib/analytics/summary";

type NeonSql = ReturnType<typeof neon>;

interface TenantSeed {
  organisationId: string;
  organisationName: string;
  organisationSlug: string;
  userId: string;
  userEmail: string;
  userName: string | null;
}

interface NeonStorageProviderOptions {
  sql?: NeonSql;
  tenant?: TenantSeed;
}

export class NeonStorageProvider implements StorageProvider {
  private sqlClient: NeonSql | null = null;
  private readonly injectedSql?: NeonSql;
  private readonly injectedTenant?: TenantSeed;
  private tenantReady = false;
  private generationTelemetrySchemaReady = false;
  private wordPressConnectionSchemaReady = false;
  private siteKnowledgeSchemaReady = false;
  private readonly ensuredProjects = new Set<string>();

  constructor(options: NeonStorageProviderOptions = {}) {
    this.injectedSql = options.sql;
    this.injectedTenant = options.tenant;
  }

  async getJson<T>(path: string): Promise<T | null> {
    return this.withFailureLogging("getJson", path, async () => {
      if (isActiveProjectPath(path)) return this.getActiveProject() as Promise<T | null>;
      if (isWorkspacePreferencesPath(path)) return this.getWorkspacePreferences() as Promise<T | null>;
      if (isWorkspacePath(path)) return this.getProject(pathProjectId(path)) as Promise<T | null>;
      if (isSettingsPath(path)) return this.getSettings(pathProjectId(path)) as Promise<T | null>;
      if (isSiteKnowledgePath(path)) return this.getProjectSiteKnowledge(pathProjectId(path)) as Promise<T | null>;
      if (isSiteProfilePath(path)) return this.getProjectSiteProfile(pathProjectId(path)) as Promise<T | null>;
      if (isSiteKnowledgePagePath(path)) return this.getSiteKnowledgePage(pathProjectId(path), pathId(path)) as Promise<T | null>;
      if (isQueueControlPath(path)) return this.getQueueControl(pathProjectId(path)) as Promise<T | null>;
      if (isJobPath(path)) return this.getDocument<T>("jobs", pathId(path));
      if (isArticlePath(path)) return this.getDocument<T>("articles", pathId(path));
      if (isResearchPath(path)) return this.getDocument<T>("research_packs", researchId(pathProjectId(path), pathId(path)));
      if (isDebugPath(path)) return this.getDebug(pathProjectId(path), pathId(path)) as Promise<T | null>;
      if (isGenerationTelemetryPath(path)) return this.getGenerationTelemetry(pathProjectId(path), pathId(path)) as Promise<T | null>;
      if (isTelemetryExportStatusPath(path)) return this.getTelemetryExportStatus(decodeURIComponent(pathId(path))) as Promise<T | null>;
      if (isWorkerLeasePath(path)) return this.getWorkerLease(pathProjectId(path)) as Promise<T | null>;
      return null;
    });
  }

  async putJson<T>(path: string, value: T): Promise<void> {
    return this.withFailureLogging("putJson", path, async () => {
      if (isActiveProjectPath(path)) return this.saveActiveProject(value as { projectId?: string; updatedAt?: string });
      if (isWorkspacePreferencesPath(path)) return this.saveWorkspacePreferences(value as WorkspacePreferencesDocument);
      if (isWorkspacePath(path)) return this.saveProject(value as ProjectDocument);
      if (isSettingsPath(path)) return this.saveSettings(value as SettingsDocument);
      if (isSiteKnowledgePath(path)) return this.saveProjectSiteKnowledge(value as ProjectSiteKnowledgeDocument);
      if (isSiteProfilePath(path)) return this.saveProjectSiteProfile(value as ProjectSiteProfileDocument);
      if (isSiteKnowledgePagePath(path)) return this.saveSiteKnowledgePage(value as SiteKnowledgePageDocument, pathProjectId(path));
      if (isQueueControlPath(path)) return this.saveQueueControl(value as QueueControlDocument);
      if (isJobPath(path)) return this.saveJob(value as QueueJob);
      if (isArticlePath(path)) return this.saveArticleRow(value as ArticleDocument);
      if (isResearchPath(path)) return this.saveResearch(value as ResearchPack, pathProjectId(path));
      if (isDebugPath(path)) return this.saveDebug(value as DebugDocument, pathProjectId(path));
      if (isGenerationTelemetryPath(path)) return this.saveGenerationTelemetry(value as GenerationTelemetryDocument, pathProjectId(path));
      if (isTelemetryExportStatusPath(path)) return this.saveTelemetryExportStatus(value as TelemetryExportStatusDocument);
      if (isWorkerLeasePath(path)) return this.upsertWorkerLease(value as WorkerLeaseDocument, pathProjectId(path));
    });
  }

  async putJsonIfAbsent<T>(path: string, value: T): Promise<boolean> {
    return this.withFailureLogging("putJsonIfAbsent", path, async () => this.putJsonIfAbsentUnsafe(path, value));
  }

  async putText(path: string, value: string): Promise<void> {
    return this.withFailureLogging("putText", path, async () => {
      if (!isArticleMarkdownPath(path)) return;
      const articleId = pathId(path);
      await this.sql`update articles set markdown = ${value}, document = jsonb_set(document, '{markdown}', to_jsonb(${value}::text), true) where id = ${articleId}`;
    });
  }

  async listJson<T>(prefix: string): Promise<T[]> {
    return this.withFailureLogging("listJson", prefix, async () => {
      if (prefix.endsWith("/jobs/")) return this.listDocuments<T>("jobs", pathProjectId(prefix), "created_at asc");
      if (prefix.endsWith("/articles/")) return this.listDocuments<T>("articles", pathProjectId(prefix), "updated_at desc");
      if (prefix.endsWith("/knowledge/site/pages/")) return this.listSiteKnowledgePages(pathProjectId(prefix)) as Promise<T[]>;
      if (prefix.endsWith("/telemetry/generations/")) {
        const tenant = await this.ensureTenant();
        const projectId = pathProjectId(prefix);
        const found = rows(await this.sql`
          select *
          from generation_telemetry
          where organisation_id = ${tenant.organisationId}
            and project_id = ${projectId}
          order by updated_at desc
        `);
        return found.map(generationTelemetryFromRow) as T[];
      }
      if (prefix === telemetryExportStatusPrefix()) {
        const tenant = await this.ensureTenant();
        const found = rows(await this.sql`
          select *
          from telemetry_export_status
          where organisation_id = ${tenant.organisationId}
          order by updated_at desc
        `);
        return found.map(telemetryExportStatusFromRow) as T[];
      }
      return [];
    });
  }

  async listPaths(prefix: string): Promise<string[]> {
    return this.withFailureLogging("listPaths", prefix, async () => this.listPathsUnsafe(prefix));
  }

  async listProjects() {
    return this.withFailureLogging("listProjects", "projects/", async () => {
      const tenant = await this.ensureTenant();
    const found = rows(await this.sql`
        select document
        from projects
        where organisation_id = ${tenant.organisationId}
        order by updated_at desc
      `);
      return found.map((row) => {
        const project = row.document as ProjectDocument;
        return { ...project, profile: normalizeProjectProfile(project.profile) };
      });
    });
  }

  async getQueueStatus(projectId: string): Promise<QueueStatus> {
    return this.withFailureLogging("getQueueStatus", projectId, async () => {
      const found = rows(await this.sql`
        select
          count(*) filter (where j.status = 'queued')::int as queued,
          count(*) filter (where j.status = 'processing')::int as processing,
          count(*) filter (where j.status in ('failed', 'research_failed'))::int as failed,
          count(*) filter (where j.status = 'generated')::int as generated,
          count(*) filter (where j.status = 'needs_review')::int as review,
          (array_agg(j.id order by j.updated_at asc) filter (where j.status = 'processing'))[1] as active_job_id,
          (array_agg(j.title order by j.updated_at asc) filter (where j.status = 'processing'))[1] as active_job_title,
          (array_agg(j.document order by j.updated_at asc) filter (where j.status = 'processing'))[1] as active_job_document
        from jobs j
        where j.project_id = ${projectId}
      `);
      const row = found[0] ?? {};
      const activeJobId = row.active_job_id ? String(row.active_job_id) : null;
      const activeJobDocument = isRecord(row.active_job_document) ? row.active_job_document as unknown as QueueJob : null;
      return {
        queued: Number(row.queued ?? 0),
        processing: Number(row.processing ?? 0),
        generated: Number(row.generated ?? 0),
        review: Number(row.review ?? 0),
        failed: Number(row.failed ?? 0),
        ...(activeJobId ? { activeJob: {
          id: activeJobId,
          title: String(row.active_job_title ?? ""),
          ...(activeJobDocument ? {
            articleId: activeJobDocument.articleId,
            status: activeJobDocument.status,
            attempts: activeJobDocument.attempts,
            pipeline: activeJobDocument.pipeline,
            timings: activeJobDocument.timings,
            updatedAt: activeJobDocument.updatedAt
          } : {})
        } } : {})
      };
    });
  }

  async getProjectQueueScan() {
    return this.withFailureLogging("getProjectQueueScan", undefined, async () => {
      const tenant = await this.ensureTenant();
      const found = rows(await this.sql`
        select
          (select count(*)::int from projects where organisation_id = ${tenant.organisationId}) as projects_checked,
          coalesce(array_agg(distinct project_id) filter (where status in ('queued', 'processing')), array[]::text[]) as project_ids
        from jobs
        where organisation_id = ${tenant.organisationId}
      `);
      return {
        projectsChecked: Number(found[0]?.projects_checked ?? 0),
        projectIds: Array.isArray(found[0]?.project_ids) ? found[0].project_ids.map(String) : []
      };
    });
  }

  async getCompactJobCounts(projectId: string) {
    return this.withFailureLogging("getCompactJobCounts", projectId, async () => {
      const tenant = await this.ensureTenant();
      const found = rows(await this.sql`
        select
          count(*) filter (where status = 'queued')::int as queued,
          count(*) filter (where status = 'processing')::int as processing,
          count(*) filter (where status = 'generated')::int as generated,
          count(*) filter (where status = 'needs_review')::int as needs_review,
          count(*) filter (where status in ('failed', 'research_failed'))::int as failed
        from jobs
        where organisation_id = ${tenant.organisationId} and project_id = ${projectId}
      `);
      const row = found[0] ?? {};
      return {
        queued: Number(row.queued ?? 0),
        processing: Number(row.processing ?? 0),
        generated: Number(row.generated ?? 0),
        needsReview: Number(row.needs_review ?? 0),
        failed: Number(row.failed ?? 0)
      };
    });
  }

  async getQueueCandidate(projectId: string) {
    return this.withFailureLogging("getQueueCandidate", projectId, async () => {
      const tenant = await this.ensureTenant();
      const found = rows(await this.sql`
        select document from jobs
        where organisation_id = ${tenant.organisationId}
          and project_id = ${projectId}
          and status in ('processing', 'queued')
        order by case when status = 'processing' then 0 else 1 end,
          queue_position asc, created_at asc
        limit 1
      `);
      return found[0]?.document as QueueJob | null ?? null;
    });
  }

  async getActiveProcessingJob(projectId: string) {
    return this.getSingleQueueJob(projectId, "processing");
  }

  async getNextQueuedJob(projectId: string) {
    return this.getSingleQueueJob(projectId, "queued");
  }

  async getResumableQueuedJob(projectId: string) {
    return this.withFailureLogging("getResumableQueuedJob", projectId, async () => {
      const tenant = await this.ensureTenant();
      const found = rows(await this.sql`
        select document from jobs
        where organisation_id = ${tenant.organisationId}
          and project_id = ${projectId}
          and status = 'queued'
          and (attempts > 0 or pipeline @> '[{"status":"done"}]'::jsonb or pipeline @> '[{"status":"running"}]'::jsonb)
        order by queue_position asc, created_at asc
        limit 1
      `);
      return found[0]?.document as QueueJob | null ?? null;
    });
  }

  async getStaleProcessingJobs(projectId: string, cutoff: string) {
    return this.withFailureLogging("getStaleProcessingJobs", projectId, async () => {
      const tenant = await this.ensureTenant();
      const found = rows(await this.sql`
        select document from jobs
        where organisation_id = ${tenant.organisationId}
          and project_id = ${projectId}
          and status = 'processing'
          and updated_at < ${cutoff}::timestamptz
        order by updated_at asc
      `);
      return found.map((row) => row.document as QueueJob);
    });
  }

  async getLatestQueuePosition(projectId: string) {
    return this.withFailureLogging("getLatestQueuePosition", projectId, async () => {
      const tenant = await this.ensureTenant();
      const found = rows(await this.sql`
        select coalesce(max(queue_position), 0) as position
        from jobs
        where organisation_id = ${tenant.organisationId} and project_id = ${projectId}
      `);
      return Number(found[0]?.position ?? 0);
    });
  }

  async recordWorkerObservation(projectId: string, timings: WorkerObservationTimings) {
    return this.withFailureLogging("recordWorkerObservation", projectId, async () => {
      const tenant = await this.ensureTenant();
      await this.sql`
        with targets as (
          select id, coalesce(jobs.timings, '{}'::jsonb) || jsonb_strip_nulls(jsonb_build_object(
            'worker_first_seen_at', coalesce(jobs.timings->'worker_first_seen_at', to_jsonb(${timings.worker_first_seen_at}::text)),
            'worker_lease_requested_at', coalesce(jobs.timings->'worker_lease_requested_at', to_jsonb(${timings.worker_lease_requested_at}::text)),
            'worker_lease_acquired_at', coalesce(jobs.timings->'worker_lease_acquired_at', to_jsonb(${timings.worker_lease_acquired_at ?? null}::text)),
            'worker_lease_blocked_at', coalesce(jobs.timings->'worker_lease_blocked_at', to_jsonb(${timings.worker_lease_blocked_at ?? null}::text))
          )) as next_timings
          from jobs
          where organisation_id = ${tenant.organisationId}
            and project_id = ${projectId}
            and status in ('queued', 'processing')
        )
        update jobs
        set timings = targets.next_timings,
          document = jsonb_set(jobs.document, '{timings}', targets.next_timings, true)
        from targets
        where jobs.id = targets.id
      `;
    });
  }

  async getArticleById(articleId: string): Promise<ArticleDocument | null> {
    return this.withFailureLogging("getArticleById", articleId, async () => {
      const found = rows(await this.sql`select document from articles where id = ${articleId}`);
      if (!found[0]?.document) return null;
      return applyPublishingDefaults(found[0].document as ArticleDocument);
    });
  }

  async updateArticle(article: ArticleDocument): Promise<void> {
    return this.withFailureLogging("updateArticle", article.id, async () => {
      const summary = toArticleSummary(article);
      const persistedDocument = {
        ...article,
        summaryScores: { research: summary.researchScore, evidence: summary.evidenceScore }
      };
      await this.sql`
        update articles set
          title = ${article.title},
          markdown = ${article.markdown},
          word_count = ${article.wordCount},
          document = ${JSON.stringify(persistedDocument)}::jsonb,
          updated_at = ${article.updatedAt}::timestamptz
        where id = ${article.id}
      `;
    });
  }

  async getProjectWordPressConnection(projectId: string): Promise<ProjectWordPressConnectionSecret | null> {
    return this.withFailureLogging("getProjectWordPressConnection", projectId, async () => {
      await this.ensureWordPressConnectionSchema();
      const tenant = await this.ensureTenant();
      const found = rows(await this.sql`
        select document
        from project_wordpress_connections
        where organisation_id = ${tenant.organisationId}
          and project_id = ${projectId}
      `);
      return found[0]?.document as ProjectWordPressConnectionSecret | null ?? null;
    });
  }

  async saveProjectWordPressConnection(connection: ProjectWordPressConnectionSecret): Promise<void> {
    return this.withFailureLogging("saveProjectWordPressConnection", connection.projectId, async () => {
      await this.ensureWordPressConnectionSchema();
      const tenant = await this.ensureTenant();
      await this.ensureProjectRows(connection.projectId);
      const next = withProjectWordPressConnectionDefaults(connection, tenant);
      await this.sql`
        insert into project_wordpress_connections (
          project_id, organisation_id, created_by_user_id, site_url, username, encrypted_application_password,
          connection_status, default_post_status, default_category, last_validated_at, last_error, document, created_at, updated_at
        )
        values (
          ${next.projectId}, ${next.organisationId}, ${next.createdByUserId}, ${next.siteUrl}, ${next.username}, ${next.encryptedApplicationPassword},
          ${next.connectionStatus}, ${next.defaultPostStatus}, ${next.defaultCategory ?? null},
          ${next.lastValidatedAt ?? null}::timestamptz, ${next.lastError ?? null}, ${JSON.stringify(next)}::jsonb,
          ${next.createdAt}::timestamptz, ${next.updatedAt}::timestamptz
        )
        on conflict (project_id) do update set
          organisation_id = excluded.organisation_id,
          created_by_user_id = excluded.created_by_user_id,
          site_url = excluded.site_url,
          username = excluded.username,
          encrypted_application_password = excluded.encrypted_application_password,
          connection_status = excluded.connection_status,
          default_post_status = excluded.default_post_status,
          default_category = excluded.default_category,
          last_validated_at = excluded.last_validated_at,
          last_error = excluded.last_error,
          document = excluded.document,
          updated_at = excluded.updated_at
      `;
    });
  }

  async deleteProjectWordPressConnection(projectId: string): Promise<void> {
    return this.withFailureLogging("deleteProjectWordPressConnection", projectId, async () => {
      await this.ensureWordPressConnectionSchema();
      const tenant = await this.ensureTenant();
      await this.sql`
        delete from project_wordpress_connections
        where organisation_id = ${tenant.organisationId}
          and project_id = ${projectId}
      `;
    });
  }

  async getProjectSiteKnowledge(projectId: string): Promise<ProjectSiteKnowledgeDocument | null> {
    return this.withFailureLogging("getProjectSiteKnowledge", projectId, async () => {
      return this.loadProjectSiteKnowledge(projectId);
    });
  }

  async listSiteKnowledgePages(projectId: string): Promise<SiteKnowledgePageDocument[]> {
    return this.withFailureLogging("listSiteKnowledgePages", projectId, async () => {
      await this.ensureSiteKnowledgeSchema();
      const tenant = await this.ensureTenant();
      const found = rows(await this.sql`
        select document
        from project_site_pages
        where organisation_id = ${tenant.organisationId}
          and project_id = ${projectId}
        order by imported_at desc, url asc
      `);
      return found.map((row) => row.document as SiteKnowledgePageDocument);
    });
  }

  async saveProjectSiteKnowledge(siteKnowledge: ProjectSiteKnowledgeDocument): Promise<void> {
    return this.withFailureLogging("saveProjectSiteKnowledge", siteKnowledge.projectId, async () => {
      await this.ensureSiteKnowledgeSchema();
      const tenant = await this.ensureTenant();
      await this.ensureProjectRows(siteKnowledge.projectId);
      const next = withProjectSiteKnowledgeDefaults(siteKnowledge, tenant);
      await this.sql`
        insert into project_site_knowledge (
          project_id, organisation_id, sitemap_url, status, pages_indexed, processed_pages, total_discovered_urls,
          started_at, completed_at, last_imported_at, current_url, last_error, metadata, document, created_at, updated_at
        )
        values (
          ${next.projectId}, ${next.organisationId}, ${next.sitemapUrl}, ${next.status}, ${next.pagesIndexed},
          ${next.processedPages}, ${next.totalDiscoveredUrls}, ${next.startedAt ?? null}::timestamptz,
          ${next.completedAt ?? null}::timestamptz, ${next.lastImportedAt ?? null}::timestamptz, ${next.currentUrl ?? null},
          ${next.lastError ?? null}, ${JSON.stringify(next.metadata)}::jsonb, ${JSON.stringify(next)}::jsonb,
          ${next.createdAt}::timestamptz, ${next.updatedAt}::timestamptz
        )
        on conflict (project_id) do update set
          organisation_id = excluded.organisation_id,
          sitemap_url = excluded.sitemap_url,
          status = excluded.status,
          pages_indexed = excluded.pages_indexed,
          processed_pages = excluded.processed_pages,
          total_discovered_urls = excluded.total_discovered_urls,
          started_at = excluded.started_at,
          completed_at = excluded.completed_at,
          last_imported_at = excluded.last_imported_at,
          current_url = excluded.current_url,
          last_error = excluded.last_error,
          metadata = excluded.metadata,
          document = excluded.document,
          updated_at = excluded.updated_at
      `;
    });
  }

  async getProjectSiteProfile(projectId: string): Promise<ProjectSiteProfileDocument | null> {
    return this.withFailureLogging("getProjectSiteProfile", projectId, async () => {
      await this.ensureSiteKnowledgeSchema();
      const tenant = await this.ensureTenant();
      const found = rows(await this.sql`
        select *
        from project_site_profile
        where organisation_id = ${tenant.organisationId}
          and project_id = ${projectId}
        limit 1
      `);
      return found[0] ? siteProfileFromRow(found[0]) : null;
    });
  }

  async saveProjectSiteProfile(profile: ProjectSiteProfileDocument): Promise<void> {
    return this.withFailureLogging("saveProjectSiteProfile", profile.projectId, async () => {
      await this.ensureSiteKnowledgeSchema();
      const tenant = await this.ensureTenant();
      await this.ensureProjectRows(profile.projectId);
      const next = withProjectSiteProfileDefaults(profile, tenant);
      await this.sql`
        insert into project_site_profile (
          project_id, organisation_id, domain, page_count, services, products, audiences, locations,
          ctas, writing_signals, metadata, document, generated_at, updated_at
        )
        values (
          ${next.projectId}, ${next.organisationId}, ${next.domain}, ${next.pageCount},
          ${JSON.stringify(next.services)}::jsonb, ${JSON.stringify(next.products)}::jsonb,
          ${JSON.stringify(next.audiences)}::jsonb, ${JSON.stringify(next.locations)}::jsonb,
          ${JSON.stringify(next.ctas)}::jsonb, ${JSON.stringify(next.writingSignals)}::jsonb,
          ${JSON.stringify(next.metadata)}::jsonb, ${JSON.stringify(next)}::jsonb,
          ${next.generatedAt}::timestamptz, ${next.updatedAt}::timestamptz
        )
        on conflict (project_id) do update set
          organisation_id = excluded.organisation_id,
          domain = excluded.domain,
          page_count = excluded.page_count,
          services = excluded.services,
          products = excluded.products,
          audiences = excluded.audiences,
          locations = excluded.locations,
          ctas = excluded.ctas,
          writing_signals = excluded.writing_signals,
          metadata = excluded.metadata,
          document = excluded.document,
          generated_at = excluded.generated_at,
          updated_at = excluded.updated_at
      `;
    });
  }

  async saveSiteKnowledgePage(page: SiteKnowledgePageDocument, projectId: string): Promise<void> {
    return this.withFailureLogging("saveSiteKnowledgePage", page.id, async () => {
      await this.ensureSiteKnowledgeSchema();
      const tenant = await this.ensureTenant();
      await this.ensureProjectRows(projectId);
      const next = withSiteKnowledgePageDefaults(page, tenant, projectId);
      await this.sql`
        insert into project_site_pages (
          id, organisation_id, project_id, url, title, h1, meta_description, short_summary, imported_at, metadata, document, updated_at
        )
        values (
          ${next.id}, ${next.organisationId}, ${next.projectId}, ${next.url}, ${next.title}, ${next.h1 || null},
          ${next.metaDescription || null}, ${next.shortSummary || null}, ${next.importedAt}::timestamptz,
          ${JSON.stringify(next.metadata)}::jsonb, ${JSON.stringify(next)}::jsonb, ${next.updatedAt}::timestamptz
        )
        on conflict (organisation_id, project_id, url) do update set
          id = excluded.id,
          title = excluded.title,
          h1 = excluded.h1,
          meta_description = excluded.meta_description,
          short_summary = excluded.short_summary,
          imported_at = excluded.imported_at,
          metadata = excluded.metadata,
          document = excluded.document,
          updated_at = excluded.updated_at
      `;
    });
  }

  async listArticleSummaries(projectId: string): Promise<ArticleSummary[]> {
    return this.withFailureLogging("listArticleSummaries", projectId, async () => {
      const found = rows(await this.sql`
        select document
        from articles
        where project_id = ${projectId}
        order by updated_at desc
      `);
      return found.map((row) => toArticleSummary(applyPublishingDefaults(row.document as ArticleDocument)));
    });
  }

  async getArticleListMetadata(projectId: string) {
    return this.withFailureLogging("getArticleListMetadata", projectId, async () => {
      const found = rows(await this.sql`
        select id, coalesce((document->>'isPinned')::boolean, false) as is_pinned,
          jsonb_array_length(coalesce(sources, '[]'::jsonb))::int as source_count
        from articles where project_id = ${projectId}
        order by updated_at desc
      `);
      return {
        pinnedIds: found.filter((row) => Boolean(row.is_pinned)).map((row) => String(row.id)),
        sourceCounts: Object.fromEntries(found.map((row) => [String(row.id), Number(row.source_count ?? 0)]))
      };
    });
  }

  async getProjectAnalytics(projectId: string): Promise<ProjectAnalyticsSummary> {
    return this.withFailureLogging("getProjectAnalytics", projectId, async () => {
      const found = rows(await this.sql`
        with article_metrics as (
          select
            count(*)::int as article_count,
            count(*) filter (where status = 'generated')::int as generated_count,
            count(*) filter (where status = 'needs_review')::int as review_count,
            coalesce(round(avg(quality_score)), 0)::int as average_quality,
            coalesce(round(avg(coalesce((document #>> '{summaryScores,research}')::numeric, quality_score, 0))), 0)::int as average_research,
            coalesce(round(avg(coalesce((document #>> '{summaryScores,evidence}')::numeric, quality_score, 0))), 0)::int as average_evidence,
            coalesce(sum(word_count), 0)::int as total_words,
            coalesce(sum(jsonb_array_length(coalesce(sources, '[]'::jsonb))), 0)::int as source_count
          from articles
          where project_id = ${projectId}
            and status in ('generated', 'needs_review')
        ), job_metrics as (
          select count(*) filter (where status in ('failed', 'research_failed'))::int as failed_count
          from jobs where project_id = ${projectId}
        )
        select article_metrics.*, job_metrics.failed_count
        from article_metrics cross join job_metrics
      `);
      const row = found[0] ?? {};
      return {
        article_count: Number(row.article_count ?? 0),
        generated_count: Number(row.generated_count ?? 0),
        review_count: Number(row.review_count ?? 0),
        failed_count: Number(row.failed_count ?? 0),
        average_quality: Number(row.average_quality ?? 0),
        average_research: Number(row.average_research ?? 0),
        average_evidence: Number(row.average_evidence ?? 0),
        total_words: Number(row.total_words ?? 0),
        source_count: Number(row.source_count ?? 0)
      };
    });
  }

  async deletePath(path: string): Promise<void> {
    return this.withFailureLogging("deletePath", path, async () => {
      if (isWorkspacePath(path)) {
        const projectId = pathProjectId(path);
        await this.sql`delete from projects where id = ${projectId}`;
        this.ensuredProjects.delete(projectId);
      } else if (isSettingsPath(path)) {
        await this.sql`delete from project_settings where project_id = ${pathProjectId(path)}`;
      } else if (isSiteKnowledgePath(path)) {
        await this.ensureSiteKnowledgeSchema();
        const tenant = await this.ensureTenant();
        await this.sql`
          delete from project_site_knowledge
          where organisation_id = ${tenant.organisationId}
            and project_id = ${pathProjectId(path)}
        `;
      } else if (isSiteKnowledgePagePath(path)) {
        await this.ensureSiteKnowledgeSchema();
        const tenant = await this.ensureTenant();
        await this.sql`
          delete from project_site_pages
          where organisation_id = ${tenant.organisationId}
            and project_id = ${pathProjectId(path)}
            and id = ${pathId(path)}
        `;
      } else if (isJobPath(path)) {
        const jobId = pathId(path);
        await this.sql`delete from document_versions where project_id = ${pathProjectId(path)} and document_type = 'job' and document_id = ${jobId}`;
        await this.sql`delete from jobs where id = ${jobId}`;
      } else if (isArticlePath(path) || isArticleMarkdownPath(path)) {
        const articleId = pathId(path);
        await this.sql`delete from document_versions where project_id = ${pathProjectId(path)} and document_type = 'article' and document_id = ${articleId}`;
        await this.sql`delete from articles where id = ${articleId}`;
      } else if (isResearchPath(path)) {
        const id = researchId(pathProjectId(path), pathId(path));
        await this.sql`delete from research_runs where id = ${id} or research_pack_id = ${id}`;
        await this.sql`delete from research_packs where id = ${id}`;
      } else if (isDebugPath(path)) {
        await this.sql`delete from debug_events where project_id = ${pathProjectId(path)} and article_id = ${pathId(path)}`;
      } else if (isGenerationTelemetryPath(path)) {
        await this.sql`delete from generation_telemetry where project_id = ${pathProjectId(path)} and article_id = ${pathId(path)}`;
      } else if (isTelemetryExportStatusPath(path)) {
        const tenant = await this.ensureTenant();
        await this.sql`delete from telemetry_export_status where organisation_id = ${tenant.organisationId} and id = ${decodeURIComponent(pathId(path))}`;
      } else if (isExportPath(path)) {
        await this.sql`delete from exports where project_id = ${pathProjectId(path)} and blob_path = ${path}`;
      } else if (isWorkerLeasePath(path)) {
        const tenant = await this.ensureTenant();
        await this.sql`delete from worker_leases where organisation_id = ${tenant.organisationId} and project_id = ${pathProjectId(path)} and queue_name = 'default'`;
      } else if (isQueueControlPath(path)) {
        const tenant = await this.ensureTenant();
        await this.sql`delete from queue_controls where organisation_id = ${tenant.organisationId} and project_id = ${pathProjectId(path)} and queue_name = 'default'`;
      }
    });
  }

  async getOrganisation() {
    return this.withFailureLogging("getOrganisation", undefined, async () => {
      const tenant = await this.ensureTenant();
      const found = rows(await this.sql`
        select id, name, slug, created_at, updated_at
        from organisations
        where id = ${tenant.organisationId}
      `);
      if (!found[0]) return null;
      return organisationFromRow(found[0]);
    });
  }

  async saveOrganisation(organisation: OrganisationDocument) {
    return this.withFailureLogging("saveOrganisation", undefined, async () => {
      await this.sql`
        insert into organisations (id, name, slug, created_at, updated_at)
        values (${organisation.id}, ${organisation.name}, ${organisation.slug}, ${organisation.createdAt}::timestamptz, ${organisation.updatedAt}::timestamptz)
        on conflict (id) do update set
          name = excluded.name,
          slug = excluded.slug,
          updated_at = excluded.updated_at
      `;
    });
  }

  async createProject(project: ProjectDocument) {
    return this.withFailureLogging("createProject", workspacePath(project.id), async () => {
      await this.saveProject(project);
      return this.getProject(project.id);
    });
  }

  async updateProject(project: ProjectDocument) {
    return this.createProject(project);
  }

  async deleteProject(projectId: string) {
    return this.withFailureLogging("deleteProject", workspacePath(projectId), async () => {
      await this.sql`delete from document_versions where project_id = ${projectId}`;
      await this.sql`delete from articles where project_id = ${projectId}`;
      await this.sql`delete from jobs where project_id = ${projectId}`;
      await this.sql`delete from projects where id = ${projectId}`;
      this.ensuredProjects.delete(projectId);
    });
  }

  async createDocument<T>(path: string, value: T) {
    await this.putJson(path, value);
    return this.getJson<T>(path);
  }

  async updateDocument<T>(path: string, value: T) {
    return this.createDocument<T>(path, value);
  }

  async deleteDocument(path: string) {
    await this.deletePath(path);
  }

  async createVersion(input: {
    projectId: string;
    documentId: string;
    documentType: string;
    content: string;
    metadata?: Record<string, unknown>;
    createdAt?: string;
  }) {
    return this.withFailureLogging("createVersion", undefined, async () => {
      const tenant = await this.ensureTenant();
      await this.ensureProjectRows(input.projectId);
      const nextRows = rows(await this.sql`
        select coalesce(max(version_number), 0) + 1 as version_number
        from document_versions
        where organisation_id = ${tenant.organisationId}
          and project_id = ${input.projectId}
          and document_type = ${input.documentType}
          and document_id = ${input.documentId}
      `);
      const versionNumber = Number(nextRows[0]?.version_number ?? 1);
      const version: DocumentVersion = {
        id: `${input.projectId}:${input.documentType}:${input.documentId}:${versionNumber}`,
        organisationId: tenant.organisationId,
        projectId: input.projectId,
        documentId: input.documentId,
        documentType: input.documentType,
        versionNumber,
        content: input.content,
        metadata: input.metadata ?? {},
        createdByUserId: tenant.userId,
        createdAt: input.createdAt ?? new Date().toISOString()
      };
      await this.sql`
        insert into document_versions (
          id, organisation_id, project_id, document_id, document_type, version_number, content,
          metadata, created_by_user_id, created_at
        )
        values (
          ${version.id}, ${version.organisationId}, ${version.projectId}, ${version.documentId}, ${version.documentType},
          ${version.versionNumber}, ${version.content}, ${JSON.stringify(version.metadata)}::jsonb,
          ${version.createdByUserId}, ${version.createdAt}::timestamptz
        )
      `;
      return version;
    });
  }

  async getVersionHistory(input: { projectId: string; documentId: string; documentType: string }) {
    return this.withFailureLogging("getVersionHistory", undefined, async () => {
      const tenant = await this.ensureTenant();
      const found = rows(await this.sql`
        select id, organisation_id, project_id, document_id, document_type, version_number, content, metadata, created_by_user_id, created_at
        from document_versions
        where organisation_id = ${tenant.organisationId}
          and project_id = ${input.projectId}
          and document_type = ${input.documentType}
          and document_id = ${input.documentId}
        order by version_number desc
      `);
      return found.map(versionFromRow);
    });
  }

  async getResearchRun(id: string) {
    return this.withFailureLogging("getResearchRun", undefined, async () => {
      const tenant = await this.ensureTenant();
      const found = rows(await this.sql`
        select *
        from research_runs
        where organisation_id = ${tenant.organisationId} and id = ${id}
      `);
      return found[0] ? researchRunFromRow(found[0]) : null;
    });
  }

  async listResearchRuns(projectId = DEFAULT_PROJECT_ID) {
    return this.withFailureLogging("listResearchRuns", undefined, async () => {
      const tenant = await this.ensureTenant();
      const found = rows(await this.sql`
        select *
        from research_runs
        where organisation_id = ${tenant.organisationId} and project_id = ${projectId}
        order by created_at desc
      `);
      return found.map(researchRunFromRow);
    });
  }

  async listResearchSources(projectId = DEFAULT_PROJECT_ID) {
    return this.withFailureLogging("listResearchSources", undefined, async () => {
      const tenant = await this.ensureTenant();
      const found = rows(await this.sql`
        select id, title, url, domain, summary, highlights, authority_score, relevance_score, accepted, rejection_reason
        from research_sources
        where organisation_id = ${tenant.organisationId} and project_id = ${projectId}
        order by last_seen_at desc, first_seen_at desc
      `);
      return found.map(researchSourceFromRow);
    });
  }

  async listResearchFindings(projectId = DEFAULT_PROJECT_ID) {
    return this.withFailureLogging("listResearchFindings", undefined, async () => {
      const tenant = await this.ensureTenant();
      const found = rows(await this.sql`
        select *
        from research_findings
        where organisation_id = ${tenant.organisationId} and project_id = ${projectId}
        order by created_at desc
      `);
      return found.map(researchFindingFromRow);
    });
  }

  async listSourceCitations(projectId = DEFAULT_PROJECT_ID) {
    return this.withFailureLogging("listSourceCitations", undefined, async () => {
      const tenant = await this.ensureTenant();
      const found = rows(await this.sql`
        select *
        from source_citations
        where organisation_id = ${tenant.organisationId} and project_id = ${projectId}
        order by created_at desc
      `);
      return found.map(sourceCitationFromRow);
    });
  }

  async globalSearch(query: string, projectId = DEFAULT_PROJECT_ID, limit = 8): Promise<GlobalSearchResponse> {
    return this.withFailureLogging("globalSearch", undefined, async () => {
      const tenant = await this.ensureTenant();
      const clean = query.trim();
      const pattern = `%${clean}%`;
      const groups = emptySearchGroups();
      if (clean.length < 2) return { query: clean, groups };

      const projects = rows(await this.sql`
        select id, name, updated_at
        from projects
        where organisation_id = ${tenant.organisationId}
          and (name ilike ${pattern} or slug ilike ${pattern})
        order by updated_at desc
        limit ${limit}
      `);
      groups.project = projects.map((row) => ({
        id: String(row.id),
        type: "project",
        title: String(row.name),
        projectId: String(row.id),
        updatedAt: toIso(row.updated_at)
      }));

      const articles = rows(await this.sql`
        select id, project_id, job_id, title, left(markdown, 260) as excerpt, updated_at
        from articles
        where organisation_id = ${tenant.organisationId}
          and project_id = ${projectId}
          and (
            title ilike ${pattern}
            or markdown ilike ${pattern}
            or to_tsvector('simple', coalesce(title, '') || ' ' || coalesce(markdown, '')) @@ plainto_tsquery('simple', ${clean})
          )
        order by updated_at desc
        limit ${limit}
      `);
      groups.article = articles.map((row) => ({
        id: String(row.id),
        type: "article",
        title: String(row.title),
        projectId: String(row.project_id),
        articleId: String(row.id),
        jobId: nullableString(row.job_id),
        matchedText: nullableString(row.excerpt),
        updatedAt: toIso(row.updated_at)
      }));

      const runs = rows(await this.sql`
        select id, project_id, article_id, job_id, title, query, updated_at
        from research_runs
        where organisation_id = ${tenant.organisationId}
          and project_id = ${projectId}
          and (
            title ilike ${pattern}
            or query ilike ${pattern}
            or queries::text ilike ${pattern}
            or warnings::text ilike ${pattern}
          )
        order by updated_at desc
        limit ${limit}
      `);
      groups.research_run = runs.map((row) => ({
        id: String(row.id),
        type: "research_run",
        title: String(row.title),
        subtitle: nullableString(row.query) ?? "Research run",
        projectId: String(row.project_id),
        articleId: nullableString(row.article_id),
        jobId: nullableString(row.job_id),
        updatedAt: toIso(row.updated_at)
      }));

      const sources = rows(await this.sql`
        select id, project_id, article_id, title, url, domain, summary, last_seen_at
        from research_sources
        where organisation_id = ${tenant.organisationId}
          and project_id = ${projectId}
          and (
            title ilike ${pattern}
            or url ilike ${pattern}
            or domain ilike ${pattern}
            or summary ilike ${pattern}
            or highlights::text ilike ${pattern}
          )
        order by last_seen_at desc
        limit ${limit}
      `);
      groups.research_source = sources.map((row) => ({
        id: String(row.id),
        type: "research_source",
        title: String(row.domain || row.title),
        subtitle: String(row.title),
        projectId: String(row.project_id),
        articleId: nullableString(row.article_id),
        url: nullableString(row.url),
        matchedText: nullableString(row.summary),
        updatedAt: toIso(row.last_seen_at)
      }));

      const findings = rows(await this.sql`
        select f.id, f.project_id, f.research_run_id, f.source_id, f.finding_type, f.content, f.created_at, r.article_id, r.job_id, r.title as run_title
        from research_findings f
        left join research_runs r on r.id = f.research_run_id
        where f.organisation_id = ${tenant.organisationId}
          and f.project_id = ${projectId}
          and (
            f.content ilike ${pattern}
            or to_tsvector('simple', f.content) @@ plainto_tsquery('simple', ${clean})
          )
        order by f.created_at desc
        limit ${limit}
      `);
      groups.research_finding = findings.map((row) => ({
        id: String(row.id),
        type: "research_finding",
        title: String(row.content),
        subtitle: `${String(row.finding_type).replace("_", " ")} · ${String(row.run_title ?? "Research")}`,
        projectId: String(row.project_id),
        articleId: nullableString(row.article_id),
        jobId: nullableString(row.job_id),
        matchedText: String(row.content),
        updatedAt: toIso(row.created_at)
      }));

      return { query: clean, groups };
    });
  }

  private async putJsonIfAbsentUnsafe<T>(path: string, value: T): Promise<boolean> {
    if (!isWorkerLeasePath(path)) {
      const existing = await this.getJson(path);
      if (existing) return false;
      await this.putJson(path, value);
      return true;
    }

    const tenant = await this.ensureTenant();
    const lease = withLeaseDefaults(value as WorkerLeaseDocument, tenant, pathProjectId(path));
    await this.ensureProjectRows(lease.projectId ?? DEFAULT_PROJECT_ID);
    const inserted = rows(await this.sql`
      insert into worker_leases (
        organisation_id, project_id, queue_name, lease_id, owner, token, acquired_at, expires_at, document
      )
      values (
        ${lease.organisationId}, ${lease.projectId}, ${lease.queueName}, ${lease.id}, ${lease.owner}, ${lease.token},
        ${lease.acquiredAt}::timestamptz, ${lease.expiresAt}::timestamptz, ${JSON.stringify(lease)}::jsonb
      )
      on conflict (organisation_id, project_id, queue_name) do nothing
      returning token
    `);
    return inserted.length > 0;
  }

  private async listPathsUnsafe(prefix: string): Promise<string[]> {
    if (prefix === "projects/" || prefix === "projects") {
      const found = rows(await this.sql`select id from projects order by updated_at desc`);
      return found.map((row) => workspacePath(String(row.id)));
    }
    const projectId = pathProjectId(prefix);
    if (prefix === `projects/${projectId}/`) {
      const found = rows(await this.sql`select id from projects where id = ${projectId}`);
      return found.length ? [workspacePath(projectId)] : [];
    }
    if (prefix.endsWith("/jobs/")) {
      const found = rows(await this.sql`select id from jobs where project_id = ${projectId} order by created_at asc`);
      return found.map((row) => jobPath(String(row.id), projectId));
    }
    if (prefix.endsWith("/articles/")) {
      const found = rows(await this.sql`select id from articles where project_id = ${projectId} order by updated_at desc`);
      return found.flatMap((row) => [articlePath(String(row.id), projectId), articleMarkdownPath(String(row.id), projectId)]);
    }
    if (prefix.endsWith("/knowledge/site/")) {
      await this.ensureSiteKnowledgeSchema();
      const tenant = await this.ensureTenant();
      const found = rows(await this.sql`
        select project_id
        from project_site_knowledge
        where organisation_id = ${tenant.organisationId}
          and project_id = ${projectId}
      `);
      return found.length ? [siteKnowledgePath(projectId)] : [];
    }
    if (prefix.endsWith("/knowledge/site/pages/")) {
      await this.ensureSiteKnowledgeSchema();
      const tenant = await this.ensureTenant();
      const found = rows(await this.sql`
        select id
        from project_site_pages
        where organisation_id = ${tenant.organisationId}
          and project_id = ${projectId}
        order by imported_at desc, url asc
      `);
      return found.map((row) => siteKnowledgePagePath(String(row.id), projectId));
    }
    if (prefix.endsWith("/research/")) {
      const found = rows(await this.sql`select article_id from research_packs where project_id = ${projectId} order by created_at asc`);
      return found.map((row) => researchPath(String(row.article_id), projectId));
    }
    if (prefix.endsWith("/debug/")) {
      const found = rows(await this.sql`select distinct article_id from debug_events where project_id = ${projectId} order by article_id asc`);
      return found.map((row) => debugPath(String(row.article_id), projectId));
    }
    if (prefix.endsWith("/telemetry/generations/")) {
      const found = rows(await this.sql`select article_id from generation_telemetry where project_id = ${projectId} order by updated_at desc`);
      return found.map((row) => generationTelemetryPath(String(row.article_id), projectId));
    }
    if (prefix === telemetryExportStatusPrefix()) {
      const tenant = await this.ensureTenant();
      const found = rows(await this.sql`
        select id
        from telemetry_export_status
        where organisation_id = ${tenant.organisationId}
        order by updated_at desc
      `);
      return found.map((row) => telemetryExportStatusPath(String(row.id)));
    }
    if (prefix.endsWith("/queue/")) {
      const tenant = await this.ensureTenant();
      const found = rows(await this.sql`select project_id from queue_controls where organisation_id = ${tenant.organisationId} and project_id = ${projectId}`);
      return found.map(() => queueControlPath(projectId));
    }
    if (prefix.endsWith("/exports/")) {
      const found = rows(await this.sql`select blob_path from exports where project_id = ${projectId} order by created_at asc`);
      return found.map((row) => String(row.blob_path));
    }
    return [];
  }

  private async getProject(projectId: string) {
    const found = rows(await this.sql`select document from projects where id = ${projectId}`);
    const project = found[0]?.document as ProjectDocument | null ?? null;
    return project ? { ...project, profile: normalizeProjectProfile(project.profile) } : null;
  }

  private async getActiveProject() {
    const tenant = await this.ensureTenant();
    const found = rows(await this.sql`
      select settings->>'active_project_id' as project_id, updated_at
      from organisation_settings
      where organisation_id = ${tenant.organisationId}
    `);
    return {
      projectId: String(found[0]?.project_id ?? DEFAULT_PROJECT_ID),
      updatedAt: found[0]?.updated_at ? new Date(found[0].updated_at as string | number | Date).toISOString() : new Date().toISOString()
    };
  }

  private async saveActiveProject(active: { projectId?: string; updatedAt?: string }) {
    const tenant = await this.ensureTenant();
    const projectId = active.projectId || DEFAULT_PROJECT_ID;
    await this.sql`
      insert into organisation_settings (organisation_id, settings, updated_at)
      values (${tenant.organisationId}, ${JSON.stringify({ active_project_id: projectId })}::jsonb, ${active.updatedAt ?? new Date().toISOString()}::timestamptz)
      on conflict (organisation_id) do update set
        settings = jsonb_set(organisation_settings.settings, '{active_project_id}', to_jsonb(${projectId}::text), true),
        updated_at = excluded.updated_at
    `;
  }

  private async getWorkspacePreferences() {
    const tenant = await this.ensureTenant();
    const found = rows(await this.sql`
      select workspace_preferences as preferences
      from organisation_settings
      where organisation_id = ${tenant.organisationId}
    `);
    const userFound = rows(await this.sql`
      select preferences
      from user_provider_preferences
      where organisation_id = ${tenant.organisationId} and user_id = ${tenant.userId}
    `);
    const saved = isRecord(found[0]?.preferences) ? found[0].preferences as unknown as WorkspacePreferencesDocument : null;
    const userPreferences = isRecord(userFound[0]?.preferences) ? userFound[0].preferences as Record<string, unknown> : {};
    const normalized = withWorkspacePreferenceDefaults(saved, tenant);
    const aiProvider = normalized.aiProvider;
    const researchApiKey = typeof userPreferences.researchApiKey === "string" ? userPreferences.researchApiKey : "";
    const researchProvider = userPreferences.researchProvider === "byok" && researchApiKey ? "byok" : "queuewrite";
    return {
      ...normalized,
      aiProvider: {
        preference: aiProvider.writerKeyEnabled ? "bring_your_own_key" : "platform_managed",
        personalKeyStatus: aiProvider.writerKeyEnabled ? aiProvider.personalKeyStatus : "not_configured",
        writerKeyEnabled: aiProvider.writerKeyEnabled,
        writerKeyStatus: aiProvider.writerKeyStatus,
        writerApiKey: aiProvider.writerApiKey,
        researchProvider,
        researchKeyEnabled: Boolean(researchApiKey),
        researchKeyStatus: researchApiKey ? "configured" : "not_configured",
        researchApiKey,
        byokResearchProvider: "tavily"
      }
    };
  }

  private async saveWorkspacePreferences(preferences: WorkspacePreferencesDocument) {
    const tenant = await this.ensureTenant();
    const next = withWorkspacePreferenceDefaults(preferences, tenant);
    const aiProvider = next.aiProvider;
    const workspaceDocument = {
      ...next,
      aiProvider: {
        preference: aiProvider.writerKeyEnabled ? "bring_your_own_key" : "platform_managed",
        personalKeyStatus: aiProvider.writerKeyEnabled ? aiProvider.personalKeyStatus : "not_configured",
        writerKeyEnabled: aiProvider.writerKeyEnabled,
        writerKeyStatus: aiProvider.writerKeyStatus,
        writerApiKey: aiProvider.writerApiKey,
        researchProvider: "queuewrite",
        researchKeyEnabled: false,
        researchKeyStatus: "not_configured",
        researchApiKey: "",
        byokResearchProvider: "tavily"
      }
    };
    await this.sql`
      insert into organisation_settings (organisation_id, settings, workspace_preferences, updated_at)
      values (
        ${tenant.organisationId},
        '{}'::jsonb,
        ${JSON.stringify(workspaceDocument)}::jsonb,
        ${next.updatedAt}::timestamptz
      )
      on conflict (organisation_id) do update set
        workspace_preferences = ${JSON.stringify(workspaceDocument)}::jsonb,
        updated_at = excluded.updated_at
    `;
    await this.sql`
      insert into user_provider_preferences (organisation_id, user_id, preferences, updated_at)
      values (
        ${tenant.organisationId},
        ${tenant.userId},
        ${JSON.stringify({
          researchProvider: next.aiProvider.researchProvider === "byok" && next.aiProvider.researchApiKey ? "byok" : "queuewrite",
          byokResearchProvider: "tavily",
          researchApiKey: next.aiProvider.researchApiKey ?? ""
        })}::jsonb,
        ${next.updatedAt}::timestamptz
      )
      on conflict (organisation_id, user_id) do update set
        preferences = excluded.preferences,
        updated_at = excluded.updated_at
    `;
  }

  private async getSettings(projectId: string) {
    const found = rows(await this.sql`select document from project_settings where project_id = ${projectId}`);
    return found[0]?.document as SettingsDocument | null ?? null;
  }

  private async getQueueControl(projectId: string) {
    const tenant = await this.ensureTenant();
    const found = rows(await this.sql`
      select document from queue_controls
      where organisation_id = ${tenant.organisationId} and project_id = ${projectId} and queue_name = 'default'
    `);
    return found[0]?.document as QueueControlDocument | null ?? null;
  }

  private async loadProjectSiteKnowledge(projectId: string) {
    await this.ensureSiteKnowledgeSchema();
    const tenant = await this.ensureTenant();
    const found = rows(await this.sql`
      select *
      from project_site_knowledge
      where organisation_id = ${tenant.organisationId}
        and project_id = ${projectId}
      limit 1
    `);
    return found[0] ? siteKnowledgeFromRow(found[0]) : null;
  }

  private async getSiteKnowledgePage(projectId: string, pageId: string) {
    await this.ensureSiteKnowledgeSchema();
    const tenant = await this.ensureTenant();
    const found = rows(await this.sql`
      select *
      from project_site_pages
      where organisation_id = ${tenant.organisationId}
        and project_id = ${projectId}
        and id = ${pageId}
      limit 1
    `);
    return found[0] ? siteKnowledgePageFromRow(found[0]) : null;
  }

  private async getWorkerLease(projectId: string) {
    const tenant = await this.ensureTenant();
    const found = rows(await this.sql`
      select document from worker_leases
      where organisation_id = ${tenant.organisationId} and project_id = ${projectId} and queue_name = 'default'
    `);
    return found[0]?.document as WorkerLeaseDocument | null ?? null;
  }

  private async getDebug(projectId: string, articleId: string) {
    const found = rows(await this.sql`
      select job_id, jsonb_agg(jsonb_build_object('at', occurred_at, 'stage', stage, 'level', level, 'message', message, 'data', data) order by occurred_at) as events, max(occurred_at) as updated_at
      from debug_events
      where project_id = ${projectId} and article_id = ${articleId}
      group by job_id
      limit 1
    `);
    if (!found[0]) return null;
    return {
      projectId,
      articleId,
      jobId: String(found[0].job_id),
      events: Array.isArray(found[0].events) ? found[0].events as DebugDocument["events"] : [],
      updatedAt: new Date(found[0].updated_at as string | number | Date).toISOString()
    } satisfies DebugDocument;
  }

  private async getDocument<T>(table: "jobs" | "articles" | "research_packs", id: string) {
    const found = rows(table === "jobs"
      ? await this.sql`select document from jobs where id = ${id}`
      : table === "articles"
        ? await this.sql`select document from articles where id = ${id}`
        : await this.sql`select document from research_packs where id = ${id}`);
    if (!found[0]?.document) return null;
    if (table === "articles") {
      return applyPublishingDefaults(found[0].document as ArticleDocument) as T;
    }
    return found[0].document as T;
  }

  private async getSingleQueueJob(projectId: string, status: "queued" | "processing") {
    return this.withFailureLogging(`getSingleQueueJob:${status}`, projectId, async () => {
      const tenant = await this.ensureTenant();
      const found = rows(await this.sql`
        select document from jobs
        where organisation_id = ${tenant.organisationId}
          and project_id = ${projectId}
          and jobs.status = ${status}
        order by queue_position asc, created_at asc
        limit 1
      `);
      return found[0]?.document as QueueJob | null ?? null;
    });
  }

  private async listDocuments<T>(table: "jobs" | "articles", projectId: string, order: "created_at asc" | "updated_at desc") {
    const found = rows(table === "jobs"
      ? await this.sql`select document from jobs where project_id = ${projectId} order by created_at asc`
      : await this.sql`select document from articles where project_id = ${projectId} order by updated_at desc`);
    return found.map((row) => (
      table === "articles"
        ? applyPublishingDefaults(row.document as ArticleDocument) as T
        : row.document as T
    ));
  }

  private async saveProject(project: ProjectDocument) {
    const tenant = await this.ensureTenant();
    const next = withProjectDefaults(project, tenant);
    await this.sql`
      insert into projects (id, organisation_id, name, slug, created_by_user_id, document, created_at, updated_at)
      values (${next.id}, ${next.organisationId}, ${next.name}, ${next.slug}, ${next.createdByUserId}, ${JSON.stringify(next)}::jsonb, ${next.createdAt}::timestamptz, ${next.updatedAt}::timestamptz)
      on conflict (id) do update set
        organisation_id = excluded.organisation_id,
        name = excluded.name,
        slug = excluded.slug,
        document = excluded.document,
        updated_at = excluded.updated_at
    `;
    this.ensuredProjects.add(next.id);
  }

  private async saveSettings(settings: SettingsDocument) {
    const tenant = await this.ensureTenant();
    await this.ensureProjectRows(settings.projectId);
    const next = { ...settings, organisationId: settings.organisationId ?? tenant.organisationId };
    await this.sql`
      insert into project_settings (project_id, organisation_id, settings, document, updated_at)
      values (${next.projectId}, ${next.organisationId}, ${JSON.stringify(next.controls)}::jsonb, ${JSON.stringify(next)}::jsonb, now())
      on conflict (project_id) do update set
        organisation_id = excluded.organisation_id,
        settings = excluded.settings,
        document = excluded.document,
        updated_at = excluded.updated_at
    `;
  }

  private async saveQueueControl(control: QueueControlDocument) {
    const tenant = await this.ensureTenant();
    await this.ensureProjectRows(control.projectId);
    const next = withQueueControlDefaults(control, tenant);
    await this.sql`
      insert into queue_controls (organisation_id, project_id, queue_name, mode, requested_by, requested_at, stopped_at, reason, document, updated_at)
      values (
        ${next.organisationId}, ${next.projectId}, 'default', ${next.mode}, ${next.requestedBy ?? null},
        ${next.requestedAt ?? null}::timestamptz, ${next.stoppedAt ?? null}::timestamptz, ${next.reason ?? null},
        ${JSON.stringify(next)}::jsonb, ${next.updatedAt}::timestamptz
      )
      on conflict (organisation_id, project_id, queue_name) do update set
        mode = excluded.mode,
        requested_by = excluded.requested_by,
        requested_at = excluded.requested_at,
        stopped_at = excluded.stopped_at,
        reason = excluded.reason,
        document = excluded.document,
        updated_at = excluded.updated_at
    `;
  }

  private async saveJob(job: QueueJob) {
    const tenant = await this.ensureTenant();
    await this.ensureProjectRows(job.projectId);
    const next = withJobDefaults(job, tenant);
    await this.sql`
      insert into jobs (
        id, organisation_id, project_id, article_id, title, status, status_reason, attempts, queue_position, needs_review_reasons,
        fatal_error, pipeline, timings, created_by_user_id, document, created_at, updated_at
      )
      values (
        ${next.id}, ${next.organisationId}, ${next.projectId}, ${next.articleId}, ${next.title}, ${next.status},
        ${next.statusReason ?? null}, ${next.attempts}, ${next.queuePosition ?? new Date(next.createdAt).getTime()}, ${JSON.stringify(next.needsReviewReasons)}::jsonb,
        ${next.fatalError ?? null}, ${JSON.stringify(next.pipeline)}::jsonb, ${JSON.stringify(next.timings ?? {})}::jsonb,
        ${next.createdByUserId}, ${JSON.stringify(next)}::jsonb, ${next.createdAt}::timestamptz, ${next.updatedAt}::timestamptz
      )
      on conflict (id) do update set
        status = excluded.status,
        status_reason = excluded.status_reason,
        attempts = excluded.attempts,
        queue_position = excluded.queue_position,
        needs_review_reasons = excluded.needs_review_reasons,
        fatal_error = excluded.fatal_error,
        pipeline = excluded.pipeline,
        timings = excluded.timings,
        document = excluded.document,
        updated_at = excluded.updated_at
    `;
  }

  private async saveArticleRow(article: ArticleDocument) {
    const tenant = await this.ensureTenant();
    await this.ensureProjectRows(article.projectId);
    const next = withArticleDefaults(article, tenant);
    const summary = toArticleSummary(next);
    const persistedDocument = {
      ...next,
      summaryScores: { research: summary.researchScore, evidence: summary.evidenceScore }
    };
    await this.sql`
      insert into articles (
        id, organisation_id, project_id, job_id, title, status, status_reason, markdown, markdown_blob_path,
        current_version_number, versioned_at, word_count, quality_score, research_summary, validation, pipeline,
        sources, needs_review_reasons, timings, created_by_user_id, document, created_at, updated_at
      )
      values (
        ${next.id}, ${next.organisationId}, ${next.projectId}, ${next.jobId}, ${next.title}, ${next.status},
        ${next.statusReason ?? null}, ${next.markdown}, ${next.markdownBlobPath ?? null}, ${next.currentVersionNumber},
        ${next.versionedAt ?? null}::timestamptz, ${next.wordCount}, ${next.qualityScore}, ${next.researchSummary},
        ${JSON.stringify(next.validation)}::jsonb, ${JSON.stringify(next.pipeline)}::jsonb, ${JSON.stringify(next.sources)}::jsonb,
        ${JSON.stringify(next.needsReviewReasons)}::jsonb, ${JSON.stringify(next.timings ?? {})}::jsonb,
        ${next.createdByUserId}, ${JSON.stringify(persistedDocument)}::jsonb, ${next.createdAt}::timestamptz, ${next.updatedAt}::timestamptz
      )
      on conflict (id) do update set
        status = excluded.status,
        status_reason = excluded.status_reason,
        markdown = excluded.markdown,
        markdown_blob_path = excluded.markdown_blob_path,
        current_version_number = excluded.current_version_number,
        versioned_at = excluded.versioned_at,
        word_count = excluded.word_count,
        quality_score = excluded.quality_score,
        research_summary = excluded.research_summary,
        validation = excluded.validation,
        pipeline = excluded.pipeline,
        sources = excluded.sources,
        needs_review_reasons = excluded.needs_review_reasons,
        timings = excluded.timings,
        document = excluded.document,
        updated_at = excluded.updated_at
    `;
  }

  private async saveResearch(research: ResearchPack, projectId: string) {
    const tenant = await this.ensureTenant();
    await this.ensureProjectRows(projectId);
    const next = withResearchDefaults(research, tenant, projectId);
    await this.sql`
      insert into research_packs (
        id, organisation_id, project_id, article_id, job_id, run_number, title, queries, useful_facts, rejected_facts,
        questions_found, headings_found, authority_score, relevance_score, confidence, warnings, request_ids,
        duration_ms, document, created_at
      )
      values (
        ${next.id}, ${next.organisationId}, ${next.projectId}, ${next.articleId}, ${next.jobId ?? null}, ${next.runNumber},
        ${next.title}, ${JSON.stringify(next.queries)}::jsonb, ${JSON.stringify(next.usefulFacts)}::jsonb,
        ${JSON.stringify(next.rejectedFacts)}::jsonb, ${JSON.stringify(next.questionsFound)}::jsonb,
        ${JSON.stringify(next.headingsFound)}::jsonb, ${next.authorityScore}, ${next.relevanceScore}, ${next.confidence},
        ${JSON.stringify(next.warnings)}::jsonb, ${JSON.stringify(next.requestIds)}::jsonb, ${next.durationMs},
        ${JSON.stringify(next)}::jsonb, ${next.createdAt}::timestamptz
      )
      on conflict (id) do update set
        document = excluded.document,
        queries = excluded.queries,
        useful_facts = excluded.useful_facts,
        rejected_facts = excluded.rejected_facts,
        questions_found = excluded.questions_found,
        headings_found = excluded.headings_found,
        authority_score = excluded.authority_score,
        relevance_score = excluded.relevance_score,
        confidence = excluded.confidence,
        warnings = excluded.warnings,
        request_ids = excluded.request_ids,
        duration_ms = excluded.duration_ms
    `;
    await this.saveResearchFoundation(next);
  }

  private async saveResearchFoundation(research: Required<Pick<ResearchPack, "id" | "organisationId" | "projectId" | "runNumber">> & ResearchPack) {
    const createdAt = research.createdAt;
    const runNumber = research.runNumber > 0 ? research.runNumber : await this.nextResearchRunNumber(research.organisationId, research.projectId, research.articleId);
    const runId = researchRunId(research.id, runNumber);
    await this.sql`
      insert into research_runs (
        id, organisation_id, project_id, research_pack_id, article_id, job_id, run_number, title, query, queries,
        status, confidence, authority_score, relevance_score, warnings, request_ids, duration_ms, metadata,
        started_at, completed_at, created_at, updated_at
      )
      values (
        ${runId}, ${research.organisationId}, ${research.projectId}, ${research.id}, ${research.articleId},
        ${research.jobId ?? null}, ${runNumber}, ${research.title}, ${research.queries[0] ?? null},
        ${JSON.stringify(research.queries)}::jsonb, 'completed', ${research.confidence}, ${research.authorityScore},
        ${research.relevanceScore}, ${JSON.stringify(research.warnings)}::jsonb, ${JSON.stringify(research.requestIds)}::jsonb,
        ${research.durationMs}, ${JSON.stringify({ source: "research_pack" })}::jsonb,
        ${createdAt}::timestamptz, ${createdAt}::timestamptz, ${createdAt}::timestamptz, now()
      )
      on conflict (id) do update set
        research_pack_id = excluded.research_pack_id,
        article_id = excluded.article_id,
        job_id = excluded.job_id,
        title = excluded.title,
        query = excluded.query,
        queries = excluded.queries,
        status = excluded.status,
        confidence = excluded.confidence,
        authority_score = excluded.authority_score,
        relevance_score = excluded.relevance_score,
        warnings = excluded.warnings,
        request_ids = excluded.request_ids,
        duration_ms = excluded.duration_ms,
        completed_at = excluded.completed_at,
        updated_at = now()
    `;

    await this.sql`delete from source_citations where research_run_id = ${runId}`;
    await this.sql`delete from research_findings where research_run_id = ${runId}`;

    const savedSources = new Map<string, string>();
    const sourceUrls = new Map<string, string>();
    for (const source of [...research.sources, ...research.rejectedSources]) {
      const sourceKey = sourceDatabaseKey(source.url);
      const sourceId = sourceDatabaseId(research.organisationId, research.projectId, source.url);
      const saved = rows(await this.sql`
        insert into research_sources (
          id, organisation_id, project_id, research_pack_id, article_id, title, url, domain, summary,
          highlights, authority_score, relevance_score, accepted, rejection_reason, source_key, last_seen_at
        )
        values (
          ${sourceId}, ${research.organisationId}, ${research.projectId}, ${research.id}, ${research.articleId},
          ${source.title}, ${source.url}, ${source.domain}, ${source.summary ?? null}, ${JSON.stringify(source.highlights)}::jsonb,
          ${source.authorityScore}, ${source.relevanceScore}, ${source.accepted}, ${source.rejectionReason ?? null},
          ${sourceKey}, now()
        )
        on conflict (organisation_id, project_id, url) do update set
          research_pack_id = excluded.research_pack_id,
          article_id = excluded.article_id,
          title = excluded.title,
          domain = excluded.domain,
          summary = excluded.summary,
          highlights = excluded.highlights,
          authority_score = greatest(research_sources.authority_score, excluded.authority_score),
          relevance_score = greatest(research_sources.relevance_score, excluded.relevance_score),
          accepted = excluded.accepted,
          rejection_reason = case when excluded.accepted then null else excluded.rejection_reason end,
          source_key = excluded.source_key,
          last_seen_at = now()
        returning id
      `);
      const persistedSourceId = String(saved[0]?.id ?? sourceId);
      savedSources.set(source.id, persistedSourceId);
      sourceUrls.set(persistedSourceId, source.url);

      await this.sql`
        insert into source_citations (
          id, organisation_id, project_id, research_run_id, source_id, article_id, citation_type, snippet, url, metadata, created_at
        )
        values (
          ${citationId(runId, persistedSourceId)}, ${research.organisationId}, ${research.projectId}, ${runId},
          ${persistedSourceId}, ${research.articleId}, ${source.accepted ? "accepted_source" : "rejected_source"},
          ${source.summary ?? source.highlights[0] ?? null}, ${source.url},
          ${JSON.stringify({ originalSourceId: source.id, rejectionReason: source.rejectionReason ?? null })}::jsonb,
          ${createdAt}::timestamptz
        )
        on conflict (id) do update set
          snippet = excluded.snippet,
          metadata = excluded.metadata
      `;
    }

    const findings = researchFindingsFromPack(research, runId, savedSources);
    for (const finding of findings) {
      await this.sql`
        insert into research_findings (
          id, organisation_id, project_id, research_run_id, source_id, finding_type, content, confidence, metadata, created_at
        )
        values (
          ${finding.id}, ${finding.organisationId}, ${finding.projectId}, ${finding.researchRunId}, ${finding.sourceId ?? null},
          ${finding.findingType}, ${finding.content}, ${finding.confidence ?? null}, ${JSON.stringify(finding.metadata)}::jsonb,
          ${finding.createdAt}::timestamptz
        )
        on conflict (id) do update set
          source_id = excluded.source_id,
          content = excluded.content,
          confidence = excluded.confidence,
          metadata = excluded.metadata
      `;
    }

    for (const finding of findings.filter((item) => item.sourceId)) {
      const sourceUrl = sourceUrls.get(String(finding.sourceId));
      if (!sourceUrl) continue;
      await this.sql`
        insert into source_citations (
          id, organisation_id, project_id, research_run_id, source_id, finding_id, article_id, citation_type, snippet, url, metadata, created_at
        )
        values (
          ${citationId(runId, `${finding.sourceId}:${finding.id}`)}, ${finding.organisationId}, ${finding.projectId},
          ${finding.researchRunId}, ${finding.sourceId}, ${finding.id}, ${research.articleId}, 'finding_source',
          ${finding.content}, ${sourceUrl}, ${JSON.stringify({ findingType: finding.findingType })}::jsonb,
          ${finding.createdAt}::timestamptz
        )
        on conflict (id) do update set
          finding_id = excluded.finding_id,
          snippet = excluded.snippet,
          metadata = excluded.metadata
      `;
    }
  }

  private async nextResearchRunNumber(organisationId: string, projectId: string, articleId: string) {
    const found = rows(await this.sql`
      select coalesce(max(run_number), 0) + 1 as run_number
      from research_runs
      where organisation_id = ${organisationId}
        and project_id = ${projectId}
        and article_id = ${articleId}
    `);
    return Number(found[0]?.run_number ?? 1);
  }

  private async saveDebug(debug: DebugDocument, projectId: string) {
    const tenant = await this.ensureTenant();
    await this.ensureProjectRows(projectId);
    await this.sql`delete from debug_events where project_id = ${projectId} and article_id = ${debug.articleId}`;
    for (const event of debug.events) {
      await this.sql`
        insert into debug_events (organisation_id, project_id, job_id, article_id, stage, level, message, data, occurred_at)
        values (${tenant.organisationId}, ${projectId}, ${debug.jobId}, ${debug.articleId}, ${event.stage}, ${event.level}, ${event.message}, ${JSON.stringify(event.data ?? null)}::jsonb, ${event.at}::timestamptz)
      `;
    }
  }

  private async getGenerationTelemetry(projectId: string, articleId: string) {
    const tenant = await this.ensureTenant();
    const found = rows(await this.sql`
      select *
      from generation_telemetry
      where organisation_id = ${tenant.organisationId}
        and project_id = ${projectId}
        and article_id = ${articleId}
      limit 1
    `);
    return found[0] ? generationTelemetryFromRow(found[0]) : null;
  }

  private async saveGenerationTelemetry(telemetry: GenerationTelemetryDocument, projectId: string) {
    const tenant = await this.ensureTenant();
    await this.ensureProjectRows(projectId);
    await this.ensureGenerationTelemetrySchema();
    const next = withGenerationTelemetryDefaults(telemetry, tenant, projectId);
    await this.sql`
      insert into generation_telemetry (
        id, organisation_id, project_id, article_id, job_id, created_by_user_id, generation_provider, model, generation_model,
        requested_research_provider, actual_research_provider, fallback_used, fallback_reason,
        content_profile, benchmark_run, benchmark_pair_id, research_provider_name, research_provider_type, provider_credits, provider_cost_pricing_source,
        target_words, actual_words, planned_sections, actual_sections, finish_reason, review_status,
        planned_h2_count, planned_h3_count, expected_depth, actual_h2_count, actual_h3_count, actual_depth,
        h2_achievement_percent, h3_achievement_percent, target_achievement_percent, planner_outcome,
        research_concept_count, research_concepts, planned_breadth_ratio, actual_breadth_coverage,
        actual_breadth_coverage_percent, breadth_status, quality_score, quality_band,
        profile_version, region, industry, audience, profile_key, profile_relevance_score, region_awareness_active,
        industry_awareness_active, audience_awareness_active, research_duration_ms, sources_discovered, sources_accepted, sources_rejected, findings_extracted,
        useful_facts_extracted, citations_generated, input_tokens, output_tokens, total_tokens, research_tokens, generation_tokens,
        estimated_ai_cost_usd, estimated_generation_cost_usd, generation_cost_pricing_source, exa_search_calls, exa_content_calls, exa_search_requests, exa_content_pages,
        estimated_exa_search_cost_usd, estimated_exa_content_cost_usd, estimated_research_cost_usd,
        total_cost_usd, generation_duration_ms, total_duration_ms, cost_per_word, cost_per_research_concept, cost_per_source,
        metadata, created_at, updated_at
      )
      values (
        ${next.id}, ${next.organisationId}, ${next.projectId}, ${next.articleId}, ${next.jobId ?? null}, ${next.createdByUserId ?? null},
        ${next.generationProvider ?? null}, ${next.model ?? null}, ${next.generationModel ?? next.model ?? null},
        ${next.requestedResearchProvider ?? null}, ${next.actualResearchProvider ?? null}, ${Boolean(next.fallbackUsed)}, ${next.fallbackReason ?? null},
        ${next.contentProfile ?? null}, ${next.benchmarkRun ?? null}, ${next.benchmarkPairId ?? null}, ${next.researchProviderName ?? null},
        ${next.researchProviderType ?? null}, ${next.providerCredits ?? null}, ${next.providerCostPricingSource ?? null},
        ${next.targetWords}, ${next.actualWords}, ${next.plannedSections}, ${next.actualSections},
        ${next.finishReason ?? null}, ${next.reviewStatus}, ${next.plannedH2Count ?? 0}, ${next.plannedH3Count ?? 0},
        ${next.expectedDepth ?? null}, ${next.actualH2Count ?? 0}, ${next.actualH3Count ?? 0}, ${next.actualDepth ?? null},
        ${next.h2AchievementPercent ?? null}, ${next.h3AchievementPercent ?? null}, ${next.targetAchievementPercent ?? null},
        ${next.plannerOutcome ?? null}, ${next.researchConceptCount ?? 0}, ${JSON.stringify(next.researchConcepts ?? [])}::jsonb,
        ${next.plannedBreadthRatio ?? null}, ${next.actualBreadthCoverage ?? 0}, ${next.actualBreadthCoveragePercent ?? null},
        ${next.breadthStatus ?? null}, ${next.qualityScore ?? 0}, ${next.qualityBand ?? "Poor"}, ${next.profileVersion ?? 0}, ${next.region ?? null},
        ${next.industry ?? null}, ${next.audience ?? null}, ${next.profileKey ?? null}, ${next.profileRelevanceScore ?? null},
        ${Boolean(next.regionAwarenessActive)}, ${Boolean(next.industryAwarenessActive)}, ${Boolean(next.audienceAwarenessActive)},
        ${next.researchDurationMs ?? null}, ${next.sourcesDiscovered},
        ${next.sourcesAccepted}, ${next.sourcesRejected}, ${next.findingsExtracted}, ${next.usefulFactsExtracted},
        ${next.citationsGenerated}, ${next.inputTokens}, ${next.outputTokens}, ${next.totalTokens ?? next.generationTokens}, ${next.researchTokens},
        ${next.generationTokens}, ${next.estimatedAiCostUsd}, ${next.estimatedGenerationCostUsd ?? next.estimatedAiCostUsd}, ${next.generationCostPricingSource ?? null},
        ${next.exaSearchCalls}, ${next.exaContentCalls}, ${next.exaSearchRequests ?? next.exaSearchCalls}, ${next.exaContentPages ?? next.exaContentCalls},
        ${next.estimatedExaSearchCostUsd ?? 0}, ${next.estimatedExaContentCostUsd ?? 0}, ${next.estimatedResearchCostUsd}, ${next.totalCostUsd},
        ${next.generationDurationMs ?? null}, ${next.totalDurationMs ?? null}, ${next.costPerWord ?? 0}, ${next.costPerResearchConcept ?? 0}, ${next.costPerSource ?? 0},
        ${JSON.stringify(next.metadata)}::jsonb,
        ${next.createdAt}::timestamptz, ${next.updatedAt}::timestamptz
      )
      on conflict (organisation_id, project_id, article_id) do update set
        job_id = excluded.job_id,
        created_by_user_id = excluded.created_by_user_id,
        generation_provider = excluded.generation_provider,
        model = excluded.model,
        generation_model = excluded.generation_model,
        requested_research_provider = excluded.requested_research_provider,
        actual_research_provider = excluded.actual_research_provider,
        fallback_used = excluded.fallback_used,
        fallback_reason = excluded.fallback_reason,
        content_profile = excluded.content_profile,
        benchmark_run = excluded.benchmark_run,
        benchmark_pair_id = excluded.benchmark_pair_id,
        research_provider_name = excluded.research_provider_name,
        research_provider_type = excluded.research_provider_type,
        provider_credits = excluded.provider_credits,
        provider_cost_pricing_source = excluded.provider_cost_pricing_source,
        target_words = excluded.target_words,
        actual_words = excluded.actual_words,
        planned_sections = excluded.planned_sections,
        actual_sections = excluded.actual_sections,
        planned_h2_count = excluded.planned_h2_count,
        planned_h3_count = excluded.planned_h3_count,
        expected_depth = excluded.expected_depth,
        actual_h2_count = excluded.actual_h2_count,
        actual_h3_count = excluded.actual_h3_count,
        actual_depth = excluded.actual_depth,
        h2_achievement_percent = excluded.h2_achievement_percent,
        h3_achievement_percent = excluded.h3_achievement_percent,
        target_achievement_percent = excluded.target_achievement_percent,
        planner_outcome = excluded.planner_outcome,
        research_concept_count = excluded.research_concept_count,
        research_concepts = excluded.research_concepts,
        planned_breadth_ratio = excluded.planned_breadth_ratio,
        actual_breadth_coverage = excluded.actual_breadth_coverage,
        actual_breadth_coverage_percent = excluded.actual_breadth_coverage_percent,
        breadth_status = excluded.breadth_status,
        quality_score = excluded.quality_score,
        quality_band = excluded.quality_band,
        finish_reason = excluded.finish_reason,
        review_status = excluded.review_status,
        profile_version = excluded.profile_version,
        region = excluded.region,
        industry = excluded.industry,
        audience = excluded.audience,
        profile_key = excluded.profile_key,
        profile_relevance_score = excluded.profile_relevance_score,
        region_awareness_active = excluded.region_awareness_active,
        industry_awareness_active = excluded.industry_awareness_active,
        audience_awareness_active = excluded.audience_awareness_active,
        research_duration_ms = excluded.research_duration_ms,
        sources_discovered = excluded.sources_discovered,
        sources_accepted = excluded.sources_accepted,
        sources_rejected = excluded.sources_rejected,
        findings_extracted = excluded.findings_extracted,
        useful_facts_extracted = excluded.useful_facts_extracted,
        citations_generated = excluded.citations_generated,
        input_tokens = excluded.input_tokens,
        output_tokens = excluded.output_tokens,
        total_tokens = excluded.total_tokens,
        research_tokens = excluded.research_tokens,
        generation_tokens = excluded.generation_tokens,
        estimated_ai_cost_usd = excluded.estimated_ai_cost_usd,
        estimated_generation_cost_usd = excluded.estimated_generation_cost_usd,
        generation_cost_pricing_source = excluded.generation_cost_pricing_source,
        exa_search_calls = excluded.exa_search_calls,
        exa_content_calls = excluded.exa_content_calls,
        exa_search_requests = excluded.exa_search_requests,
        exa_content_pages = excluded.exa_content_pages,
        estimated_exa_search_cost_usd = excluded.estimated_exa_search_cost_usd,
        estimated_exa_content_cost_usd = excluded.estimated_exa_content_cost_usd,
        estimated_research_cost_usd = excluded.estimated_research_cost_usd,
        total_cost_usd = excluded.total_cost_usd,
        generation_duration_ms = excluded.generation_duration_ms,
        total_duration_ms = excluded.total_duration_ms,
        cost_per_word = excluded.cost_per_word,
        cost_per_research_concept = excluded.cost_per_research_concept,
        cost_per_source = excluded.cost_per_source,
        metadata = excluded.metadata,
        updated_at = excluded.updated_at
    `;
  }

  private async ensureGenerationTelemetrySchema() {
    if (this.generationTelemetrySchemaReady) return;
    await this.sql`
      alter table generation_telemetry
        add column if not exists profile_key text,
        add column if not exists quality_score integer not null default 0,
        add column if not exists quality_band text not null default 'Poor',
        add column if not exists requested_research_provider text,
        add column if not exists actual_research_provider text,
        add column if not exists fallback_used boolean not null default false,
        add column if not exists fallback_reason text,
        add column if not exists content_profile text,
        add column if not exists benchmark_run text,
        add column if not exists benchmark_pair_id text,
        add column if not exists research_provider_name text,
        add column if not exists research_provider_type text,
        add column if not exists provider_credits numeric,
        add column if not exists provider_cost_pricing_source text,
        add column if not exists generation_cost_pricing_source text
    `;
    this.generationTelemetrySchemaReady = true;
  }

  private async ensureWordPressConnectionSchema() {
    if (this.wordPressConnectionSchemaReady) return;
    await this.sql`
      create table if not exists project_wordpress_connections (
        project_id text primary key references projects(id) on delete cascade,
        organisation_id text not null references organisations(id) on delete cascade,
        created_by_user_id text not null references users(id),
        site_url text not null,
        username text not null,
        encrypted_application_password text not null,
        connection_status text not null default 'not_connected',
        default_post_status text not null default 'draft',
        default_category text,
        last_validated_at timestamptz,
        last_error text,
        document jsonb not null,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now()
      )
    `;
    await this.sql`
      create index if not exists idx_project_wordpress_connections_org
        on project_wordpress_connections (organisation_id, updated_at desc)
    `;
    this.wordPressConnectionSchemaReady = true;
  }

  private async ensureSiteKnowledgeSchema() {
    if (this.siteKnowledgeSchemaReady) return;
    await this.sql`
      create table if not exists project_site_knowledge (
        project_id text primary key references projects(id) on delete cascade,
        organisation_id text not null references organisations(id) on delete cascade,
        sitemap_url text not null,
        status text not null default 'not_configured',
        pages_indexed integer not null default 0,
        processed_pages integer not null default 0,
        total_discovered_urls integer not null default 0,
        started_at timestamptz,
        completed_at timestamptz,
        last_imported_at timestamptz,
        current_url text,
        last_error text,
        metadata jsonb not null default '{}'::jsonb,
        document jsonb not null,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now()
      )
    `;
    await this.sql`
      create index if not exists idx_project_site_knowledge_org
        on project_site_knowledge (organisation_id, updated_at desc)
    `;
    await this.sql`
      create table if not exists project_site_pages (
        id text not null,
        organisation_id text not null references organisations(id) on delete cascade,
        project_id text not null references projects(id) on delete cascade,
        url text not null,
        title text not null default '',
        h1 text,
        meta_description text,
        short_summary text,
        imported_at timestamptz not null default now(),
        metadata jsonb not null default '{}'::jsonb,
        document jsonb not null,
        updated_at timestamptz not null default now(),
        primary key (id),
        unique (organisation_id, project_id, url)
      )
    `;
    await this.sql`
      create index if not exists idx_project_site_pages_project_imported
        on project_site_pages (organisation_id, project_id, imported_at desc)
    `;
    await this.sql`
      create index if not exists idx_project_site_pages_project_title
        on project_site_pages (organisation_id, project_id, title)
    `;
    await this.sql`
      create table if not exists project_site_profile (
        project_id text primary key references projects(id) on delete cascade,
        organisation_id text not null references organisations(id) on delete cascade,
        domain text not null default '',
        page_count integer not null default 0,
        services jsonb not null default '[]'::jsonb,
        products jsonb not null default '[]'::jsonb,
        audiences jsonb not null default '[]'::jsonb,
        locations jsonb not null default '[]'::jsonb,
        ctas jsonb not null default '[]'::jsonb,
        writing_signals jsonb not null default '[]'::jsonb,
        metadata jsonb not null default '{}'::jsonb,
        document jsonb not null,
        generated_at timestamptz not null default now(),
        updated_at timestamptz not null default now()
      )
    `;
    await this.sql`
      create index if not exists idx_project_site_profile_org
        on project_site_profile (organisation_id, updated_at desc)
    `;
    this.siteKnowledgeSchemaReady = true;
  }

  private async getTelemetryExportStatus(id: string) {
    const tenant = await this.ensureTenant();
    const found = rows(await this.sql`
      select *
      from telemetry_export_status
      where organisation_id = ${tenant.organisationId}
        and id = ${id}
      limit 1
    `);
    return found[0] ? telemetryExportStatusFromRow(found[0]) : null;
  }

  private async saveTelemetryExportStatus(status: TelemetryExportStatusDocument) {
    const tenant = await this.ensureTenant();
    const now = new Date().toISOString();
    const next: TelemetryExportStatusDocument = {
      ...status,
      organisationId: status.organisationId ?? tenant.organisationId,
      projectId: status.projectId ?? null,
      articleId: status.articleId ?? null,
      lastError: status.lastError ?? null,
      exportedAt: status.exportedAt ?? null,
      attempts: status.attempts ?? 0,
      createdAt: status.createdAt ?? now,
      updatedAt: status.updatedAt ?? now
    };
    await this.sql`
      insert into telemetry_export_status (
        id, organisation_id, export_type, project_id, article_id, export_key, target_sheet,
        status, attempts, last_error, exported_at, created_at, updated_at
      )
      values (
        ${next.id}, ${next.organisationId}, ${next.exportType}, ${next.projectId ?? null}, ${next.articleId ?? null},
        ${next.exportKey}, ${next.targetSheet}, ${next.status}, ${next.attempts}, ${next.lastError ?? null},
        ${next.exportedAt ?? null}::timestamptz, ${next.createdAt}::timestamptz, ${next.updatedAt}::timestamptz
      )
      on conflict (organisation_id, export_type, export_key, target_sheet) do update set
        id = excluded.id,
        project_id = excluded.project_id,
        article_id = excluded.article_id,
        status = excluded.status,
        attempts = excluded.attempts,
        last_error = excluded.last_error,
        exported_at = excluded.exported_at,
        updated_at = excluded.updated_at
    `;
  }

  private async upsertWorkerLease(lease: WorkerLeaseDocument, projectId: string) {
    const tenant = await this.ensureTenant();
    const next = withLeaseDefaults(lease, tenant, projectId);
    await this.ensureProjectRows(next.projectId ?? DEFAULT_PROJECT_ID);
    await this.sql`
      insert into worker_leases (organisation_id, project_id, queue_name, lease_id, owner, token, acquired_at, expires_at, document)
      values (${next.organisationId}, ${next.projectId}, ${next.queueName}, ${next.id}, ${next.owner}, ${next.token}, ${next.acquiredAt}::timestamptz, ${next.expiresAt}::timestamptz, ${JSON.stringify(next)}::jsonb)
      on conflict (organisation_id, project_id, queue_name) do update set
        lease_id = excluded.lease_id,
        owner = excluded.owner,
        token = excluded.token,
        acquired_at = excluded.acquired_at,
        expires_at = excluded.expires_at,
        document = excluded.document
    `;
  }

  private async ensureProjectRows(projectId: string) {
    if (this.ensuredProjects.has(projectId)) return;
    const existing = await this.getProject(projectId);
    if (existing) {
      this.ensuredProjects.add(projectId);
      return;
    }
    await this.saveProject(projectId === DEFAULT_PROJECT_ID ? createDefaultProject() : {
      ...createDefaultProject(),
      id: projectId,
      name: projectId
    });
    await this.saveSettings(projectId === DEFAULT_PROJECT_ID ? createDefaultSettings() : {
      ...createDefaultSettings(),
      projectId
    });
  }

  private async ensureTenant() {
    const tenant = this.tenant;
    if (this.tenantReady) return tenant;
    await this.sql`
      insert into organisations (id, name, slug)
      values (${tenant.organisationId}, ${tenant.organisationName}, ${tenant.organisationSlug})
      on conflict (id) do update set name = excluded.name, slug = excluded.slug, updated_at = now()
    `;
    await this.sql`
      insert into organisation_settings (organisation_id, settings)
      values (${tenant.organisationId}, '{}'::jsonb)
      on conflict (organisation_id) do nothing
    `;
    await this.sql`
      insert into users (id, auth_subject, email, name)
      values (${tenant.userId}, ${tenant.userId}, ${tenant.userEmail}, ${tenant.userName})
      on conflict (id) do update set email = excluded.email, name = excluded.name, updated_at = now()
    `;
    await this.sql`
      insert into organisation_users (organisation_id, user_id, role)
      values (${tenant.organisationId}, ${tenant.userId}, 'owner')
      on conflict (organisation_id, user_id) do nothing
    `;
    await this.sql`
      insert into billing_accounts (organisation_id)
      values (${tenant.organisationId})
      on conflict (organisation_id) do nothing
    `;
    for (const provider of ["openai", "deepseek", "exa"]) {
      await this.sql`
        insert into api_key_providers (id, name)
        values (${provider}, ${provider})
        on conflict (id) do nothing
      `;
    }
    this.tenantReady = true;
    return tenant;
  }

  private get sql() {
    if (this.injectedSql) return this.injectedSql;
    if (!this.sqlClient) {
      const url = process.env.DATABASE_URL;
      if (!url) throw new Error("DATABASE_URL is required when STORAGE_BACKEND=neon.");
      this.sqlClient = neon(url);
    }
    return this.sqlClient;
  }

  private get tenant() {
    return this.injectedTenant ?? tenantFromEnv();
  }

  private async withFailureLogging<T>(operation: string, path: string | undefined, work: () => Promise<T>) {
    try {
      return await work();
    } catch (error) {
      logStorageError({
        event: "operation_failed",
        provider: "neon",
        operation,
        path,
        error: errorMessage(error)
      });
      throw error;
    }
  }
}

function tenantFromEnv(): TenantSeed {
  const email = process.env.OSW_AUTH_USER_EMAIL ?? process.env.WORKSPACE_USER_EMAIL;
  const userId = process.env.OSW_AUTH_USER_ID ?? email;
  if (!email || !userId) {
    throw new Error("OSW_AUTH_USER_EMAIL or WORKSPACE_USER_EMAIL is required when STORAGE_BACKEND=neon so seeded rows use a real authenticated user.");
  }
  const organisationName = process.env.OSW_ORGANISATION_NAME ?? "Default Organisation";
  return {
    organisationId: process.env.OSW_ORGANISATION_ID ?? "org_default",
    organisationName,
    organisationSlug: process.env.OSW_ORGANISATION_SLUG ?? slugify(organisationName),
    userId,
    userEmail: email,
    userName: process.env.OSW_AUTH_USER_NAME ?? null
  };
}

function withProjectDefaults(project: ProjectDocument, tenant: TenantSeed): ProjectDocument {
  return {
    ...project,
    organisationId: project.organisationId ?? tenant.organisationId,
    slug: project.slug ?? slugify(project.name || project.id),
    createdByUserId: project.createdByUserId ?? tenant.userId,
    profile: normalizeProjectProfile(project.profile)
  };
}

function withProjectWordPressConnectionDefaults(connection: ProjectWordPressConnectionSecret, tenant: TenantSeed): ProjectWordPressConnectionSecret {
  return {
    ...connection,
    organisationId: connection.organisationId ?? tenant.organisationId,
    createdByUserId: connection.createdByUserId ?? tenant.userId
  };
}

function withProjectSiteKnowledgeDefaults(siteKnowledge: ProjectSiteKnowledgeDocument, tenant: TenantSeed): ProjectSiteKnowledgeDocument {
  const now = new Date().toISOString();
  return {
    ...siteKnowledge,
    organisationId: siteKnowledge.organisationId ?? tenant.organisationId,
    pagesIndexed: siteKnowledge.pagesIndexed ?? 0,
    processedPages: siteKnowledge.processedPages ?? 0,
    totalDiscoveredUrls: siteKnowledge.totalDiscoveredUrls ?? 0,
    startedAt: siteKnowledge.startedAt ?? null,
    completedAt: siteKnowledge.completedAt ?? null,
    lastImportedAt: siteKnowledge.lastImportedAt ?? null,
    currentUrl: siteKnowledge.currentUrl ?? null,
    lastError: siteKnowledge.lastError ?? null,
    metadata: isRecord(siteKnowledge.metadata) ? siteKnowledge.metadata : {},
    createdAt: siteKnowledge.createdAt ?? now,
    updatedAt: siteKnowledge.updatedAt ?? now
  };
}

function withSiteKnowledgePageDefaults(page: SiteKnowledgePageDocument, tenant: TenantSeed, projectId: string): SiteKnowledgePageDocument {
  const now = new Date().toISOString();
  return {
    ...page,
    organisationId: page.organisationId ?? tenant.organisationId,
    projectId: page.projectId ?? projectId,
    metadata: isRecord(page.metadata) ? page.metadata : {},
    importedAt: page.importedAt ?? now,
    updatedAt: page.updatedAt ?? now
  };
}

function withProjectSiteProfileDefaults(profile: ProjectSiteProfileDocument, tenant: TenantSeed): ProjectSiteProfileDocument {
  const now = new Date().toISOString();
  return {
    ...profile,
    organisationId: profile.organisationId ?? tenant.organisationId,
    domain: profile.domain ?? "",
    pageCount: profile.pageCount ?? 0,
    services: stringArray(profile.services),
    products: stringArray(profile.products),
    audiences: stringArray(profile.audiences),
    locations: stringArray(profile.locations),
    ctas: stringArray(profile.ctas),
    writingSignals: stringArray(profile.writingSignals),
    metadata: isRecord(profile.metadata) ? profile.metadata : {},
    generatedAt: profile.generatedAt ?? now,
    updatedAt: profile.updatedAt ?? now
  };
}

function withJobDefaults(job: QueueJob, tenant: TenantSeed): QueueJob {
  return {
    ...job,
    organisationId: job.organisationId ?? tenant.organisationId,
    createdByUserId: job.createdByUserId ?? tenant.userId,
    queuePosition: job.queuePosition ?? new Date(job.createdAt).getTime(),
    statusReason: job.statusReason ?? null
  };
}

function withQueueControlDefaults(control: QueueControlDocument, tenant: TenantSeed): QueueControlDocument {
  return {
    ...control,
    organisationId: control.organisationId ?? tenant.organisationId,
    requestedBy: control.requestedBy ?? null,
    requestedAt: control.requestedAt ?? null,
    stoppedAt: control.stoppedAt ?? null,
    reason: control.reason ?? null
  };
}

function withWorkspacePreferenceDefaults(preferences: WorkspacePreferencesDocument | null, tenant: TenantSeed): WorkspacePreferencesDocument {
  const defaults = createDefaultWorkspacePreferences({
    name: tenant.userName ?? "",
    email: tenant.userEmail,
    workspaceName: tenant.organisationName
  });
  const now = new Date().toISOString();
  return {
    ...defaults,
    ...preferences,
    organisationId: preferences?.organisationId ?? tenant.organisationId,
    userId: preferences?.userId ?? tenant.userId,
    account: {
      ...defaults.account,
      ...preferences?.account
    },
    notifications: {
      ...defaults.notifications,
      ...preferences?.notifications
    },
    aiProvider: {
      ...defaults.aiProvider,
      ...preferences?.aiProvider
    },
    operational: {
      ...defaults.operational,
      ...preferences?.operational
    },
    createdAt: preferences?.createdAt ?? defaults.createdAt,
    updatedAt: preferences?.updatedAt ?? now
  };
}

function withArticleDefaults(article: ArticleDocument, tenant: TenantSeed): ArticleDocument {
  return applyPublishingDefaults({
    ...article,
    organisationId: article.organisationId ?? tenant.organisationId,
    createdByUserId: article.createdByUserId ?? tenant.userId,
    currentVersionNumber: article.currentVersionNumber ?? 1,
    versionedAt: article.versionedAt ?? null,
    markdownBlobPath: article.markdownBlobPath ?? null,
    statusReason: article.statusReason ?? null,
    isPinned: article.isPinned ?? false
  });
}

function withResearchDefaults(research: ResearchPack, tenant: TenantSeed, projectId: string): Required<Pick<ResearchPack, "id" | "organisationId" | "projectId" | "runNumber">> & ResearchPack {
  return {
    ...research,
    id: research.id ?? researchId(projectId, research.articleId),
    organisationId: research.organisationId ?? tenant.organisationId,
    projectId: research.projectId ?? projectId,
    runNumber: research.runNumber ?? 0,
    researchConcepts: research.researchConcepts ?? [],
    researchConceptCount: research.researchConceptCount ?? research.researchConcepts?.length ?? 0
  };
}

function withGenerationTelemetryDefaults(telemetry: GenerationTelemetryDocument, tenant: TenantSeed, projectId: string): GenerationTelemetryDocument {
  const now = new Date().toISOString();
  const targetWords = telemetry.targetWords ?? 0;
  const actualWords = telemetry.actualWords ?? 0;
  const plannedSections = telemetry.plannedSections ?? telemetry.plannedH2Count ?? 0;
  const actualSections = telemetry.actualSections ?? telemetry.actualH2Count ?? 0;
  const plannedH2Count = telemetry.plannedH2Count ?? plannedSections;
  const actualH2Count = telemetry.actualH2Count ?? actualSections;
  const plannedH3Count = telemetry.plannedH3Count ?? 0;
  const actualH3Count = telemetry.actualH3Count ?? 0;
  const inputTokens = telemetry.inputTokens ?? 0;
  const outputTokens = telemetry.outputTokens ?? 0;
  const totalTokens = telemetry.totalTokens ?? telemetry.generationTokens ?? inputTokens + outputTokens;
  const estimatedGenerationCostUsd = telemetry.estimatedGenerationCostUsd ?? telemetry.estimatedAiCostUsd ?? 0;
  const exaSearchRequests = telemetry.exaSearchRequests ?? telemetry.exaSearchCalls ?? 0;
  const exaContentPages = telemetry.exaContentPages ?? telemetry.exaContentCalls ?? 0;
  const totalCostUsd = telemetry.totalCostUsd ?? 0;
  const sourceCount = telemetry.sourcesDiscovered ?? telemetry.sourcesAccepted ?? 0;
  const telemetryQuality = calculateTelemetryQuality(telemetry);
  return {
    ...telemetry,
    id: telemetry.id ?? `${projectId}:${telemetry.articleId}:generation`,
    organisationId: telemetry.organisationId ?? tenant.organisationId,
    projectId: telemetry.projectId ?? projectId,
    model: telemetry.model ?? null,
    generationProvider: telemetry.generationProvider ?? null,
    generationModel: telemetry.generationModel ?? telemetry.model ?? null,
    jobId: telemetry.jobId,
    createdByUserId: telemetry.createdByUserId ?? null,
    targetWords,
    actualWords,
    plannedSections,
    actualSections,
    plannedH2Count,
    plannedH3Count,
    expectedDepth: telemetry.expectedDepth ?? "standard",
    actualH2Count,
    actualH3Count,
    actualDepth: telemetry.actualDepth ?? "light",
    h2AchievementPercent: telemetry.h2AchievementPercent ?? percentage(actualH2Count, plannedH2Count),
    h3AchievementPercent: telemetry.h3AchievementPercent ?? percentage(actualH3Count, plannedH3Count),
    targetAchievementPercent: telemetry.targetAchievementPercent ?? percentage(actualWords, targetWords),
    plannerOutcome: telemetry.plannerOutcome ?? "matched_plan",
    researchConceptCount: telemetry.researchConceptCount ?? telemetry.researchConcepts?.length ?? 0,
    researchConcepts: telemetry.researchConcepts ?? [],
    plannedBreadthRatio: telemetry.plannedBreadthRatio ?? ratio(plannedH2Count, telemetry.researchConceptCount ?? telemetry.researchConcepts?.length ?? 0),
    actualBreadthCoverage: telemetry.actualBreadthCoverage ?? 0,
    actualBreadthCoveragePercent: telemetry.actualBreadthCoveragePercent ?? percentage(telemetry.actualBreadthCoverage ?? 0, telemetry.researchConceptCount ?? telemetry.researchConcepts?.length ?? 0),
    breadthStatus: telemetry.breadthStatus ?? "sufficient",
    qualityScore: telemetry.qualityScore ?? telemetryQuality.qualityScore,
    qualityBand: telemetry.qualityBand ?? telemetryQuality.qualityBand,
    finishReason: telemetry.finishReason ?? null,
    reviewStatus: telemetry.reviewStatus ?? "generated",
    profileVersion: telemetry.profileVersion ?? 0,
    region: telemetry.region ?? null,
    industry: telemetry.industry ?? null,
    audience: telemetry.audience ?? null,
    profileKey: telemetry.profileKey ?? (telemetry.industry && telemetry.audience ? profileKeyFor(telemetry.industry, telemetry.audience) : null),
    profileRelevanceScore: telemetry.profileRelevanceScore ?? null,
    regionAwarenessActive: telemetry.regionAwarenessActive ?? false,
    industryAwarenessActive: telemetry.industryAwarenessActive ?? false,
    audienceAwarenessActive: telemetry.audienceAwarenessActive ?? false,
    researchDurationMs: telemetry.researchDurationMs ?? null,
    sourcesDiscovered: telemetry.sourcesDiscovered ?? 0,
    sourcesAccepted: telemetry.sourcesAccepted ?? 0,
    sourcesRejected: telemetry.sourcesRejected ?? 0,
    findingsExtracted: telemetry.findingsExtracted ?? 0,
    usefulFactsExtracted: telemetry.usefulFactsExtracted ?? 0,
    citationsGenerated: telemetry.citationsGenerated ?? 0,
    inputTokens,
    outputTokens,
    researchTokens: telemetry.researchTokens ?? 0,
    totalTokens,
    generationTokens: telemetry.generationTokens ?? totalTokens,
    estimatedAiCostUsd: telemetry.estimatedAiCostUsd ?? estimatedGenerationCostUsd,
    estimatedGenerationCostUsd,
    generationCostPricingSource: telemetry.generationCostPricingSource ?? null,
    exaSearchCalls: telemetry.exaSearchCalls ?? exaSearchRequests,
    exaContentCalls: telemetry.exaContentCalls ?? exaContentPages,
    exaSearchRequests,
    exaContentPages,
    estimatedExaSearchCostUsd: telemetry.estimatedExaSearchCostUsd ?? 0,
    estimatedExaContentCostUsd: telemetry.estimatedExaContentCostUsd ?? 0,
    estimatedResearchCostUsd: telemetry.estimatedResearchCostUsd ?? 0,
    totalCostUsd,
    generationDurationMs: telemetry.generationDurationMs ?? null,
    totalDurationMs: telemetry.totalDurationMs ?? null,
    costPerWord: telemetry.costPerWord ?? (actualWords ? Number((totalCostUsd / actualWords).toFixed(6)) : 0),
    costPerResearchConcept: telemetry.costPerResearchConcept ?? ((telemetry.researchConceptCount ?? 0) ? Number((totalCostUsd / (telemetry.researchConceptCount ?? 1)).toFixed(6)) : 0),
    costPerSource: telemetry.costPerSource ?? (sourceCount ? Number((totalCostUsd / sourceCount).toFixed(6)) : 0),
    createdAt: telemetry.createdAt ?? now,
    updatedAt: telemetry.updatedAt ?? now
  };
}

function withLeaseDefaults(lease: WorkerLeaseDocument, tenant: TenantSeed, projectId: string): WorkerLeaseDocument {
  return {
    ...lease,
    organisationId: lease.organisationId ?? tenant.organisationId,
    projectId: lease.projectId ?? projectId,
    queueName: lease.queueName ?? "default"
  };
}

function researchId(projectId: string, articleId: string) {
  return `${projectId}:${articleId}:1`;
}

function researchRunId(researchPackId: string, runNumber: number) {
  return `${researchPackId}:run:${runNumber}`;
}

function sourceDatabaseKey(url: string) {
  return createHash("sha256").update(url.trim().toLowerCase()).digest("hex");
}

function sourceDatabaseId(organisationId: string, projectId: string, url: string) {
  return `src_${createHash("sha256").update(`${organisationId}:${projectId}:${url.trim().toLowerCase()}`).digest("hex").slice(0, 32)}`;
}

function findingId(researchRunId: string, type: ResearchFinding["findingType"], index: number) {
  return `finding_${createHash("sha256").update(`${researchRunId}:${type}:${index}`).digest("hex").slice(0, 32)}`;
}

function citationId(researchRunId: string, sourceId: string) {
  return `citation_${createHash("sha256").update(`${researchRunId}:${sourceId}`).digest("hex").slice(0, 32)}`;
}

function researchFindingsFromPack(
  research: Required<Pick<ResearchPack, "id" | "organisationId" | "projectId" | "runNumber">> & ResearchPack,
  researchRunId: string,
  savedSources: Map<string, string>
) {
  const createdAt = research.createdAt;
  const findings: ResearchFinding[] = [];
  const acceptedSources = research.sources.map((source) => savedSources.get(source.id)).filter(Boolean) as string[];
  const factSources = new Map((research.usefulFactSources ?? []).map((item) => [item.fact, savedSources.get(item.sourceId) ?? null]));
  const push = (findingType: ResearchFinding["findingType"], content: string, index: number, sourceId?: string | null, metadata: Record<string, unknown> = {}) => {
    findings.push({
      id: findingId(researchRunId, findingType, index),
      organisationId: research.organisationId,
      projectId: research.projectId,
      researchRunId,
      sourceId: sourceId ?? null,
      findingType,
      content,
      confidence: research.confidence,
      metadata,
      createdAt
    });
  };

  research.usefulFacts.forEach((fact, index) => {
    const sourceId = factSources.get(fact) ?? acceptedSources[index % Math.max(acceptedSources.length, 1)] ?? null;
    push("useful_fact", fact, index, sourceId, { sourceLinkedBy: factSources.has(fact) ? "fact_attribution" : "fallback_source_order" });
  });
  research.rejectedFacts.forEach((fact, index) => push("rejected_fact", fact, index, null));
  research.questionsFound.forEach((question, index) => push("question", question, index, null));
  research.headingsFound.forEach((heading, index) => push("heading", heading, index, null));

  if (research.usefulFacts.length > 0) {
    push("summary", research.usefulFacts.slice(0, 5).join(" "), 0, acceptedSources[0] ?? null, { generatedFrom: "useful_facts" });
  }

  return findings;
}

function pathProjectId(path: string) {
  return path.split("/")[1] || DEFAULT_PROJECT_ID;
}

function pathId(path: string) {
  const filename = path.split("/").pop() ?? "";
  return filename.replace(/\.(json|md)$/, "");
}

function isWorkspacePath(path: string) {
  return path.endsWith("/workspace.json");
}

function isActiveProjectPath(path: string) {
  return path === activeProjectPath();
}

function isWorkspacePreferencesPath(path: string) {
  return path === workspacePreferencesPath();
}

function isSettingsPath(path: string) {
  return path.endsWith("/settings.json");
}

function isSiteKnowledgePath(path: string) {
  return path.endsWith("/knowledge/site/config.json");
}

function isSiteProfilePath(path: string) {
  return path.endsWith("/knowledge/site/profile.json");
}

function isSiteKnowledgePagePath(path: string) {
  return /\/knowledge\/site\/pages\/[^/]+\.json$/.test(path);
}

function isQueueControlPath(path: string) {
  return /\/queue\/control\.json$/.test(path);
}

function isJobPath(path: string) {
  return /\/jobs\/[^/]+\.json$/.test(path);
}

function isArticlePath(path: string) {
  return /\/articles\/[^/]+\.json$/.test(path);
}

function isArticleMarkdownPath(path: string) {
  return /\/articles\/[^/]+\.md$/.test(path);
}

function isResearchPath(path: string) {
  return /\/research\/[^/]+\.json$/.test(path);
}

function isDebugPath(path: string) {
  return /\/debug\/[^/]+\.json$/.test(path);
}

function isGenerationTelemetryPath(path: string) {
  return /\/telemetry\/generations\/[^/]+\.json$/.test(path);
}

function isTelemetryExportStatusPath(path: string) {
  return path.startsWith(telemetryExportStatusPrefix()) && path.endsWith(".json");
}

function isWorkerLeasePath(path: string) {
  return path.endsWith("/worker/lease.json");
}

function isExportPath(path: string) {
  return /\/exports\/[^/]+$/.test(path);
}

function slugify(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "default";
}

function rows(value: unknown) {
  return value as Array<Record<string, unknown>>;
}

function organisationFromRow(row: Record<string, unknown>): OrganisationDocument {
  return {
    id: String(row.id),
    name: String(row.name),
    slug: String(row.slug),
    createdAt: new Date(row.created_at as string | number | Date).toISOString(),
    updatedAt: new Date(row.updated_at as string | number | Date).toISOString()
  };
}

function versionFromRow(row: Record<string, unknown>): DocumentVersion {
  return {
    id: String(row.id),
    organisationId: String(row.organisation_id),
    projectId: String(row.project_id),
    documentId: String(row.document_id),
    documentType: String(row.document_type),
    versionNumber: Number(row.version_number),
    content: String(row.content),
    metadata: isRecord(row.metadata) ? row.metadata : {},
    createdByUserId: String(row.created_by_user_id),
    createdAt: new Date(row.created_at as string | number | Date).toISOString()
  };
}

function siteKnowledgeFromRow(row: Record<string, unknown>): ProjectSiteKnowledgeDocument {
  return {
    projectId: String(row.project_id),
    organisationId: String(row.organisation_id),
    sitemapUrl: String(row.sitemap_url ?? ""),
    status: String(row.status ?? "not_configured") as ProjectSiteKnowledgeDocument["status"],
    pagesIndexed: Number(row.pages_indexed ?? 0),
    processedPages: Number(row.processed_pages ?? 0),
    totalDiscoveredUrls: Number(row.total_discovered_urls ?? 0),
    startedAt: nullableDate(row.started_at),
    completedAt: nullableDate(row.completed_at),
    lastImportedAt: nullableDate(row.last_imported_at),
    currentUrl: nullableString(row.current_url),
    lastError: nullableString(row.last_error),
    metadata: isRecord(row.metadata) ? row.metadata : {},
    createdAt: dateIso(row.created_at),
    updatedAt: dateIso(row.updated_at)
  };
}

function siteKnowledgePageFromRow(row: Record<string, unknown>): SiteKnowledgePageDocument {
  return {
    id: String(row.id),
    projectId: String(row.project_id),
    organisationId: String(row.organisation_id),
    url: String(row.url),
    title: String(row.title ?? ""),
    h1: nullableString(row.h1) ?? "",
    metaDescription: nullableString(row.meta_description) ?? "",
    shortSummary: nullableString(row.short_summary) ?? "",
    importedAt: dateIso(row.imported_at),
    updatedAt: dateIso(row.updated_at),
    metadata: isRecord(row.metadata) ? row.metadata : {}
  };
}

function siteProfileFromRow(row: Record<string, unknown>): ProjectSiteProfileDocument {
  return {
    projectId: String(row.project_id),
    organisationId: String(row.organisation_id),
    domain: String(row.domain ?? ""),
    pageCount: Number(row.page_count ?? 0),
    services: stringArray(row.services),
    products: stringArray(row.products),
    audiences: stringArray(row.audiences),
    locations: stringArray(row.locations),
    ctas: stringArray(row.ctas),
    writingSignals: stringArray(row.writing_signals),
    generatedAt: dateIso(row.generated_at),
    updatedAt: dateIso(row.updated_at),
    metadata: isRecord(row.metadata) ? row.metadata : {}
  };
}

function researchRunFromRow(row: Record<string, unknown>): ResearchRun {
  return {
    id: String(row.id),
    organisationId: String(row.organisation_id),
    projectId: String(row.project_id),
    researchPackId: nullableString(row.research_pack_id),
    articleId: nullableString(row.article_id),
    jobId: nullableString(row.job_id),
    runNumber: Number(row.run_number),
    title: String(row.title),
    query: nullableString(row.query),
    queries: stringArray(row.queries),
    status: String(row.status) as ResearchRun["status"],
    confidence: nullableNumber(row.confidence),
    authorityScore: nullableNumber(row.authority_score),
    relevanceScore: nullableNumber(row.relevance_score),
    warnings: stringArray(row.warnings),
    requestIds: stringArray(row.request_ids),
    durationMs: nullableNumber(row.duration_ms),
    metadata: isRecord(row.metadata) ? row.metadata : {},
    startedAt: nullableDate(row.started_at),
    completedAt: nullableDate(row.completed_at),
    createdAt: dateIso(row.created_at),
    updatedAt: dateIso(row.updated_at)
  };
}

function researchSourceFromRow(row: Record<string, unknown>): ResearchSource {
  return {
    id: String(row.id),
    title: String(row.title),
    url: String(row.url),
    domain: String(row.domain),
    summary: nullableString(row.summary) ?? undefined,
    highlights: stringArray(row.highlights),
    authorityScore: Number(row.authority_score),
    relevanceScore: Number(row.relevance_score),
    accepted: Boolean(row.accepted),
    rejectionReason: nullableString(row.rejection_reason) ?? undefined
  };
}

function researchFindingFromRow(row: Record<string, unknown>): ResearchFinding {
  return {
    id: String(row.id),
    organisationId: String(row.organisation_id),
    projectId: String(row.project_id),
    researchRunId: String(row.research_run_id),
    sourceId: nullableString(row.source_id),
    findingType: String(row.finding_type) as ResearchFinding["findingType"],
    content: String(row.content),
    confidence: nullableNumber(row.confidence),
    metadata: isRecord(row.metadata) ? row.metadata : {},
    createdAt: dateIso(row.created_at)
  };
}

function sourceCitationFromRow(row: Record<string, unknown>): SourceCitation {
  return {
    id: String(row.id),
    organisationId: String(row.organisation_id),
    projectId: String(row.project_id),
    researchRunId: nullableString(row.research_run_id),
    sourceId: String(row.source_id),
    findingId: nullableString(row.finding_id),
    articleId: nullableString(row.article_id),
    citationType: String(row.citation_type),
    snippet: nullableString(row.snippet),
    url: String(row.url),
    metadata: isRecord(row.metadata) ? row.metadata : {},
    createdAt: dateIso(row.created_at)
  };
}

function generationTelemetryFromRow(row: Record<string, unknown>): GenerationTelemetryDocument {
  return {
    id: String(row.id),
    organisationId: String(row.organisation_id),
    projectId: String(row.project_id),
    articleId: String(row.article_id),
    jobId: nullableString(row.job_id) ?? undefined,
    createdByUserId: nullableString(row.created_by_user_id),
    generationProvider: nullableString(row.generation_provider),
    model: nullableString(row.model),
    generationModel: nullableString(row.generation_model) ?? nullableString(row.model),
    requestedResearchProvider: nullableString(row.requested_research_provider) as GenerationTelemetryDocument["requestedResearchProvider"],
    actualResearchProvider: nullableString(row.actual_research_provider) as GenerationTelemetryDocument["actualResearchProvider"],
    fallbackUsed: Boolean(row.fallback_used),
    fallbackReason: nullableString(row.fallback_reason),
    contentProfile: nullableString(row.content_profile) as GenerationTelemetryDocument["contentProfile"],
    benchmarkRun: nullableString(row.benchmark_run),
    benchmarkPairId: nullableString(row.benchmark_pair_id),
    researchProviderName: nullableString(row.research_provider_name),
    researchProviderType: nullableString(row.research_provider_type) as GenerationTelemetryDocument["researchProviderType"],
    providerCredits: nullableNumber(row.provider_credits),
    providerCostPricingSource: nullableString(row.provider_cost_pricing_source),
    targetWords: Number(row.target_words ?? 0),
    actualWords: Number(row.actual_words ?? 0),
    plannedSections: Number(row.planned_sections ?? 0),
    actualSections: Number(row.actual_sections ?? 0),
    plannedH2Count: Number(row.planned_h2_count ?? row.planned_sections ?? 0),
    plannedH3Count: Number(row.planned_h3_count ?? 0),
    expectedDepth: nullableString(row.expected_depth),
    actualH2Count: Number(row.actual_h2_count ?? row.actual_sections ?? 0),
    actualH3Count: Number(row.actual_h3_count ?? 0),
    actualDepth: nullableString(row.actual_depth),
    h2AchievementPercent: nullableNumber(row.h2_achievement_percent) ?? undefined,
    h3AchievementPercent: nullableNumber(row.h3_achievement_percent) ?? undefined,
    targetAchievementPercent: nullableNumber(row.target_achievement_percent) ?? undefined,
    plannerOutcome: nullableString(row.planner_outcome),
    researchConceptCount: Number(row.research_concept_count ?? 0),
    researchConcepts: stringArray(row.research_concepts),
    plannedBreadthRatio: nullableNumber(row.planned_breadth_ratio) ?? undefined,
    actualBreadthCoverage: Number(row.actual_breadth_coverage ?? 0),
    actualBreadthCoveragePercent: nullableNumber(row.actual_breadth_coverage_percent) ?? undefined,
    breadthStatus: nullableString(row.breadth_status),
    qualityScore: Number(row.quality_score ?? 0),
    qualityBand: (nullableString(row.quality_band) ?? "Poor") as GenerationTelemetryDocument["qualityBand"],
    finishReason: nullableString(row.finish_reason),
    reviewStatus: String(row.review_status ?? "generated") as GenerationTelemetryDocument["reviewStatus"],
    profileVersion: Number(row.profile_version ?? 0),
    region: nullableString(row.region),
    industry: nullableString(row.industry),
    audience: nullableString(row.audience),
    profileKey: nullableString(row.profile_key),
    profileRelevanceScore: nullableNumber(row.profile_relevance_score),
    regionAwarenessActive: Boolean(row.region_awareness_active),
    industryAwarenessActive: Boolean(row.industry_awareness_active),
    audienceAwarenessActive: Boolean(row.audience_awareness_active),
    researchDurationMs: nullableNumber(row.research_duration_ms),
    sourcesDiscovered: Number(row.sources_discovered ?? 0),
    sourcesAccepted: Number(row.sources_accepted ?? 0),
    sourcesRejected: Number(row.sources_rejected ?? 0),
    findingsExtracted: Number(row.findings_extracted ?? 0),
    usefulFactsExtracted: Number(row.useful_facts_extracted ?? 0),
    citationsGenerated: Number(row.citations_generated ?? 0),
    inputTokens: Number(row.input_tokens),
    outputTokens: Number(row.output_tokens),
    totalTokens: Number(row.total_tokens ?? Number(row.input_tokens ?? 0) + Number(row.output_tokens ?? 0)),
    researchTokens: Number(row.research_tokens ?? 0),
    generationTokens: Number(row.generation_tokens ?? Number(row.input_tokens ?? 0) + Number(row.output_tokens ?? 0)),
    estimatedAiCostUsd: Number(row.estimated_ai_cost_usd),
    estimatedGenerationCostUsd: Number(row.estimated_generation_cost_usd ?? row.estimated_ai_cost_usd ?? 0),
    generationCostPricingSource: nullableString(row.generation_cost_pricing_source),
    exaSearchCalls: Number(row.exa_search_calls),
    exaContentCalls: Number(row.exa_content_calls),
    exaSearchRequests: Number(row.exa_search_requests ?? row.exa_search_calls ?? 0),
    exaContentPages: Number(row.exa_content_pages ?? row.exa_content_calls ?? 0),
    estimatedExaSearchCostUsd: Number(row.estimated_exa_search_cost_usd ?? 0),
    estimatedExaContentCostUsd: Number(row.estimated_exa_content_cost_usd ?? 0),
    estimatedResearchCostUsd: Number(row.estimated_research_cost_usd),
    totalCostUsd: Number(row.total_cost_usd),
    totalDurationMs: nullableNumber(row.total_duration_ms),
    costPerWord: Number(row.cost_per_word ?? 0),
    costPerResearchConcept: Number(row.cost_per_research_concept ?? 0),
    costPerSource: Number(row.cost_per_source ?? 0),
    generationDurationMs: nullableNumber(row.generation_duration_ms),
    metadata: isRecord(row.metadata) ? row.metadata : {},
    createdAt: dateIso(row.created_at),
    updatedAt: dateIso(row.updated_at)
  };
}

function telemetryExportStatusFromRow(row: Record<string, unknown>): TelemetryExportStatusDocument {
  return {
    id: String(row.id),
    organisationId: String(row.organisation_id),
    exportType: String(row.export_type) as TelemetryExportStatusDocument["exportType"],
    projectId: nullableString(row.project_id),
    articleId: nullableString(row.article_id),
    exportKey: String(row.export_key),
    targetSheet: String(row.target_sheet),
    status: String(row.status) as TelemetryExportStatusDocument["status"],
    attempts: Number(row.attempts ?? 0),
    lastError: nullableString(row.last_error),
    exportedAt: nullableDate(row.exported_at),
    createdAt: dateIso(row.created_at),
    updatedAt: dateIso(row.updated_at)
  };
}

function nullableString(value: unknown) {
  return value == null ? null : String(value);
}

function nullableNumber(value: unknown) {
  return value == null ? null : Number(value);
}

function percentage(actual: number, planned: number) {
  if (planned <= 0) return actual > 0 ? 200 : 100;
  return Math.round((actual / planned) * 1000) / 10;
}

function ratio(actual: number, planned: number) {
  if (planned <= 0) return actual > 0 ? 1 : 0;
  return Math.round((actual / planned) * 100) / 100;
}

function dateIso(value: unknown) {
  return new Date(value as string | number | Date).toISOString();
}

function nullableDate(value: unknown) {
  return value == null ? null : dateIso(value);
}

function toIso(value: unknown) {
  return value == null ? null : dateIso(value);
}

function emptySearchGroups(): Record<GlobalSearchResultType, GlobalSearchResult[]> {
  return {
    project: [],
    article: [],
    research_run: [],
    research_finding: [],
    research_source: []
  };
}

function stringArray(value: unknown) {
  return Array.isArray(value) ? value.map(String) : [];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
