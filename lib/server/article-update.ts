import { nowIso } from "@/lib/defaults";
import type { WorkspaceStore } from "@/lib/storage/storage";
import { countWords } from "@/lib/text";
import { normalizeContentProfile, type ContentProfile } from "@/lib/content-profiles";

export interface ArticlePatch {
  markdown?: string;
  title?: string;
  isPinned?: boolean;
  contentProfile?: ContentProfile | null;
}

export async function updateArticleFromPatch(store: WorkspaceStore, articleId: string, patch: ArticlePatch) {
  const article = await store.getArticleById(articleId);
  if (!article) return null;

  const hasMarkdown = typeof patch.markdown === "string";
  const hasTitle = typeof patch.title === "string";
  const hasPinned = typeof patch.isPinned === "boolean";
  const hasContentProfile = patch.contentProfile !== undefined;
  const updated = {
    ...article,
    title: hasTitle ? patch.title!.trim() || article.title : article.title,
    markdown: hasMarkdown ? patch.markdown! : article.markdown,
    wordCount: hasMarkdown ? countWords(patch.markdown!) : article.wordCount,
    isPinned: hasPinned ? patch.isPinned! : article.isPinned ?? false,
    contentProfile: hasContentProfile ? normalizeContentProfile(patch.contentProfile) : article.contentProfile,
    updatedAt: hasMarkdown || hasTitle || hasContentProfile ? nowIso() : article.updatedAt
  };
  await store.updateArticle(updated);
  return updated;
}
