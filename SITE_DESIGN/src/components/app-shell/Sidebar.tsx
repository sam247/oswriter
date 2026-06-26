import {
  ChevronsUpDown,
  Plus,
  Upload,
  RotateCw,
  Trash2,
  MoreHorizontal,
  Sparkles,
  FolderPlus,
  Copy,
  Archive,
} from "lucide-react";
import { useOSStore, selectProjectArticles, selectProjectStats, type QueueFilter, type ArticleStatus } from "@/lib/os-writer-store";
import { useShallow } from "zustand/react/shallow";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

const FILTERS: { id: QueueFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "queued", label: "Queued" },
  { id: "processing", label: "Processing" },
  { id: "generated", label: "Done" },
  { id: "failed", label: "Failed" },
  { id: "review", label: "Review" },
];

export function Sidebar() {
  const projects = useOSStore((s) => s.projects);
  const selectedProjectId = useOSStore((s) => s.selectedProjectId);
  const setProject = useOSStore((s) => s.setProject);
  const stats = useOSStore(useShallow(selectProjectStats));
  const articles = useOSStore(useShallow(selectProjectArticles));
  const queueFilter = useOSStore((s) => s.queueFilter);
  const setQueueFilter = useOSStore((s) => s.setQueueFilter);
  const bulkAdd = useOSStore((s) => s.bulkAdd);
  const setBulkAdd = useOSStore((s) => s.setBulkAdd);
  const addTitles = useOSStore((s) => s.addTitles);
  const retryFailed = useOSStore((s) => s.retryFailed);
  const clearQueue = useOSStore((s) => s.clearQueue);
  const selectedArticleId = useOSStore((s) => s.selectedArticleId);
  const selectArticle = useOSStore((s) => s.selectArticle);
  const removeArticle = useOSStore((s) => s.removeArticle);

  const project = projects.find((p) => p.id === selectedProjectId);

  const visible = articles.filter(
    (a) => queueFilter === "all" || a.status === queueFilter,
  );

  const countsByStatus = articles.reduce<Record<string, number>>((acc, a) => {
    acc[a.status] = (acc[a.status] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <aside className="flex h-full flex-col overflow-hidden bg-surface-2 text-[13px]">
      {/* Project switcher */}
      <div className="px-2 pt-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-surface-3">
              <div className="grid size-5 shrink-0 place-items-center rounded bg-ink text-primary-foreground">
                <Sparkles className="size-3" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[12.5px] font-medium text-ink">{project?.name}</div>
              </div>
              <ChevronsUpDown className="size-3.5 text-ink-subtle" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-64">
            <DropdownMenuLabel>Projects</DropdownMenuLabel>
            {projects.map((p) => (
              <DropdownMenuItem key={p.id} onSelect={() => setProject(p.id)}>
                <div className="flex w-full items-center justify-between">
                  <span>{p.name}</span>
                  <span className="mono text-[10px] text-ink-subtle">{p.template}</span>
                </div>
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem><FolderPlus className="mr-2 size-3.5" /> New project</DropdownMenuItem>
            <DropdownMenuItem><Copy className="mr-2 size-3.5" /> Clone project</DropdownMenuItem>
            <DropdownMenuItem><Archive className="mr-2 size-3.5" /> Archive</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Stats — inline, borderless */}
        <div className="mono mt-1 flex items-center gap-3 px-2 pb-2 text-[10.5px] text-ink-subtle">
          <span><span className="text-ink">{stats.generated}</span> done</span>
          <span><span className={stats.failed > 0 ? "text-danger" : "text-ink"}>{stats.failed}</span> failed</span>
          <span><span className="text-ink">{stats.pending}</span> pending</span>
          <span className="ml-auto"><span className="text-ink">Q{stats.avgQuality}</span></span>
        </div>
      </div>

      {/* Queue filters */}
      <div className="hairline-b px-2 pb-2">
        <div className="flex flex-wrap gap-px">
          {FILTERS.map((f) => {
            const n = f.id === "all" ? articles.length : countsByStatus[f.id] ?? 0;
            const active = queueFilter === f.id;
            return (
              <button
                key={f.id}
                onClick={() => setQueueFilter(f.id)}
                className={cn(
                  "flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] transition-colors",
                  active
                    ? "bg-ink/[0.08] text-ink"
                    : "text-ink-muted hover:bg-surface-3 hover:text-ink",
                )}
              >
                <span>{f.label}</span>
                <span className={cn("mono text-[10px]", active ? "text-ink-muted" : "text-ink-subtle")}>
                  {n}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Articles list — flat, Mail.app style */}
      <div className="min-h-0 flex-1 overflow-auto">
        {visible.length === 0 ? (
          <div className="p-6 text-center text-[12px] text-ink-subtle">No articles in this filter.</div>
        ) : (
          <ul className="py-1">
            {visible.map((a) => {
              const active = selectedArticleId === a.id;
              return (
                <li key={a.id}>
                  <button
                    onClick={() => selectArticle(a.id)}
                    className={cn(
                      "group relative flex w-full items-start gap-2.5 px-3 py-1.5 text-left transition-colors",
                      active
                        ? "bg-ink/[0.06]"
                        : "hover:bg-surface-3",
                    )}
                  >
                    {active && <span className="absolute inset-y-1 left-0 w-[2px] rounded-r bg-ink" />}
                    <StatusDot status={a.status} />
                    <div className="min-w-0 flex-1">
                      <div className={cn(
                        "truncate text-[13px] leading-snug tracking-[-0.005em]",
                        active ? "font-semibold text-ink" : "font-medium text-ink",
                      )}>
                        {a.title}
                      </div>
                      <div className="mono mt-0.5 flex items-center gap-1.5 text-[10.5px] text-ink-subtle">
                        <span className="capitalize">{a.status}</span>
                        {a.wordCount > 0 && (
                          <>
                            <span className="text-line-strong">·</span>
                            <span>{a.wordCount.toLocaleString()} w</span>
                          </>
                        )}
                        {a.status === "generated" && (
                          <>
                            <span className="text-line-strong">·</span>
                            <span>Q{a.quality}</span>
                          </>
                        )}
                        <span className="text-line-strong">·</span>
                        <span>{relativeDate(a.updatedAt)}</span>
                      </div>
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <span
                          role="button"
                          onClick={(e) => e.stopPropagation()}
                          className="invisible mt-0.5 flex size-5 items-center justify-center rounded text-ink-muted hover:bg-surface-1 group-hover:visible"
                        >
                          <MoreHorizontal className="size-3.5" />
                        </span>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem>Retry</DropdownMenuItem>
                        <DropdownMenuItem>Duplicate</DropdownMenuItem>
                        <DropdownMenuItem>Export</DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          onSelect={() => removeArticle(a.id)}
                          className="text-destructive focus:text-destructive"
                        >
                          Remove
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Bulk add */}
      <div className="hairline-t px-2 pb-2 pt-2">
        <div className="mb-1 flex items-center justify-between px-1">
          <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-subtle">
            Add titles
          </span>
          <button
            onClick={clearQueue}
            className="flex items-center gap-1 text-[10.5px] text-ink-subtle hover:text-ink"
          >
            <Trash2 className="size-3" /> Clear queue
          </button>
        </div>
        <textarea
          value={bulkAdd}
          onChange={(e) => setBulkAdd(e.target.value)}
          placeholder="Paste one title per line…"
          className="mono w-full resize-none rounded-md border border-line bg-surface-1 p-2 text-[12px] leading-snug text-ink placeholder:text-ink-subtle focus:border-line-strong focus:outline-none"
          rows={3}
        />
        <div className="mt-1.5 flex gap-1">
          <button
            onClick={() => addTitles(bulkAdd.split("\n"))}
            className="flex flex-1 items-center justify-center gap-1 rounded-md bg-ink px-2 py-1.5 text-[11.5px] font-medium text-primary-foreground hover:bg-ink/90"
          >
            <Plus className="size-3.5" /> Add
          </button>
          <button className="flex items-center justify-center gap-1 rounded-md px-2 py-1.5 text-[11.5px] text-ink-muted hover:bg-surface-3 hover:text-ink">
            <Upload className="size-3.5" /> CSV
          </button>
          <button
            onClick={retryFailed}
            className="flex items-center justify-center gap-1 rounded-md px-2 py-1.5 text-[11.5px] text-ink-muted hover:bg-surface-3 hover:text-ink"
          >
            <RotateCw className="size-3.5" /> Retry
          </button>
        </div>
      </div>
    </aside>
  );
}

function StatusDot({ status }: { status: ArticleStatus }) {
  const cls = {
    queued: "bg-ink-subtle/60",
    processing: "bg-info animate-pulse",
    generated: "bg-success",
    failed: "bg-danger",
    review: "bg-warn",
  }[status];
  return <span className={cn("mt-[7px] size-1.5 shrink-0 rounded-full", cls)} />;
}

function relativeDate(iso: string) {
  const d = new Date(iso);
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 60) return "now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  if (diff < 86400 * 7) return `${Math.floor(diff / 86400)}d`;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
