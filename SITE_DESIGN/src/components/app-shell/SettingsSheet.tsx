import { useOSStore, type StyleProfile, type ContentToggles } from "@/lib/os-writer-store";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { Check } from "lucide-react";

const STYLE_PROFILES: { id: StyleProfile; label: string; desc: string }[] = [
  { id: "standard", label: "Standard", desc: "Balanced general-purpose voice" },
  { id: "technical", label: "Technical", desc: "Precise, spec-driven, low metaphor" },
  { id: "homeowner", label: "Homeowner", desc: "Plain-English, reassuring, practical" },
  { id: "developer", label: "Developer", desc: "Trade-facing, dense, code-aware" },
  { id: "commercial", label: "Commercial", desc: "Conversion-led with light persuasion" },
  { id: "authority", label: "Authority", desc: "Editorial, citation-heavy, long-form" },
  { id: "local-seo", label: "Local SEO", desc: "Geo-anchored, NAP-aware" },
];

const TOGGLE_LABELS: Record<keyof ContentToggles, string> = {
  tldr: "TL;DR",
  faq: "FAQ block",
  comparisonTable: "Comparison table",
  bulletSummaries: "Bullet summaries",
  citations: "Citations",
  internalLinks: "Internal links",
  editorPass: "AI editor pass (automatic)",
};

export function SettingsSheet() {
  const open = useOSStore((s) => s.settingsOpen);
  const toggleSettings = useOSStore((s) => s.toggleSettings);
  const styleProfile = useOSStore((s) => s.styleProfile);
  const setPref = useOSStore((s) => s.setPref);
  const toggles = useOSStore((s) => s.toggles);
  const setToggle = useOSStore((s) => s.setToggle);

  return (
    <Sheet open={open} onOpenChange={(v) => toggleSettings(v)}>
      <SheetContent side="right" className="w-[440px] sm:max-w-none overflow-y-auto bg-surface-2 p-0">
        <SheetHeader className="hairline-b px-5 py-3.5">
          <SheetTitle className="text-[14px] font-semibold tracking-[-0.005em]">Settings</SheetTitle>
          <SheetDescription className="text-[11.5px] text-ink-muted">
            Project-level generation, content, and integration preferences.
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-7 px-5 py-5">
          <Group title="Style profile">
            <ul className="divide-y divide-line/70">
              {STYLE_PROFILES.map((p) => {
                const active = styleProfile === p.id;
                return (
                  <li key={p.id}>
                    <button
                      onClick={() => setPref("styleProfile", p.id)}
                      className={cn(
                        "flex w-full items-center gap-3 py-2 text-left transition-colors",
                        active ? "" : "hover:bg-surface-3/60",
                      )}
                    >
                      <span className={cn(
                        "grid size-4 shrink-0 place-items-center rounded-full border",
                        active ? "border-ink bg-ink" : "border-line-strong",
                      )}>
                        {active && <Check className="size-2.5 text-primary-foreground" />}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className={cn(
                          "text-[12.5px] tracking-[-0.003em]",
                          active ? "font-semibold text-ink" : "font-medium text-ink",
                        )}>
                          {p.label}
                        </div>
                        <div className="text-[11px] leading-snug text-ink-muted">{p.desc}</div>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          </Group>

          <Group title="Content controls">
            <ul className="divide-y divide-line/70">
              {(Object.keys(TOGGLE_LABELS) as (keyof ContentToggles)[]).map((k) => (
                <li key={k} className="flex items-center justify-between py-1.5">
                  <span className="text-[12.5px] text-ink">{TOGGLE_LABELS[k]}</span>
                  <Switch checked={toggles[k]} onCheckedChange={(v) => setToggle(k, !!v)} />
                </li>
              ))}
            </ul>
          </Group>

          <Group title="Publishing integrations" badge="Soon">
            <ul className="divide-y divide-line/70">
              {["WordPress", "Shopify", "Webflow", "Contentful"].map((p) => (
                <li key={p} className="flex items-center justify-between py-1.5">
                  <span className="text-[12.5px] text-ink-muted">{p}</span>
                  <span className="mono text-[10px] text-ink-subtle">—</span>
                </li>
              ))}
            </ul>
          </Group>

          <Group title="Keyboard">
            <ul className="divide-y divide-line/70">
              {[
                ["Command palette", "⌘K"],
                ["Settings", "⌘,"],
                ["Toggle sidebar", "⌥1"],
                ["Toggle inspector", "⌥2"],
              ].map(([label, k]) => (
                <li key={label} className="flex items-center justify-between py-1.5">
                  <span className="text-[12.5px] text-ink">{label}</span>
                  <span className="mono rounded bg-surface-3 px-1.5 py-0.5 text-[10.5px] text-ink-muted">{k}</span>
                </li>
              ))}
            </ul>
          </Group>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function Group({ title, badge, children }: { title: string; badge?: string; children: React.ReactNode }) {
  return (
    <section>
      <div className="mb-2 flex items-center gap-2">
        <h3 className="text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-subtle">{title}</h3>
        {badge && <span className="mono rounded bg-surface-3 px-1 text-[9px] text-ink-subtle">{badge}</span>}
      </div>
      {children}
    </section>
  );
}
