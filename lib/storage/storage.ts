import type { ArticleDocument, DebugDocument, GlobalSearchResponse, GlobalSearchResult, GlobalSearchResultType, ProjectDocument, QueueControlDocument, QueueJob, ResearchPack, SettingsDocument, WorkerLeaseDocument } from "@/lib/types";
import { createDefaultProject, createDefaultQueueControl, createDefaultSettings, DEFAULT_PROJECT_ID } from "@/lib/defaults";
import { activeProjectPath, articleMarkdownPath, articlePath, articlesPrefix, debugPath, jobPath, jobsPrefix, queueControlPath, researchPath, settingsPath, workerLeasePath, workspacePath } from "@/lib/storage/paths";

export interface StorageProvider {
  getJson<T>(path: string): Promise<T | null>;
  putJson<T>(path: string, value: T): Promise<void>;
  putJsonIfAbsent<T>(path: string, value: T): Promise<boolean>;
  putText(path: string, value: string): Promise<void>;
  listJson<T>(prefix: string): Promise<T[]>;
  listPaths(prefix: string): Promise<string[]>;
  deletePath(path: string): Promise<void>;
  globalSearch?(query: string, projectId: string, limit?: number): Promise<GlobalSearchResponse>;
}

export type StorageAdapter = StorageProvider;

export class WorkspaceStore {
  constructor(private readonly storage: StorageProvider) {}

  async getActiveProjectId() {
    const active = await this.storage.getJson<{ projectId?: string }>(activeProjectPath());
    return active?.projectId || DEFAULT_PROJECT_ID;
  }

  async setActiveProjectId(projectId: string) {
    await this.storage.putJson(activeProjectPath(), {
      projectId,
      updatedAt: new Date().toISOString()
    });
  }

  async ensureProject(projectId?: string) {
    const resolvedProjectId = projectId ?? await this.getActiveProjectId();
    let project = await this.storage.getJson<ProjectDocument>(workspacePath(resolvedProjectId));
    if (!project) {
      project = resolvedProjectId === DEFAULT_PROJECT_ID
        ? createDefaultProject()
        : { ...createDefaultProject(), id: resolvedProjectId, name: resolvedProjectId };
      await this.storage.putJson(workspacePath(resolvedProjectId), project);
    }

    let settings = await this.storage.getJson<SettingsDocument>(settingsPath(resolvedProjectId));
    if (!settings) {
      settings = resolvedProjectId === DEFAULT_PROJECT_ID
        ? createDefaultSettings()
        : { ...createDefaultSettings(), projectId: resolvedProjectId };
      await this.storage.putJson(settingsPath(resolvedProjectId), settings);
    }

    let queueControl = await this.storage.getJson<QueueControlDocument>(queueControlPath(resolvedProjectId));
    if (!queueControl) {
      queueControl = createDefaultQueueControl(resolvedProjectId);
      await this.storage.putJson(queueControlPath(resolvedProjectId), queueControl);
    }

    return { project, settings, queueControl };
  }

  async getState(projectId?: string) {
    const resolvedProjectId = projectId ?? await this.getActiveProjectId();
    const { project, settings, queueControl } = await this.ensureProject(resolvedProjectId);
    const projects = await this.listProjects();
    const jobs = await this.listJobs(resolvedProjectId);
    const articles = await this.listArticles(resolvedProjectId);
    return { project, projects, settings, queueControl, jobs, articles };
  }

  async saveProject(project: ProjectDocument) {
    await this.storage.putJson(workspacePath(project.id), project);
  }

