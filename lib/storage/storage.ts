import type { ArticleDocument, DebugDocument, ProjectDocument, QueueJob, ResearchPack, SettingsDocument, WorkerLeaseDocument } from "@/lib/types";
import { createDefaultProject, createDefaultSettings, DEFAULT_PROJECT_ID } from "@/lib/defaults";
import { articleMarkdownPath, articlePath, articlesPrefix, debugPath, jobPath, jobsPrefix, researchPath, settingsPath, workerLeasePath, workspacePath } from "@/lib/storage/paths";

export interface StorageAdapter {
  getJson<T>(path: string): Promise<T | null>;
  putJson<T>(path: string, value: T): Promise<void>;
  putJsonIfAbsent<T>(path: string, value: T): Promise<boolean>;
  putText(path: string, value: string): Promise<void>;
  listJson<T>(prefix: string): Promise<T[]>;
  listPaths(prefix: string): Promise<string[]>;
  deletePath(path: string): Promise<void>;
}

export class WorkspaceStore {
  constructor(private readonly storage: StorageAdapter) {}

  async ensureProject(projectId = DEFAULT_PROJECT_ID) {
    let project = await this.storage.getJson<ProjectDocument>(workspacePath(projectId));
    if (!project) {
      project = createDefaultProject();
      await this.storage.putJson(workspacePath(projectId), project);
    }

    let settings = await this.storage.getJson<SettingsDocument>(settingsPath(projectId));
    if (!settings) {
      settings = createDefaultSettings();
      await this.storage.putJson(settingsPath(projectId), settings);
    }

    return { project, settings };
  }

  async getState(projectId = DEFAULT_PROJECT_ID) {
    const { project, settings } = await this.ensureProject(projectId);
    const jobs = await this.listJobs(projectId);
    const articles = await this.listArticles(projectId);
    return { project, settings, jobs, articles };
  }

  async clearProjectData(projectId = DEFAULT_PROJECT_ID) {
    const prefixes = [
      jobsPrefix(projectId),
      articlesPrefix(projectId),
      `${rootForClear(projectId)}/research/`,
      `${rootForClear(projectId)}/debug/`,
      `${rootForClear(projectId)}/exports/`
    ];
    const paths = (await Promise.all(prefixes.map((prefix) => this.storage.listPaths(prefix)))).flat();
    await Promise.all(paths.map((path) => this.storage.deletePath(path)));
    return paths.length;
  }

  async listJobs(projectId = DEFAULT_PROJECT_ID) {
    const jobs = await this.storage.listJson<QueueJob>(jobsPrefix(projectId));
    return jobs.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  async saveJob(job: QueueJob) {
    await this.storage.putJson(jobPath(job.id, job.projectId), job);
  }

  async getJob(jobId: string, projectId = DEFAULT_PROJECT_ID) {
    return this.storage.getJson<QueueJob>(jobPath(jobId, projectId));
  }

  async listArticles(projectId = DEFAULT_PROJECT_ID) {
    const all = await this.storage.listJson<ArticleDocument>(articlesPrefix(projectId));
    return all
      .filter((article) => typeof article.markdown === "string")
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async saveArticle(article: ArticleDocument) {
    await this.storage.putJson(articlePath(article.id, article.projectId), article);
    await this.storage.putText(articleMarkdownPath(article.id, article.projectId), article.markdown);
  }

  async saveResearch(research: ResearchPack, projectId = DEFAULT_PROJECT_ID) {
    await this.storage.putJson(researchPath(research.articleId, projectId), research);
  }

  async getResearch(articleId: string, projectId = DEFAULT_PROJECT_ID) {
    return this.storage.getJson<ResearchPack>(researchPath(articleId, projectId));
  }

  async saveDebug(debug: DebugDocument, projectId = DEFAULT_PROJECT_ID) {
    await this.storage.putJson(debugPath(debug.articleId, projectId), debug);
  }

  async getDebug(articleId: string, projectId = DEFAULT_PROJECT_ID) {
    return this.storage.getJson<DebugDocument>(debugPath(articleId, projectId));
  }

  async getWorkerLease(projectId = DEFAULT_PROJECT_ID) {
    return this.storage.getJson<WorkerLeaseDocument>(workerLeasePath(projectId));
  }

  async createWorkerLeaseIfAbsent(lease: WorkerLeaseDocument, projectId = DEFAULT_PROJECT_ID) {
    return this.storage.putJsonIfAbsent(workerLeasePath(projectId), lease);
  }

  async deleteWorkerLease(projectId = DEFAULT_PROJECT_ID) {
    await this.storage.deletePath(workerLeasePath(projectId));
  }

  async getSettings(projectId = DEFAULT_PROJECT_ID) {
    const { settings } = await this.ensureProject(projectId);
    return settings;
  }

  async saveSettings(settings: SettingsDocument) {
    await this.storage.putJson(settingsPath(settings.projectId), settings);
  }
}

function rootForClear(projectId: string) {
  return `projects/${projectId}`;
}
