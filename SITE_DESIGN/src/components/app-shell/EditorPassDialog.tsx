import { useOSStore, selectArticle } from "@/lib/os-writer-store";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Sparkles, ArrowRight, Check } from "lucide-react";
import { useState } from "react";

const RULES = [
  ["Remove repetition", true],
  ["Improve section ordering", true],
  ["Tighten introductions", true],
  ["Improve FAQ answers", true],
  ["Merge weak sections", false],
  ["Improve transitions", true],
  ["Remove research leakage", true],
  ["Remove source-language", true],
  ["Remove generic filler", true],
  ["Improve readability", true],
] as const;

export function EditorPassDialog() {
  const open = useOSStore((s) => s.editorPassOpen);
  const toggle = useOSStore((s) => s.toggleEditorPass);
  const article = useOSStore(selectArticle);
  const [rules, setRules] = useState<Record<string, boolean>>(
    Object.fromEntries(RULES.map(([k, v]) => [k, v as boolean])),
  );

  if (!article) return null;
  const before = article.quality;
  const after = Math.min(100, before + 8);

  return (
    <Dialog open={open} onOpenChange={(v) => toggle(v)}>
      <DialogContent className="max-w-3xl gap-0 overflow-hidden p-0">
        <DialogHeader className="hairline-b px-5 py-4">
          <div className="flex items-center gap-2">
            <div className="grid size-7 place-items-center rounded-md bg-ink text-primary-foreground">
              <Sparkles className="size-3.5" />
            </div>
            <div>
              <DialogTitle className="text-[15px]">AI editor pass</DialogTitle>
              <DialogDescription className="text-[12px]">
                Run a final polish on "{article.title}".
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="grid grid-cols-[260px_minmax(0,1fr)] divide-x divide-line">
          <div className="p-4">
            <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.15em] text-ink-subtle">Rules</div>
            <ul className="space-y-1">
              {RULES.map(([name]) => (
                <li key={name} className="flex items-center justify-between rounded px-2 py-1 hover:bg-surface-3">
                  <span className="text-[12px] text-ink">{name}</span>
                  <Switch
                    checked={rules[name]}
                    onCheckedChange={(v) => setRules((r) => ({ ...r, [name]: !!v }))}
                  />
                </li>
              ))}
            </ul>
          </div>
          <div className="bg-surface-2 p-4">
            <div className="mb-2 flex items-center justify-between">
              <div className="text-[10px] font-semibold uppercase tracking-[0.15em] text-ink-subtle">Preview</div>
              <div className="mono flex items-center gap-2 text-[11px]">
                <span className="rounded border border-line bg-surface-1 px-1.5 py-0.5 text-ink-muted">Q{before}</span>
                <ArrowRight className="size-3 text-ink-subtle" />
                <span className="rounded border border-success/30 bg-success/10 px-1.5 py-0.5 text-success">Q{after}</span>
              </div>
            </div>
            <div className="hairline grid grid-cols-2 gap-0 rounded-md border border-line bg-surface-1 text-[12px] leading-relaxed">
              <div className="hairline-r p-3">
                <div className="mb-1 text-[9.5px] uppercase tracking-wider text-ink-subtle">Before</div>
                <p className="text-ink-muted line-through decoration-danger/40">
                  The road adoption process, as it is widely known by many in the industry, is a very important process that is governed by various legal frameworks that have been put in place.
                </p>
              </div>
              <div className="p-3">
                <div className="mb-1 text-[9.5px] uppercase tracking-wider text-ink-subtle">After</div>
                <p className="text-ink">
                  Road adoption is governed by the Highways Act 1980, primarily under Section 38 and Section 278.
                </p>
              </div>
            </div>

            <ul className="mono mt-3 space-y-0.5 text-[11px] text-ink-muted">
              <li className="flex items-center gap-1.5"><Check className="size-3 text-success" /> 12 repetitive phrases removed</li>
              <li className="flex items-center gap-1.5"><Check className="size-3 text-success" /> 4 sections reordered</li>
              <li className="flex items-center gap-1.5"><Check className="size-3 text-success" /> 3 weak sections merged</li>
            </ul>

            <div className="mt-4 flex items-center justify-end gap-2">
              <button onClick={() => toggle(false)} className="hairline rounded-md border border-line bg-surface-1 px-3 py-1.5 text-[12px] text-ink hover:bg-surface-3">
                Cancel
              </button>
              <button onClick={() => toggle(false)} className="rounded-md bg-ink px-3 py-1.5 text-[12px] font-medium text-primary-foreground hover:bg-ink/90">
                Accept all changes
              </button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
