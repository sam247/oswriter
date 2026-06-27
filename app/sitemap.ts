import { readdir } from "node:fs/promises";
import path from "node:path";
import type { MetadataRoute } from "next";
import { marketingUrl } from "@/lib/server/urls";
import { BLOG_POSTS } from "@/lib/site/blog-posts";

const APP_DIR = path.join(process.cwd(), "app");
const APP_ONLY_ROOT_SEGMENTS = new Set([
  "api",
  "dashboard",
  "forgot-password",
  "login",
  "projects",
  "reset-password",
  "settings",
  "signup",
  "verify"
]);

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticRoutes = await collectPublicStaticRoutes(APP_DIR);
  const blogRoutes = BLOG_POSTS.map((post) => ({
    url: marketingUrl(`/blog/${post.slug}`),
    lastModified: new Date(post.publishedAt),
    changeFrequency: "monthly" as const,
    priority: 0.7
  }));

  return [
    ...staticRoutes.map((route) => ({
      url: marketingUrl(route),
      lastModified: new Date(),
      changeFrequency: route === "/" ? "weekly" as const : "monthly" as const,
      priority: route === "/" ? 1 : route === "/pricing" ? 0.9 : 0.8
    })),
    ...blogRoutes
  ];
}

async function collectPublicStaticRoutes(dir: string, segments: string[] = []): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const routes = new Set<string>();

  if (entries.some((entry) => entry.isFile() && isPageFile(entry.name)) && isPublicRoute(segments)) {
    routes.add(routePath(segments));
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (entry.name.startsWith("_") || entry.name.startsWith("[")) continue;

    if (isRouteGroup(entry.name)) {
      const nestedRoutes = await collectPublicStaticRoutes(path.join(dir, entry.name), segments);
      for (const route of nestedRoutes) routes.add(route);
      continue;
    }

    const nextSegments = [...segments, entry.name];
    const nestedRoutes = await collectPublicStaticRoutes(path.join(dir, entry.name), nextSegments);
    for (const route of nestedRoutes) routes.add(route);
  }

  return [...routes].sort();
}

function isPageFile(name: string) {
  return /^page\.(ts|tsx|js|jsx)$/.test(name);
}

function isRouteGroup(name: string) {
  return name.startsWith("(") && name.endsWith(")");
}

function isPublicRoute(segments: string[]) {
  if (segments.some((segment) => segment.startsWith("["))) return false;
  const rootSegment = segments[0];
  if (!rootSegment) return true;
  return !APP_ONLY_ROOT_SEGMENTS.has(rootSegment);
}

function routePath(segments: string[]) {
  if (segments.length === 0) return "/";
  return `/${segments.join("/")}`;
}
