import type { ArticleDocument, ProjectDocument } from "@/lib/types";
import type { WorkspaceStore } from "@/lib/storage/storage";

export async function getAccessibleProject(store: WorkspaceStore, projectId: string): Promise<ProjectDocument | null> {
  const projects = await store.listProjects();
  return projects.find((project) => project.id === projectId) ?? null;
}

export async function getAccessibleArticle(store: WorkspaceStore, articleId: string): Promise<ArticleDocument | null> {
  const article = await store.getArticleById(articleId);
  if (!article) return null;
  const project = await getAccessibleProject(store, article.projectId);
  return project ? article : null;
}
