import { ChevronRight, Command, Play, Settings2, PanelLeft, PanelRight, ChevronDown, Check } from "lucide-react";
import { useOSStore, selectArticle } from "@/lib/os-writer-store";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";

export function Titlebar() {
  const project = useOSStore((s) => s.projects.find((p) => p.id === s.selectedProjectId));
  const article = useOSStore(selectArticle);
  const togglePalette = useOSStore((s) => s.togglePalette);
  const toggleSettings = useOSStore((s) => s.toggleSettings);
  const toggleSidebar = useOSStore((s) => s.toggleSidebar);
  const toggleInspector = useOSStore((s) => s.toggleInspector);
  const retryFailed = useOSStore((s) => s.retryFailed);
  const toggles = useOSStore((s) => s.toggles);
  const setToggle = useOSStore((s) => s.setToggle);

  return (
    <div className="hairline-b flex h-10 select-none items-center bg-surface-2/85 px-3 backdrop-blur">
      {/* traffic lights */}
      <div className="flex items-center gap-1.5 pr-3">
        <span className="size-[11px] rounded-full bg-[#FF5F57]" />
        <span className="size-[11px] rounded-full bg-[#FEBC2E]" />
        <span className="size-[11px] rounded-full bg-[#28C840]" />
      </div>

      <button
        onClick={toggleSidebar}
        className="mr-1 flex size-7 items-center justify-center rounded text-ink-subtle hover:bg-surface-3 hover:text-ink"
        title="Toggle sidebar (⌥1)"
      >
        <PanelLeft className="size-3.5" />
      </button>
      <button
        onClick={toggleInspector}
        className="mr-3 flex size-7 items-center justify-center rounded text-ink-subtle hover:bg-surface-3 hover:text-ink"
        title="Toggle inspector (⌥2)"
      >
        <PanelRight className="size-3.5" />
      </button>

      {/* breadcrumb */}
      <div className="flex min-w-0 flex-1 items-center gap-1.5 text-[12.5px]">
        <span className="font-semibold tracking-[-0.005em] text-ink">OS Writer</span>
        <ChevronRight className="size-3 text-ink-subtle" />
        <span className="truncate text-ink-muted">{project?.name}</span>
        {article && (
          <>
            <ChevronRight className="size-3 text-ink-subtle" />
            <span className="truncate text-ink">{article.title}</span>
          </>
        )}
      </div>

      <div className="flex items-center gap-1">
        <button
          onClick={() => togglePalette(true)}
          className="group flex h-7 items-center gap-2 rounded-md bg-surface-1 px-2 text-[12px] text-ink-muted hover:text-ink"
          title="Command palette (⌘K)"
        >
          <Command className="size-3.5" />
          <span>Search actions…</span>
          <span className="mono ml-1 rounded bg-surface-3 px-1 text-[10px] text-ink-subtle">⌘K</span>
        </button>

        <button
          onClick={() => toggleSettings(true)}
          className="flex size-7 items-center justify-center rounded-md text-ink-subtle hover:bg-surface-3 hover:text-ink"
          title="Settings (⌘,)"
        >
          <Settings2 className="size-3.5" />
        </button>

        <div className="mx-1 h-4 w-px bg-line" />

        {/* generate split button — quieter */}
        <div className="flex items-stretch overflow-hidden rounded-md bg-ink text-primary-foreground">
          <button className="flex items-center gap-1.5 px-2.5 text-[12px] font-medium hover:bg-ink/90">
            <Play className="size-3 fill-current" />
            Generate
          </button>
          <div className="w-px bg-white/15" />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="px-1.5 hover:bg-ink/90" title="Generate options">
                <ChevronDown className="size-3.5" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-60 p-1">
              <DropdownMenuLabel className="px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-subtle">
                Include
              </DropdownMenuLabel>
              {([
                ["tldr", "TL;DR"],
                ["faq", "FAQ"],
                ["comparisonTable", "Comparison table"],
                ["bulletSummaries", "Bullet summaries"],
                ["citations", "Citations"],
                ["internalLinks", "Internal links"],
                ["editorPass", "AI editor pass"],
              ] as const).map(([k, label]) => (
                <DropdownMenuItem
                  key={k}
                  onSelect={(e) => {
                    e.preventDefault();
                    setToggle(k, !toggles[k]);
                  }}
                  className="flex h-7 cursor-pointer items-center gap-2 rounded px-2 text-[12.5px]"
                >
                  <span className="grid size-3.5 place-items-center">
                    {toggles[k] && <Check className="size-3 text-ink" />}
                  </span>
                  <span className="flex-1">{label}</span>
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={retryFailed} className="h-7 rounded px-2 text-[12.5px]">
                Retry all failed
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </div>
  );
}
