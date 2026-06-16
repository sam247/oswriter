import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { buildProjectAnalytics } from "@/lib/analytics/project";
import { createDefaultProject, createDefaultSettings } from "@/lib/defaults";
import { createProjectManifest, exportProjectZip } from "@/lib/export/exporters";
import { QueueRunner } from "@/lib/queue/runner";
import { calculateArticleScores } from "@/lib/scoring/article-scores";
import { articlePath, jobPath } from "@/lib/storage/paths";
import { NeonStorageProvider } from "@/lib/storage/neon";
import { WorkspaceStore } from "@/lib/storage/storage";
import type { ArticleGenerationInput, EditorInput, ModelAdapter, ProjectDocument, QueueJob, ResearchPack, SearchAdapter, ValidationInput, ValidationResult } from "@/lib/types";

const canRunNeon = Boolean(process.env.TEST_NEON_DATABASE_URL);
const neonTest = canRunNeon ? test : test.skip;

neonTest("OS Writer workflow persists correctly through NeonStorageProvider", async () => {
  const env = snapshotEnv();
  const id = randomUUID().replaceAll("-", "").slice(0, 12);
  const projectId = `default`;
  process.env.DATABASE_URL = process.env.TEST_NEON_DATABASE_URL;
  process.env.OSW_AUTH_USER_EMAIL = "workflow@example.test";
  process.env.OSW_AUTH_USER_ID = `user_workflow_${id}`;
  process.env.OSW_ORGANISATION_ID = `org_workflow_${id}`;
  process.env.OSW_ORGANISATION_NAME = "Workflow Smoke Organisation";
  process.env.OSW_ORGANISATION_SLUG = `workflow-smoke-${id}`;

  try {
    const provider = new NeonStorageProvider();
    const store = new WorkspaceStore(provider);
    const runner = new QueueRunner(store, new FakeSearch(), new FakeModel());
    await provider.deleteProject(projectId).catch(() => undefined);

    const createdProject: ProjectDocument = {
      ...createDefaultProject(),
      name: "Neon Workflow Project"
    };
    await store.saveProject(createdProject);
    await store.saveSettings(createDefaultSettings());
    assert.equal((await store.ensureProject()).project.name, "Neon Workflow Project");

    const editedProject = { ...createdProject, name: "Neon Workflow Edited", updatedAt: new Date().toISOString() };
    await store.saveProject(editedProject);
    assert.equal((await store.ensureProject()).project.name, "Neon Workflow Edited");

    const [job] = await runner.addTitles(["Neon storage validation article"]);
    const jobVersion = await provider.createVersion({
      projectId,
      documentId: job.id,
      documentType: "job",
      content: JSON.stringify(job),
      metadata: { status: job.status }
    });
    assert.equal(jobVersion.versionNumber, 1);

    await drainQueue(runner);
    const state = await store.getState();
    assert.equal(state.jobs.length, 1);
    assert.equal(state.articles.length, 1);
    assert.ok(state.jobs[0].status === "generated" || state.jobs[0].status === "needs_review");
    assert.ok(state.articles[0].status === "generated" || state.articles[0].status === "needs_review");

    const article = state.articles[0];
    const research = await store.getResearch(article.id);
    assert.ok(research);
    assert.equal(research.articleId, article.id);
    assert.ok(research.requestIds.length > 0);
    const initialRuns = await provider.listResearchRuns(projectId);
    assert.equal(initialRuns.filter((run) => run.articleId === article.id).length, 1);
    const initialSources = await provider.listResearchSources(projectId);
    assert.ok(initialSources.some((source) => source.url.includes("gov.uk")));
    const initialFindings = await provider.listResearchFindings(projectId);
    assert.ok(initialFindings.some((finding) => finding.researchRunId === initialRuns.find((run) => run.articleId === article.id)?.id));
    const initialCitations = await provider.listSourceCitations(projectId);
    assert.ok(initialCitations.some((citation) => citation.findingId && citation.sourceId));

    await store.saveResearch({ ...research, createdAt: new Date(Date.now() + 4_000).toISOString() }, projectId);
    const repeatedRuns = await provider.listResearchRuns(projectId);
    assert.equal(repeatedRuns.filter((run) => run.articleId === article.id).length, 2);
    const repeatedSources = await provider.listResearchSources(projectId);
    assert.equal(repeatedSources.filter((source) => source.url === research.sources[0]?.url).length, 1);
    assert.deepEqual(await provider.getJson<typeof article>(articlePath(article.id, projectId)), article);

    const updatedArticle = {
      ...article,
      markdown: `${article.markdown}\n\n## SEO Notes\n\nPersisted content for derived SEO scoring.`,
      updatedAt: new Date().toISOString()
    };
    await store.saveArticle(updatedArticle);
    const articleVersion = await provider.createVersion({
      projectId,
      documentId: article.id,
      documentType: "article",
      content: updatedArticle.markdown,
      metadata: { source: "workflow-test" }
    });
    assert.equal(articleVersion.versionNumber, 1);
    const history = await provider.getVersionHistory({ projectId, documentId: article.id, documentType: "article" });
    assert.equal(history.length, 1);
    assert.match(history[0].content, /SEO Notes/);

    const detailsResearch = await store.getResearch(article.id);
    const seoScores = calculateArticleScores(updatedArticle, detailsResearch);
    assert.equal(seoScores.quality.key, "quality");
    assert.equal(seoScores.research.key, "research");
    assert.equal(seoScores.evidence.key, "evidence");

    const refreshed = await store.getState();
    const analytics = buildProjectAnalytics({ articles: refreshed.articles, jobs: refreshed.jobs, researchPacks: [research as ResearchPack] });
    assert.equal(analytics.total_articles, 1);
    assert.equal(analytics.reliability.success_rate, 100);

    const manifest = createProjectManifest(refreshed.project, refreshed.articles, refreshed.jobs, [research as ResearchPack]);
    assert.equal(manifest.articleCount, 1);
    const zip = exportProjectZip(refreshed.project, refreshed.articles, "markdown");
    assert.equal(String.fromCharCode(...zip.slice(0, 4)), "PK\u0003\u0004");

    assert.ok(await store.getJob(job.id));
    assert.ok(await store.getResearch(article.id));
    assert.ok((await store.listArticles()).some((item) => item.id === article.id));

    await store.clearProjectData();
    assert.equal((await store.getState()).jobs.length, 0);
    assert.equal((await store.getState()).articles.length, 0);
    assert.equal(await store.getResearch(article.id), null);
    assert.equal(await provider.getJson<QueueJob>(jobPath(job.id, projectId)), null);
    assert.equal(await provider.getJson<typeof article>(articlePath(article.id, projectId)), null);
    assert.equal((await provider.getVersionHistory({ projectId, documentId: article.id, documentType: "article" })).length, 0);
  } finally {
    restoreEnv(env);
  }
});

