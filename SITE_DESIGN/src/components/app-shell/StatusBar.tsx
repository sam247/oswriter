import { useOSStore, selectProjectStats, selectArticle } from "@/lib/os-writer-store";
import { useShallow } from "zustand/react/shallow";

export function StatusBar() {
  const stats = useOSStore(useShallow(selectProjectStats));
  const article = useOSStore(selectArticle);

  return (
    <div className="hairline-t mono flex h-6 items-center gap-3 bg-surface-2/70 px-3 text-[10.5px] text-ink-subtle">
      <div className="flex items-center gap-1.5">
        <span className="size-1.5 rounded-full bg-success" />
        <span className="text-ink-muted">Ready</span>
      </div>
      <Sep />
      <span><span className="text-ink-muted">{stats.total}</span> articles</span>
      <span><span className="text-ink-muted">{stats.generated}</span> done</span>
      <span><span className={stats.failed > 0 ? "text-danger" : "text-ink-muted"}>{stats.failed}</span> failed</span>
      <span><span className="text-ink-muted">{stats.pending}</span> pending</span>
      <Sep />
      <span>Q<span className="text-ink-muted">{stats.avgQuality}</span></span>
      <span><span className="text-ink-muted">{stats.totalWords.toLocaleString()}</span> w</span>
      <span><span className="text-ink-muted">{stats.successRate}%</span> success</span>
      <div className="flex-1" />
      {article?.updatedAt && (
        <span>Autosaved {new Date(article.updatedAt).toLocaleTimeString()}</span>
      )}
    </div>
  );
}

function Sep() {
  return <div className="h-3 w-px bg-line" />;
}
