import { articleBodyHtml } from "@/lib/export/exporters";
import { decryptSecret } from "@/lib/security/secrets";
import type { ArticleDocument, ProjectWordPressConnectionSecret, WordPressPostStatus } from "@/lib/types";

interface WordPressApiError {
  code?: string;
  message?: string;
}

interface WordPressUserResponse {
  id: number;
  name?: string;
  slug?: string;
}

interface WordPressPostResponse {
  id: number;
  link: string;
  status: WordPressPostStatus | string;
  date?: string;
  date_gmt?: string;
}

export function normalizeWordPressSiteUrl(value: string) {
  const trimmed = value.trim();
  if (!trimmed) throw new Error("Site URL is required.");
  const candidate = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    throw new Error("Enter a valid WordPress site URL.");
  }
  parsed.pathname = parsed.pathname.replace(/\/+$/, "");
  parsed.search = "";
  parsed.hash = "";
  return parsed.toString().replace(/\/$/, "");
}

export async function testWordPressConnection(input: {
  siteUrl: string;
  username: string;
  applicationPassword: string;
}) {
  const siteUrl = normalizeWordPressSiteUrl(input.siteUrl);
  const username = input.username.trim();
  const applicationPassword = input.applicationPassword.trim();
  if (!username) throw new Error("Username is required.");
  if (!applicationPassword) throw new Error("Application password is required.");

  const response = await fetch(wordPressEndpoint(siteUrl, "/wp-json/wp/v2/users/me"), {
    headers: {
      Authorization: basicAuth(username, applicationPassword),
      Accept: "application/json"
    },
    cache: "no-store"
  });

  if (!response.ok) {
    throw new Error(await readWordPressError(response, "WordPress connection failed."));
  }

  const user = await response.json() as WordPressUserResponse;
  return {
    siteUrl,
    username,
    user
  };
}

export async function publishArticleToWordPress(
  connection: ProjectWordPressConnectionSecret,
  article: ArticleDocument,
  status: WordPressPostStatus
) {
  const response = await fetch(wordPressEndpoint(connection.siteUrl, "/wp-json/wp/v2/posts"), {
    method: "POST",
    headers: {
      Authorization: basicAuth(connection.username, connectionPassword(connection)),
      Accept: "application/json",
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      title: article.title,
      content: articleBodyHtml(article),
      excerpt: buildExcerpt(article),
      status
    })
  });

  if (!response.ok) {
    throw new Error(await readWordPressError(response, `WordPress ${status === "draft" ? "draft publish" : "publish"} failed.`));
  }

  const post = await response.json() as WordPressPostResponse;
  return {
    postId: Number(post.id),
    url: String(post.link),
    status: (post.status === "draft" ? "draft" : "publish") as WordPressPostStatus,
    publishedAt: post.date_gmt || post.date || new Date().toISOString()
  };
}

export function connectionPassword(connection: Pick<ProjectWordPressConnectionSecret, "encryptedApplicationPassword">) {
  return decryptSecret(connection.encryptedApplicationPassword);
}

async function readWordPressError(response: Response, fallback: string) {
  try {
    const payload = await response.json() as WordPressApiError;
    return payload.message || fallback;
  } catch {
    return fallback;
  }
}

function wordPressEndpoint(siteUrl: string, path: string) {
  return `${siteUrl}${path.startsWith("/") ? path : `/${path}`}`;
}

function basicAuth(username: string, applicationPassword: string) {
  return `Basic ${Buffer.from(`${username}:${applicationPassword}`).toString("base64")}`;
}

function buildExcerpt(article: ArticleDocument) {
  const fromSummary = article.researchSummary?.trim();
  if (fromSummary) return fromSummary.slice(0, 280);
  const firstParagraph = article.markdown
    .split(/\r?\n\r?\n/)
    .map((chunk) => chunk.replace(/^#+\s+/gm, "").replace(/[*_`>#-]/g, "").trim())
    .find(Boolean);
  return firstParagraph?.slice(0, 280) ?? "";
}