class FakeSearch implements SearchAdapter {
  async search(query: string) {
    return {
      requestId: `req_${query}`,
      results: Array.from({ length: 5 }, (_, index) => ({
        title: index === 0 ? "GOV.UK technical guidance" : `Water authority source ${index}`,
        url: index === 0 ? `https://www.gov.uk/guidance/${encodeURIComponent(query)}` : `https://water.org.uk/source-${index}-${encodeURIComponent(query)}`,
        summary: `${query} guidance with standards, legislation, practical facts, and infrastructure requirements for storage validation article work.`,
        highlights: [`${query} requirements should be checked against current project requirements before work starts.`]
      }))
    };
  }
}

class FakeModel implements ModelAdapter {
  async generateArticle(input: ArticleGenerationInput) {
    return `# ${input.title}

Intro paragraph with a direct practical answer for the reader.

## Requirements
Useful details based on the research notes.

## Process
Practical sequence and decision points.

## Costs And Timing
Plain-English explanation without fake precision.

## Common Problems
Risks and checks to consider.

## Practical Next Steps
What to do next.

## FAQ

### What should you check first?
Check the current project requirements first.`;
  }

  async editArticle(input: EditorInput) {
    return input.markdown;
  }

  async validateArticle(input: ValidationInput): Promise<ValidationResult> {
    return {
      pass: true,
      warnings: [],
      needsReviewReasons: [],
      qualityScore: 92,
      sectionScores: { research: input.research.confidence, intent: 90, headings: 90, readability: 88 },
      faqScore: 88,
      seoScore: 84
    };
  }
}

async function drainQueue(runner: QueueRunner, maxSteps = 20) {
  await runner.resumeQueue();
  for (let index = 0; index < maxSteps; index += 1) {
    const result = await runner.processNext();
    if (!result.processed) return;
  }
  throw new Error(`Queue did not drain within ${maxSteps} steps.`);
}

function snapshotEnv() {
  return {
    DATABASE_URL: process.env.DATABASE_URL,
    OSW_AUTH_USER_EMAIL: process.env.OSW_AUTH_USER_EMAIL,
    OSW_AUTH_USER_ID: process.env.OSW_AUTH_USER_ID,
    OSW_ORGANISATION_ID: process.env.OSW_ORGANISATION_ID,
    OSW_ORGANISATION_NAME: process.env.OSW_ORGANISATION_NAME,
    OSW_ORGANISATION_SLUG: process.env.OSW_ORGANISATION_SLUG
  };
}

function restoreEnv(env: Record<string, string | undefined>) {
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}
