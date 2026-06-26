import { create } from "zustand";

export type ArticleStatus =
  | "queued"
  | "processing"
  | "generated"
  | "failed"
  | "review";

export type PipelineStage =
  | "research"
  | "outline"
  | "generation"
  | "validation"
  | "editor"
  | "export";

export interface PipelineStep {
  stage: PipelineStage;
  status: "idle" | "running" | "done" | "failed";
  durationMs?: number;
  error?: string;
}

export interface Source {
  id: string;
  index: number;
  title: string;
  url: string;
  authority: number; // 0-100
  relevance: number; // 0-100
  accepted: boolean;
  locked?: boolean;
  excluded?: boolean;
}

export interface Validator {
  id: string;
  name: string;
  group: "intent" | "structure" | "content" | "seo";
  passed: boolean;
  trigger?: string;
  fix?: string;
}

export interface Article {
  id: string;
  projectId: string;
  title: string;
  status: ArticleStatus;
  wordCount: number;
  quality: number; // 0-100
  sources: Source[];
  facts: string[];
  questions: string[];
  headings: string[];
  validators: Validator[];
  pipeline: PipelineStep[];
  markdown: string;
  createdAt: string;
  updatedAt: string;
}

export interface Project {
  id: string;
  name: string;
  template: string;
  archived?: boolean;
}

interface Prefs {
  sidebarWidth: number;
  inspectorWidth: number;
  sidebarCollapsed: boolean;
  inspectorCollapsed: boolean;
  inspectorTab: "research" | "pipeline" | "validation" | "seo" | "debug";
  viewMode: "rich" | "markdown" | "split";
  styleProfile: StyleProfile;
  toggles: ContentToggles;
}

export type StyleProfile =
  | "standard"
  | "technical"
  | "homeowner"
  | "developer"
  | "commercial"
  | "authority"
  | "local-seo";

export interface ContentToggles {
  tldr: boolean;
  faq: boolean;
  comparisonTable: boolean;
  bulletSummaries: boolean;
  citations: boolean;
  internalLinks: boolean;
  editorPass: boolean;
}

export type QueueFilter =
  | "all"
  | "queued"
  | "processing"
  | "generated"
  | "failed"
  | "review";

interface State extends Prefs {
  projects: Project[];
  articles: Article[];
  selectedProjectId: string;
  selectedArticleId: string;
  queueFilter: QueueFilter;
  bulkAdd: string;
  paletteOpen: boolean;
  settingsOpen: boolean;
  editorPassOpen: boolean;

  setProject: (id: string) => void;
  selectArticle: (id: string) => void;
  setQueueFilter: (f: QueueFilter) => void;
  setBulkAdd: (s: string) => void;
  addTitles: (titles: string[]) => void;
  retryFailed: () => void;
  clearQueue: () => void;
  removeArticle: (id: string) => void;
  updateArticle: (id: string, patch: Partial<Article>) => void;
  setPref: <K extends keyof Prefs>(k: K, v: Prefs[K]) => void;
  setToggle: (k: keyof ContentToggles, v: boolean) => void;
  togglePalette: (v?: boolean) => void;
  toggleSettings: (v?: boolean) => void;
  toggleEditorPass: (v?: boolean) => void;
  toggleSidebar: () => void;
  toggleInspector: () => void;
}

const SAMPLE_MD = `# Road Adoption Process Explained

When a new housing development is built, the roads that serve it do not automatically become part of the public highway network. For a local authority to take over responsibility for maintaining them, a formal process known as road adoption must be completed. This process is governed by legal agreements under the Highways Act 1980, most commonly a Section 38 Agreement.

## Navigating The Adoption Process

The adoption process typically begins before construction starts. Developers submit detailed plans for the road layout, drainage, and street lighting to the local highway authority for technical approval.

## Defining A Section 38 Agreement

A Section 38 Agreement is a legal contract between a developer and a local highway authority under Section 38 of the Highways Act 1980. It governs the construction of roads to a standard suitable for adoption as public highway.

### Key obligations

- Build to the authority's specification
- Provide a financial bond
- Maintain the road during a defence period
- Submit as-built drawings prior to adoption

## Why Road Adoption Matters For Buyers

Buyers of new-build homes should always confirm whether the roads serving their development are adopted, in the process of being adopted, or remain private. Unadopted roads can lead to significant maintenance costs for residents.
`;