  async listProjects() {
    const paths = await this.storage.listPaths("projects/");
    const workspacePaths = [...new Set(paths.filter((path) => path.endsWith("/workspace.json")))];
    const projects = (await Promise.all(workspacePaths.map((path) => this.storage.getJson<ProjectDocument>(path))))
      .filter((project): project is ProjectDocument => Boolean(project));
    const { project } = await this.ensureProject(DEFAULT_PROJECT_ID);
    if (!projects.some((item) => item.id === project.id)) projects.push(project);
    return projects.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async clearProjectData(projectId?: string) {
    const resolvedProjectId = projectId ?? await this.getActiveProjectId();
    const prefixes = [
      jobsPrefix(resolvedProjectId),
      articlesPrefix(resolvedProjectId),
      `${rootForClear(resolvedProjectId)}/queue/`,
      `${rootForClear(resolvedProjectId)}/research/`,
      `${rootForClear(resolvedProjectId)}/debug/`,
      `${rootForClear(resolvedProjectId)}/exports/`
    ];
    const paths = (await Promise.all(prefixes.map((prefix) => this.storage.listPaths(prefix)))).flat();
    await Promise.all(paths.map((path) => this.storage.deletePath(path)));
    return paths.length;
  }

  async deleteProject(projectId: string) {
    const activeProjectId = await this.getActiveProjectId();
    if (projectId === DEFAULT_PROJECT_ID) {
      const count = await this.clearProjectData(projectId);
      const project = createDefaultProject();
      await this.saveProject(project);
      await this.saveSettings(createDefaultSettings());
      await this.saveQueueControl(createDefaultQueueControl(projectId));
      await this.setActiveProjectId(DEFAULT_PROJECT_ID);
      return { project, deleted: count };
    }

    const rootPrefix = `${rootForClear(projectId)}/`;
    const paths = new Set(await this.storage.listPaths(rootPrefix));
    paths.add(workspacePath(projectId));
    paths.add(settingsPath(projectId));
    paths.add(queueControlPath(projectId));
    await Promise.all([...paths].map((path) => this.storage.deletePath(path)));

    if (activeProjectId === projectId) await this.setActiveProjectId(DEFAULT_PROJECT_ID);
    const { project } = await this.ensureProject(DEFAULT_PROJECT_ID);
    return { project, deleted: paths.size };
  }

  async clearQueueData(projectId?: string) {
    const resolvedProjectId = projectId ?? await this.getActiveProjectId();
    const jobs = await this.listJobs(resolvedProjectId);
    const queueJobs = jobs.filter((job) => job.status === "queued" || job.status === "failed" || job.status === "skipped");
    await Promise.all(queueJobs.map((job) => this.storage.deletePath(jobPath(job.id, resolvedProjectId))));
    return queueJobs.length;
  }

  async listJobs(projectId?: string) {
    const resolvedProjectId = projectId ?? await this.getActiveProjectId();
    const jobs = await this.storage.listJson<QueueJob>(jobsPrefix(resolvedProjectId));
    return jobs.sort((a, b) => (a.queuePosition ?? new Date(a.createdAt).getTime()) - (b.queuePosition ?? new Date(b.createdAt).getTime()) || a.createdAt.localeCompare(b.createdAt));
  }

  async saveJob(job: QueueJob) {
    await this.storage.putJson(jobPath(job.id, job.projectId), job);
  }

  async saveJobs(jobs: QueueJob[]) {
    await Promise.all(jobs.map((job) => this.saveJob(job)));
  }

  async getJob(jobId: string, projectId?: string) {
    return this.storage.getJson<QueueJob>(jobPath(jobId, projectId ?? await this.getActiveProjectId()));
  }

  async listArticles(projectId?: string) {
    const all = await this.storage.listJson<ArticleDocument>(articlesPrefix(projectId ?? await this.getActiveProjectId()));
    return all
      .filter((article) => typeof article.markdown === "string")
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async saveArticle(article: ArticleDocument) {
    await this.storage.putJson(articlePath(article.id, article.projectId), article);
    await this.storage.putText(articleMarkdownPath(article.id, article.projectId), article.markdown);
  }

  async deleteArticle(articleId: string, projectId?: string) {
    const resolvedProjectId = projectId ?? await this.getActiveProjectId();
    await this.storage.deletePath(articlePath(articleId, resolvedProjectId));
    await this.storage.deletePath(articleMarkdownPath(articleId, resolvedProjectId));
  }

  async saveResearch(research: ResearchPack, projectId?: string) {
    await this.storage.putJson(researchPath(research.articleId, projectId ?? await this.getActiveProjectId()), research);
  }

  async getResearch(articleId: string, projectId?: string) {
    return this.storage.getJson<ResearchPack>(researchPath(articleId, projectId ?? await this.getActiveProjectId()));
  }

  async saveDebug(debug: DebugDocument, projectId?: string) {
    await this.storage.putJson(debugPath(debug.articleId, projectId ?? await this.getActiveProjectId()), debug);
  }

  async getDebug(articleId: string, projectId?: string) {
    return this.storage.getJson<DebugDocument>(debugPath(articleId, projectId ?? await this.getActiveProjectId()));
  }

  async getWorkerLease(projectId?: string) {
    return this.storage.getJson<WorkerLeaseDocument>(workerLeasePath(projectId ?? await this.getActiveProjectId()));
  }

  async createWorkerLeaseIfAbsent(lease: WorkerLeaseDocument, projectId?: string) {
    return this.storage.putJsonIfAbsent(workerLeasePath(projectId ?? await this.getActiveProjectId()), lease);
  }

  async deleteWorkerLease(projectId?: string) {
    await this.storage.deletePath(workerLeasePath(projectId ?? await this.getActiveProjectId()));
  }

  async getSettings(projectId?: string) {
    const { settings } = await this.ensureProject(projectId);
    return settings;
  }

  async saveSettings(settings: SettingsDocument) {
    await this.storage.putJson(settingsPath(settings.projectId), settings);
  }

  async getQueueControl(projectId?: string) {
    const resolvedProjectId = projectId ?? await this.getActiveProjectId();
    const control = await this.storage.getJson<QueueControlDocument>(queueControlPath(resolvedProjectId));
    if (control) return control;
    const created = createDefaultQueueControl(resolvedProjectId);
    await this.saveQueueControl(created);
    return created;
  }

  async saveQueueControl(control: QueueControlDocument) {
    await this.storage.putJson(queueControlPath(control.projectId), control);
  }

  async globalSearch(query: string, projectId?: string, limit = 8): Promise<GlobalSearchResponse> {
    const resolvedProjectId = projectId ?? await this.getActiveProjectId();
    const clean = query.trim();
    const empty = emptySearchResponse(clean);
    if (clean.length < 2) return empty;
    if (this.storage.globalSearch) return this.storage.globalSearch(clean, resolvedProjectId, limit);

    const [projects, jobs, articles] = await Promise.all([
      this.listProjects(),
      this.listJobs(resolvedProjectId),
      this.listArticles(resolvedProjectId)
    ]);
    const packs = (await Promise.all(articles.map((article) => this.getResearch(article.id, resolvedProjectId))))
      .filter((pack): pack is ResearchPack => Boolean(pack));
    const needle = clean.toLowerCase();
    const matches = (value?: string | null) => Boolean(value?.toLowerCase().includes(needle));
    const groups = empty.groups;
    const push = (type: GlobalSearchResultType, result: GlobalSearchResult) => {
      if (groups[type].length < limit) groups[type].push(result);
    };

    for (const project of projects) {
      if (matches(project.name) || matches(project.slug)) push("project", { id: project.id, type: "project", title: project.name, projectId: project.id, updatedAt: project.updatedAt });
    }
    for (const article of articles) {
      if (matches(article.title) || matches(article.markdown)) push("article", { id: article.id, type: "article", title: article.title, subtitle: `${article.wordCount} words`, projectId: article.projectId, articleId: article.id, jobId: article.jobId, matchedText: excerpt(article.markdown, needle), updatedAt: article.updatedAt });
    }
    for (const pack of packs) {
      if (matches(pack.title) || pack.queries.some(matches)) push("research_run", { id: pack.id ?? pack.articleId, type: "research_run", title: pack.title, subtitle: `${pack.sources.length} sources`, projectId: pack.projectId ?? resolvedProjectId, articleId: pack.articleId, jobId: pack.jobId ?? null, updatedAt: pack.createdAt });
      for (const source of [...pack.sources, ...pack.rejectedSources]) {
        if (matches(source.title) || matches(source.domain) || matches(source.url) || matches(source.summary) || source.highlights.some(matches)) push("research_source", { id: source.id, type: "research_source", title: source.domain || source.title, subtitle: source.title, projectId: pack.projectId ?? resolvedProjectId, articleId: pack.articleId, jobId: pack.jobId ?? null, url: source.url, matchedText: source.summary ?? source.highlights[0] ?? null, updatedAt: pack.createdAt });
      }
      for (const fact of [...pack.usefulFacts, ...pack.rejectedFacts, ...pack.questionsFound, ...pack.headingsFound]) {
        if (matches(fact)) push("research_finding", { id: `${pack.articleId}:${fact}`, type: "research_finding", title: fact, subtitle: pack.title, projectId: pack.projectId ?? resolvedProjectId, articleId: pack.articleId, jobId: pack.jobId ?? null, matchedText: fact, updatedAt: pack.createdAt });
      }
    }
    for (const job of jobs) {
      if (matches(job.title)) push("article", { id: job.articleId, type: "article", title: job.title, subtitle: statusText(job.status), projectId: job.projectId, articleId: job.articleId, jobId: job.id, updatedAt: job.updatedAt });
    }

    return { query: clean, groups };
  }
}

function rootForClear(projectId: string) {
  return `projects/${projectId}`;
}

function emptySearchResponse(query: string): GlobalSearchResponse {
  return {
    query,
    groups: {
      project: [],
      article: [],
      research_run: [],
      research_finding: [],
      research_source: []
    }
  };
}

function excerpt(value: string, needle: string) {
  const index = value.toLowerCase().indexOf(needle);
  if (index < 0) return null;
  return value.slice(Math.max(0, index - 80), Math.min(value.length, index + 160)).replace(/\s+/g, " ").trim();
}

function statusText(status: QueueJob["status"]) {
  return status.replace("_", " ");
}
