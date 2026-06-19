import type { WorkspaceStore } from "@/lib/storage/storage";
import type { UsageProvider } from "@/lib/billing/service";

export class WorkspaceUsageProvider implements UsageProvider {
  constructor(private readonly store: WorkspaceStore) {}

  async getUsage() {
    const projects = await this.store.listProjects();
    const articleGroups = await Promise.all(projects.map((project) => this.store.listArticles(project.id)));
    const articles = articleGroups.flat();
    const research = await Promise.all(articles.map((article) => this.store.getResearch(article.id, article.projectId)));
    return {
      projects: projects.length,
      words: articles.reduce((total, article) => total + Math.max(0, article.wordCount), 0),
      researchRuns: research.filter(Boolean).length,
      exports: 0,
      mcpAccess: 0,
      byokAccess: 0
    };
  }
}
