import { createFileRoute } from "@tanstack/react-router";
import { PanelGroup, Panel, PanelResizeHandle } from "react-resizable-panels";
import { Titlebar } from "@/components/app-shell/Titlebar";
import { Sidebar } from "@/components/app-shell/Sidebar";
import { Workspace } from "@/components/app-shell/Workspace";
import { Inspector } from "@/components/app-shell/Inspector";
import { StatusBar } from "@/components/app-shell/StatusBar";
import { CommandPalette } from "@/components/app-shell/CommandPalette";
import { SettingsSheet } from "@/components/app-shell/SettingsSheet";
import { EditorPassDialog } from "@/components/app-shell/EditorPassDialog";
import { useOSStore } from "@/lib/os-writer-store";

export const Route = createFileRoute("/dashboard")({
  head: () => ({
    meta: [
      { title: "OS Writer — Bulk article generation" },
      { name: "description", content: "Local-first bulk article generation, research, validation, and AI editing for SEO teams." },
    ],
  }),
  component: AppShell,
});

function AppShell() {
  const sidebarCollapsed = useOSStore((s) => s.sidebarCollapsed);
  const inspectorCollapsed = useOSStore((s) => s.inspectorCollapsed);

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-background text-ink">
      <Titlebar />
      <div className="min-h-0 flex-1">
        <PanelGroup direction="horizontal" autoSaveId="os-writer-shell">
          {!sidebarCollapsed && (
            <>
              <Panel defaultSize={20} minSize={15} maxSize={28} className="min-w-0">
                <Sidebar />
              </Panel>
              <PanelResizeHandle className="w-px bg-line transition-colors hover:bg-ink-subtle data-[resize-handle-state=drag]:bg-ink" />
            </>
          )}
          <Panel defaultSize={inspectorCollapsed ? 80 : 55} minSize={30} className="min-w-0">
            <Workspace />
          </Panel>
          {!inspectorCollapsed && (
            <>
              <PanelResizeHandle className="w-px bg-line transition-colors hover:bg-ink-subtle data-[resize-handle-state=drag]:bg-ink" />
              <Panel defaultSize={25} minSize={20} maxSize={36} className="min-w-0">
                <Inspector />
              </Panel>
            </>
          )}
        </PanelGroup>
      </div>
      <StatusBar />

      <CommandPalette />
      <SettingsSheet />
      <EditorPassDialog />
    </div>
  );
}
