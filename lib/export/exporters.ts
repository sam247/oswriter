import type { ArticleDocument, ProjectDocument, QueueJob, ResearchPack } from "@/lib/types";
import { createZip } from "@/lib/export/zip";

export type ArticleExportFormat = "markdown" | "docx" | "html" | "json";
export type ProjectExportFormat = ArticleExportFormat;

export interface ProjectManifest {
  projectName: string;
  createdDate: string;
  articleCount: number;
  generatedCount: number;
  reviewCount: number;
  failedCount: number;
  totalWords: number;
  averageArticleLength: number;
  averageAuthority: number;
  averageConfidence: number;
}

export function createProjectManifest(project: ProjectDocument, articles: ArticleDocument[], jobs: QueueJob[], researchPacks: ResearchPack[]): ProjectManifest {
  const generatedCount = articles.filter((article) => article.status === "generated").length;
  const reviewCount = articles.filter((article) => article.status === "needs_review").length;
  const failedCount = jobs.filter((job) => job.status === "failed" || job.status === "research_failed").length;
  const totalWords = articles.reduce((sum, article) => sum + article.wordCount, 0);
  return {
    projectName: project.name,
    createdDate: project.createdAt,
    articleCount: jobs.length || articles.length,
    generatedCount,
    reviewCount,
    failedCount,
    totalWords,
    averageArticleLength: average(articles.map((article) => article.wordCount)),
    averageAuthority: average(researchPacks.map((research) => research.authorityScore)),
    averageConfidence: average(researchPacks.map((research) => research.confidence))
  };
}

export function exportArticle(article: ArticleDocument, format: ArticleExportFormat) {
  if (format === "markdown") return textFile(article.markdown, "text/markdown; charset=utf-8", `${safeFilename(article.title)}.md`);
  if (format === "html") return textFile(articleToHtml(article), "text/html; charset=utf-8", `${safeFilename(article.title)}.html`);
  if (format === "json") return textFile(JSON.stringify(article, null, 2), "application/json; charset=utf-8", `${safeFilename(article.title)}.json`);
  return binaryFile(articleToDocx(article), "application/vnd.openxmlformats-officedocument.wordprocessingml.document", `${safeFilename(article.title)}.docx`);
}

export function exportProjectZip(project: ProjectDocument, articles: ArticleDocument[], format: ProjectExportFormat) {
  const folder = safeFilename(project.name);
  const files = articles.map((article) => {
    const name = safeFilename(article.title);
    if (format === "markdown") return { name: `${folder}/${name}.md`, content: article.markdown };
    if (format === "html") return { name: `${folder}/${name}.html`, content: articleToHtml(article) };
    if (format === "json") return { name: `${folder}/${name}.json`, content: JSON.stringify(article, null, 2) };
    return { name: `${folder}/${name}.docx`, content: articleToDocx(article) };
  });
  return createZip(files);
}

export function exportFullProjectPackage(project: ProjectDocument, articles: ArticleDocument[], manifest: ProjectManifest) {
  const folder = safeFilename(project.name);
  const files = articles.flatMap((article) => {
    const name = safeFilename(article.title);
    return [
      { name: `${folder}/markdown/${name}.md`, content: article.markdown },
      { name: `${folder}/docx/${name}.docx`, content: articleToDocx(article) },
      { name: `${folder}/html/${name}.html`, content: articleToHtml(article) },
      { name: `${folder}/json/${name}.json`, content: JSON.stringify(article, null, 2) }
    ];
  });
  return createZip([
    { name: `${folder}/project-manifest.json`, content: JSON.stringify(manifest, null, 2) },
    ...files
  ]);
}

