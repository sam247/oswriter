import { useEffect } from "react";
import { useOSStore, selectProjectArticles } from "@/lib/os-writer-store";
import { useShallow } from "zustand/react/shallow";
import {
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandShortcut,
} from "@/components/ui/command";
import {
  Play,
  RotateCw,
  Sparkles,
  Wand2,
  Download,
  Settings2,
  PanelLeft,
  PanelRight,
  FileText,
} from "lucide-react";

export function CommandPalette() {
  const open = useOSStore((s) => s.paletteOpen);
  const togglePalette = useOSStore((s) => s.togglePalette);
  const toggleSettings = useOSStore((s) => s.toggleSettings);
  const toggleEditorPass = useOSStore((s) => s.toggleEditorPass);
  const toggleSidebar = useOSStore((s) => s.toggleSidebar);
  const toggleInspector = useOSStore((s) => s.toggleInspector);
  const retryFailed = useOSStore((s) => s.retryFailed);
  const articles = useOSStore(useShallow(selectProjectArticles));
  const selectArticle = useOSStore((s) => s.selectArticle);
  const projects = useOSStore((s) => s.projects);
  const setProject = useOSStore((s) => s.setProject);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        togglePalette();
      }
      if ((e.metaKey || e.ctrlKey) && e.key === ",") {
        e.preventDefault();
        toggleSettings();
      }
      if (e.altKey && e.key === "1") { e.preventDefault(); toggleSidebar(); }
      if (e.altKey && e.key === "2") { e.preventDefault(); toggleInspector(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [togglePalette, toggleSettings, toggleSidebar, toggleInspector]);

  const run = (fn: () => void) => {
    fn();
    togglePalette(false);
  };

  return (
    <CommandDialog open={open} onOpenChange={(v) => togglePalette(v)}>
      <CommandInput placeholder="Search articles, projects, actions…" />
      <CommandList>
        <CommandEmpty>No results.</CommandEmpty>

        <CommandGroup heading="Actions">
          <CommandItem onSelect={() => run(() => {})}>
            <Play className="mr-2 size-3.5" /> Generate selected article
            <CommandShortcut>⌘G</CommandShortcut>
          </CommandItem>
          <CommandItem onSelect={() => run(retryFailed)}>
            <RotateCw className="mr-2 size-3.5" /> Retry all failed
          </CommandItem>
          <CommandItem onSelect={() => run(() => toggleEditorPass(true))}>
            <Sparkles className="mr-2 size-3.5" /> Run AI editor pass
          </CommandItem>
          <CommandItem onSelect={() => run(() => {})}>
            <Wand2 className="mr-2 size-3.5" /> Optimise article
          </CommandItem>
          <CommandItem onSelect={() => run(() => {})}>
            <Download className="mr-2 size-3.5" /> Export project
          </CommandItem>
        </CommandGroup>

        <CommandGroup heading="View">
          <CommandItem onSelect={() => run(toggleSidebar)}>
            <PanelLeft className="mr-2 size-3.5" /> Toggle sidebar
            <CommandShortcut>⌥1</CommandShortcut>
          </CommandItem>
          <CommandItem onSelect={() => run(toggleInspector)}>
            <PanelRight className="mr-2 size-3.5" /> Toggle inspector
            <CommandShortcut>⌥2</CommandShortcut>
          </CommandItem>
          <CommandItem onSelect={() => run(() => toggleSettings(true))}>
            <Settings2 className="mr-2 size-3.5" /> Open settings
            <CommandShortcut>⌘,</CommandShortcut>
          </CommandItem>
        </CommandGroup>

        <CommandGroup heading="Projects">
          {projects.map((p) => (
            <CommandItem key={p.id} onSelect={() => run(() => setProject(p.id))}>
              {p.name}
            </CommandItem>
          ))}
        </CommandGroup>

        <CommandGroup heading="Articles">
          {articles.map((a) => (
            <CommandItem key={a.id} onSelect={() => run(() => selectArticle(a.id))}>
              <FileText className="mr-2 size-3.5" /> {a.title}
              <CommandShortcut className="mono">{a.status}</CommandShortcut>
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
