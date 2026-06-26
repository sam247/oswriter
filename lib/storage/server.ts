import { authTenantFromSession } from "@/lib/auth/service";
import { getAuthSession } from "@/lib/server/auth";
import { BlobStorageProvider } from "@/lib/storage/blob";
import { logStorageInfo } from "@/lib/storage/logging";
import { MemoryStorageAdapter } from "@/lib/storage/memory";
import { NeonStorageProvider, type TenantSeed } from "@/lib/storage/neon";
import { WorkspaceStore } from "@/lib/storage/storage";

export async function createWorkspaceStore() {
  const session = await getAuthSession();
  return new WorkspaceStore(createStorageProvider(session ? authTenantFromSession(session) : undefined));
}

export function createWorkspaceStoreForTenant(tenant?: TenantSeed) {
  return new WorkspaceStore(createStorageProvider(tenant));
}

export function createStorageProvider(tenant?: TenantSeed) {
  if (process.env.STORAGE_BACKEND === "neon") {
    logStorageInfo({ event: "provider_selected", provider: "neon" });
    return new NeonStorageProvider(tenant ? { tenant } : {});
  }
  if (process.env.STORAGE_BACKEND === "memory") {
    logStorageInfo({ event: "provider_selected", provider: "memory" });
    return new MemoryStorageAdapter({ sharedKey: tenant?.organisationId ?? "default" });
  }
  logStorageInfo({ event: "provider_selected", provider: "blob" });
  return new BlobStorageProvider();
}