const articles: Article[] = [
  {
    id: "a1",
    projectId: "p1",
    title: "Road Adoption Process Explained",
    status: "generated",
    wordCount: 2044,
    quality: 100,
    sources: [
      { id: "s1", index: 1, title: "Adoption of roads by highway authorities — GOV.UK", url: "https://www.gov.uk/government/publications/adoption-of-roads-by-highway-authorities", authority: 98, relevance: 96, accepted: true },
      { id: "s2", index: 2, title: "Road Adoption Explained | Section 38 & 278 Works for Developers", url: "https://www.ng-groundworks.co.uk/news/article/road-adoption-explained-section-38-and-278", authority: 72, relevance: 92, accepted: true },
      { id: "s3", index: 3, title: "Understanding Section 38 and Section 104 Agreements", url: "https://www.new-builds.co.uk/blog/section-38-section-104-agreements-new-build", authority: 68, relevance: 88, accepted: true },
      { id: "s4", index: 4, title: "Section 38 of the Highways Act: Road Adoption Process", url: "https://legalclarity.org/section-38-of-the-highways-act-road-adoption-process/", authority: 74, relevance: 90, accepted: true },
    ],
    facts: [
      "Road adoption is governed by the Highways Act 1980, primarily under Section 38.",
      "Developers post a financial bond covering remedial works during the defence period.",
    ],
    questions: [
      "What is a Section 38 agreement?",
      "How long does road adoption take?",
      "Who pays for road adoption?",
    ],
    headings: [
      "Navigating The Adoption Process",
      "Defining A Section 38 Agreement",
      "Why Road Adoption Matters For Buyers",
    ],
    validators: [
      { id: "v1", name: "Intent match", group: "intent", passed: true },
      { id: "v2", name: "Heading quality", group: "structure", passed: true },
      { id: "v3", name: "FAQ quality", group: "content", passed: true },
      { id: "v4", name: "Research leakage", group: "content", passed: true },
      { id: "v5", name: "Source leakage", group: "content", passed: true },
      { id: "v6", name: "Duplicate sections", group: "structure", passed: true },
      { id: "v7", name: "Duplicate FAQs", group: "structure", passed: true },
      { id: "v8", name: "Thin content", group: "content", passed: true },
      { id: "v9", name: "Readability", group: "content", passed: true },
      { id: "v10", name: "Completeness", group: "content", passed: true },
      { id: "v11", name: "H1 present", group: "seo", passed: true },
      { id: "v12", name: "No CTA contamination", group: "seo", passed: true },
    ],
    pipeline: [
      { stage: "research", status: "done", durationMs: 12000 },
      { stage: "outline", status: "done", durationMs: 2000 },
      { stage: "generation", status: "done", durationMs: 18000 },
      { stage: "validation", status: "done", durationMs: 1000 },
      { stage: "editor", status: "done", durationMs: 4000 },
      { stage: "export", status: "idle" },
    ],
    markdown: SAMPLE_MD,
    createdAt: "2026-06-09T20:00:00Z",
    updatedAt: "2026-06-09T21:06:35Z",
  },
  {
    id: "a2",
    projectId: "p1",
    title: "Piling Cost Per Metre UK",
    status: "failed",
    wordCount: 0,
    quality: 0,
    sources: [],
    facts: [],
    questions: [],
    headings: [],
    validators: [
      { id: "v1", name: "Intent match", group: "intent", passed: false, trigger: "Query returned no qualifying sources above authority threshold (60).", fix: "Lower authority threshold to 50 or broaden the query." },
    ],
    pipeline: [
      { stage: "research", status: "failed", durationMs: 8000, error: "No sources above authority threshold." },
      { stage: "outline", status: "idle" },
      { stage: "generation", status: "idle" },
      { stage: "validation", status: "idle" },
      { stage: "editor", status: "idle" },
      { stage: "export", status: "idle" },
    ],
    markdown: "",
    createdAt: "2026-06-09T19:00:00Z",
    updatedAt: "2026-06-09T19:08:00Z",
  },
  {
    id: "a3",
    projectId: "p1",
    title: "What Is A CBR Test?",
    status: "failed",
    wordCount: 0,
    quality: 0,
    sources: [],
    facts: [],
    questions: [],
    headings: [],
    validators: [],
    pipeline: [
      { stage: "research", status: "failed", durationMs: 6000, error: "Rate limited by gateway." },
      { stage: "outline", status: "idle" },
      { stage: "generation", status: "idle" },
      { stage: "validation", status: "idle" },
      { stage: "editor", status: "idle" },
      { stage: "export", status: "idle" },
    ],
    markdown: "",
    createdAt: "2026-06-09T18:00:00Z",
    updatedAt: "2026-06-09T18:06:00Z",
  },
  {
    id: "a4",
    projectId: "p1",
    title: "What Causes Subsidence In Older Homes",
    status: "queued",
    wordCount: 0,
    quality: 0,
    sources: [],
    facts: [],
    questions: [],
    headings: [],
    validators: [],
    pipeline: [
      { stage: "research", status: "idle" },
      { stage: "outline", status: "idle" },
      { stage: "generation", status: "idle" },
      { stage: "validation", status: "idle" },
      { stage: "editor", status: "idle" },
      { stage: "export", status: "idle" },
    ],
    markdown: "",
    createdAt: "2026-06-11T08:00:00Z",
    updatedAt: "2026-06-11T08:00:00Z",
  },
];

