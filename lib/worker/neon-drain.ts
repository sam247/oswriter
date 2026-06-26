import { neon } from "@neondatabase/serverless";
import { createRuntimeForTenant } from "@/lib/server/runtime";
import type { TenantSeed } from "@/lib/storage/neon";
import { drainQueueWithLease, type WorkerDrainAllResult, type WorkerProjectDrainResult } from "@/lib/worker/drain";

type NeonSql = ReturnType<typeof neon>;

export async function drainAllTenantProjectsWithLeases(now = () => Date.now()): Promise<WorkerDrainAllResult> {
  const sql = sqlClient();
  const startedAt = now();
  const projectsCheckedRows = await sql`select count(*)::int as count from projects`;
  const rows = await sql`
    select distinct on (j.organisation_id, j.project_id)
      j.organisation_id,
      j.project_id,
      o.name as organisation_name,
      o.slug as organisation_slug,
      u.id as user_id,
      u.email as user_email,
      u.name as user_name
    from jobs j
    join organisations o on o.id = j.organisation_id
    join organisation_users ou on ou.organisation_id = j.organisation_id
    join users u on u.id = ou.user_id
    where j.status in ('queued', 'processing')
    order by
      j.organisation_id,
      j.project_id,
      case when ou.role = 'owner' then 0 else 1 end,
      ou.created_at asc
  `;

  const results: WorkerProjectDrainResult[] = [];
  for (const row of rows) {
    const tenant: TenantSeed = {
      organisationId: String(row.organisation_id),
      organisationName: String(row.organisation_name),
      organisationSlug: String(row.organisation_slug),
      userId: String(row.user_id),
      userEmail: String(row.user_email),
      userName: row.user_name ? String(row.user_name) : null
    };
    const { store, runner } = createRuntimeForTenant(tenant);
    const result = await drainQueueWithLease({
      store,
      runner,
      projectId: String(row.project_id),
      now
    });
    results.push({ ...result, projectId: String(row.project_id) });
  }

  return {
    projectsChecked: Number(projectsCheckedRows[0]?.count ?? 0),
    projectsWithWork: results.length,
    processed: results.reduce((sum, result) => sum + result.processed, 0),
    remaining: results.reduce((sum, result) => sum + result.remaining, 0),
    durationMs: now() - startedAt,
    results
  };
}

function sqlClient() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is required for multi-tenant worker draining.");
  return neon(url);
}
