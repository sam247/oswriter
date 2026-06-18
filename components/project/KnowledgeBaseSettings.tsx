"use client";

import { ChevronDown } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { normalizeProjectKnowledgeBase } from "@/lib/project/knowledge-base";
import type { ProjectKnowledgeBase } from "@/lib/types";

interface KnowledgeBaseSettingsProps {
  knowledgeBase?: ProjectKnowledgeBase;
  disabledReason?: string | null;
  onSave: (knowledgeBase: ProjectKnowledgeBase) => void;
}

const TEXT_AREAS: Array<{ key: keyof ProjectKnowledgeBase; label: string; placeholder: string }> = [
  { key: "aboutBusiness", label: "About The Business", placeholder: "What the business does, how it operates, and what makes it distinct." },
  { key: "services", label: "Services", placeholder: "One service per line or a short service summary." },
  { key: "products", label: "Products", placeholder: "Products or product categories relevant to future articles." },
  { key: "targetCustomer", label: "Target Customer", placeholder: "Who the business serves and what matters to them." },
  { key: "writingRules", label: "Writing Rules", placeholder: "For example: Use UK English. Avoid medical claims." },
  { key: "preferredCTA", label: "Preferred CTA", placeholder: "For example: Book a screening appointment." }
];

export function KnowledgeBaseSettings({ knowledgeBase, disabledReason, onSave }: KnowledgeBaseSettingsProps) {
  const normalized = useMemo(() => normalizeProjectKnowledgeBase(knowledgeBase), [knowledgeBase]);
  const [draft, setDraft] = useState(normalized);

  useEffect(() => setDraft(normalized), [normalized]);

  const dirty = JSON.stringify(draft) !== JSON.stringify(normalized);
  const configured = Object.values(normalized).some(Boolean);

  function update(key: keyof ProjectKnowledgeBase, value: string) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  return (
    <details className="group mt-4 rounded-md border border-line bg-surface-1">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3.5 [&::-webkit-details-marker]:hidden">
        <div className="min-w-0">
          <div className="text-[13px] font-semibold text-ink">Knowledge Base <span className="font-normal text-ink-subtle">(Optional)</span></div>
          <div className="mono mt-0.5 text-[10px] text-ink-subtle">{configured ? "Configured" : "Not configured"}</div>
        </div>
        <ChevronDown className="size-4 shrink-0 text-ink-subtle transition-transform group-open:rotate-180" aria-hidden="true" />
      </summary>

      <div className="border-t border-line px-4 pb-4 pt-3">
        <p className="text-[11.5px] leading-relaxed text-ink-muted">Provide additional information about your business, services and audience to improve article planning and generation.</p>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <KnowledgeInput label="Brand Name" value={draft.brandName} placeholder="Business or brand name" onChange={(value) => update("brandName", value)} />
          <KnowledgeInput label="Website" value={draft.website} placeholder="https://example.com" onChange={(value) => update("website", value)} />
        </div>

        <div className="mt-3 space-y-3">
          {TEXT_AREAS.map((field) => (
            <label key={field.key} className="block text-[12px] text-ink-muted">
              <span>{field.label}</span>
              <textarea
                value={draft[field.key]}
                onChange={(event) => update(field.key, event.currentTarget.value)}
                placeholder={field.placeholder}
                rows={field.key === "aboutBusiness" || field.key === "writingRules" ? 4 : 3}
                className="mt-1 w-full resize-y rounded border border-line bg-background px-2.5 py-2 text-[13px] leading-relaxed text-ink outline-none placeholder:text-ink-subtle focus:border-ink"
              />
            </label>
          ))}
        </div>

        {disabledReason && <div className="mt-3 text-[11px] text-warn">{disabledReason}</div>}
        <div className="mt-4 flex justify-end">
          <button
            type="button"
            disabled={!dirty || Boolean(disabledReason)}
            title={disabledReason ?? "Save project knowledge base"}
            onClick={() => onSave(normalizeProjectKnowledgeBase(draft))}
            className="h-8 rounded-md bg-ink px-3 text-[11.5px] font-medium text-white disabled:cursor-not-allowed disabled:opacity-40"
          >
            Save Knowledge Base
          </button>
        </div>
      </div>
    </details>
  );
}

function KnowledgeInput({ label, value, placeholder, onChange }: { label: string; value: string; placeholder: string; onChange: (value: string) => void }) {
  return (
    <label className="block text-[12px] text-ink-muted">
      <span>{label}</span>
      <input
        value={value}
        onChange={(event) => onChange(event.currentTarget.value)}
        placeholder={placeholder}
        className="mt-1 h-9 w-full rounded border border-line bg-background px-2.5 text-[13px] text-ink outline-none placeholder:text-ink-subtle focus:border-ink"
      />
    </label>
  );
}