export const useOSStore = create<State>((set, get) => ({
  sidebarWidth: 280,
  inspectorWidth: 340,
  sidebarCollapsed: false,
  inspectorCollapsed: false,
  inspectorTab: "research",
  viewMode: "rich",
  styleProfile: "standard",
  toggles: {
    tldr: true,
    faq: true,
    comparisonTable: false,
    bulletSummaries: true,
    citations: true,
    internalLinks: false,
    editorPass: true,
  },

  projects: [
    { id: "p1", name: "Default Project", template: "Construction SEO" },
    { id: "p2", name: "Homeowner Guides", template: "Homeowner" },
  ],
  articles,
  selectedProjectId: "p1",
  selectedArticleId: "a1",
  queueFilter: "all",
  bulkAdd: "",
  paletteOpen: false,
  settingsOpen: false,
  editorPassOpen: false,

  setProject: (id) => set({ selectedProjectId: id }),
  selectArticle: (id) => set({ selectedArticleId: id }),
  setQueueFilter: (queueFilter) => set({ queueFilter }),
  setBulkAdd: (bulkAdd) => set({ bulkAdd }),
  addTitles: (titles) => {
    const { articles, selectedProjectId } = get();
    const next = titles
      .map((t) => t.trim())
      .filter(Boolean)
      .map((title, i) => ({
        id: `a${Date.now()}_${i}`,
        projectId: selectedProjectId,
        title,
        status: "queued" as ArticleStatus,
        wordCount: 0,
        quality: 0,
        sources: [],
        facts: [],
        questions: [],
        headings: [],
        validators: [],
        pipeline: [
          { stage: "research", status: "idle" },
          { stage: "outline", status: "idle" },
          { stage: "generation", status: "idle" },
          { stage: "validation", status: "idle" },
          { stage: "editor", status: "idle" },
          { stage: "export", status: "idle" },
        ] as PipelineStep[],
        markdown: "",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }));
    set({ articles: [...articles, ...next], bulkAdd: "" });
  },
  retryFailed: () => {
    set({
      articles: get().articles.map((a) =>
        a.status === "failed" ? { ...a, status: "queued" } : a,
      ),
    });
  },
  clearQueue: () => {
    set({
      articles: get().articles.filter((a) => a.status !== "queued"),
    });
  },
  removeArticle: (id) => {
    set({ articles: get().articles.filter((a) => a.id !== id) });
  },
  updateArticle: (id, patch) => {
    set({
      articles: get().articles.map((a) => (a.id === id ? { ...a, ...patch } : a)),
    });
  },
  setPref: (k, v) => set({ [k]: v } as any),
  setToggle: (k, v) => set({ toggles: { ...get().toggles, [k]: v } }),
  togglePalette: (v) => set({ paletteOpen: v ?? !get().paletteOpen }),
  toggleSettings: (v) => set({ settingsOpen: v ?? !get().settingsOpen }),
  toggleEditorPass: (v) => set({ editorPassOpen: v ?? !get().editorPassOpen }),
  toggleSidebar: () => set({ sidebarCollapsed: !get().sidebarCollapsed }),
  toggleInspector: () => set({ inspectorCollapsed: !get().inspectorCollapsed }),
}));

export function selectFilteredArticles(s: State) {
  return s.articles.filter(
    (a) =>
      a.projectId === s.selectedProjectId &&
      (s.queueFilter === "all" || a.status === s.queueFilter),
  );
}

export function selectProjectArticles(s: State) {
  return s.articles.filter((a) => a.projectId === s.selectedProjectId);
}

export function selectProjectStats(s: State) {
  const list = selectProjectArticles(s);
  const generated = list.filter((a) => a.status === "generated");
  const failed = list.filter((a) => a.status === "failed").length;
  const pending = list.filter((a) => a.status === "queued" || a.status === "processing").length;
  const totalWords = generated.reduce((sum, a) => sum + a.wordCount, 0);
  const avgQuality = generated.length
    ? Math.round(generated.reduce((s, a) => s + a.quality, 0) / generated.length)
    : 0;
  const successRate = list.length ? Math.round((generated.length / list.length) * 100) : 0;
  return {
    total: list.length,
    generated: generated.length,
    failed,
    pending,
    avgQuality,
    totalWords,
    successRate,
  };
}

export function selectArticle(s: State) {
  return s.articles.find((a) => a.id === s.selectedArticleId);
}
