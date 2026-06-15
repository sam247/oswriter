import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { createPipeline } from "@/lib/defaults";
import { jobPath } from "@/lib/storage/paths";
import { NeonStorageProvider } from "@/lib/storage/neon";
import type { ProjectDocument, QueueJob } from "@/lib/types";

const canRunNeon = Boolean(process.env.TEST_NEON_DATABASE_URL);
const neonTest = canRunNeon ? test : test.skip;

neonTest("NeonStorageProvider supports project, document, version, history, and delete operations", async () => {
  const previousDatabaseUrl = process.env.DATABASE_URL;
  const previousUserEmail = process.env.OSW_AUTH_USER_EMAIL;
  const previousUserId = process.env.OSW_AUTH_USER_ID;
  const previousOrgId = process.env.OSW_ORGANISATION_ID;
  const previousOrgName = process.env.OSW_ORGANISATION_NAME;
  const id = randomUUID().replaceAll("-", "").slice(0, 12);
  const projectId = `project_${id}`;
  const jobId = `job_${id}`;
  const articleId = `article_${id}`;

  process.env.DATABASE_URL = process.env.TEST_NEON_DATABASE_URL;
  process.env.OSW_AUTH_USER_EMAIL = "storage-smoke@example.test";
  process.env.OSW_AUTH_USER_ID = "user_storage_smoke";
  process.env.OSW_ORGANISATION_ID = `org_${id}`;
  process.env.OSW_ORGANISATION_NAME = "Storage Smoke Organisation";

  try {
    const provider = new NeonStorageProvider();
    const now = new Date().toISOString();
    const organisation = await provider.getOrganisation();
    assert.equal(organisation?.id, process.env.OSW_ORGANISATION_ID);

    const createdProject = await provider.createProject({
      id: projectId,
      name: "Storage Smoke",
      createdAt: now,
      updatedAt: now
    });
    assert.equal(createdProject?.id, projectId);
    assert.equal(createdProject?.organisationId, process.env.OSW_ORGANISATION_ID);

    const updatedProject: ProjectDocument = {
      ...createdProject,
      name: "Storage Smoke Updated",
      updatedAt: new Date(Date.now() + 1_000).toISOString()
    };
    await provider.updateProject(updatedProject);
    assert.equal((await provider.getJson<ProjectDocument>(`projects/${projectId}/workspace.json`))?.name, "Storage Smoke Updated");

    const queued: QueueJob = {
      id: jobId,
      projectId,
      articleId,
      title: "Smoke document",
      status: "queued",
      createdAt: now,
      updatedAt: now,
      attempts: 0,
      needsReviewReasons: [],
      pipeline: createPipeline(),
      timings: { queued_at: now }
    };
    const createdDocument = await provider.createDocument<QueueJob>(jobPath(jobId, projectId), queued);
    assert.equal(createdDocument?.status, "queued");

    const processing: QueueJob = {
      ...queued,
      status: "processing",
      statusReason: "manual_review_required",
      attempts: 1,
      updatedAt: new Date(Date.now() + 2_000).toISOString()
    };
    await provider.updateDocument(jobPath(jobId, projectId), processing);
    const updatedDocument = await provider.getJson<QueueJob>(jobPath(jobId, projectId));
    assert.equal(updatedDocument?.status, "processing");
    assert.equal(updatedDocument?.statusReason, "manual_review_required");

    const firstVersion = await provider.createVersion({
      projectId,
      documentId: jobId,
      documentType: "job",
      content: "first",
      metadata: { status: "queued" },
      createdAt: now
    });
    const secondVersion = await provider.createVersion({
      projectId,
      documentId: jobId,
      documentType: "job",
      content: "second",
      metadata: { status: "processing" },
      createdAt: new Date(Date.now() + 3_000).toISOString()
    });
    assert.equal(firstVersion.versionNumber, 1);
    assert.equal(secondVersion.versionNumber, 2);

    const history = await provider.getVersionHistory({ projectId, documentId: jobId, documentType: "job" });
    assert.equal(history.length, 2);
    assert.equal(history[0].versionNumber, 2);
    assert.equal(history[1].versionNumber, 1);

    await provider.deleteDocument(jobPath(jobId, projectId));
    assert.equal(await provider.getJson<QueueJob>(jobPath(jobId, projectId)), null);

    await provider.deleteProject(projectId);
    assert.equal(await provider.getJson<ProjectDocument>(`projects/${projectId}/workspace.json`), null);
  } finally {
    restoreEnv("DATABASE_URL", previousDatabaseUrl);
    restoreEnv("OSW_AUTH_USER_EMAIL", previousUserEmail);
    restoreEnv("OSW_AUTH_USER_ID", previousUserId);
    restoreEnv("OSW_ORGANISATION_ID", previousOrgId);
    restoreEnv("OSW_ORGANISATION_NAME", previousOrgName);
  }
});

function restoreEnv(key: string, value: string | undefined) {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}

