import { DEFAULT_PROJECT_ID } from "@/lib/defaults";

export const root = (projectId = DEFAULT_PROJECT_ID) => `projects/${projectId}`;
export const activeProjectPath = () => "workspace/active-project.json";
export const workspacePreferencesPath = () => "workspace/preferences.json";
export const workspacePath = (projectId = DEFAULT_PROJECT_ID) => `${root(projectId)}/workspace.json`;
export const settingsPath = (projectId = DEFAULT_PROJECT_ID) => `${root(projectId)}/settings.json`;
export const queueControlPath = (projectId = DEFAULT_PROJECT_ID) => `${root(projectId)}/queue/control.json`;
export const jobPath = (jobId: string, projectId = DEFAULT_PROJECT_ID) => `${root(projectId)}/jobs/${jobId}.json`;
export const jobsPrefix = (projectId = DEFAULT_PROJECT_ID) => `${root(projectId)}/jobs/`;
export const articlePath = (articleId: string, projectId = DEFAULT_PROJECT_ID) => `${root(projectId)}/articles/${articleId}.json`;
export const articleMarkdownPath = (articleId: string, projectId = DEFAULT_PROJECT_ID) => `${root(projectId)}/articles/${articleId}.md`;
export const articlesPrefix = (projectId = DEFAULT_PROJECT_ID) => `${root(projectId)}/articles/`;
export const researchPath = (articleId: string, projectId = DEFAULT_PROJECT_ID) => `${root(projectId)}/research/${articleId}.json`;
export const debugPath = (articleId: string, projectId = DEFAULT_PROJECT_ID) => `${root(projectId)}/debug/${articleId}.json`;
export const generationTelemetryPath = (articleId: string, projectId = DEFAULT_PROJECT_ID) => `${root(projectId)}/telemetry/generations/${articleId}.json`;
export const workerLeasePath = (projectId = DEFAULT_PROJECT_ID) => `${root(projectId)}/worker/lease.json`;
