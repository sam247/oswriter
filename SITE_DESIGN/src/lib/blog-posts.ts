export type BlogPost = {
  slug: string;
  title: string;
  description: string;
  category: string;
  readingTime: string;
  publishedAt: string; // ISO
  publishedLabel: string;
  author: { name: string; role: string };
};

export const BLOG_POSTS: BlogPost[] = [
  {
    slug: "why-ai-writers-fail-at-large-scale-content-operations",
    title: "Why AI Writers Fail at Large-Scale Content Operations",
    description:
      "Single-article AI tools collapse the moment you try to publish at volume. Here's where the workflow breaks — research, validation, queueing, publishing — and how to design around it.",
    category: "Content Operations",
    readingTime: "9 min read",
    publishedAt: "2026-06-24",
    publishedLabel: "June 24, 2026",
    author: { name: "QueueWrite Team", role: "Product" },
  },
];

export const BLOG_CATEGORIES = [
  "All",
  "Content Operations",
  "Workflow",
  "SEO",
  "Engineering",
] as const;