export function articleToHtml(article: ArticleDocument) {
  const body = articleBodyHtml(article);
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(article.title)}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; line-height: 1.65; max-width: 760px; margin: 40px auto; padding: 0 20px; color: #111418; }
    h1, h2, h3 { line-height: 1.2; }
    code { background: #f4f5f7; padding: 0.1rem 0.25rem; border-radius: 4px; }
    pre { background: #f4f5f7; padding: 1rem; overflow-x: auto; }
    blockquote { border-left: 3px solid #e2e5e9; margin-left: 0; padding-left: 1rem; color: #59616b; }
  </style>
</head>
<body>
${body}
</body>
</html>`;
}

export function articleBodyHtml(article: Pick<ArticleDocument, "markdown">) {
  return markdownToHtml(article.markdown);
}

export function articleToDocx(article: ArticleDocument) {
  const body = markdownToDocxBody(article.markdown);
  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    ${body}
    <w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/></w:sectPr>
  </w:body>
</w:document>`;
  return createZip([
    { name: "[Content_Types].xml", content: contentTypesXml },
    { name: "_rels/.rels", content: relationshipsXml },
    { name: "word/document.xml", content: documentXml }
  ]);
}

export function safeFilename(value: string) {
  const cleaned = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return cleaned || "article";
}

function textFile(body: string, contentType: string, filename: string) {
  return { body, contentType, filename };
}

function binaryFile(body: Uint8Array, contentType: string, filename: string) {
  return { body, contentType, filename };
}

function markdownToHtml(markdown: string) {
  const lines = markdown.split(/\r?\n/);
  const html: string[] = [];
  let inList = false;
  let inCode = false;
  const paragraph: string[] = [];

  const flushParagraph = () => {
    if (!paragraph.length) return;
    html.push(`<p>${inlineMarkdown(paragraph.join(" "))}</p>`);
    paragraph.length = 0;
  };
  const closeList = () => {
    if (inList) html.push("</ul>");
    inList = false;
  };

  for (const line of lines) {
    if (line.trim().startsWith("```")) {
      flushParagraph();
      closeList();
      html.push(inCode ? "</code></pre>" : "<pre><code>");
      inCode = !inCode;
      continue;
    }
    if (inCode) {
      html.push(escapeHtml(line));
      continue;
    }
    const trimmed = line.trim();
    if (!trimmed) {
      flushParagraph();
      closeList();
      continue;
    }
    const heading = /^(#{1,6})\s+(.+)$/.exec(trimmed);
    if (heading) {
      flushParagraph();
      closeList();
      html.push(`<h${heading[1].length}>${inlineMarkdown(heading[2])}</h${heading[1].length}>`);
      continue;
    }
    const listItem = /^[-*]\s+(.+)$/.exec(trimmed);
    if (listItem) {
      flushParagraph();
      if (!inList) html.push("<ul>");
      inList = true;
      html.push(`<li>${inlineMarkdown(listItem[1])}</li>`);
      continue;
    }
    paragraph.push(trimmed);
  }
  flushParagraph();
  closeList();
  if (inCode) html.push("</code></pre>");
  return html.join("\n");
}

function markdownToDocxBody(markdown: string) {
  return markdown
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const heading = /^(#{1,3})\s+(.+)$/.exec(line);
      const text = heading ? heading[2] : line.replace(/^[-*]\s+/, "");
      const style = heading ? `<w:pStyle w:val="Heading${heading[1].length}"/>` : "";
      return `<w:p><w:pPr>${style}</w:pPr><w:r><w:t xml:space="preserve">${escapeXml(stripMarkdown(text))}</w:t></w:r></w:p>`;
    })
    .join("\n");
}

function inlineMarkdown(value: string) {
  return escapeHtml(value)
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>")
    .replace(/`([^`]+)`/g, "<code>$1</code>");
}

function stripMarkdown(value: string) {
  return value
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/`([^`]+)`/g, "$1");
}

function escapeHtml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function escapeXml(value: string) {
  return escapeHtml(value).replace(/'/g, "&apos;");
}

function average(values: number[]) {
  const valid = values.filter((value) => Number.isFinite(value));
  if (!valid.length) return 0;
  return Number((valid.reduce((sum, value) => sum + value, 0) / valid.length).toFixed(2));
}

const contentTypesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`;

const relationshipsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;
