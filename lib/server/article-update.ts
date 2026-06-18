import { nowIso } from "@/lib/defaults";
import type { WorkspaceStore } from "@/lib/storage/storage";
import { countWords } from "@/lib/text";

export interface ArticlePatch {
  markdown?: string;
  title?: string;
  isPinned?: boolean;
}

export async function updateArticleFromPatch(store: WorkspaceStore, articleId: string, patch: ArticlePatch) {
  const article = await store.getArticleById(articleId);
  if (!article) return null;

  const hasMarkdown = typeof patch.markdown === "string";
  const hasTitle = typeof patch.title === "string";
  const hasPinned = typeof patch.isPinned === "boolean";
  const updated = {
    ...article,
    title: hasTitle ? patch.title!.trim() || article.title : article.title,
    markdown: hasMarkdown ? patch.markdown! : article.markdown,
    wordCount: hasMarkdown ? countWords(patch.markdown!) : article.wordCount,
    isPinned: hasPinned ? patch.isPinned! : article.isPinned ?? false,
    updatedAt: hasMarkdown || hasTitle ? nowIso() : article.updatedAt
  };
  await store.updateArticle(updated);
  return updated;
}
